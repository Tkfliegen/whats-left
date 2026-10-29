import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {completeLabor} from './helpers/complete-labor.mjs';

const exactNote=fs.readFileSync('tests/fixtures/complete-labor-monthly.txt','utf8');
function fixture({alias,recordPeriod='month',evidencePeriod='month'}={}) {
 const f=completeLabor(),old=f.evidence.provenance;
 f.note=exactNote;f.evidence.period=evidencePeriod;
 if(alias)f.note=f.note.replace('affected monthly reporting period',alias).replace('per staff member monthly','per staff member '+alias);
 const p=f.load('src/app/api/analyze/evidence/provenance.ts');
 f.evidence.provenance=p.createEvidenceProvenance(f.evidence,f.note,[]);
 const sources=f.evidence.provenance.items,original=prefix=>sources.find(s=>/^source_input\[\d+\]$/.test(s.source)&&s.text.startsWith(prefix));
 const head=original('The current baseline'),worker=original('The Tuesday evening labor cost');
 const anchor=(source,quote)=>({source_ref:source.id,quote});
 f.supports=[{concept:'baseline_headcount',scope:'tuesday_evening',period:recordPeriod,support:{value:anchor(head,'4'),unit:anchor(head,'4 staff members'),scope:anchor(head,head.text),period:anchor(head,alias??'affected monthly reporting period'),currency:null}},
 {concept:'labor_cost_per_worker',scope:'tuesday_evening',period:recordPeriod,support:{value:anchor(worker,'625'),unit:anchor(worker,'USD 625 per staff member'),scope:anchor(worker,worker.text),period:anchor(worker,alias??'monthly'),currency:anchor(worker,'USD')}}];
 const remap=id=>sources.find(s=>s.source===old.items.find(item=>item.id===id).source).id;
 for(const fact of f.record.supporting_facts)fact.source_refs=fact.source_refs.map(remap);
 f.record.permission_source_refs=f.record.permission_source_refs.map(remap);f.record.constraint_source_refs=f.record.constraint_source_refs.map(remap);
 f.evidence.provenance.authorization_records=[f.record];
 f.finding.evidence_refs=f.finding.evidence_refs.map(id=>{const refs=old.citable_facts.find(fact=>fact.id===id).source_refs.map(remap);return f.evidence.provenance.citable_facts.find(fact=>JSON.stringify(fact.source_refs)===JSON.stringify(refs)).id;});
 return f;
}
const plain=value=>JSON.parse(JSON.stringify(value));
function ground(f){return f.load('src/app/api/analyze/evidence/calculation-facts.ts').groundCalculationFacts(f.supports,f.evidence.provenance.items,f.evidence);}

for(const alias of ['month','monthly','per month','each month','monthly reporting period','affected monthly period','affected monthly reporting period'])test(`literal generic monthly alias grounds: ${alias}`,()=>{
 const f=fixture({alias,evidencePeriod:'monthly'}),before=JSON.stringify(f.supports);
 const facts=ground(f);assert.equal(facts.length,2);assert.ok(facts.every(fact=>fact.period==='monthly'));
 assert.equal(JSON.stringify(f.supports),before);
 assert.equal(f.load('src/app/api/analyze/evidence/calculation-facts.ts').validateCalculationFacts(facts,f.evidence.provenance.items,f.evidence),true);
});
test('exact captured provider period anchors now ground without rewriting original quotes',()=>{
 const f=fixture();f.supports[1].support.unit.quote='USD 625 per staff member monthly';const facts=ground(f);assert.equal(facts.length,2);
 assert.equal(facts[0].support.period.quote,'affected monthly reporting period');assert.equal(facts[1].support.period.quote,'monthly');
 assert.deepEqual(plain(facts.map(fact=>[fact.concept,fact.value,fact.period])),[['baseline_headcount',4,'month'],['labor_cost_per_worker',625,'month']]);
});
test('equivalent record metadata uses the unchanged Evidence spelling at the calculator boundary',()=>{
 for(const recordPeriod of ['monthly','per month','each month','monthly reporting period']){
  const f=fixture({recordPeriod}),facts=ground(f);assert.equal(facts.length,2);assert.ok(facts.every(fact=>fact.period==='month'));
  assert.equal(f.load('src/app/api/analyze/evidence/calculation-facts.ts').validateCalculationFacts(facts,f.evidence.provenance.items,f.evidence),true);
 }
});
for(const period of ['day','week','quarter','year','daily','weekly','quarterly','yearly','last month','this month','September 2026','2026-09','month or week','approximately monthly','every other month','monthly and yearly'])test(`generic monthly source cannot establish a different/ambiguous period: ${period}`,()=>{
 const f=fixture({recordPeriod:period,evidencePeriod:period});assert.equal(ground(f).length,0);
});
test('record and Evidence incompatible periods still reject',()=>assert.equal(ground(fixture({recordPeriod:'week',evidencePeriod:'month'})).length,0));
test('an invented monthly anchor is not rescued by canonicalization',()=>{
 const f=fixture();f.supports[0].support.period.quote='each month';assert.equal(ground(f).some(fact=>fact.concept==='baseline_headcount'),false);
});
test('monthly aliases cannot borrow unrelated source scope',()=>{
 const f=fixture();f.supports[1].support.scope=f.supports[0].support.scope;assert.equal(ground(f).some(fact=>fact.concept==='labor_cost_per_worker'),false);
});
test('exact note reaches real calculator and Gate using grounded facts; no synthetic numeric inputs',()=>{
 const f=fixture(),p=f.load('src/app/api/analyze/evidence/provenance.ts'),facts=ground(f);
 f.evidence.provenance={...p.createEvidenceProvenance(f.evidence,f.note,facts),authorization_records:[f.record]};
 const input=f.load('src/app/api/analyze/scenarios/scenarios.ts').buildScenarioInput({evidence:f.evidence,leaks:{leaks:[f.finding],insufficient_evidence:[]},operational_context:[]});
 const a=input.authorized_changes[0];assert.ok(a);
 const scenarios={scenarios:[{title:'Test Tuesday staffing',target_leak:a.target_leak,controlled_changes:[{variable:a.variable_label,change_type:a.change_type,from:a.from,value:a.value,unit:a.unit}],available_input_refs:a.source_refs,missing_calculation_inputs:[],confidence:'high'}],not_simulation_ready:[]};
 const simulation=f.load('src/lib/scenario-calculator.ts').calculateScenarios({evidence:f.evidence,scenarios,input_facts:input.input_facts});
 const r=simulation.results[0];assert.equal(r.status,'calculable');assert.equal(r.calculation.baseline_value,2500);assert.equal(r.calculation.projected_value,1875);assert.equal(r.calculation.impact_value,625);
 assert.equal(f.load('src/lib/decision-gate.ts').evaluateDecisionGate({evidence:f.evidence,scenarios,simulation}).decision_gate,'action_allowed');
});
test('derived margin remains rejected in insufficient-evidence text',()=>{
 const f=fixture();
 const result={leaks:[],insufficient_evidence:[{topic:'Business margin',reason:'Revenue USD 100,000 minus costs USD 95,800 leaves USD 4,200 margin.'}]};
 const r=f.load('src/app/api/analyze/leaks/output.ts').validateLeakOutput(result,f.evidence);
 assert.equal(r.reason,'unreported_number');assert.equal(r.field,'insufficient_evidence[0].reason');assert.deepEqual(Array.from(r.numbers),['4200']);
});
test('closing live output remains blocked: unreported share first, false title independently',()=>{
 const f=fixture(),validate=f.load('src/app/api/analyze/leaks/output.ts').validateLeakOutput;
 const title='Tuesday evening staffing cost exceeds sales for the affected monthly period';
 const interpretation='Tuesday evening staffing cost of USD 2,500 per month represents 31.3% of the USD 8,000 in Tuesday evening sales for the affected monthly period.';
 const result={leaks:[{...f.finding,title,interpretation}],insufficient_evidence:[]};
 const rejection=validate(result,f.evidence);assert.equal(rejection.reason,'unreported_number');assert.equal(rejection.field,'leaks[0].interpretation');assert.deepEqual(Array.from(rejection.numbers),['31.3']);
 // Independent fixture isolates the title boundary; no rejected provider output
 // is repaired or forwarded by production.
 const titleOnly={leaks:[{...f.finding,title}],insufficient_evidence:[]};
 assert.equal(validate(titleOnly,f.evidence).reason,'unverified_comparison');
});
test('producer instructions prohibit arithmetic in all fields and false comparative titles',()=>{
 const prompt=fixture().load('src/app/api/analyze/leaks/leaks.ts').leakSystemPrompt;
 for(const text of ['EVERY output field','insufficient_evidence.reason','never subtract costs from revenue','Staffing cost below sales must never be described as exceeding sales'])assert.ok(prompt.includes(text));
});
