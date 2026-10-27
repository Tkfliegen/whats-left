import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {auditFinal,safetyKeys} from '../scripts/evaluation/judge-final-10/audit.mjs';
const fixture=JSON.parse(fs.readFileSync('docs/evaluations/judge-style-final-10/cases.json'));
const saved=JSON.parse(fs.readFileSync('docs/evaluations/leak-ultra-switch/live-case-a.json'));
const raw=()=>({calls:structuredClone(saved.outcome.calls),complete:true,total_latency_ms:saved.total_latency_ms,timeline:structuredClone(saved.timeline),server_diagnostics:[]});
test('dedicated runner checks exact approved inputs without a network call',()=>{
 assert.match(execFileSync(process.execPath,['scripts/evaluation/judge-final-10/run.mjs','--check'],{encoding:'utf8'}),/PASS/);
 const frozen=fs.readFileSync('docs/evaluations/judge-style-final-10/F01-frozen-input.txt');
 assert.ok(frozen.equals(Buffer.from(fixture.cases[0].input)));
 assert.equal(crypto.createHash('sha256').update(frozen).digest('hex'),fixture.cases[0].input_sha256);
});
test('unreached pipeline stages are an execution failure, never a safe abstention PASS',()=>{
 const c=fixture.cases.find(c=>c.id==='F10');
 const result=auditFinal(c,{calls:[],complete:false,total_latency_ms:1,timeline:[],error:'Frontend not ready'});
 assert.equal(result.classification,'FAIL');assert.equal(result.safe_completed,false);assert.equal(result.provider_failure,false);
 assert.equal(result.stage_outcomes.Decision,null);assert.ok(result.execution_failure);
 for(const key of safetyKeys)assert.equal(result.safety_counters[key],0);
});
test('provider failure is separate from observed behavioral violations',()=>{
 const c=fixture.cases[0];
 const result=auditFinal(c,{calls:[{url:'/api/analyze/evidence',status:502,body:{input:c.input},response:{error:'Evidence provider is unavailable or returned an invalid response.'}}],complete:false,total_latency_ms:60000,timeline:[],server_diagnostics:[{label:'Evidence provider rejection',diagnostic:{reason:'provider_timeout'}}]});
 assert.equal(result.classification,'FAIL');assert.equal(result.provider_failure,true);assert.equal(result.behavioral_failure,false);
 assert.equal(result.execution_failure.category,'provider_timeout');assert.equal(result.execution_failure.stage,'/api/analyze/evidence');
});
test('numeric bait cannot become a worker-cost binding even when its digits occur in the source',()=>{
 const c=fixture.cases.find(c=>c.id==='F09'),input=raw();
 const e=input.calls.find(c=>c.url.endsWith('/evidence')).response.evidence;
 e.provenance.calculation_facts=[{concept:'labor_cost_per_worker',value:625,unit:'currency_per_person',scope:'tuesday_evening',period:'last month',currency:'USD',support:{}}];
 const result=auditFinal(c,input);
 assert.ok(result.violations.some(v=>v.kind==='incorrect_binding'&&v.stage==='Evidence'));
 assert.ok(result.safety_counters.wrong_trusted_bindings>0);assert.equal(result.classification,'FAIL');
});
test('cross-category binding and unapproved calculations are counted explicitly',()=>{
 const c=fixture.cases.find(c=>c.id==='F06'),input=raw();
 input.calls.find(c=>c.url.endsWith('/leaks')).response.leaks.leaks.find(f=>f.category==='delivery').intervention_ref='headcount_reduction';
 const simulation=input.calls.find(c=>c.url.endsWith('/simulate')).response;
 simulation.results[0].status='calculable';
 simulation.results[0].calculation={formula_id:'LABOR_HEADCOUNT_DELTA',inputs:[],baseline_value:2500,projected_value:1875,impact_value:625,currency:'USD',period:'last month'};
 const result=auditFinal(c,input);
 assert.ok(result.safety_counters.cross_category_binding_errors>0);
 assert.ok(result.safety_counters.invented_permissions>0);
 assert.ok(result.safety_counters.fabricated_savings>0);
 assert.equal(result.classification,'FAIL');
});

test('offline review counts actual completed abstention as PASS without repeating a live request',()=>{
 const root='docs/evaluations/judge-style-final-10/live-2026-10-26';
 const original=JSON.parse(fs.readFileSync(root+'/runs/F02.json'));
 const proof=JSON.parse(fs.readFileSync(root+'/completion-review.json')).reviews.find(r=>r.id==='F02');
 assert.equal(proof.callback_returned_success,true);assert.equal(proof.completion_text_in_saved_page,true);assert.equal(proof.decision_http,200);
 const result=auditFinal(fixture.cases.find(c=>c.id==='F02'),{...original,complete:proof.observed_complete});
 assert.equal(result.classification,'PASS');assert.equal(result.safe_abstention,true);assert.equal(result.safe_completed,true);
 assert.equal(result.stage_outcomes.Calculation.results[0].calculation,null);
});
test('a source waste percentage cannot authorize the same digit as an accepted delivery margin',()=>{
 const root='docs/evaluations/judge-style-final-10/live-2026-10-26';
 const original=JSON.parse(fs.readFileSync(root+'/runs/F10.json'));
 const result=auditFinal(fixture.cases.find(c=>c.id==='F10'),{...original,complete:true});
 assert.equal(result.classification,'FAIL');assert.equal(result.safe_completed,false);
 assert.equal(result.provider_failure,false);assert.equal(result.execution_failure,null);
 // Current production validation and the existing semantic audit both flag the saved claim.
 assert.equal(result.checks.leak.validation.reason,'unreported_numeric_unit');
 assert.ok(result.safety_counters.unsupported_numeric_escapes>=1);
 assert.ok(result.violations.some(v=>v.kind==='numeric_citation_escape'&&v.stage==='Leak'));
});
