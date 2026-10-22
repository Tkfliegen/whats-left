// Isolated diagnosis: unchanged Leak handler and request, exact saved Evidence.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import nextEnv from '@next/env';
import {productionModules} from '../../../tests/helpers/provenance.mjs';
const load=productionModules();
const {isLeakRequest,isModelLeakResult}=load('src/app/api/analyze/leaks/leaks.ts');
const {validateLeakOutput,validateLeakReferences}=load('src/app/api/analyze/leaks/output.ts');
const {resolveEvidenceRefs}=load('src/app/api/analyze/evidence/provenance.ts');
const hash=text=>crypto.createHash('sha256').update(text).digest('hex');
// Diagnostic token inventory only, matching the existing guard exactly. The
// authoritative acceptance result always comes from the real production guard.
export const numericTokens=text=>(text.match(/\d+(?:,\d{3})*(?:\.\d+)?/g)??[]).map(v=>v.replace(/,/g,'').replace(/(\.\d*?)0+$/,'$1').replace(/\.$/,''));
export function analyzeResult(result,evidence){
 const citationDiagnostics=[];const validation=validateLeakOutput(result,evidence,d=>citationDiagnostics.push(JSON.parse(JSON.stringify(d))));
 const catalog=evidence.provenance.citable_facts;const findings=[],unreported=[];let firstFailureExcerpt;
 result.leaks.forEach((leak,index)=>{
  const cited=leak.evidence_refs.map(id=>catalog.find(f=>f.id===id));const allowed=[...new Set(numericTokens(cited.map(f=>f.text).join('\n')))];
  const fields=[[`leaks[${index}].title`,leak.title],...leak.evidence.map((text,j)=>[`leaks[${index}].evidence[${j}]`,text]),[`leaks[${index}].interpretation`,leak.interpretation]];
  for(const [field_path,value] of fields){
   if(validation.field===field_path)firstFailureExcerpt=value;
   for(const normalized_number of [...new Set(numericTokens(JSON.stringify(value)).filter(n=>!allowed.includes(n)))]){
    unreported.push({field_path,normalized_number,field_value:value,finding_index:index,title:leak.title,category:leak.category,intervention_ref:leak.intervention_ref??null,cited_fact_ids:leak.evidence_refs,resolved_source_ids:resolveEvidenceRefs(evidence,leak.evidence_refs),allowed_numeric_tokens:allowed,trusted_catalog_matches:catalog.filter(f=>numericTokens(f.text).includes(normalized_number)).map(f=>({fact_id:f.id,source_refs:f.source_refs}))});
   }
  }
  findings.push({index,title:leak.title,category:leak.category,intervention_ref:leak.intervention_ref??null,evidence_refs:leak.evidence_refs,interpretation:leak.interpretation,allowed_numeric_tokens:allowed});
 });
 const source=catalog.map(f=>f.text).join('\n'),allowedAll=new Set(numericTokens(source));
 result.insufficient_evidence.forEach((item,index)=>{for(const key of ['topic','reason']){const field_path=`insufficient_evidence[${index}].${key}`,value=item[key];if(validation.field===field_path)firstFailureExcerpt=value;for(const normalized_number of [...new Set(numericTokens(JSON.stringify(value)).filter(n=>!allowedAll.has(n)))])unreported.push({field_path,normalized_number,field_value:value,cited_fact_ids:null,scope:'full trusted catalog under existing insufficient-evidence contract',trusted_catalog_matches:[]});}});
 return {structural_reference_validation:validateLeakReferences(result,evidence),validation,first_failure_excerpt:firstFailureExcerpt,citation_diagnostics:citationDiagnostics,unreported_numbers:unreported,findings};
}
export async function runOne(input,run,key,liveFetch=fetch){
 assert.equal(isLeakRequest(input),true,'Saved request must still pass unchanged input validation');
 let calls=0,requestHash,model,providerStatus=null,providerLatency=null,providerFailure=null,parsed;
 const started=Date.now();const modules=productionModules(async(url,options)=>{
  calls++;assert.equal(calls,1,'No retries permitted');requestHash=hash(options.body);model=JSON.parse(options.body).model;
  const upstreamStarted=Date.now();
  try{
   const response=await liveFetch(url,{...options,headers:{...options.headers,Authorization:`Bearer ${key}`}});providerStatus=response.status;
   if(response.ok){try{const envelope=await response.clone().json();const choice=envelope?.choices?.[0];if(choice?.finish_reason==='stop'&&!choice?.message?.refusal&&typeof choice?.message?.content==='string'){try{parsed=JSON.parse(choice.message.content);}catch{providerFailure='provider_invalid_completion_json';}}else providerFailure='provider_response_invalid';}catch(error){providerFailure=error?.name==='SyntaxError'?'provider_invalid_envelope_json':['TimeoutError','AbortError'].includes(error?.name)?'provider_timeout':'provider_response_unreadable';}}
   else providerFailure='provider_http_error';
   providerLatency=Date.now()-upstreamStarted;return response; // unchanged response
  }catch(error){providerLatency=Date.now()-upstreamStarted;providerFailure=options.signal?.aborted||['TimeoutError','AbortError'].includes(error?.name)?'provider_timeout':'provider_network_error';throw error;}
 });
 const response=await modules('src/app/api/analyze/leaks/route.ts').POST(new Request('http://localhost/api/analyze/leaks',{method:'POST',body:JSON.stringify(input)}));
 const body=await response.json();assert.equal(calls,1);const validResult=parsed!==undefined&&isModelLeakResult(parsed,input.evidence);
 const analysis=validResult?analyzeResult(parsed,input.evidence):null;
 if(analysis)assert.equal(response.status,analysis.validation.ok?200:502,'Observation must match unchanged real handler acceptance');
 return {run,provider_http_status:providerStatus,route_http_status:response.status,classification:response.status===200?'PASS':'FAIL',provider_failure:providerFailure,provider_latency_ms:providerLatency,total_handler_latency_ms:Date.now()-started,request_sha256:requestHash,model,route_error:body.error??null,output_schema_and_ref_shape_valid:validResult,trusted_result:response.status===200?body.leaks:null,analysis};
}
async function main(){
 const sourcePath=process.argv[2]??'/tmp/whats-left-evidence-ultra-switch-smoke/report.json';const out=path.resolve(process.argv[3]??'docs/evaluations/leak-case-a-reliability');assert.equal(fs.existsSync(out+'/results.json'),false,'Refusing accidental rerun');
 const saved=JSON.parse(fs.readFileSync(sourcePath)),original=saved.outcome.calls.find(c=>c.url==='/api/analyze/leaks');assert.ok(original?.body?.evidence);const input=original.body;assert.deepEqual(input.evidence,saved.outcome.calls.find(c=>c.url==='/api/analyze/evidence').response.evidence);assert.equal(isLeakRequest(input),true);
 nextEnv.loadEnvConfig(process.cwd());const key=process.env.NEBIUS_API_KEY;assert.ok(key);
 const sourceHashes=Object.fromEntries(fs.readdirSync('src',{recursive:true}).filter(p=>fs.statSync(path.join('src',p)).isFile()).map(p=>{const file=path.join('src',p);return [file,hash(fs.readFileSync(file))];}));
 fs.mkdirSync(out,{recursive:true});fs.writeFileSync(out+'/input.json',JSON.stringify(input,null,2));const manifest={started:new Date().toISOString(),source_artifact:sourcePath,input_sha256:hash(JSON.stringify(input)),runs_planned:5,original_route_status:original.status,original_error:original.response,original_rejected_prose_retained:false,source_hashes:sourceHashes,method:'Five independent sequential requests via unchanged isolated real Leak handler and real configured provider; no Evidence/downstream calls, retries, repairs or fallbacks. Observer clones provider envelopes only in memory; retains finding summaries and offending excerpts, never full raw provider envelopes or headers.'};fs.writeFileSync(out+'/manifest.json',JSON.stringify(manifest,null,2));
 const results=[];for(let run=1;run<=5;run++){const row=await runOne(input,run,key);if(results.length)assert.equal(row.request_sha256,results[0].request_sha256,'Requests must be identical');results.push(row);fs.writeFileSync(out+'/results.json',JSON.stringify({results},null,2));console.log(JSON.stringify({run,provider_http_status:row.provider_http_status,route_http_status:row.route_http_status,classification:row.classification,provider_failure:row.provider_failure,latency_ms:row.provider_latency_ms,validation:row.analysis?.validation,unreported:row.analysis?.unreported_numbers.map(n=>({field:n.field_path,number:n.normalized_number}))}));}
 const changed=Object.entries(sourceHashes).filter(([file,expected])=>hash(fs.readFileSync(file))!==expected).map(([file])=>file);fs.writeFileSync(out+'/source-check.json',JSON.stringify({finished:new Date().toISOString(),changed_source_files:changed,identical_request_sha256:results[0].request_sha256},null,2));assert.deepEqual(changed,[]);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)main().catch(()=>{console.error('Leak diagnosis harness stopped; no automatic retry. Inspect saved results.');process.exitCode=1;});
