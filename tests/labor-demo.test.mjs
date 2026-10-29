import test from 'node:test';
import assert from 'node:assert/strict';
import {laborDemo} from './helpers/labor-demo.mjs';

function validate(text,mutate=()=>{}){
 const f=laborDemo();mutate(f);f.finding.title=text;
 return f.load('src/app/api/analyze/leaks/output.ts').validateLeakOutput({leaks:[f.finding],insufficient_evidence:[]},f.evidence);
}
test('explicit actual and target percentages have original source provenance and shared monthly sales scope',()=>{
 const f=laborDemo();
 assert.ok(f.evidence.provenance.citable_facts.some(fact=>fact.text===f.actual.text&&fact.text.includes('31.25%')));
 assert.ok(f.evidence.provenance.citable_facts.some(fact=>fact.text===f.target.text&&fact.text.includes('25%')));
 assert.equal(validate(f.finding.title).ok,true);
});
for(const word of ['exceeds','is greater than','is higher than','is above'])test(`reported actual share ${word} target passes`,()=>assert.equal(validate(`Tuesday evening labor cost share ${word} management target`).ok,true));
for(const word of ['is less than','is lower than','is below','equals'])test(`contradicted share comparison ${word} rejects`,()=>assert.equal(validate(`Tuesday evening labor cost share ${word} management target`).ok,false));
test('monetary cost-exceeds-sales claim still rejects on the new fixture',()=>assert.equal(validate('Tuesday evening staffing cost exceeds sales revenue').reason,'unverified_comparison'));
test('reverse source-supported percentage comparison passes',()=>assert.equal(validate('Management target is below actual Tuesday evening labor cost share').ok,true));
test('model category cannot bypass a contradicted share comparison bound to Labor sources',()=>assert.equal(validate('Actual share is below management target',f=>{f.finding.category='operations';}).ok,false));
for(const [name,edit] of [
 ['missing actual citation',f=>{f.finding.evidence_refs=f.finding.evidence_refs.filter(id=>!f.evidence.provenance.citable_facts.find(fact=>fact.id===id).source_refs.includes(f.actual.id));}],
 ['missing target citation',f=>{f.finding.evidence_refs=f.finding.evidence_refs.filter(id=>!f.evidence.provenance.citable_facts.find(fact=>fact.id===id).source_refs.includes(f.target.id));}],
 ['mismatched period',f=>{f.evidence.period='week';}],
 ['ambiguous role record',f=>{f.evidence.provenance.authorization_records.push(structuredClone(f.record));}],
])test(`${name} cannot support a share comparison`,()=>assert.equal(validate('Tuesday evening labor cost share exceeds management target',edit).ok,false));
for(const title of ['Friday evening labor cost share exceeds management target','Tuesday evening labor cost share of 25% exceeds management target of 31.25%','Tuesday evening labor cost share exceeds management target in USD','Actual waste share exceeds labor target'])test(`unsupported or incompatible operands reject: ${title}`,()=>assert.equal(validate(title).ok,false));
test('reported percentages do not authorize new derived savings, gaps or shares',()=>{
 for(const claim of ['The gap is 6.25 percentage points.','The projected labor share is 23.4375%.','The staffing cost is 31.3% of sales.']){
  const f=laborDemo();f.finding.interpretation=claim;
  assert.equal(f.load('src/app/api/analyze/leaks/output.ts').validateLeakOutput({leaks:[f.finding],insufficient_evidence:[]},f.evidence).ok,false);
 }
});
test('a headcount source cannot masquerade as the monthly monetary sales denominator',()=>{
 assert.equal(validate('Tuesday evening labor cost share exceeds management target',f=>{
  const sales=f.record.supporting_facts.find(fact=>fact.role==='sales');sales.value=4;sales.source_refs=[f.head.id];
 }).ok,false);
});
test('share verification uses the same bounded generic-month identity as calculation grounding',()=>{
 for(const period of ['monthly','per month','each month','monthly reporting period','affected monthly reporting period']){
  assert.equal(validate('Tuesday evening labor cost share exceeds management target',f=>{
   f.evidence.period=period;f.evidence.provenance={...f.load('src/app/api/analyze/evidence/provenance.ts').createEvidenceProvenance(f.evidence,f.note,[]),authorization_records:[f.record]};
  }).ok,true);
 }
});
for(const interpretation of [
 'Tuesday evening labor cost share is 31.25%, which is above the management target of no more than 25% of Tuesday evening sales. The current staffing level is 4 staff members costing USD 2,500 per month. Management has approved testing a reduction of 1 staff member on Tuesday evenings while keeping all other schedules unchanged.',
 'Tuesday evening labor cost share is reported at 31.25% of Tuesday evening sales, which is above the management target of no more than 25%. The current staffing level is 4 staff members at a total cost of USD 2,500 per month (USD 625 per staff member). Management has approved a test reducing headcount by 1 staff member on Tuesday evenings while keeping all other schedules unchanged.',
])test('captured valid relative-clause comparison and nested target upper bound pass unchanged',()=>{
 const f=laborDemo();f.finding.interpretation=interpretation;
 if(interpretation.includes('625'))f.finding.evidence_refs.push(f.evidence.provenance.citable_facts.find(fact=>fact.source_refs.length===1&&fact.source_refs[0]===f.worker.id).id);
 const result={leaks:[f.finding],insufficient_evidence:[]},before=JSON.stringify(result);
 assert.equal(f.load('src/app/api/analyze/leaks/output.ts').validateLeakOutput(result,f.evidence).ok,true);assert.equal(JSON.stringify(result),before);
});
for(const interpretation of [
 'Tuesday evening labor cost share is 31.25%, which is below the management target of no more than 25%.',
 'Tuesday evening labor cost share is 31.25%, which is above the management target of no more than 31.25%.',
 'Friday evening labor cost share is 31.25%, which is above the management target of no more than 25%.',
 'Tuesday evening labor cost share is not above the management target of no more than 25%.',
])test(`relative-clause support never repairs contradicted values, bounds, scope or negation: ${interpretation}`,()=>{
 const f=laborDemo();f.finding.interpretation=interpretation;
 assert.equal(f.load('src/app/api/analyze/leaks/output.ts').validateLeakOutput({leaks:[f.finding],insufficient_evidence:[]},f.evidence).ok,false);
});
test('true Labor demo grounds both facts, binds explicit permission and calculates the approved test',()=>{
 const f=laborDemo(),before=JSON.stringify(f.evidence);
 assert.deepEqual(Array.from(f.evidence.provenance.calculation_facts,fact=>fact.value),[4,625]);
 const records=f.load('src/app/api/analyze/evidence/authorization-records.ts');assert.ok(records.requiredAuthorizationSources(f.record));
 const input=f.load('src/app/api/analyze/scenarios/scenarios.ts').buildScenarioInput({evidence:f.evidence,leaks:{leaks:[f.finding],insufficient_evidence:[]},operational_context:[]}),a=input.authorized_changes[0];assert.ok(a);
 const scenarios={scenarios:[{title:'Test Tuesday staffing',target_leak:a.target_leak,controlled_changes:[{variable:a.variable_label,change_type:a.change_type,from:a.from,value:a.value,unit:a.unit}],available_input_refs:a.source_refs,missing_calculation_inputs:[],confidence:'high'}],not_simulation_ready:[]};
 const simulation=f.load('src/lib/scenario-calculator.ts').calculateScenarios({evidence:f.evidence,scenarios,input_facts:input.input_facts});
 assert.equal(simulation.results[0].status,'calculable');const calc=simulation.results[0].calculation;
 assert.equal(calc.baseline_value,2500);assert.equal(calc.projected_value,1875);assert.equal(calc.impact_value,625);
 assert.equal(f.load('src/lib/decision-gate.ts').evaluateDecisionGate({evidence:f.evidence,scenarios,simulation}).decision_gate,'action_allowed');
 assert.equal(JSON.stringify(f.evidence),before);
});
