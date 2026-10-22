import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import ts from 'typescript';
import {productionModules} from './helpers/provenance.mjs';
const evidence=JSON.parse(fs.readFileSync('tests/fixtures/leak-case-a-failed.json')).evidence;
const fact=n=>evidence.provenance.citable_facts.find(f=>f.id.endsWith('_'+String(n).padStart(2,'0'))).id;
const {validateLeakOutput}=productionModules()('src/app/api/analyze/leaks/output.ts');
const plain=x=>JSON.parse(JSON.stringify(x));
const valid=()=>({leaks:[{title:'PRIVATE finding',category:'labor',intervention_ref:'headcount_reduction',evidence_refs:[12,14,16].map(fact),evidence:['PRIVATE evidence: Tuesday sales USD 1,900 and staffing cost USD 2,500.'],interpretation:'PRIVATE interpretation',confidence:'high'}],insufficient_evidence:[]});
const generic={error:'Leak analysis result rejected by output validation: incomplete_citation_support.'};
function diagnose(result){const logs=[];const before=JSON.stringify(result);const validation=validateLeakOutput(result,evidence,d=>logs.push(plain(d)));assert.deepEqual(plain(validation),plain(validateLeakOutput(result,evidence)));assert.equal(JSON.stringify(result),before);return {validation,logs};}
async function run(result,env){
 const logs=[];let calls=0;const dependencies=productionModules(),exports={};
 const code=ts.transpileModule(fs.readFileSync('src/app/api/analyze/leaks/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext(code,{exports,Response,AbortSignal,process:{env:{NODE_ENV:env,NEBIUS_API_KEY:'SECRET_TEST_KEY'}},console:{warn:(...args)=>logs.push(args)},require:s=>dependencies(path.resolve('src/app/api/analyze/leaks',s+'.ts')),fetch:async()=>{calls++;return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({...result,leaks:result.leaks.map(({intervention_ref,...finding})=>{void intervention_ref;return finding;})})}}]});}});
 const before=JSON.stringify(result);const response=await exports.POST(new Request('http://localhost',{method:'POST',body:JSON.stringify({evidence,operational_context:[]})}));assert.equal(calls,1);assert.equal(JSON.stringify(result),before);return {status:response.status,body:await response.json(),logs};
}
test('semantic missing sales fact logs exact first finding and intersection support before resolution',async()=>{
 const result=valid();result.leaks.unshift({...result.leaks[0],intervention_ref:null,evidence_refs:[fact(17)],evidence:['Waste is 9%.']});result.leaks[1].evidence_refs=[14,16].map(fact);
 const response=await run(result,'development');assert.equal(response.status,502);assert.deepEqual(response.body,generic);assert.equal(response.logs.length,1);assert.equal(response.logs[0][0],"[What's Left?] Backend Leak rejection");
 assert.deepEqual(JSON.parse(response.logs[0][1]),{reason:'incomplete_citation_support',finding_index:1,intervention_ref:null,trigger:'intersection',returned_fact_ids:[14,16].map(fact),required_fact_ids:[12,14,16].map(fact),missing_fact_ids:[fact(12)]});
});
test('bound omission of the entire group reports the complete missing group',()=>{
 const result=valid();result.leaks[0].evidence_refs=[fact(13)];const {validation,logs}=diagnose(result);assert.equal(validation.reason,'incomplete_citation_support');assert.equal(logs.length,1);
 assert.deepEqual(logs[0],{reason:'incomplete_citation_support',finding_index:0,intervention_ref:'headcount_reduction',trigger:'intervention_binding',returned_fact_ids:[fact(13)],required_fact_ids:[12,14,16].map(fact),missing_fact_ids:[12,14,16].map(fact)});
});
test('unbound intersection reports applicable required and missing group without inventing a binding',()=>{
 for(const binding of [null,undefined]){const result=valid();result.leaks[0].intervention_ref=binding;result.leaks[0].evidence_refs=[fact(14)];const {logs}=diagnose(result);assert.equal(logs[0].trigger,'intersection');assert.equal(logs[0].intervention_ref,null);assert.deepEqual(logs[0].required_fact_ids,[12,14,16].map(fact));assert.deepEqual(logs[0].missing_fact_ids,[12,16].map(fact));}
});
test('valid complete support produces no diagnostics in validator or development route',async()=>{
 const result=valid();const {validation,logs}=diagnose(result);assert.deepEqual(plain(validation),{ok:true});assert.deepEqual(logs,[]);const response=await run(result,'development');assert.equal(response.status,200);assert.deepEqual(response.body,{leaks:result});assert.deepEqual(response.logs,[]);
});
test('production and unset environments preserve generic rejection and emit no diagnostic',async()=>{
 const result=valid();result.leaks[0].evidence_refs=[fact(14)];for(const env of ['production',undefined]){const response=await run(result,env);assert.equal(response.status,502);assert.deepEqual(response.body,generic);assert.deepEqual(response.logs,[]);}
});
test('diagnostic contains only controlled identity and fact IDs, never prose, source text, keys or provider envelopes',async()=>{
 const result=valid();result.leaks[0].evidence_refs=[fact(14)];const response=await run(result,'development'),d=JSON.parse(response.logs[0][1]);
 assert.deepEqual(Object.keys(d).sort(),['reason','finding_index','intervention_ref','trigger','returned_fact_ids','required_fact_ids','missing_fact_ids'].sort());assert.doesNotMatch(JSON.stringify(response.logs),/PRIVATE|Tuesday|staffing|sales|Cornhead|SECRET_TEST_KEY|choices|source_input|source_refs/);
 for(const ids of [d.returned_fact_ids,d.required_fact_ids,d.missing_fact_ids])for(const id of ids)assert.match(id,/^fact_[a-f0-9]{32}_\d+$/);
});
test('first structural rejection still wins across findings before prose checks, without mutation',()=>{
 const result=valid();result.leaks[0].interpretation='PRIVATE unsupported 33.4%';result.leaks.push({...result.leaks[0],evidence_refs:[fact(13)]},{...result.leaks[0],evidence_refs:[fact(14)]});
 const {validation,logs}=diagnose(result);assert.equal(validation.reason,'incomplete_citation_support');assert.equal(validation.field,'leaks[1].evidence_refs');assert.equal(logs.length,1);assert.equal(logs[0].finding_index,1);
 result.leaks=result.leaks.slice(0,1);const numeric=diagnose(result);assert.equal(numeric.validation.reason,'unreported_number');assert.deepEqual(numeric.logs,[]);
});
test('malformed unknown IDs reject before citation diagnostics and never reach logs or HTTP errors',async()=>{
 const result=valid();result.leaks[0].evidence_refs=['PRIVATE malformed source ID'];assert.equal(diagnose(result).validation.reason,'invalid_evidence_refs');assert.deepEqual(diagnose(result).logs,[]);
 const response=await run(result,'development');assert.equal(response.status,502);assert.deepEqual(response.logs,[]);assert.deepEqual(response.body,{error:'Leak analysis provider returned invalid findings.'});
});
test('combined fact lineage leaves missing diagnostics source-aware',()=>{
 const result=valid();result.leaks[0].evidence_refs=[fact(24),fact(16)];const {logs}=diagnose(result);assert.deepEqual(logs[0].returned_fact_ids,[24,16].map(fact));assert.deepEqual(logs[0].missing_fact_ids,[fact(12)]);
});
