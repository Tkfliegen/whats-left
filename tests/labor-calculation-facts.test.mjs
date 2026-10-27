import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import ts from 'typescript';
import {productionModules} from './helpers/provenance.mjs';
const load=productionModules(),plain=x=>JSON.parse(JSON.stringify(x));
const raw=JSON.parse(fs.readFileSync('tests/fixtures/authorization-current-note.json'));
const provenance=load('src/app/api/analyze/evidence/provenance.ts');
const grounding=load('src/app/api/analyze/evidence/calculation-facts.ts');
const scenario=load('src/app/api/analyze/scenarios/scenarios.ts');
const calculator=load('src/lib/scenario-calculator.ts');
const schema=load('src/app/api/analyze/evidence/evidence.ts');
function fixture({headcount='4',cost='625',scope='Tuesday evening',currency='USD',extra=[],reportingPeriod='last month',costUnit='per worker'}={}){
 const evidence=structuredClone(raw.evidence);delete evidence.provenance;
 evidence.period=reportingPeriod;
 const baseline=`For the affected monthly period, the authoritative baseline ${scope} headcount is ${headcount} staff members.`;
 const worker=`For the affected monthly period, the labor cost per worker for ${scope}s is ${currency} ${cost} ${costUnit}.`;
 const period=`The reporting period is ${reportingPeriod}.`;
 const input=[raw.input,period,baseline,worker,...extra].join('\n');
 const manifest=provenance.createEvidenceProvenance(evidence,input),sources=manifest.items;
 const anchor=(text,quote)=>({source_ref:sources.find(s=>s.source.startsWith('source_input[')&&s.text===text).id,quote});
 const supports=[
  {concept:'baseline_headcount',scope:'tuesday_evening',period:evidence.period,support:{value:anchor(baseline,headcount),unit:anchor(baseline,`${headcount} staff members`),scope:anchor(baseline,baseline),period:anchor(period,reportingPeriod),currency:null}},
  {concept:'labor_cost_per_worker',scope:'tuesday_evening',period:evidence.period,support:{value:anchor(worker,cost),unit:anchor(worker,`labor cost per worker for ${scope}s is ${currency} ${cost} ${costUnit}`),scope:anchor(worker,worker),period:anchor(period,reportingPeriod),currency:anchor(worker,currency)}},
 ];
 return {evidence,input,sources,supports,baseline,worker,anchor};
}
const ground=f=>grounding.groundCalculationFacts(f.supports,f.sources,f.evidence);
function trusted(f){const facts=ground(f);f.evidence.provenance=provenance.createEvidenceProvenance(f.evidence,f.input,facts);return f.evidence;}
test('explicit scalar anchors construct the two typed source-backed Labor facts',()=>{
 const f=fixture(),before=JSON.stringify(f.supports),facts=ground(f);
 assert.equal(facts.length,2);assert.equal(JSON.stringify(f.supports),before);
 assert.deepEqual(plain(facts.map(fact=>grounding.calculationInput(fact))),[
  {concept:'baseline_headcount',scope:'tuesday_evening',value:4,unit:'persons',period:f.evidence.period,currency:null},
  {concept:'labor_cost_per_worker',scope:'tuesday_evening',value:625,unit:'currency_per_person',period:f.evidence.period,currency:'USD'},
 ]);
 for(const fact of facts)for(const anchor of Object.values(fact.support).filter(Boolean))assert.ok(f.sources.some(s=>s.id===anchor.source_ref&&s.text.includes(anchor.quote)));
 assert.equal(provenance.isEvidence(trusted(f),true),true);
});
test('production extraction schema requests anchors without a redundant model numeric value',()=>{
 const f=fixture(),output=schema.createEvidenceOutputSchema(f.sources.map(s=>s.id),true,true);
 assert.ok(output.required.includes('calculation_support'));
 assert.equal(schema.matchesSchema(f.supports,grounding.createCalculationSupportSchema()),true);
 assert.equal(schema.matchesSchema([{...f.supports[0],value:4}],grounding.createCalculationSupportSchema()),false);
});
for(const concept of ['baseline_headcount','labor_cost_per_worker'])test(`missing ${concept} is never synthesized from totals or permission`,()=>{
 const f=fixture();f.supports=f.supports.filter(s=>s.concept!==concept);
 assert.equal(ground(f).some(s=>s.concept===concept),false);
});
for(const [name,mutate]of [
 ['wrong controlled scope',s=>s[0].scope='friday_evening'],
 ['wrong period',s=>s[0].period='last_year'],
 ['unsupported scalar',s=>s[0].support.value.quote='5'],
 ['contextual value quote',s=>s[0].support.value.quote='4 staff members'],
 ['empty value quote',s=>s[0].support.value.quote=''],
 ['unknown source',s=>s[0].support.value.source_ref='src_unknown'],
 ['wrong unit',s=>s[0].support.unit.quote='headcount'],
 ['scope borrowed from another statement',s=>s[0].support.scope=s[1].support.scope],
 ['paraphrased scope',s=>s[0].support.scope.quote='Tuesday headcount is four'],
 ['wrong currency',s=>s[1].support.currency.quote='EUR'],
 ['missing currency',s=>s[1].support.currency=null],
 ['multiple quantity values',s=>s[1].support.unit.quote='625 and 2500 per worker'],
 ])test(`${name} abstains`,()=>{
 const f=fixture();mutate(f.supports);assert.ok(ground(f).length<2);
 });
for(const [name,options]of [
 ['negative headcount',{headcount:'-4'}],['fractional headcount',{headcount:'4.5'}],
 ['negative cost',{cost:'-625'}],['out of range',{cost:'9999999999999999'}],
 ['source scope is Friday',{scope:'Friday evening'}],['source currency differs',{currency:'EUR'}],
 ])test(`${name} is not accepted`,()=>{const f=fixture(options);assert.ok(ground(f).length<2);});
test('same-value duplicate candidates abstain instead of choosing the first',()=>{
 const f=fixture();f.supports.push(structuredClone(f.supports[0]));assert.deepEqual(plain(ground(f).map(s=>s.concept)),['labor_cost_per_worker']);
});
test('conflicting source values abstain for that concept',()=>{
 const f=fixture(),other=fixture({headcount:'5'}),otherRecord=other.supports[0];
 // Construct a shared original catalog, not a candidate referencing another note.
 const text=other.baseline,extra=provenance.createEvidenceProvenance(f.evidence,f.input+'\n'+text);
 f.sources=extra.items;const source=extra.items.find(s=>s.text===text&&s.source.startsWith('source_input['));
 const idFor=text=>extra.items.find(s=>s.text===text&&s.source.startsWith('source_input[')).id;
 for(const record of f.supports)for(const anchor of Object.values(record.support).filter(Boolean))anchor.source_ref=idFor(fixture().sources.find(s=>s.id===anchor.source_ref).text);
 for(const anchor of Object.values(otherRecord.support).filter(Boolean))anchor.source_ref=anchor.quote==='last month'?idFor('The reporting period is last month.'):source.id;
 f.supports.push(otherRecord);assert.equal(ground(f).some(s=>s.concept==='baseline_headcount'),false);
});
test('derived-only per-worker cost cannot use total staffing cost or a fabricated scalar anchor',()=>{
 const f=fixture();f.supports[1].support.value=f.anchor(f.baseline,'625');assert.equal(ground(f).some(s=>s.concept==='labor_cost_per_worker'),false);
 f.supports=[];assert.equal(ground(f).length,0);
});
for(const [concept,text]of [
 ['baseline_headcount','For the affected monthly period, the authoritative baseline Tuesday evening headcount is 5 staff members.'],
 ['labor_cost_per_worker','For the affected monthly period, the labor cost per worker for Tuesday evenings is USD 700 per worker.'],
])test(`a conflicting explicit ${concept} source abstains even if extraction omitted its candidate`,()=>{
 const f=fixture({extra:[text]});assert.equal(ground(f).some(fact=>fact.concept===concept),false);
});
test('period anchors cannot be borrowed without an explicit affected-period relationship',()=>{
 const f=fixture();f.supports[0].support.scope.quote='authoritative baseline Tuesday evening headcount is 4 staff members';
 assert.equal(ground(f).some(fact=>fact.concept==='baseline_headcount'),false);
});
test('an affected monthly quantity cannot be assigned a yearly reporting period',()=>{
 assert.equal(ground(fixture({reportingPeriod:'last year'})).length,0);
});
test('a hypothetical source cannot become a trusted fact by selecting around its qualifier',()=>{
 const f=fixture(),old=f.sources.find(s=>s.id===f.supports[0].support.value.source_ref);
 old.text='If we changed scheduling, '+old.text;
 assert.equal(ground(f).some(fact=>fact.concept==='baseline_headcount'),false);
});
test('provenance revalidates values, anchors and calculation views without changing citable identities',()=>{
 const f=fixture(),old=provenance.createEvidenceProvenance(f.evidence,f.input),e=trusted(f);
 assert.deepEqual(plain(e.provenance.citable_facts),plain(old.citable_facts));assert.deepEqual(plain(e.provenance.items.slice(0,old.items.length)),plain(old.items));
 for(const mutate of [e=>e.provenance.calculation_facts[0].value=5,e=>e.provenance.calculation_facts[1].unit='currency',e=>e.provenance.calculation_facts[0].support.value.quote='5',e=>e.provenance.items.at(-1).text='{}']){
  const changed=structuredClone(e);mutate(changed);assert.equal(provenance.isEvidence(changed,true),false);
 }
});
function handoff(f=fixture()){
 const evidence=trusted(f),source=n=>evidence.provenance.items.find(s=>s.source===`source_input[${n-1}]`).id;
 const scope='tuesday_evening_6pm_10pm';
 evidence.provenance.authorization_records=load('src/app/api/analyze/evidence/authorization-atoms.ts').assembleAuthorizationRecords([
  {kind:'scoped_sales',scope,period:'month',amount:1900,currency:'USD',source_refs:[source(12)]},
  {kind:'scoped_staffing_cost',scope,period:'month',amount:2500,currency:'USD',source_refs:[source(14)]},
  {kind:'headcount_reduction_permission',scope,operation:'delta',value:-1,unit:'persons',permission:'explicit',source_refs:[source(16)]},
  {kind:'schedule_constraint',scope,intervention:'headcount_reduction',constraint:'rest_schedule_unchanged',source_refs:[source(16)]},
 ],evidence.provenance.items,'USD');
 const refs=[12,14,16].map(n=>evidence.provenance.citable_facts.find(f=>f.id.endsWith('_'+String(n).padStart(2,'0'))).id);
 const leaks={leaks:[{title:'Tuesday staffing',category:'labor',evidence_refs:refs,evidence:['Reported staffing mismatch.'],interpretation:'The source permits a staffing test.',confidence:'high'}],insufficient_evidence:[]};
 const input=scenario.buildScenarioInput({evidence,leaks,operational_context:[]}),auth=input.authorized_changes[0];assert.ok(auth);
 const scenarios={scenarios:[{title:'Tuesday staffing test',target_leak:auth.target_leak,controlled_changes:[{variable:auth.variable_label,change_type:auth.change_type,from:auth.from,value:auth.value,unit:auth.unit}],available_input_refs:auth.source_refs,missing_calculation_inputs:[],confidence:'high'}],not_simulation_ready:[]};
 return {evidence,scenarios,input_facts:input.input_facts};
}
test('existing Scenario handoff carries exact calculator JSON and supported Labor becomes calculable',()=>{
 const request=handoff(),facts=request.input_facts.filter(f=>f.source.startsWith('calculation_inputs.'));
 assert.equal(facts.length,2);for(const fact of facts)assert.equal(Object.keys(JSON.parse(fact.fact)).length,6);
 assert.equal(request.scenarios.scenarios[0].controlled_changes[0].from,null);
 assert.equal(calculator.isSimulationRequest(request),true);
 const result=calculator.calculateScenarios(request).results[0];assert.equal(result.status,'calculable');
 assert.equal(result.calculation.formula_id,'LABOR_HEADCOUNT_DELTA');assert.equal(result.calculation.baseline_value,2500);assert.equal(result.calculation.projected_value,1875);assert.equal(result.calculation.impact_value,625);
 assert.ok(result.calculation.inputs.filter(i=>i.name!=='headcount_delta').every(i=>facts.some(f=>f.id===i.source_ref)));
});
for(const concept of ['baseline_headcount','labor_cost_per_worker'])test(`handoff without ${concept} still returns not_calculable_yet`,()=>{
 const f=fixture();f.supports=f.supports.filter(s=>s.concept!==concept);const request=handoff(f);
 assert.equal(calculator.calculateScenarios(request).results[0].status,'not_calculable_yet');
});
test('caller-injected calculation input cannot bypass accepted source binding',()=>{
 const request=handoff();request.input_facts.find(f=>f.source==='calculation_inputs.baseline_headcount').id='input_999';
 assert.equal(calculator.isSimulationRequest(request),false);
 const changed=handoff();changed.input_facts.find(f=>f.source==='calculation_inputs.baseline_headcount').fact=JSON.stringify({concept:'baseline_headcount',scope:'tuesday_evening',value:8,unit:'persons',period:changed.evidence.period,currency:null});
 assert.equal(calculator.isSimulationRequest(changed),false);
});
test('authorization alone still abstains and accepted calculation facts do not change authorization identity',()=>{
 const empty=fixture();empty.supports=[];const before=handoff(empty),after=handoff();
 assert.deepEqual(plain(after.scenarios),plain(before.scenarios));
 const result=calculator.calculateScenarios(before).results[0];assert.equal(result.status,'not_calculable_yet');assert.equal(result.missing_inputs.length,2);
});
test('normal Evidence route produces validated facts from mocked extraction anchors without touching totals or authorization',async()=>{
 const f=fixture(),exports={},deps=productionModules();let calls=0;
 const code=ts.transpileModule(fs.readFileSync('src/app/api/analyze/evidence/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext(code,{exports,Response,AbortSignal,process:{env:{NEBIUS_API_KEY:'test-only'}},require:s=>deps(path.resolve('src/app/api/analyze/evidence',s+'.ts')),fetch:async(_url,options)=>{
  calls++;assert.ok(JSON.parse(options.body).response_format.json_schema.schema.required.includes('calculation_support'));
  return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({...f.evidence,authorization_atoms:[],business_total_support:[],calculation_support:f.supports})}}]});
 }});
 const response=await exports.POST(new Request('http://local',{method:'POST',body:JSON.stringify({input:f.input})}));
 assert.equal(response.status,200);const {evidence}=await response.json();assert.equal(calls,1);assert.equal(evidence.provenance.calculation_facts.length,2);assert.equal(provenance.isEvidence(evidence,true),true);
 assert.equal(evidence.calculation_support,undefined);assert.deepEqual(evidence.provenance.authorization_records,[]);
 // Existing total grounding still nulls totals lacking independent total support.
 assert.equal(evidence.revenue.total,null);assert.equal(evidence.costs.total,null);
});
test('a source reporting only total cost and headcount cannot supply a divided per-worker value',()=>{
 const f=fixture(),total='For the affected monthly period, Tuesday evenings incurred total staffing cost USD 2500.';
 const input=['The reporting period is last month.',f.baseline,total].join('\n');
 const sources=provenance.createEvidenceProvenance(f.evidence,input).items;
 const ref=text=>sources.find(s=>s.text===text&&s.source.startsWith('source_input[')).id;
 const baseline=structuredClone(f.supports[0]);for(const a of Object.values(baseline.support).filter(Boolean))a.source_ref=a.quote==='last month'?ref('The reporting period is last month.'):ref(f.baseline);
 const cost=structuredClone(f.supports[1]);for(const a of Object.values(cost.support).filter(Boolean))a.source_ref=a.quote==='last month'?ref('The reporting period is last month.'):ref(total);
 assert.equal(input.includes('625'),false);
 const facts=grounding.groundCalculationFacts([baseline,cost],sources,f.evidence);
 assert.deepEqual(plain(facts.map(f=>f.concept)),['baseline_headcount']);
});
test('a permission-only staffing quantity never becomes a missing baseline headcount',()=>{
 const f=fixture(),permission='Management approves reducing Tuesday evening staffing by 1 person.';
 const input=['The reporting period is last month.',permission,f.worker].join('\n');
 const sources=provenance.createEvidenceProvenance(f.evidence,input).items;
 const ref=text=>sources.find(s=>s.text===text&&s.source.startsWith('source_input[')).id;
 const cost=structuredClone(f.supports[1]);for(const a of Object.values(cost.support).filter(Boolean))a.source_ref=a.quote==='last month'?ref('The reporting period is last month.'):ref(f.worker);
 const fake={...structuredClone(f.supports[0]),support:{value:{source_ref:ref(permission),quote:'1'},unit:{source_ref:ref(permission),quote:'1 person'},scope:{source_ref:ref(permission),quote:permission},period:{source_ref:ref('The reporting period is last month.'),quote:'last month'},currency:null}};
 const facts=grounding.groundCalculationFacts([fake,cost],sources,f.evidence);
 assert.deepEqual(plain(facts.map(f=>f.concept)),['labor_cost_per_worker']);
});

test('diagnostics distinguish extraction omission, duplicates, grounding rejection and acceptance without changing facts',()=>{
 for(const [reason,change] of [
  ['missing_candidate',f=>{f.supports=f.supports.slice(1);}],
  ['duplicate_candidates',f=>{f.supports.push(structuredClone(f.supports[0]));}],
  ['schema_invalid',f=>{f.supports[0].scope='friday_evening';}],
  ['period_mismatch',f=>{f.supports[0].period='last year';}],
  ['unknown_source_ref',f=>{f.supports[0].support.value.source_ref='secret unknown source';}],
  ['empty_anchor',f=>{f.supports[0].support.scope.quote='';}],
  ['anchor_not_literal',f=>{f.supports[0].support.scope.quote='PRIVATE paraphrase';}],
  ['value_not_single_numeric_literal',f=>{f.supports[0].support.value.quote='4 staff members';}],
  ['scope_source_mismatch',f=>{f.supports[0].support.scope=f.supports[1].support.scope;}],
  [null,()=>{}],
 ]) {
  const f=fixture();change(f);const diagnostics=[];
  const expected=ground(f),actual=grounding.groundCalculationFacts(f.supports,f.sources,f.evidence,d=>diagnostics.push(d));
  assert.deepEqual(plain(actual),plain(expected));
  assert.equal(diagnostics[0].rejection_reason,reason);
  assert.equal(diagnostics[0].accepted,reason===null);
  assert.equal(diagnostics.length,2);
  const serialized=JSON.stringify(diagnostics);
  for(const forbidden of [f.baseline,f.worker,'PRIVATE','secret unknown source','"source_ref":','"quote":','625','USD'])assert.equal(serialized.includes(forbidden),false);
 }
 const f=fixture();assert.deepEqual(plain(grounding.groundCalculationFacts(f.supports,f.sources,f.evidence,()=>{throw Error('logger failed');})),plain(ground(f)));
 const diagnostics=[];grounding.groundCalculationFacts(undefined,f.sources,f.evidence,d=>diagnostics.push(d));
 assert.ok(diagnostics.every(d=>d.candidate_count===0&&d.rejection_reason==='missing_candidate'));
});

test('calculation logging is development-only and handoff logs contain metadata only',()=>{
 const code=ts.transpileModule(fs.readFileSync('src/app/api/analyze/evidence/calculation-facts.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 for(const env of ['development','production',undefined]){
  const logs=[],exports={};
  vm.runInNewContext(code,{exports,process:{env:{NODE_ENV:env}},console:{warn:(...args)=>logs.push(args)},require:()=>schema});
  const f=fixture(),diagnostics=[];grounding.groundCalculationFacts(f.supports,f.sources,f.evidence,d=>diagnostics.push(d));
  diagnostics.forEach(exports.logCalculationDiagnostic);
  exports.logCalculationHandoff('scenario_input',[{source:'calculation_inputs.baseline_headcount',fact:'PRIVATE BUSINESS DATA'}]);
  exports.logCalculationHandoff('simulate_input',[]);
  assert.equal(logs.length,env==='development'?6:0);
  assert.equal(JSON.stringify(logs).includes('PRIVATE'),false);
  if(env==='development'){
   assert.equal(JSON.parse(logs[2][1]).calculation_input_emitted,true);
   assert.equal(JSON.parse(logs[3][1]).calculation_input_emitted,false);
  }
 }
});

test('extraction instructions require null headcount currency and independently matching literal worker period anchors',()=>{
 const prompt=schema.evidenceSystemPrompt;
 for(const text of ['support.currency MUST be JSON null','Never emit an empty-string currency anchor',
  'Every non-null support anchor must independently satisfy',
  'SAME accepted Evidence reporting period','Do not paraphrase the period into a different expression',
  'Do not equate "affected monthly period" with "last month"',
  'omit the calculation_support candidate rather than guessing'])assert.ok(prompt.includes(text),text);
 const f=fixture();assert.equal(f.supports[0].support.currency,null);
 assert.equal(ground(f).find(fact=>fact.concept==='baseline_headcount').currency,null);
});
test('non-null empty headcount currency anchor still rejects with empty_anchor',()=>{
 const f=fixture();f.supports[0].support.currency={source_ref:f.supports[0].support.value.source_ref,quote:''};
 const diagnostics=[],facts=grounding.groundCalculationFacts(f.supports,f.sources,f.evidence,d=>diagnostics.push(d));
 assert.equal(facts.some(fact=>fact.concept==='baseline_headcount'),false);
 assert.equal(diagnostics[0].rejection_reason,'empty_anchor');
});
test('literal worker period matching accepted Evidence period passes unchanged',()=>{
 const f=fixture();assert.equal(f.supports[1].support.period.quote,f.evidence.period);
 assert.equal(ground(f).find(fact=>fact.concept==='labor_cost_per_worker').value,625);
});
for(const [name,change,reason] of [
 ['literal but mismatched period',f=>{f.supports[1].support.period=f.anchor(f.worker,'affected monthly period');},'period_anchor_mismatch'],
 ['paraphrased period',f=>{f.supports[1].support.period.quote='the preceding calendar month';},'anchor_not_literal'],
 ['empty period quote',f=>{f.supports[1].support.period.quote='';},'empty_anchor'],
 ['unsupported period reference',f=>{f.supports[1].support.period.source_ref='unknown';},'unknown_source_ref'],
 ['missing period anchor',f=>{delete f.supports[1].support.period;},'schema_invalid'],
])test(`worker cost with ${name} remains fail-closed`,()=>{
 const f=fixture();change(f);const diagnostics=[];
 const facts=grounding.groundCalculationFacts(f.supports,f.sources,f.evidence,d=>diagnostics.push(d));
 assert.equal(facts.some(fact=>fact.concept==='labor_cost_per_worker'),false);
 assert.equal(diagnostics[1].rejection_reason,reason);
 assert.equal(facts.some(fact=>fact.concept==='baseline_headcount'),true);
});

test('worker scope extraction contract requires the entire literal unit excerpt within one source span',()=>{
 for(const text of ['COMPLETE EXACT support.unit.quote','unit quote must be a literal substring of the scope quote',
  'Do not select only "Tuesday evenings"','full quantity/unit/currency expression',
  'omit the candidate; never stitch separate source regions together or paraphrase'])assert.ok(schema.evidenceSystemPrompt.includes(text),text);
});
test('worker scope containing the full quantity-bearing unit excerpt passes without affecting baseline',()=>{
 const f=fixture(),before=JSON.stringify(f.supports),diagnostics=[];
 const facts=grounding.groundCalculationFacts(f.supports,f.sources,f.evidence,d=>diagnostics.push(d));
 assert.ok(f.supports[1].support.scope.quote.includes(f.supports[1].support.unit.quote));
 assert.equal(diagnostics[1].accepted,true);assert.equal(facts[1].value,625);
 assert.equal(facts[0].concept,'baseline_headcount');assert.equal(facts[0].value,4);
 assert.equal(JSON.stringify(f.supports),before);
});
for(const quote of ['Tuesday evenings','For the affected monthly period, the labor cost per worker for Tuesday evenings'])test(`literal scope lacking complete unit excerpt rejects: ${quote}`,()=>{
 const f=fixture();f.supports[1].support.scope.quote=quote;const diagnostics=[];
 const facts=grounding.groundCalculationFacts(f.supports,f.sources,f.evidence,d=>diagnostics.push(d));
 assert.equal(diagnostics[1].rejection_reason,'scope_missing_unit_anchor');
 assert.deepEqual(plain(facts),plain(ground(fixture()).filter(fact=>fact.concept==='baseline_headcount')));
});
test('stitching noncontiguous source regions into a worker scope quote remains rejected',()=>{
 const f=fixture();
 // Both fragments occur literally, but omitting intervening text does not create a literal source span.
 const first='For the affected monthly period, ',last='USD 625 per worker';
 assert.ok(f.worker.includes(first)&&f.worker.includes(last));
 f.supports[1].support.scope.quote=first+last;
 const diagnostics=[],facts=grounding.groundCalculationFacts(f.supports,f.sources,f.evidence,d=>diagnostics.push(d));
 assert.equal(diagnostics[1].rejection_reason,'anchor_not_literal');
 assert.deepEqual(plain(facts),plain(ground(fixture()).filter(fact=>fact.concept==='baseline_headcount')));
});
test('unsupported worker scope abstains while retaining the unchanged accepted baseline fact',()=>{
 const f=fixture();f.supports[1].support.scope.quote='Tuesday evenings labor cost per worker USD 999';
 assert.deepEqual(plain(ground(f)),plain(ground(fixture()).filter(fact=>fact.concept==='baseline_headcount')));
});

test('worker unit extraction guidance explicitly requires literal per-person semantics in the unit quote itself',()=>{
 for(const text of ['support.unit.quote itself must be one contiguous literal source excerpt',
  '"per worker", "per person", "per staff member", "each worker", "each person" or "each staff member"',
  'Quantity-only spans such as "USD 625", "$625" or "625 USD"',
  'Never stitch spans, paraphrase or manufacture per-worker wording',
  'omit the candidate rather than infer it'])assert.ok(schema.evidenceSystemPrompt.includes(text),text);
});
for(const wording of ['per worker','per person','per staff member','each worker','each person','each staff member'])test(`literal worker unit form ${wording} passes without affecting baseline`,()=>{
 const f=fixture({costUnit:wording});f.supports[1].support.unit.quote=`USD 625 ${wording}`;
 const diagnostics=[],facts=grounding.groundCalculationFacts(f.supports,f.sources,f.evidence,d=>diagnostics.push(d));
 assert.equal(diagnostics[1].accepted,true);assert.equal(facts[1].unit,'currency_per_person');assert.equal(facts[1].value,625);
 assert.deepEqual(plain(facts[0]),plain(ground(fixture({costUnit:wording}))[0]));
});
for(const [name,quote] of [
 ['stitched unit span','labor cost per worker USD 625'],
 ['invented per-person wording','USD 625 per person'],
])test(`${name} remains rejected by literal grounding`,()=>{
 const f=fixture();f.supports[1].support.unit.quote=quote;const diagnostics=[];
 const facts=grounding.groundCalculationFacts(f.supports,f.sources,f.evidence,d=>diagnostics.push(d));
 assert.equal(diagnostics[1].rejection_reason,'anchor_not_literal');
 assert.deepEqual(plain(facts),plain(ground(fixture()).filter(fact=>fact.concept==='baseline_headcount')));
});

function bindingFixture(statement, scope=statement, extra=[]){
 const f=fixture();
 f.input=['The reporting period is last month.',f.baseline,statement,...extra].join('\n');
 f.sources=provenance.createEvidenceProvenance(f.evidence,f.input).items;
 const anchor=(text,quote)=>({source_ref:f.sources.find(s=>s.source.startsWith('source_input[')&&s.text===text).id,quote});
 for(const a of Object.values(f.supports[0].support).filter(Boolean))a.source_ref=anchor(a.quote==='last month'?'The reporting period is last month.':f.baseline,a.quote).source_ref;
 f.supports[1].support={value:anchor(statement,'625'),unit:anchor(statement,'USD 625'),scope:anchor(statement,scope),period:anchor(statement,'last month'),currency:anchor(statement,'USD')};
 return f;
}
for(const wording of ['per worker','per person','per staff member','each worker','each person','each staff member'])test(`bounded unit binding recognizes ${wording} without mutation and is idempotent`,()=>{
 const statement=`The authoritative labor cost ${wording} for Tuesday evenings last month was USD 625.`;
 const f=bindingFixture(statement),before=JSON.stringify(f.supports),facts=ground(f);
 assert.equal(facts.length,2);assert.equal(facts[1].value,625);
 assert.equal(facts[1].support.unit.quote,`${wording} for Tuesday evenings last month was USD 625`);
 assert.ok(statement.includes(facts[1].support.unit.quote));
 assert.equal(facts[1].support.unit.source_ref,f.supports[1].support.unit.source_ref);
 assert.equal(JSON.stringify(f.supports),before);
 assert.deepEqual(plain(grounding.groundCalculationFacts(facts.map(({concept,scope,period,support})=>({concept,scope,period,support})),f.sources,f.evidence)),plain(facts));
 assert.equal(grounding.validateCalculationFacts(facts,f.sources,f.evidence),true);
 assert.equal(provenance.isEvidence(trusted(f),true),true);
 assert.deepEqual(plain(facts[0]),plain(grounding.groundCalculationFacts([f.supports[0]],f.sources,f.evidence)[0]));
});
test('sufficient unit anchors are preserved exactly',()=>{
 const f=fixture(),original=plain(f.supports[1].support.unit);
 assert.deepEqual(plain(ground(f)[1].support.unit),original);
});
for(const [name,statement,scope,extra] of [
 ['outside accepted scope','Labor cost per worker for Tuesday evenings last month was USD 625.','Tuesday evenings last month was USD 625',[]],
 ['another statement','Labor cost for Tuesday evenings last month was USD 625.',undefined,['Labor cost is reported per worker.']],
 ['another numeric token','Labor cost per worker for 2 Tuesday evenings last month was USD 625.',undefined,[]],
 ['unsupported wording','Labor cost per employee for Tuesday evenings last month was USD 625.',undefined,[]],
 ['hyphenated wording','Labor cost per-worker for Tuesday evenings last month was USD 625.',undefined,[]],
])test(`binding rejects ${name} with per_worker_unit_missing`,()=>{
 const f=bindingFixture(statement,scope,extra),diagnostics=[];
 const facts=grounding.groundCalculationFacts(f.supports,f.sources,f.evidence,d=>diagnostics.push(d));
 assert.equal(diagnostics[1].rejection_reason,'per_worker_unit_missing');
 assert.deepEqual(plain(facts),plain(grounding.groundCalculationFacts([f.supports[0]],f.sources,f.evidence)));
});
for(const [name,mutate,reason] of [
 ['wrong source',f=>{f.supports[1].support.unit.source_ref=f.supports[0].support.unit.source_ref;},'anchor_not_literal'],
 ['wrong scope',f=>{f.supports[1].support.scope.quote='USD 625';},'wrong_scope'],
 ['wrong period',f=>{f.supports[1].period='this month';},'period_mismatch'],
 ['wrong currency',f=>{f.evidence.currency='EUR';},'currency_mismatch'],
 ['invented unit',f=>{f.supports[1].support.unit.quote='USD 625 per person';},'anchor_not_literal'],
 ['stitched scope',f=>{f.supports[1].support.scope.quote='labor cost per worker USD 625';},'anchor_not_literal'],
])test(`binding cannot repair ${name}`,()=>{
 const f=bindingFixture('The authoritative labor cost per worker for Tuesday evenings last month was USD 625.');
 mutate(f);const diagnostics=[];
 grounding.groundCalculationFacts(f.supports,f.sources,f.evidence,d=>diagnostics.push(d));
 assert.equal(diagnostics[1].rejection_reason,reason);
 assert.equal(diagnostics[0].accepted,true);
});
