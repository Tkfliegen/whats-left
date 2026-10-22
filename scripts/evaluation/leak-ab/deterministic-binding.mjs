// Same saved cases/scoring; new production contract and server-owned bindings.
import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import nextEnv from '@next/env';
import {evaluateOne,models} from './evaluate.mjs';
import {observedMetadata} from './ultra-hardened.mjs';
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
export async function evaluateResolved(c,repeat,key,fetcher=fetch){
 const row=await evaluateOne(c,models.ultra,repeat,key,fetcher);
 const meta=observedMetadata({...row,generated_result:row.trusted_result});
 let onlyBindingAdded=null;
 if(row.trusted_result){
  const semantic={...row.trusted_result,leaks:row.trusted_result.leaks.map(({intervention_ref,...finding})=>{void intervention_ref;return finding;})};
  assert.deepEqual(semantic,row.generated_result,'Resolver must not modify refs or prose');onlyBindingAdded=true;
 }
 return {...row,...meta,raw_semantic_finding_validity:row.output_schema_and_ref_shape_valid,
  raw_semantic_validation:row.analysis?.validation??null,
  trusted_resolution_present:row.trusted_result!==null,only_binding_added:onlyBindingAdded,
  citation_failure:row.analysis?.validation.ok===false&&['invalid_evidence_refs','incomplete_citation_support'].includes(row.analysis.validation.reason)?row.analysis.validation:null,
  numeric_failure:row.analysis?.validation.ok===false&&['unreported_number','unreported_numeric_unit'].includes(row.analysis.validation.reason)?row.analysis.validation:null,
  classification:meta.incorrect_intervention_bindings.length||meta.fact_source_ids_in_prose.length?'FAIL':row.classification};
}
async function main(){
 const out='docs/evaluations/leak-deterministic-binding';assert.equal(fs.existsSync(out+'/results.json'),false,'Refusing accidental rerun');
 assert.equal(models.current,'nvidia/Nemotron-3_5-Lightning');
 const bytes=fs.readFileSync('docs/evaluations/leak-lightning-ultra/cases.json'),cases=JSON.parse(bytes);assert.equal(cases.length,8);fs.writeFileSync(out+'/cases.json',bytes);
 const hashes=Object.fromEntries(fs.readdirSync('src',{recursive:true}).filter(f=>fs.statSync('src/'+f).isFile()).map(f=>['src/'+f,sha(fs.readFileSync('src/'+f))]));
 const before=JSON.parse(fs.readFileSync(out+'/before-source-hashes.json'));const changed=Object.keys(hashes).filter(f=>hashes[f]!==before[f]);
 assert.deepEqual([...changed].sort(),['src/app/api/analyze/leaks/binding.ts','src/app/api/analyze/leaks/leaks.ts','src/app/api/analyze/leaks/route.ts','src/types/leaks.ts'].sort());
 fs.writeFileSync(out+'/manifest.json',JSON.stringify({started:new Date().toISOString(),production_model:models.current,evaluation_model:models.ultra,planned_calls:16,repeats:2,concurrency:2,timeout_ms:60000,cases_sha256:sha(bytes),source_hashes:hashes,production_changes:changed,method:'Same eight saved inputs, two Ultra-only observations, existing category recall/scoring plus manual semantic review. Real updated production handler uses semantic-only provider schema and deterministic binding after unchanged citation/numeric validation. No Evidence/downstream calls, retries, repairs or fallback.'},null,2));
 nextEnv.loadEnvConfig(process.cwd());assert.ok(process.env.NEBIUS_API_KEY);
 const jobs=cases.flatMap(c=>[1,2].map(repeat=>({c,repeat})));let cursor=0;const results=[];
 async function worker(){while(cursor<jobs.length){const {c,repeat}=jobs[cursor++];const row=await evaluateResolved(c,repeat,process.env.NEBIUS_API_KEY);results.push(row);fs.writeFileSync(out+'/results.json',JSON.stringify({results},null,2));console.log(JSON.stringify({completed:results.length,case:c.id,repeat,result:row.classification,provider_http:row.provider_http_status,route_http:row.route_http_status,raw_valid:row.raw_semantic_finding_validity,validation:row.raw_semantic_validation,bindings:row.bindings.map(f=>({category:f.category,intervention_ref:f.intervention_ref})),latency_ms:row.provider_latency_ms}));}}
 await Promise.all([worker(),worker()]);for(const c of cases)assert.equal(new Set(results.filter(r=>r.case_id===c.id).map(r=>r.request_sha256)).size,1);
 const changedDuringCalls=Object.keys(hashes).filter(f=>sha(fs.readFileSync(f))!==hashes[f]);assert.deepEqual(changedDuringCalls,[]);
 fs.writeFileSync(out+'/source-check.json',JSON.stringify({finished:new Date().toISOString(),calls:results.length,production_changes:changed,changed_source_files_during_calls:changedDuringCalls,cases_sha256:sha(fs.readFileSync(out+'/cases.json')),identical_saved_cases:true,identical_repeat_requests:true,production_model_unchanged:true},null,2));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)main().catch(()=>{console.error('Deterministic binding evaluation stopped without retry; inspect saved results.');process.exitCode=1;});
