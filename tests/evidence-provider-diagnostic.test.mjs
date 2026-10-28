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
async function run(fetcher,{env='development',aborted=false,input='PRIVATE business/source prose. Currency: USD.',overrides={},loggerThrows=false}={}){
 const logs=[],dependencies=productionModules(),exports={};let calls=0;let ticks=0;
 const code=ts.transpileModule(fs.readFileSync('src/app/api/analyze/evidence/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const abort={timeout:ms=>{assert.equal(ms,60000);if(!aborted)return AbortSignal.timeout(ms);const controller=new AbortController();controller.abort(new DOMException('PRIVATE timeout cause','TimeoutError'));return controller.signal;}};
 vm.runInNewContext(code,{exports,Response,AbortSignal:abort,Date:{now:()=>ticks++===0?1000:61037},process:{env:{NODE_ENV:env,NEBIUS_API_KEY:'SECRET_API_KEY'}},console:{warn:(...args)=>{if(loggerThrows)throw Error('PRIVATE logger failure');logs.push(args);}},require:s=>({...dependencies(path.resolve('src/app/api/analyze/evidence',s+'.ts')),...overrides[s]}),fetch:async(url,options)=>{calls++;assert.equal(url,'https://api.tokenfactory.nebius.com/v1/chat/completions');const payload=JSON.parse(options.body);assert.equal(payload.model,'nvidia/Nemotron-3-Ultra-550b-a55b');assert.equal(payload.temperature,.2);assert.equal(payload.max_tokens,4000);assert.equal(options.cache,'no-store');return fetcher(url,options);}});
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
test('production errors retain generic client responses and emit a safe failure classification',async()=>{
 for(const fetcher of [async()=>{throw new DOMException('PRIVATE SECRET_API_KEY','TimeoutError');},async()=>new Response('PRIVATE upstream',{status:429}),async()=>new Response('PRIVATE malformed')]){
  const dev=await run(fetcher),prod=await run(fetcher,{env:'production'});assert.equal(prod.status,502);assert.deepEqual(prod.body,dev.body);assert.equal(prod.logs.length,1);assert.equal(prod.logs[0][0],"[What's Left?] Evidence failure");assert.doesNotMatch(JSON.stringify(prod.logs),/PRIVATE|SECRET_API_KEY/);assert.doesNotMatch(JSON.stringify(prod.body),/PRIVATE|SECRET_API_KEY|configured_timeout|elapsed_ms|provider_timeout/);
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
 const invalid={...output,authorization_atoms:atomsFromRecords(structuredClone(e.provenance.authorization_records))};
 invalid.authorization_atoms[0].amount=1901;
 const result=await run(async()=>envelope(JSON.stringify(invalid)),{input:e.provenance.source_input});
 assert.equal(result.status,502);assert.deepEqual(result.body,{error:'Evidence authorization atoms have invalid source support.'});assert.equal(result.logs.length,1);assert.equal(result.logs[0][0],"[What's Left?] Evidence authorization atom rejection");assert.equal(JSON.parse(result.logs[0][1]).reason,'numeric_anchor_source_missing');
});

const productionDiagnostic=result=>{assert.equal(result.logs.length,1);assert.equal(result.logs[0][0],"[What's Left?] Evidence failure");return JSON.parse(result.logs[0][1]);};
for(const [label,fetcher,classification] of [
 ['non-2xx',async()=>new Response('PRIVATE body',{status:429}),'evidence_provider_non_2xx'],
 ['invalid response',async()=>Response.json({choices:[]}),'evidence_invalid_response'],
 ['invalid envelope JSON',async()=>new Response('PRIVATE malformed'),'evidence_invalid_json'],
 ['invalid completion JSON',async()=>envelope('PRIVATE malformed'),'evidence_invalid_json'],
 ['empty completion JSON',async()=>envelope(''),'evidence_invalid_json'],
 ['invalid schema',async()=>envelope('{"PRIVATE":"SECRET_API_KEY"}'),'evidence_schema_invalid'],
 ['currency conflict',async()=>envelope(JSON.stringify({...output,currency:'EUR'})),'evidence_currency_conflict'],
 ['invalid authorization atoms',async()=>envelope(JSON.stringify({...output,authorization_atoms:[{kind:'schedule_constraint',intervention:'headcount_reduction',scope:'tuesday_evening_6pm_10pm',constraint:'rest_schedule_unchanged',source_refs:[]}]})),'evidence_authorization_atom_invalid'],
 ['timeout',async()=>{throw new DOMException('PRIVATE SECRET_API_KEY','TimeoutError');},'evidence_provider_timeout'],
 ['network',async()=>{throw new TypeError('PRIVATE SECRET_API_KEY');},'evidence_provider_network_error'],
])test(`production ${label} identifies the failure without changing its response`,async()=>{
 const dev=await run(fetcher),prod=await run(fetcher,{env:'production'});
 assert.equal(prod.status,502);assert.deepEqual(prod.body,dev.body);
 assert.equal(productionDiagnostic(prod).classification,classification);
 assert.doesNotMatch(JSON.stringify(prod.logs),/PRIVATE|SECRET_API_KEY|Bearer|stack|message|source prose/);
});
test('production authorization record rejection has its own classification',async()=>{
 const result=await run(async()=>envelope(JSON.stringify(output)),{env:'production',overrides:{'./authorization-records':{validateAuthorizationRecords:()=>false}}});
 assert.equal(result.status,502);assert.deepEqual(result.body,{error:'Evidence authorization records have invalid source support.'});
 assert.deepEqual(productionDiagnostic(result),{classification:'evidence_authorization_record_invalid'});
});
for(const name of ['Error','PRIVATE SECRET_API_KEY'])test(`post-provider exceptions expose only allowlisted names: ${name==='Error'?'known':'unknown'}`,async()=>{
 const failure=new Error('PRIVATE payload SECRET_API_KEY');failure.name=name;
 const result=await run(async()=>envelope(JSON.stringify(output)),{env:'production',overrides:{'./business-totals':{groundBusinessTotals:()=>{throw failure;}}}});
 assert.equal(result.status,502);assert.deepEqual(result.body,generic);
 assert.deepEqual(productionDiagnostic(result),{classification:'evidence_unhandled_exception',phase:'output',error_name:name==='Error'?'Error':'unknown'});
 assert.doesNotMatch(JSON.stringify(result.logs),/PRIVATE|SECRET_API_KEY|stack|message/);
});
test('production diagnostic failure cannot alter the existing 502 response',async()=>{
 const result=await run(async()=>new Response('PRIVATE body',{status:429}),{env:'production',loggerThrows:true});
 assert.equal(result.status,502);assert.deepEqual(result.body,{error:'Evidence provider request failed.'});
});
test('production success remains identical and logs no diagnostic',async()=>{
 const dev=await run(async()=>envelope(JSON.stringify(output)));
 const prod=await run(async()=>envelope(JSON.stringify(output)),{env:'production'});
 assert.equal(prod.status,200);assert.deepEqual(prod.body,dev.body);assert.deepEqual(prod.logs,[]);
});

for(const [label,mutate,reason] of [
 ['empty refs',atoms=>{atoms[0].source_refs=[];},'invalid_source_refs'],
 ['duplicate refs',atoms=>{atoms[0].source_refs.push(atoms[0].source_refs[0]);},'invalid_source_refs'],
 ['missing numeric anchor',atoms=>{atoms[0].amount=1901;},'numeric_anchor_source_missing'],
 ['currency mismatch',atoms=>{atoms[0].currency='EUR';},'currency_mismatch'],
])test(`production atom detail: ${label}; validation and response unchanged`,async()=>{
 const atoms=atomsFromRecords(structuredClone(e.provenance.authorization_records));mutate(atoms);
 const before=JSON.stringify(atoms);
 const {validateAuthorizationAtoms}=productionModules()('src/app/api/analyze/evidence/authorization-atoms.ts');
 const rejections=[];
 assert.equal(validateAuthorizationAtoms(atoms,e.provenance.items,e.currency),false);
 assert.equal(validateAuthorizationAtoms(atoms,e.provenance.items,e.currency,d=>rejections.push(d)),false);
 assert.equal(rejections.length,1);assert.equal(rejections[0].reason,reason);
 const result=await run(async()=>envelope(JSON.stringify({...output,authorization_atoms:atoms})),{env:'production',input:e.provenance.source_input});
 assert.equal(result.status,502);assert.deepEqual(result.body,{error:'Evidence authorization atoms have invalid source support.'});
 assert.deepEqual(productionDiagnostic(result),{classification:'evidence_authorization_atom_invalid',atom_index:0,atom_kind:'scoped_sales',rejection_reason:reason});
 assert.equal(JSON.stringify(atoms),before);
 assert.doesNotMatch(JSON.stringify(result.logs),/PRIVATE|SECRET|source_text|source_input|quote|amount|1901|1900|Cornhead|Bearer|USD|EUR/);
 const throwing=await run(async()=>envelope(JSON.stringify({...output,authorization_atoms:atoms})),{env:'production',input:e.provenance.source_input,loggerThrows:true});
 assert.equal(throwing.status,result.status);assert.deepEqual(throwing.body,result.body);
});
test('atom detail reports the actual later permission index and allowlisted kind',async()=>{
 const atoms=atomsFromRecords(structuredClone(e.provenance.authorization_records));
 const index=atoms.findIndex(a=>a.kind==='headcount_reduction_permission');assert.ok(index>0);
 atoms[index].source_refs=[];
 const result=await run(async()=>envelope(JSON.stringify({...output,authorization_atoms:atoms})),{env:'production',input:e.provenance.source_input});
 assert.deepEqual(productionDiagnostic(result),{classification:'evidence_authorization_atom_invalid',atom_index:index,atom_kind:'headcount_reduction_permission',rejection_reason:'invalid_source_refs'});
});
test('unrecognized diagnostic reasons and indices cannot leak callback data',async()=>{
 for(const detail of [{reason:'PRIVATE SECRET_API_KEY',atom_index:0},{reason:'invalid_source_refs',atom_index:'PRIVATE SECRET_API_KEY'},{reason:'atom_schema_invalid',atom_index:0}]){
  const result=await run(async()=>envelope(JSON.stringify(output)),{env:'production',overrides:{'./authorization-atoms':{assembleAuthorizationRecords:(_atoms,_sources,_currency,onReject)=>{onReject(detail);return null;}}}});
  assert.equal(result.status,502);assert.deepEqual(productionDiagnostic(result),{classification:'evidence_authorization_atom_invalid'});
 }
});
test('valid authorization atoms have identical acceptance with and without rejection callbacks',()=>{
 const {validateAuthorizationAtoms}=productionModules()('src/app/api/analyze/evidence/authorization-atoms.ts');
 const atoms=atomsFromRecords(structuredClone(e.provenance.authorization_records)),before=JSON.stringify(atoms),rejections=[];
 assert.equal(validateAuthorizationAtoms(atoms,e.provenance.items,e.currency),true);
 assert.equal(validateAuthorizationAtoms(atoms,e.provenance.items,e.currency,d=>rejections.push(d)),true);
 assert.deepEqual(rejections,[]);assert.equal(JSON.stringify(atoms),before);
});

const invalidResponseBody={error:'Evidence provider returned an invalid response.'};
const responseShape=(subtype,contentType='missing',finish='other',refusal=false,tools=false)=>({
 classification:'evidence_invalid_response',invalid_response_subtype:subtype,phase:'completion_guard',
 content_type:contentType,finish_reason_category:finish,refusal_present:refusal,tool_calls_present:tools,
});
const choiceEnvelope=(message,finish_reason='stop')=>({choices:[{finish_reason,message}]});
const shapeCases=[
 ['null envelope',null,responseShape('missing_choice')],
 ['missing choices',{},responseShape('missing_choice')],
 ['null choices',{choices:null},responseShape('missing_choice')],
 ['empty choices',{choices:[]},responseShape('missing_choice')],
 ['null first choice',{choices:[null]},responseShape('missing_choice')],
 ['missing message',{choices:[{finish_reason:'stop'}]},responseShape('missing_message','missing','stop')],
 ['null message',choiceEnvelope(null),responseShape('missing_message','missing','stop')],
 ['missing content',choiceEnvelope({}),responseShape('non_string_content','missing','stop')],
 ['null content',choiceEnvelope({content:null}),responseShape('non_string_content','null','stop')],
 ['array content',choiceEnvelope({content:['PRIVATE output SECRET_API_KEY']}),responseShape('non_string_content','array','stop')],
 ['object content',choiceEnvelope({content:{private:'PRIVATE output SECRET_API_KEY'}}),responseShape('non_string_content','object','stop')],
 ['numeric content',choiceEnvelope({content:95800}),responseShape('non_string_content','number','stop')],
 ['boolean content',choiceEnvelope({content:false}),responseShape('non_string_content','boolean','stop')],
 ['missing finish reason',{choices:[{message:{content:'PRIVATE output SECRET_API_KEY'}}]},responseShape('non_stop_finish_reason','string')],
 ['unknown finish reason',choiceEnvelope({content:'PRIVATE output SECRET_API_KEY'},'PRIVATE finish SECRET_API_KEY'),responseShape('non_stop_finish_reason','string')],
 ['object finish reason',choiceEnvelope({content:'PRIVATE output SECRET_API_KEY'},{private:'SECRET_API_KEY'}),responseShape('non_stop_finish_reason','string')],
 ['refusal present',choiceEnvelope({content:'PRIVATE output',refusal:'PRIVATE refusal SECRET_API_KEY'}),responseShape('refusal_present','string','stop',true)],
 ['tool calls without content',choiceEnvelope({tool_calls:[{id:'PRIVATE SECRET_API_KEY',function:{arguments:'PRIVATE source'}}]}),responseShape('non_string_content','missing','stop',false,true)],
 ['null tool calls',choiceEnvelope({content:null,tool_calls:null}),responseShape('non_string_content','null','stop')],
 ['empty tool-call list is structurally present',choiceEnvelope({content:null,tool_calls:[]}),responseShape('non_string_content','null','stop',false,true)],
 ['empty string with non-stop finish',choiceEnvelope({content:''},'length'),responseShape('non_stop_finish_reason','string','length')],
 ['missing message precedes non-stop finish',choiceEnvelope(null,'length'),responseShape('missing_message','missing','length')],
 ['refusal precedes finish and content failures',choiceEnvelope({content:null,refusal:'PRIVATE SECRET_API_KEY',tool_calls:[]},'length'),responseShape('refusal_present','null','length',true,true)],
 ['non-stop finish precedes non-string content',choiceEnvelope({content:null},'length'),responseShape('non_stop_finish_reason','null','length')],
 ...['length','tool_calls','function_call','content_filter'].map(finish=>[
  `allowlisted finish ${finish}`,choiceEnvelope({content:'PRIVATE output SECRET_API_KEY'},finish),responseShape('non_stop_finish_reason','string',finish),
 ]),
];
for(const [label,value,expected] of shapeCases)test(`invalid-response diagnostic: ${label}`,async()=>{
 const fetcher=async()=>Response.json(value);
 const dev=await run(fetcher),prod=await run(fetcher,{env:'production'}),throwing=await run(fetcher,{env:'production',loggerThrows:true});
 for(const result of [dev,prod,throwing]){assert.equal(result.status,502);assert.deepEqual(result.body,invalidResponseBody);}
 assert.deepEqual(productionDiagnostic(prod),expected);
 assert.doesNotMatch(JSON.stringify(prod.logs),/PRIVATE|SECRET_API_KEY|95800|arguments|source prose|Bearer/);
});
for(const content of ['', ' \n '])test(`empty/whitespace string stays invalid JSON, not missing content: ${JSON.stringify(content)}`,async()=>{
 const fetcher=async()=>envelope(content);
 const prod=await run(fetcher,{env:'production'}),throwing=await run(fetcher,{env:'production',loggerThrows:true});
 for(const result of [prod,throwing]){assert.equal(result.status,502);assert.deepEqual(result.body,{error:'Evidence provider returned invalid JSON.'});}
 const d=productionDiagnostic(prod);assert.equal(d.classification,'evidence_invalid_json');assert.equal(d.phase,'output');
 assert.equal(d.invalid_response_subtype,undefined);
});
for(const name of ['Error','RangeError','PRIVATE SECRET_API_KEY'])test(`secondary envelope exception: ${name==='PRIVATE SECRET_API_KEY'?'unknown name':name}`,async()=>{
 const failure=new Error('PRIVATE response body SECRET_API_KEY');failure.name=name;
 const fetcher=async()=>({ok:true,json:async()=>{throw failure;}});
 const dev=await run(fetcher),prod=await run(fetcher,{env:'production'}),throwing=await run(fetcher,{env:'production',loggerThrows:true});
 for(const result of [dev,prod,throwing]){assert.equal(result.status,502);assert.deepEqual(result.body,generic);}
 assert.deepEqual(productionDiagnostic(prod),{classification:'evidence_invalid_response',invalid_response_subtype:'envelope_read_exception',phase:'response_json',error_name:name==='PRIVATE SECRET_API_KEY'?'unknown':name});
 assert.doesNotMatch(JSON.stringify(prod.logs),/PRIVATE|SECRET_API_KEY|message|stack|response body/);
});
test('envelope syntax/network/timeout exceptions retain their existing classifications',async()=>{
 for(const [name,classification] of [['SyntaxError','evidence_invalid_json'],['TypeError','evidence_provider_network_error'],['TimeoutError','evidence_provider_timeout'],['AbortError','evidence_provider_timeout']]){
  const fetcher=async()=>({ok:true,json:async()=>{const e=new Error('PRIVATE SECRET_API_KEY');e.name=name;throw e;}});
  const result=await run(fetcher,{env:'production'}),d=productionDiagnostic(result);
  assert.equal(result.status,502);assert.deepEqual(result.body,generic);assert.equal(d.classification,classification);
  assert.equal(d.invalid_response_subtype,undefined);
 }
});
test('diagnostic adds no response normalization or stricter acceptance checks',async()=>{
 const content=JSON.stringify(output);
 const baseline=await run(async()=>envelope(content),{env:'production'});
 for(const value of [
  choiceEnvelope({content,refusal:'',tool_calls:[{id:'PRIVATE SECRET_API_KEY'}]}),
  {choices:{0:{finish_reason:'stop',message:{content}}}},
 ]){
  const result=await run(async()=>Response.json(value),{env:'production'});
  assert.equal(result.status,200);assert.deepEqual(result.body,baseline.body);assert.deepEqual(result.logs,[]);
 }
});
