import {atomsFromRecords} from './helpers/authorization-atoms.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import {productionModules} from './helpers/provenance.mjs';
const e=JSON.parse(fs.readFileSync('tests/fixtures/leak-case-a-failed.json')).evidence;
const {provenance:ignored,...base}=e;void ignored;
// This provider-boundary fixture has no source-bound business-total support.
base.revenue={...base.revenue,total:null};base.costs={...base.costs,total:null};
const output={...base,authorization_atoms:[]};
const envelope=content=>Response.json({choices:[{finish_reason:'stop',message:{content}}]});
const generic={error:'Evidence provider is unavailable or returned an invalid response.'};
async function run(fetcher,{env='development',aborted=false,input='PRIVATE business/source prose. Currency: USD.'}={}){
 const logs=[],dependencies=productionModules(),exports={};let calls=0;let ticks=0;
 const code=ts.transpileModule(fs.readFileSync('src/app/api/analyze/evidence/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const abort={timeout:ms=>{assert.equal(ms,60000);if(!aborted)return AbortSignal.timeout(ms);const controller=new AbortController();controller.abort(new DOMException('PRIVATE timeout cause','TimeoutError'));return controller.signal;}};
 vm.runInNewContext(code,{exports,Response,AbortSignal:abort,Date:{now:()=>ticks++===0?1000:61037},process:{env:{NODE_ENV:env,NEBIUS_API_KEY:'SECRET_API_KEY'}},console:{warn:(...args)=>logs.push(args)},require:s=>dependencies(path.resolve('src/app/api/analyze/evidence',s+'.ts')),fetch:async(url,options)=>{calls++;assert.equal(url,'https://api.tokenfactory.nebius.com/v1/chat/completions');const payload=JSON.parse(options.body);assert.equal(payload.model,'nvidia/Nemotron-3-Ultra-550b-a55b');assert.equal(payload.temperature,.2);assert.equal(payload.max_tokens,4000);assert.equal(options.cache,'no-store');return fetcher(url,options);}});
 const response=await exports.POST(new Request('http://localhost',{method:'POST',body:JSON.stringify({input})}));
 assert.equal(calls,1);return {status:response.status,body:await response.json(),logs};
}
function diagnostic(result){assert.equal(result.logs.length,1);assert.equal(result.logs[0][0],"[What's Left?] Evidence provider rejection");return JSON.parse(result.logs[0][1]);}
for(const name of ['TimeoutError','AbortError'])test(`${name} produces safe timeout duration and unchanged client error`,async()=>{
 const result=await run(async()=>{throw new DOMException('PRIVATE provider message SECRET_API_KEY',name);});assert.equal(result.status,502);assert.deepEqual(result.body,generic);assert.deepEqual(diagnostic(result),{reason:'provider_timeout',configured_timeout_ms:60000,elapsed_ms:60037});
});
test('aborted timeout signal identifies timeout even when fetch throws a different error name',async()=>{
 const result=await run(async()=>{throw new TypeError('PRIVATE socket cause');},{aborted:true});assert.equal(diagnostic(result).reason,'provider_timeout');assert.deepEqual(result.body,generic);
});
test('provider HTTP error logs only status, without reading or logging its body',async()=>{
 const result=await run(async()=>({ok:false,status:429,json:()=>{throw Error('must not read private HTTP error body');}}));assert.equal(result.status,502);assert.deepEqual(result.body,{error:'Evidence provider request failed.'});assert.deepEqual(diagnostic(result),{reason:'provider_http_error',status:429});
});
test('network/fetch rejection is distinct from timeout',async()=>{
 const result=await run(async()=>{throw new TypeError('PRIVATE network URL SECRET_API_KEY');});assert.deepEqual(result.body,generic);assert.deepEqual(diagnostic(result),{reason:'provider_network_error'});
});
for(const [label,fetcher,reason,body] of [
 ['malformed provider envelope',async()=>new Response('PRIVATE not JSON'),'provider_invalid_json',generic],
 ['malformed completion content',async()=>envelope('PRIVATE not JSON'),'provider_invalid_json',{error:'Evidence provider returned invalid JSON.'}],
 ['empty completion content',async()=>envelope(''),'provider_empty_response',{error:'Evidence provider returned invalid JSON.'}],
 ['empty choices',async()=>Response.json({choices:[]}),'provider_empty_response',{error:'Evidence provider returned an invalid response.'}],
 ['truncated completion',async()=>Response.json({choices:[{finish_reason:'length',message:{content:'PRIVATE partial'}}]}),'provider_response_invalid',{error:'Evidence provider returned an invalid response.'}],
 ['refused completion',async()=>Response.json({choices:[{finish_reason:'stop',message:{refusal:'PRIVATE refusal',content:'{}'}}]}),'provider_response_invalid',{error:'Evidence provider returned an invalid response.'}],
 ['non-string content',async()=>Response.json({choices:[{finish_reason:'stop',message:{content:42}}]}),'provider_response_invalid',{error:'Evidence provider returned an invalid response.'}],
 ['schema-invalid content',async()=>envelope('{"PRIVATE":"provider body"}'),'provider_schema_invalid',{error:'Evidence provider returned invalid evidence.'}],
])test(`${label} has a structured category and preserves its existing HTTP error`,async()=>{
 const result=await run(fetcher);assert.equal(result.status,502);assert.deepEqual(result.body,body);assert.deepEqual(diagnostic(result),{reason});
});
test('response body read timeout and stream failure retain boundary classification',async()=>{
 const timeout=await run(async()=>({ok:true,json:async()=>{throw new DOMException('PRIVATE','TimeoutError');}}));assert.equal(diagnostic(timeout).reason,'provider_timeout');assert.deepEqual(timeout.body,generic);
 const network=await run(async()=>({ok:true,json:async()=>{throw new TypeError('PRIVATE socket');}}));assert.equal(diagnostic(network).reason,'provider_network_error');assert.deepEqual(network.body,generic);
});
test('production errors remain generic with no diagnostic or client leakage',async()=>{
 for(const fetcher of [async()=>{throw new DOMException('PRIVATE SECRET_API_KEY','TimeoutError');},async()=>new Response('PRIVATE upstream',{status:429}),async()=>new Response('PRIVATE malformed')]){
  const dev=await run(fetcher),prod=await run(fetcher,{env:'production'});assert.equal(prod.status,502);assert.deepEqual(prod.body,dev.body);assert.deepEqual(prod.logs,[]);assert.doesNotMatch(JSON.stringify(prod.body),/PRIVATE|SECRET_API_KEY|configured_timeout|elapsed_ms|provider_timeout/);
 }
});
test('diagnostics contain only allowlisted category/status/duration fields, never prose, prompts, secrets or payloads',async()=>{
 for(const fetcher of [async()=>{throw new TypeError('PRIVATE network SECRET_API_KEY');},async()=>envelope('PRIVATE model prose'),async()=>new Response('PRIVATE body',{status:500})]){
  const result=await run(fetcher),d=diagnostic(result);assert.ok(Object.keys(d).every(k=>['reason','status','configured_timeout_ms','elapsed_ms'].includes(k)));assert.doesNotMatch(JSON.stringify(result.logs),/PRIVATE|SECRET_API_KEY|Business|source prose|Authorization|Bearer|messages|choices|content|authorization_records/);
 }
});
test('successful Evidence response and provenance are unchanged and produce no diagnostic',async()=>{
 const result=await run(async()=>envelope(JSON.stringify(output)));assert.equal(result.status,200);assert.deepEqual(result.logs,[]);const {provenance,...actual}=result.body.evidence;assert.deepEqual(actual,base);assert.deepEqual(provenance.authorization_records,[]);assert.equal(provenance.source_input,'PRIVATE business/source prose. Currency: USD.');
});
test('atomic source-support failures remain separate from provider failures',async()=>{
 const invalid={...output,authorization_atoms:atomsFromRecords(e.provenance.authorization_records)};
 invalid.authorization_atoms[0].amount=1901;
 const result=await run(async()=>envelope(JSON.stringify(invalid)),{input:e.provenance.source_input});
 assert.equal(result.status,502);assert.deepEqual(result.body,{error:'Evidence authorization atoms have invalid source support.'});assert.equal(result.logs.length,1);assert.equal(result.logs[0][0],"[What's Left?] Evidence authorization atom rejection");assert.equal(JSON.parse(result.logs[0][1]).reason,'numeric_anchor_source_missing');
});
