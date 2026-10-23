import {createRequire} from 'node:module';
const nativeRequire=createRequire(import.meta.url);
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';

let externalCalls=0;
const cache=new Map();
function load(filename){
  if(cache.has(filename))return cache.get(filename);
  const exports={};cache.set(filename,exports);
  const code=ts.transpileModule(readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(code,{exports,structuredClone,Response,process:{env:{}},require:specifier=>specifier.startsWith('node:')?nativeRequire(specifier):load(specifier.startsWith('@/')?path.resolve('src',specifier.slice(2)+'.ts'):path.resolve(path.dirname(filename),specifier+'.ts')),fetch(){externalCalls++;throw Error('No external calls allowed');}});
  return exports;
}
const root=fileURLToPath(new URL('../src/',import.meta.url));
const {calculateScenarios,isSimulationRequest,formulaRegistry,roundCurrency}=load(path.join(root,'lib/scenario-calculator.ts'));
const {POST}=load(path.join(root,'app/api/analyze/simulate/route.ts'));
const fixture=name=>JSON.parse(readFileSync(new URL(`./fixtures/simulation-${name}.json`,import.meta.url),'utf8'));
const result=body=>calculateScenarios(body).results[0];
const plain=value=>JSON.parse(JSON.stringify(value));
function editFact(body,concept,mutate){const entry=body.input_facts.find(f=>f.source==='calculation_inputs.'+concept);const fact=JSON.parse(entry.fact);mutate(fact);entry.fact=JSON.stringify(fact);}
const change=body=>body.scenarios.scenarios[0].controlled_changes[0];

test('Cornhead labor and waste are valid but not calculable; delivery is not simulated',()=>{
  const body=fixture('cornhead');assert.equal(isSimulationRequest(body),true);
  const results=calculateScenarios(body).results;assert.equal(results.length,2);
  for(const r of results){assert.equal(r.status,'not_calculable_yet');assert.equal(r.calculation,null);assert.ok(r.missing_inputs.length);}
  assert.match(results[0].missing_inputs.join(' '),/headcount.*labor cost per worker/i);
  assert.match(results[1].missing_inputs.join(' '),/ingredient purchases.*ingredient cost is not equivalent/);
  assert.equal(results.some(r=>/delivery/i.test(r.target_leak)),false);
});
test('complete labor calculates baseline, projected cost, and signed savings through registry',()=>{
  const r=result(fixture('labor'));assert.equal(r.status,'calculable');
  assert.equal(r.calculation.formula_id,'LABOR_HEADCOUNT_DELTA');
  assert.equal(r.calculation.baseline_value,3080);assert.equal(r.calculation.projected_value,2310);assert.equal(r.calculation.impact_value,770);
  assert.equal(r.calculation.currency,'USD');assert.equal(r.calculation.period,'last_month');
});
test('explicit purchases fixture calculates waste using percent normalization',()=>{
  const r=result(fixture('waste'));assert.equal(r.status,'calculable');
  assert.equal(r.calculation.formula_id,'INGREDIENT_WASTE_RATE_TARGET');
  assert.equal(r.calculation.baseline_value,1800);assert.equal(r.calculation.projected_value,1000);assert.equal(r.calculation.impact_value,800);
});
test('ingredient cost, prose facts, and scenario missing-input prose never supply purchases',()=>{
  const body=fixture('waste');body.input_facts=body.input_facts.filter(f=>!f.source.startsWith('calculation_inputs.'));
  body.evidence.costs.items[1].amount=20000;
  body.evidence.facts.push('Ingredient purchases $20,000');
  body.input_facts.push({id:'input_99',source:'operational_context[99]',fact:'Ingredient purchases $20,000'});
  assert.equal(result(body).status,'not_calculable_yet');
});
test('missing worker cost cannot be derived from total labor cost or baseline headcount',()=>{
  const body=fixture('labor');body.input_facts=body.input_facts.filter(f=>f.source!=='calculation_inputs.labor_cost_per_worker');
  assert.equal(result(body).status,'not_calculable_yet');
});
for(const [name,edit] of [
  ['unknown variable',b=>change(b).variable='Delivery pricing'],
  ['unsupported unit',b=>change(b).unit='workers'],
  ['unsupported change type',b=>{change(b).change_type='absolute_target';change(b).from=4;}],
  ['negative baseline',b=>editFact(b,'baseline_headcount',f=>f.value=-1)],
  ['fractional headcount',b=>editFact(b,'baseline_headcount',f=>f.value=4.5)],
  ['fractional delta',b=>change(b).value=-.5],
  ['negative projected headcount',b=>change(b).value=-5],
  ['incompatible baseline',b=>change(b).from=7],
  ['wrong period',b=>editFact(b,'labor_cost_per_worker',f=>f.period='next_month')],
  ['wrong currency',b=>editFact(b,'labor_cost_per_worker',f=>f.currency='EUR')],
  ['negative worker cost',b=>editFact(b,'labor_cost_per_worker',f=>f.value=-10)],
  ['missing currency',b=>b.evidence.currency=null],
  ['ambiguous currency',b=>b.evidence.currency='$'],
  ['missing period',b=>b.evidence.period=null],
  ['duplicate authoritative concept',b=>b.input_facts.push({...b.input_facts.at(-1),id:'input_99'})],
  ['multiple changes without approved combined formula',b=>b.scenarios.scenarios[0].controlled_changes.push({...change(b)})],
  ['numeric overflow',b=>editFact(b,'labor_cost_per_worker',f=>f.value=Number.MAX_VALUE)],
])test(`${name} prevents calculation`,()=>{const body=fixture('labor');edit(body);assert.equal(result(body).status,'not_calculable_yet');assert.equal(result(body).calculation,null);});
for(const rate of [-1,101])test(`invalid waste rate ${rate} prevents calculation`,()=>{
  const body=fixture('waste');change(body).value=rate;assert.equal(result(body).status,'not_calculable_yet');
});
test('negative purchases and incompatible structured units prevent waste calculation',()=>{
  for(const mutate of [f=>f.value=-1,f=>f.unit='currency_per_person',f=>f.scope='tuesday_evening']){
    const body=fixture('waste');editFact(body,'ingredient_purchases',mutate);assert.equal(result(body).status,'not_calculable_yet');
  }
});
test('zero inputs and boundary percentages are valid; increased costs yield negative impact',()=>{
  const body=fixture('labor');change(body).value=1;assert.equal(result(body).calculation.impact_value,-770);
  const waste=fixture('waste');change(waste).from=0;change(waste).value=100;assert.equal(result(waste).calculation.impact_value,-20000);
  editFact(waste,'ingredient_purchases',f=>f.value=0);assert.equal(result(waste).calculation.impact_value,0);
});
test('NaN/Infinity, malformed structures, forged references are rejected before arithmetic',()=>{
  for(const mutate of [
    b=>change(b).value=NaN,b=>change(b).from=Infinity,b=>b.evidence.costs.total=Infinity,
    b=>b.scenarios.scenarios[0].available_input_refs=['unknown'],b=>b.extra=true,
    b=>b.input_facts.push({...b.input_facts[0]}),
    b=>b.input_facts.at(-1).fact='{"concept":"ingredient_purchases","value":Infinity}',
    b=>b.scenarios.scenarios[0].controlled_changes=[],
  ]){const body=fixture('labor');mutate(body);assert.equal(isSimulationRequest(body),false);assert.throws(()=>calculateScenarios(body),/Invalid simulation request/);}
});
test('round final currency to cents, ties away from zero; avoid intermediate rounding',()=>{
  assert.equal(roundCurrency(1.005),1.01);assert.equal(roundCurrency(-1.005),-1.01);assert.equal(roundCurrency(2.675),2.68);
  const labor=fixture('labor');editFact(labor,'labor_cost_per_worker',f=>f.value=770.125);
  assert.equal(result(labor).calculation.baseline_value,3080.5);assert.equal(result(labor).calculation.projected_value,2310.38);assert.equal(result(labor).calculation.impact_value,770.13);
  const waste=fixture('waste');editFact(waste,'ingredient_purchases',f=>f.value=123.45);
  assert.equal(result(waste).calculation.baseline_value,11.11);assert.equal(result(waste).calculation.projected_value,6.17);assert.equal(result(waste).calculation.impact_value,4.94);
});
test('registry has explicit aliases, units, change types, input requirements and functions',()=>{
  assert.equal(formulaRegistry.length,2);
  for(const formula of formulaRegistry){assert.ok(formula.formula_id);assert.ok(formula.required_inputs.length);assert.ok(formula.aliases.length);assert.ok(formula.unit);assert.equal(typeof formula.calculate,'function');}
  const body=fixture('labor');change(body).variable='  Tuesday   EVENING headcount ';assert.equal(result(body).status,'calculable');
  change(body).variable='Tuesday staffing';assert.equal(result(body).status,'not_calculable_yet');
});
test('numeric source references, original changes and input immutability are preserved',()=>{
  const body=fixture('labor');const before=JSON.stringify(body);const r=result(body);
  assert.equal(JSON.stringify(body),before);assert.deepEqual(plain(r.controlled_changes),body.scenarios.scenarios[0].controlled_changes);
  assert.deepEqual(plain(r.calculation.inputs.map(i=>i.source_ref)),['input_21','input_22','scenarios.scenarios[0].controlled_changes[0].value']);
  for(const input of r.calculation.inputs){assert.equal(typeof input.name,'string');assert.equal(typeof input.value,'number');assert.equal(typeof input.unit,'string');}
});
test('no recommendation/ranking fields and no external calls',()=>{
  for(const name of ['cornhead','labor','waste']){
    const output=calculateScenarios(fixture(name));assert.doesNotMatch(JSON.stringify(output),/"(?:ranking|recommendation|best|priority)"/);
  }
  assert.equal(externalCalls,0);
  const source=readFileSync(path.join(root,'lib/scenario-calculator.ts'),'utf8');assert.doesNotMatch(source,/\bfetch\s*\(|NEBIUS_API_KEY|https?:\/\//);
});
test('simulate route returns Cornhead results without provider calls and rejects malformed requests',async()=>{
  const req=body=>new Request('http://localhost/api/analyze/simulate',{method:'POST',body:JSON.stringify(body)});
  const response=await POST(req(fixture('cornhead')));assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
  assert.deepEqual(await response.json(),plain(calculateScenarios(fixture('cornhead'))));
  assert.equal((await POST(req({}))).status,400);
  assert.equal((await POST(new Request('http://localhost',{method:'POST',body:'{'}))).status,400);
  assert.equal(externalCalls,0);
});
test('exact time-qualified headcount alias emitted by the real Scenario Agent uses the same labor formula',()=>{
  const complete=fixture('labor');change(complete).variable='Tuesday evening 6 PM to 10 PM headcount';assert.equal(result(complete).calculation.impact_value,770);
  const cornhead=fixture('cornhead');change(cornhead).variable='Tuesday evening 6 PM to 10 PM headcount';
  assert.equal(result(cornhead).status,'not_calculable_yet');assert.match(result(cornhead).missing_inputs.join(' '),/baseline.*headcount.*labor cost per worker/i);
});
