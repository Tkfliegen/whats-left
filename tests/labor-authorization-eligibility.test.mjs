import test from 'node:test';
import assert from 'node:assert/strict';
import {completeLabor} from './helpers/complete-labor.mjs';

function evaluate(f,findings=[f.finding]) {
 const request={evidence:f.evidence,leaks:{leaks:findings,insufficient_evidence:[]},operational_context:[]};
 const bindings=f.load('src/app/api/analyze/leaks/binding.ts').resolveLeakInterventions(findings,f.evidence);
 const input=f.load('src/app/api/analyze/scenarios/scenarios.ts').buildScenarioInput(request);
 return {bindings:Array.from(bindings),input};
}
for(const sales of [8000,2500])test(`complete Labor permission remains eligible at sales ${sales}, cost 2500`,()=>{
 const f=completeLabor({sales}),snapshot=JSON.stringify(f.evidence);
 const {validateAuthorizationRecords,requiredAuthorizationSources}=f.load('src/app/api/analyze/evidence/authorization-records.ts');
 assert.equal(validateAuthorizationRecords([f.record],f.evidence.provenance.items,'USD'),true);
 assert.equal(requiredAuthorizationSources(f.record).length,4);
 const {bindings,input}=evaluate(f);assert.deepEqual(bindings,['headcount_reduction']);assert.equal(input.authorized_changes.length,1);
 assert.equal(input.authorized_changes[0].value,-1);assert.equal(JSON.stringify(f.evidence),snapshot);
});
test('Leak binding still requires the correct category',()=>{
 const f=completeLabor();f.finding.category='delivery';assert.deepEqual(evaluate(f).bindings,[null]);
});
test('complete citation coverage is required independently by Leak and Scenario',()=>{
 const f=completeLabor();f.finding.evidence_refs.pop();const result=evaluate(f);assert.deepEqual(result.bindings,[null]);assert.equal(result.input.authorized_changes.length,0);
 const r=f.load('src/app/api/analyze/leaks/output.ts').validateLeakOutput({leaks:[f.finding],insufficient_evidence:[]},f.evidence);
 assert.equal(r.reason,'incomplete_citation_support');
});
test('multiple findings cannot claim one authorization',()=>{
 const f=completeLabor();const result=evaluate(f,[f.finding,{...f.finding,title:'Another staffing finding'}]);
 assert.deepEqual(result.bindings,[null,null]);assert.equal(result.input.authorized_changes.length,0);
});
for(const [name,mutate] of [
 ['permission',f=>{f.record.permission='absent';f.record.permission_source_refs=[];}],
 ['schedule constraint',f=>{f.record.constraint='none';f.record.constraint_source_refs=[];}],
 ['supporting role',f=>{f.record.supporting_facts.pop();}],
 ['supporting source',f=>{f.record.supporting_facts[0].source_refs=['nonexistent'];}],
 ['original source',f=>{f.evidence.provenance.items=f.evidence.provenance.items.filter(s=>s.id!==f.record.supporting_facts[0].source_refs[0]);}],
])test(`missing ${name} remains ineligible`,()=>{
 const f=completeLabor();mutate(f);const result=evaluate(f);assert.deepEqual(result.bindings,[null]);assert.equal(result.input.authorized_changes.length,0);
});
test('Scenario independently matches the record, not the intervention_ref field',()=>{
 const f=completeLabor();f.finding.intervention_ref=null;assert.equal(evaluate(f).input.authorized_changes.length,1);
 f.finding.intervention_ref='headcount_reduction';f.finding.evidence_refs.pop();assert.equal(evaluate(f).input.authorized_changes.length,0);
});
test('eligible test with missing trusted calculation facts produces no calculated savings',()=>{
 const f=completeLabor(),{input}=evaluate(f),a=input.authorized_changes[0];
 const scenarios={scenarios:[{title:'Test Tuesday staffing',target_leak:a.target_leak,controlled_changes:[{variable:a.variable_label,change_type:a.change_type,from:a.from,value:a.value,unit:a.unit}],available_input_refs:a.source_refs,missing_calculation_inputs:[],confidence:'high'}],not_simulation_ready:[]};
 const simulation=f.load('src/lib/scenario-calculator.ts').calculateScenarios({evidence:f.evidence,scenarios,input_facts:input.input_facts});
 assert.equal(simulation.results[0].status,'not_calculable_yet');assert.equal(simulation.results[0].calculation,null);
 const gate=f.load('src/lib/decision-gate.ts').evaluateDecisionGate({evidence:f.evidence,scenarios,simulation});
 assert.notEqual(gate.decision_gate,'action_allowed');
});
