import {createRequire} from 'node:module';
const nativeRequire=createRequire(import.meta.url);
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';

const fixture=JSON.parse(readFileSync(new URL('./fixtures/scenarios-bagel.json',import.meta.url),'utf8'));
function loadRoute(fetcher, key='test-key') {
  const cache=new Map();
  function load(filename) {
    if(cache.has(filename))return cache.get(filename);
    const exports={};cache.set(filename,exports);
    const code=ts.transpileModule(readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
    vm.runInNewContext(code,{exports,require:s=>s.startsWith('node:')?nativeRequire(s):load(path.resolve(path.dirname(filename),s+'.ts')),Response,AbortSignal,process:{env:{NEBIUS_API_KEY:key}},fetch:fetcher});
    return exports;
  }
  const dir=fileURLToPath(new URL('../src/app/api/analyze/scenarios/',import.meta.url));
  return {...load(path.join(dir,'route.ts')),...load(path.join(dir,'scenarios.ts')),...load(path.join(dir,'abstention.ts'))};
}
const request=body=>new Request('http://localhost/api/analyze/scenarios',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
const completion=result=>Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(result)}}]});
const helpers=loadRoute();
const input=helpers.buildScenarioInput(fixture);
const validResult=()=>({scenarios:[
  {title:'Test Tuesday evening headcount reduction',target_leak:fixture.leaks.leaks[0].title,controlled_changes:[{variable:'Tuesday evening headcount',change_type:'delta',from:null,value:-1,unit:'persons'}],available_input_refs:Array.from(input.authorized_changes[0].source_refs),missing_calculation_inputs:['Baseline Tuesday evening headcount','Labor cost per worker for the affected period'],confidence:'high'},
  {title:'Test stated ingredient waste target',target_leak:fixture.leaks.leaks[2].title,controlled_changes:[{variable:'Ingredient waste rate',change_type:'absolute_target',from:9,value:5,unit:'percent'}],available_input_refs:Array.from(input.authorized_changes[1].source_refs),missing_calculation_inputs:['Required cost basis for translating waste-rate change into currency impact'],confidence:'high'},
],not_simulation_ready:[{target_leak:fixture.leaks.leaks[1].title,reason:'No controllable decision variable has been supplied.',missing_decision_input_categories:['A controllable decision variable','Constraints governing that variable','Unit-level cost data required for simulation']}]});
const validate=r=>helpers.validateScenarioResult(r,input.input_facts,input.confirmed_leaks);

test('valid labor delta, waste absolute target, and delivery abstention; ingredient-cost reference optional',()=>{
  const result=validResult();assert.equal(validate(result),true);
  assert.equal(result.scenarios.length,2);assert.equal(result.scenarios[0].controlled_changes[0].value,-1);
  const original=JSON.stringify(result);validate(result);assert.equal(JSON.stringify(result),original);
});
test('deterministic provenance preserves exact values and source paths without treating assumptions as facts',()=>{
  const copy=structuredClone(fixture);copy.evidence.assumptions=['invented'];copy.evidence.missing_information=['unknown'];
  assert.equal(JSON.stringify(helpers.buildScenarioInput(copy)),JSON.stringify(input));
  assert.equal(JSON.stringify(helpers.buildScenarioInput(fixture)),JSON.stringify(input));
  assert.equal(new Set(input.input_facts.map(f=>f.id)).size,input.input_facts.length);
  assert.equal(input.input_facts.find(f=>f.source==='evidence.costs.items[1]').fact,JSON.stringify(fixture.evidence.costs.items[1]));
  assert.doesNotMatch(JSON.stringify(input),/ingredient purchases baseline|invented/);
});
for(const [name,mutate] of [
  ['empty controlled changes',r=>r.scenarios[0].controlled_changes=[]],
  ['cross-destination normalized duplicate',r=>r.not_simulation_ready.push({...r.not_simulation_ready[0],target_leak:'  TUESDAY—EVENING LABOR INEFFICIENCY!!! '})],
  ['duplicate within scenarios',r=>r.scenarios.push(structuredClone(r.scenarios[0]))],
  ['missing confirmed leak',r=>r.not_simulation_ready=[]],
  ['unknown target leak',r=>r.scenarios[0].target_leak='Invented leak'],
  ['unknown reference',r=>r.scenarios[0].available_input_refs=['input_999']],
  ['prose reference',r=>r.scenarios[0].available_input_refs=['Tuesday sales']],
  ['no references',r=>r.scenarios[0].available_input_refs=[]],
  ['delta string value',r=>r.scenarios[0].controlled_changes[0].value='-1'],
  ['delta nonfinite value',r=>r.scenarios[0].controlled_changes[0].value=Infinity],
  ['delta nonfinite baseline',r=>r.scenarios[0].controlled_changes[0].from=NaN],
  ['absolute null baseline',r=>r.scenarios[1].controlled_changes[0].from=null],
  ['unknown change type',r=>r.scenarios[0].controlled_changes[0].change_type='relative'],
  ['unexpected change field',r=>r.scenarios[0].controlled_changes[0].impact=1180],
  ['missing change field',r=>delete r.scenarios[0].controlled_changes[0].unit],
  ['blank variable',r=>r.scenarios[0].controlled_changes[0].variable=' '],
  ['extra output property',r=>r.recommendation='Choose labor'],
  ['invalid confidence',r=>r.scenarios[0].confidence='certain'],
  ['empty missing decision categories',r=>r.not_simulation_ready[0].missing_decision_input_categories=[]],
])test(`rejects ${name} without repairing output`,()=>{
  const result=validResult();mutate(result);const before=JSON.stringify(result);
  assert.equal(validate(result),false);assert.equal(JSON.stringify(result),before);
});
test('finite known delta baseline is valid; absolute finite target is valid',()=>{
  const result=validResult();result.scenarios[0].controlled_changes[0].from=4;assert.equal(validate(result),true);
});
test('valid route uses exact configuration and preserves actionable scenarios and returns code-owned abstention plus resolvable fact IDs',async()=>{
  let calls=0;const {POST}=loadRoute(async(url,options)=>{
    calls++;assert.equal(url,'https://api.tokenfactory.nebius.com/v1/chat/completions');
    assert.equal(options.headers.Authorization,'Bearer test-key');assert.equal(options.cache,'no-store');assert.ok(options.signal instanceof AbortSignal);
    const body=JSON.parse(options.body);assert.equal(body.model,'nvidia/Nemotron-3_5-Lightning');assert.equal(body.temperature,.2);assert.equal(body.max_tokens,4000);assert.equal(body.chat_template_kwargs.enable_thinking,false);
    assert.equal(body.response_format.type,'json_schema');assert.equal(body.response_format.json_schema.strict,true);assert.equal(body.response_format.json_schema.name,'scenario_agent_v1');
    const schema=body.response_format.json_schema.schema;
    assert.equal(schema.properties.scenarios.items.properties.controlled_changes.minItems,1);
    assert.deepEqual(schema.properties.scenarios.items.properties.target_leak.enum,fixture.leaks.leaks.map(l=>l.title));
    assert.deepEqual(schema.properties.scenarios.items.properties.available_input_refs.items.enum,JSON.parse(JSON.stringify(input.input_facts.map(f=>f.id))));
    assert.match(body.messages[0].content,/Required JSON schema:/);
    assert.deepEqual(JSON.parse(body.messages[1].content),JSON.parse(JSON.stringify(input)));
    return completion(validResult());
  });
  const response=await POST(request(fixture));assert.equal(response.status,200);assert.equal(calls,1);
  assert.equal(response.headers.get('cache-control'),'no-store');
  assert.deepEqual(await response.json(),{scenarios:JSON.parse(JSON.stringify(helpers.ownAbstentionExplanations(validResult()))),input_facts:JSON.parse(JSON.stringify(input.input_facts))});
});
test('invalid requests rejected before fetch',async()=>{
  const {POST}=loadRoute(()=>{throw Error('must not fetch');});
  for(const body of [null,[],{}, {...fixture,evidence:{}},{...fixture,leaks:{}},{...fixture,operational_context:[' ']},{...fixture,extra:true},{...fixture,leaks:{...fixture.leaks,leaks:[fixture.leaks.leaks[0],fixture.leaks.leaks[0]]}}])assert.equal((await POST(request(body))).status,400);
  assert.equal((await POST(new Request('http://localhost',{method:'POST',body:'{'}))).status,400);
});
test('missing key safe 500',async()=>{
  const {POST}=loadRoute(()=>{throw Error('must not fetch');},'');assert.equal((await POST(request(fixture))).status,500);
});
test('zero confirmed leaks permits empty destinations',async()=>{
  const {POST}=loadRoute(async()=>completion({scenarios:[],not_simulation_ready:[]}));
  assert.equal((await POST(request({...fixture,leaks:{leaks:[],insufficient_evidence:[]}}))).status,200);
});
for(const [name,fetcher] of [
  ['upstream error',async()=>new Response('private internals',{status:429})],
  ['network failure',async()=>{throw Error('private internals');}],
  ['timeout',async()=>{throw new DOMException('private internals','TimeoutError');}],
  ['bad envelope',async()=>Response.json(null)],
  ['bad upstream JSON',async()=>new Response('{')],
  ['truncated',async()=>Response.json({choices:[{finish_reason:'length',message:{content:'{}'}}]})],
  ['refusal',async()=>Response.json({choices:[{finish_reason:'stop',message:{refusal:'private internals',content:'{}'}}]})],
  ['bad final JSON',async()=>Response.json({choices:[{finish_reason:'stop',message:{content:'{'}}]})],
  ['invalid result explicitly rejected',async()=>{const r=validResult();r.scenarios[0].controlled_changes=[];return completion(r);}],
])test(`safe 502 for ${name}`,async()=>{
  const {POST}=loadRoute(fetcher);const response=await POST(request(fixture));assert.equal(response.status,502);
  const body=await response.json();assert.deepEqual(Object.keys(body),['error']);assert.doesNotMatch(body.error,/private|test-key/);
  if(name==='invalid result explicitly rejected')assert.match(body.error,/rejected by deterministic validation/);
});

for (const id of ['J02','J03','J06','J07']) test(`saved ${id} contamination is stripped after unchanged validators pass`, async()=>{
  const raw=JSON.parse(readFileSync(new URL(`../docs/evaluations/judge-style-full-pipeline/runs/${id}.json`,import.meta.url),'utf8'));
  const saved=raw.calls.find(c=>c.url.endsWith('/scenarios'));
  const original=structuredClone(saved.response.scenarios);
  const {POST}=loadRoute(async()=>completion(original));
  const response=await POST(request(saved.body));assert.equal(response.status,200);
  const trusted=(await response.json()).scenarios;
  assert.deepEqual(trusted.scenarios,original.scenarios);
  for(const item of trusted.not_simulation_ready){
    assert.equal(item.reason,'No eligible authorized change is available for this finding.');
    assert.deepEqual(item.missing_decision_input_categories,['An eligible authorized change']);
    assert.doesNotMatch(item.reason+item.missing_decision_input_categories.join(''),/waste|delivery|labor|\d/i);
  }
  assert.deepEqual(original,saved.response.scenarios);
});
test('explanation projection is stable, number-free and discards arbitrary model explanatory fields',()=>{
  const original=validResult();original.not_simulation_ready[0].reason='Waste target 5%, unrelated global number 99123';
  original.not_simulation_ready[0].missing_decision_input_categories=['Invent surcharge 42'];
  const one=helpers.ownAbstentionExplanations(original),two=helpers.ownAbstentionExplanations(original);
  assert.equal(JSON.stringify(one),JSON.stringify(two));assert.equal(one.scenarios,original.scenarios);
  assert.doesNotMatch(JSON.stringify(one.not_simulation_ready.map(({reason,missing_decision_input_categories})=>({reason,missing_decision_input_categories}))),/5|99123|42|waste|surcharge/i);
  assert.match(original.not_simulation_ready[0].reason,/99123/);
});
test('invalid abstention still rejects before any explanation projection',async()=>{
  const result=validResult();result.not_simulation_ready[0].reason='';
  const {POST}=loadRoute(async()=>completion(result));
  assert.equal((await POST(request(fixture))).status,502);
});
