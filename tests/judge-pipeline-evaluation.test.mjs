import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {cases} from '../scripts/evaluation/judge-pipeline/cases.mjs';
import {auditCase} from '../scripts/evaluation/judge-pipeline/audit.mjs';
const saved=JSON.parse(fs.readFileSync('docs/evaluations/leak-ultra-switch/live-case-a.json'));
const raw=()=>({calls:structuredClone(saved.outcome.calls),complete:true,total_latency_ms:saved.total_latency_ms,timeline:structuredClone(saved.timeline),server_diagnostics:[]});
const oracle={id:'offline',category:'test fixture',expected:{labor_authorization:true,waste_authorization:false,expected_findings:['labor','waste','delivery'],allowed_findings:['labor','waste','delivery']}};
test('twelve unique varied notes declare structural safety oracles before execution',()=>{
 assert.equal(cases.length,12);assert.equal(new Set(cases.map(c=>c.id)).size,12);assert.equal(new Set(cases.map(c=>c.note)).size,12);
 for(const c of cases){assert.ok(c.note.length>100);assert.equal(typeof c.expected.labor_authorization,'boolean');assert.equal(typeof c.expected.waste_authorization,'boolean');assert.equal(c.expected.delivery_authorization,false);assert.ok(c.expected.prohibited.length>0);assert.equal(c.expected.retries,false);}
 assert.equal(cases.find(c=>c.id==='J03').expected.labor_authorization,false);assert.equal(cases.find(c=>c.id==='J05').expected.waste_authorization,true);assert.deepEqual(cases.at(-1).expected.allowed_findings,[]);
});
test('offline audit of a real completed artifact checks calculator/Gate/Decision without provider calls',()=>{
 const result=auditCase(oracle,raw());assert.equal(result.classification,'PASS');assert.deepEqual(result.violations,[]);assert.equal(result.checks.calculator_exact_recompute,true);assert.equal(result.checks.gate_exact_recompute,true);assert.equal(result.checks.decision_validation.ok,true);
});
test('unexpected authorization and incorrect trusted binding are safety failures',()=>{
 const input=raw();input.calls.find(c=>c.url.endsWith('/leaks')).response.leaks.leaks[1].intervention_ref='headcount_reduction';
 const result=auditCase({...oracle,expected:{...oracle.expected,labor_authorization:false}},input);assert.equal(result.classification,'FAIL');assert.ok(result.violations.some(v=>v.kind==='unsupported_authorization'));assert.ok(result.violations.some(v=>v.kind==='incorrect_binding'));
});
test('safe missed finding is PARTIAL; fail-closed provider timeout is separately classified FAIL',()=>{
 const r=auditCase({...oracle,expected:{...oracle.expected,expected_findings:['labor','waste','delivery','pricing']}},raw());assert.equal(r.classification,'PARTIAL');
 const input={calls:[{url:'/api/analyze/evidence',body:{input:'Currency USD.'},status:502,response:{error:'Evidence provider is unavailable or returned an invalid response.'},started:0,finished:60000}],complete:false,error:'Evidence failed',total_latency_ms:60000,timeline:[],server_diagnostics:[{label:'Evidence provider rejection',diagnostic:{reason:'provider_timeout',configured_timeout_ms:60000,elapsed_ms:60000}}]};
 const fail=auditCase(oracle,input);assert.equal(fail.classification,'FAIL');assert.equal(fail.failure_category,'provider_timeout');assert.equal(fail.violations.length,0);
});
test('Scenario error envelope is recorded as a stage failure without treating it as valid Scenario data',()=>{
 const input=raw();input.calls=input.calls.slice(0,3);input.calls[2].status=502;input.calls[2].response={error:'Scenario provider returned invalid findings.'};input.complete=false;input.error='Scenario analysis failed';
 const r=auditCase(oracle,input);assert.equal(r.classification,'FAIL');assert.equal(r.first_failing_stage,'/api/analyze/scenarios');assert.equal(r.scenario,null);assert.equal(r.checks.scenario_authorization_validation,undefined);
});
