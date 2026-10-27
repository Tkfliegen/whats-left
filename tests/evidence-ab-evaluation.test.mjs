import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {cases,unknownEvidence} from '../scripts/evaluation/evidence-ab/cases.mjs';
import {captureRequest,judgeCompletion,judgeAtoms,runProviderCall,models,timeoutMs,productionModel,summarize} from '../scripts/evaluation/evidence-ab/evaluate.mjs';
const atoms=note=>note.expected_atoms.map(({allowed_source_refs,...atom})=>{void allowed_source_refs;return structuredClone(atom);});
const completion=value=>({choices:[{finish_reason:'stop',message:{content:JSON.stringify({...unknownEvidence,currency:'USD',business_total_support:[],calculation_support:[],authorization_atoms:value})}}]});
test('eight annotated notes cover exact Case A, varied positives and fail-closed controls',()=>{
 assert.equal(cases.length,8);assert.equal(cases[0].input,JSON.parse(fs.readFileSync('tests/fixtures/authorization-current-note.json')).input);assert.equal(cases.find(c=>c.id==='target_without_permission').expected_authorizations.length,0);assert.equal(cases.find(c=>c.id==='ambiguous_no_grant').expected_authorizations.length,0);assert.equal(cases.find(c=>c.id==='permissions_missing_calculation').expected_authorizations.length,2);
});
test('oracle atoms pass unchanged production schema/validators and downstream deterministic authorization for all notes',async()=>{
 for(const note of cases){const judged=await judgeCompletion(note,completion(atoms(note)),await captureRequest(note));assert.equal(judged.classification,'PASS',note.id);assert.equal(judged.schema_valid,true);assert.equal(judged.atom_validation,true);assert.equal(judged.record_validation,true);assert.equal(judged.downstream_authorization.correct,true,note.id);}
});
test('missing expected atom is PARTIAL when valid and safely withholding authorization',async()=>{
 const note=cases[0],value=atoms(note).filter(a=>a.kind!=='schedule_constraint');const result=await judgeCompletion(note,completion(value),await captureRequest(note));assert.equal(result.classification,'PARTIAL');assert.deepEqual(result.missing_expected_atoms.map(a=>a.kind),['schedule_constraint']);assert.equal(result.downstream_authorization.safe,true);assert.equal(result.downstream_authorization.correct,false);assert.deepEqual(result.assembled_authorization_records,[]);
});
test('more atoms are not better: false Waste permission fails and exposes unsafe authorization even if validators accept',async()=>{
 const note=cases.find(c=>c.id==='target_without_permission'),value=atoms(note);value.push({kind:'waste_reduction_permission',scope:'ingredient_waste',from:9,value:5,unit:'percent',permission:'explicit',source_refs:value.flatMap(a=>a.source_refs)});
 const result=await judgeCompletion(note,completion(value),await captureRequest(note));assert.equal(result.atom_validation,true);assert.equal(result.classification,'FAIL');assert.equal(result.false_positive_permission_count,1);assert.equal(result.downstream_authorization.safe,false);assert.deepEqual(result.downstream_authorization.unexpected_ids,['ingredient_waste_rate_target']);
});
test('wrong values/source association and duplicate atoms are FAIL rather than completeness gains',()=>{
 const note=cases[0],value=atoms(note);value[0].amount=6200;value.push({...value[1]});const judged=judgeAtoms(note,value);assert.equal(judged.matched_expected_atoms.length,note.expected_atoms.length-1);assert.equal(judged.unexpected_or_misclassified_atoms.length,2);
});
test('malformed provider output remains distinct from a missing atom',async()=>{
 const note=cases[0],captured=await captureRequest(note);
 for(const envelope of [{choices:[]},{choices:[{finish_reason:'stop',message:{content:'PRIVATE not JSON'}}]}]){const result=await judgeCompletion(note,envelope,captured);assert.equal(result.classification,'FAIL');assert.ok(result.failure.startsWith('provider_'));}
});
test('saved atom projection never retains raw model prose or arbitrary enum/ID text',async()=>{
 const note=cases[0],c=completion([{kind:'PRIVATE model prose',source_refs:['PRIVATE secret'],scope:'PRIVATE scope',value:'PRIVATE number'}]);const result=await judgeCompletion(note,c,await captureRequest(note));assert.equal(result.classification,'FAIL');assert.equal(result.failure,'provider_schema_invalid');assert.doesNotMatch(JSON.stringify(result),/PRIVATE/);
});
test('provider requests vary only model, keep 60s settings, and never retry an HTTP failure',async()=>{
 const note=cases[0],captured=await captureRequest(note);assert.equal(captured.payload.model,productionModel);assert.equal(timeoutMs,60000);assert.equal(captured.payload.max_tokens,4000);assert.equal(captured.payload.temperature,.2);assert.equal(captured.payload.chat_template_kwargs.enable_thinking,false);
 let calls=0;const result=await runProviderCall(note,'Ultra',1,captured,'TEST_KEY',async(url,options)=>{calls++;assert.equal(url,captured.url);const payload=JSON.parse(options.body);assert.equal(payload.model,models.Ultra);assert.deepEqual({...payload,model:captured.payload.model},captured.payload);assert.ok(options.signal instanceof AbortSignal);return new Response('PRIVATE error',{status:429});});assert.equal(calls,1);assert.equal(result.status,429);assert.equal(result.failure,'provider_http_error');assert.doesNotMatch(JSON.stringify(result),/PRIVATE|TEST_KEY/);
});
test('timeout is a scored failure without a retry',async()=>{
 let calls=0;const result=await runProviderCall(cases[0],'Ultra',1,await captureRequest(cases[0]),'TEST_KEY',async()=>{calls++;throw new DOMException('PRIVATE timeout','TimeoutError');});assert.equal(calls,1);assert.equal(result.failure,'provider_timeout');assert.equal(result.classification,'FAIL');assert.doesNotMatch(JSON.stringify(result),/PRIVATE/);
});
test('summary counts failures and missing atoms against all scheduled observations',()=>{
 const summary=summarize([{case_id:'case_a',model_label:'Ultra',classification:'FAIL',failure:'provider_timeout',latency_ms:60000},{case_id:'case_a',model_label:'Ultra',classification:'PARTIAL',latency_ms:1000,expected_atom_count:6,matched_expected_atoms:['scoped_sales'],returned_atom_count:1,unexpected_or_misclassified_atoms:[]}]);assert.equal(summary.Ultra.calls,2);assert.equal(summary.Ultra.timeouts,1);assert.equal(summary.Ultra.fail,1);assert.equal(summary.Ultra.partial,1);assert.equal(summary.Ultra.expected_atoms,12);assert.equal(summary.Ultra.matched_atoms,1);assert.equal(summary.Ultra.average_latency_ms,30500);
});
