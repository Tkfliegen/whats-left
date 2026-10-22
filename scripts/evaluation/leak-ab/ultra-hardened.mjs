// Isolated follow-up: saved inputs/scoring, existing real handler, Ultra only.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import nextEnv from '@next/env';
import {evaluateOne,models} from './evaluate.mjs';
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
export function observedMetadata(row){
 const incorrect=[];
 for(const [finding_index,f] of (row.generated_result?.leaks??[]).entries()){
  if(f.intervention_ref!=null&&(({headcount_reduction:'labor',waste_rate_target:'waste'})[f.intervention_ref]!==f.category))incorrect.push({finding_index,category:f.category,intervention_ref:f.intervention_ref});
 }
 const prose_ids=row.numeric_inventory.flatMap(f=>[...f.text.matchAll(/(?:fact_|src_)[A-Za-z0-9_]+|(?<!\w)_\d+\b/g)].map(m=>({field_path:f.field_path,identifier:m[0]})));
 return {incorrect_intervention_bindings:incorrect,cross_category_intervention_bindings:incorrect,fact_source_ids_in_prose:prose_ids,bindings:(row.generated_result?.leaks??[]).map((f,finding_index)=>({finding_index,category:f.category,intervention_ref:f.intervention_ref??null,evidence_refs:f.evidence_refs}))};
}
export async function runFollowup(c,repeat,key,fetcher=fetch){
 const row=await evaluateOne(c,models.ultra,repeat,key,fetcher);const meta=observedMetadata(row);
 return {...row,...meta,classification:meta.incorrect_intervention_bindings.length||meta.fact_source_ids_in_prose.length?'FAIL':row.classification};
}
async function main(){
 const out='docs/evaluations/leak-ultra-hardened';assert.equal(fs.existsSync(out+'/results.json'),false,'Refusing accidental rerun');
 assert.equal(models.current,'nvidia/Nemotron-3_5-Lightning');
 const caseBytes=fs.readFileSync('docs/evaluations/leak-lightning-ultra/cases.json');const cases=JSON.parse(caseBytes);assert.equal(cases.length,8);
 fs.writeFileSync(out+'/cases.json',caseBytes);
 const before=JSON.parse(fs.readFileSync(out+'/before-source-hashes.json'));const hashes=Object.fromEntries(Object.keys(before).map(f=>[f,sha(fs.readFileSync(f))]));
 const changed=Object.keys(before).filter(f=>hashes[f]!==before[f]);assert.deepEqual(changed,['src/app/api/analyze/leaks/leaks.ts']);
 fs.writeFileSync(out+'/manifest.json',JSON.stringify({started:new Date().toISOString(),model:models.ultra,production_model:models.current,planned_calls:16,repeats:2,concurrency:2,timeout_ms:60000,cases_sha256:sha(caseBytes),source_hashes:hashes,production_files_changed_before_calls:changed,method:'Exact saved eight cases and existing scoring/evaluateOne; real production handler plus Ultra-only transport override. New evaluation metadata identifies cross-category bindings and IDs in prose, previously assessed manually. No downstream/retry/repair/fallback.'},null,2));
 nextEnv.loadEnvConfig(process.cwd());assert.ok(process.env.NEBIUS_API_KEY);
 const jobs=cases.flatMap(c=>[1,2].map(repeat=>({c,repeat})));let index=0;const results=[];
 async function worker(){while(index<jobs.length){const {c,repeat}=jobs[index++];const row=await runFollowup(c,repeat,process.env.NEBIUS_API_KEY);results.push(row);fs.writeFileSync(out+'/results.json',JSON.stringify({results},null,2));console.log(JSON.stringify({completed:results.length,case:c.id,repeat,result:row.classification,status:row.route_http_status,validation:row.analysis?.validation,incorrect_bindings:row.incorrect_intervention_bindings,prose_ids:row.fact_source_ids_in_prose,latency_ms:row.provider_latency_ms}));}}
 await Promise.all([worker(),worker()]);
 for(const c of cases)assert.equal(new Set(results.filter(r=>r.case_id===c.id).map(r=>r.request_sha256)).size,1);
 const changedDuringCalls=Object.keys(hashes).filter(f=>sha(fs.readFileSync(f))!==hashes[f]);assert.deepEqual(changedDuringCalls,[]);
 fs.writeFileSync(out+'/source-check.json',JSON.stringify({finished:new Date().toISOString(),calls:results.length,production_changes_from_before:changed,changed_source_files_during_calls:changedDuringCalls,cases_sha256:sha(fs.readFileSync(out+'/cases.json')),identical_saved_cases:true,identical_repeat_requests:true},null,2));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)main().catch(()=>{console.error('Ultra follow-up stopped without retry; inspect saved results.');process.exitCode=1;});
