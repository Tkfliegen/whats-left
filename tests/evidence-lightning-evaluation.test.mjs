import test from 'node:test';
import assert from 'node:assert/strict';
import {cases,unknownEvidence} from '../scripts/evaluation/evidence-ab/cases.mjs';
import {captureRequest,runProviderCall,productionModel,models,timeoutMs} from '../scripts/evaluation/evidence-ab/evaluate.mjs';
import {validateReference,comparisonSummary} from '../scripts/evaluation/evidence-ab/lightning-followup.mjs';
function reference(){return {manifest:{timeout_ms:timeoutMs,models:{Ultra:models.Ultra},notes:cases.map(({sources,...note})=>{void sources;return note;}),source_hashes:{'test-source':'expected-hash'}},data:{results:cases.flatMap(note=>[1,2].map(repeat=>({case_id:note.id,repeat,model_label:'Ultra',model:models.Ultra,classification:'PASS',latency_ms:2000})))}};}
test('reuse requires identical notes, scoring annotations, timeout, model and production source hashes',()=>{
 const {manifest,data}=reference();assert.equal(validateReference(manifest,data,()=> 'expected-hash').length,16);
 assert.throws(()=>validateReference(manifest,data,()=> 'changed-hash'));
 const changed=structuredClone(manifest);changed.notes[0].expected_atoms=[];assert.throws(()=>validateReference(changed,data,()=> 'expected-hash'));
 const wrongTimeout={...manifest,timeout_ms:120000};assert.throws(()=>validateReference(wrongTimeout,data,()=> 'expected-hash'));
});
test('reuse rejects missing or duplicate Ultra run identities',()=>{
 const {manifest,data}=reference();assert.throws(()=>validateReference(manifest,{results:data.results.slice(1)},()=> 'expected-hash'));
 const duplicate={results:[...data.results.slice(1),data.results[1]]};assert.throws(()=>validateReference(manifest,duplicate,()=> 'expected-hash'));
});
test('historical Lightning invocation stays pinned while production Evidence uses Ultra',async()=>{
 const note=cases[0],captured=await captureRequest(note);assert.equal(models.Lightning,'nvidia/Nemotron-3_5-Lightning');assert.equal(productionModel,models.Ultra);let calls=0;
 const row=await runProviderCall(note,'Lightning',1,captured,'TEST_KEY',async(url,options)=>{calls++;assert.equal(url,captured.url);const payload=JSON.parse(options.body);assert.equal(payload.model,models.Lightning);assert.deepEqual({...payload,model:captured.payload.model},captured.payload);const atoms=note.expected_atoms.map(({allowed_source_refs,...atom})=>{void allowed_source_refs;return atom;});return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({...unknownEvidence,currency:'USD',business_total_support:[],calculation_support:[],authorization_atoms:atoms})}}]});});assert.equal(calls,1);assert.equal(row.classification,'PASS');assert.equal(row.downstream_authorization.correct,true);
});
test('comparison summarizes new Lightning and reused Ultra without counting Super',()=>{
 const rows=[{case_id:'case_a',model_label:'Lightning',classification:'FAIL',failure:'provider_timeout',latency_ms:60000},{case_id:'case_a',model_label:'Ultra',classification:'PASS',latency_ms:2000,expected_atom_count:6,matched_expected_atoms:[],returned_atom_count:0}];const summary=comparisonSummary(rows);assert.deepEqual(Object.keys(summary),['Lightning','Ultra']);assert.equal(summary.Lightning.calls,1);assert.equal(summary.Lightning.timeouts,1);assert.equal(summary.Ultra.calls,1);
});
