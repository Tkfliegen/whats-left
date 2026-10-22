// Evaluation-only follow-up: 16 Lightning calls, 16 reused Ultra observations.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import nextEnv from '@next/env';
import {cases} from './cases.mjs';
import {captureRequest,runProviderCall,productionModel,models,timeoutMs,summarize} from './evaluate.mjs';
const digest=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
export function validateReference(manifest,data,hash=digest){
 assert.equal(manifest.timeout_ms,timeoutMs,'Reference timeout changed');
 assert.equal(manifest.models.Ultra,models.Ultra,'Reference Ultra identifier changed');
 assert.deepEqual(manifest.notes,cases.map(({sources,...note})=>{void sources;return note;}),'Reference notes or scoring annotations changed');
 for(const [file,expected]of Object.entries(manifest.source_hashes))assert.equal(hash(file),expected,`Production source differs: ${file}`);
 const rows=data.results.filter(r=>r.model_label==='Ultra');assert.equal(rows.length,16,'Expected 16 saved Ultra calls');
 assert.equal(new Set(rows.map(r=>`${r.case_id}:${r.repeat}`)).size,16);
 for(const note of cases)for(const repeat of [1,2])assert.equal(rows.filter(r=>r.case_id===note.id&&r.repeat===repeat&&r.model===models.Ultra).length,1);
 return rows;
}
export function comparisonSummary(rows){const summary=summarize(rows);return {Lightning:summary.Lightning,Ultra:summary.Ultra};}
async function main(){
 const referenceDir='docs/evaluations/evidence-super-ultra',out=path.resolve(process.argv[2]??'docs/evaluations/evidence-lightning-ultra');
 const referenceManifest=JSON.parse(fs.readFileSync(referenceDir+'/manifest.json')),referenceData=JSON.parse(fs.readFileSync(referenceDir+'/results.json'));
 const reused=validateReference(referenceManifest,referenceData).map(row=>({...row,reused:true}));
 nextEnv.loadEnvConfig(process.cwd());const key=process.env.NEBIUS_API_KEY;if(!key)throw Error('Missing evaluation API key');
 if(fs.existsSync(out+'/results.json'))throw Error('Output already exists; refusing accidental repeat');
 fs.mkdirSync(out,{recursive:true});const started=new Date().toISOString();
 const manifest={started,production_model:productionModel,models:{Lightning:models.Lightning,Ultra:models.Ultra},timeout_ms:timeoutMs,new_calls_planned:16,reused_ultra_calls:16,reused_ultra_started:referenceManifest.started,reference:referenceDir,reference_results_sha256:digest(referenceDir+'/results.json'),notes:referenceManifest.notes,source_hashes:referenceManifest.source_hashes,method:'Same notes, annotation oracle, prompt/schema/validators, scoring and request settings. Lightning sequential, one active call; two scheduled repeats, no retries. Ultra results reused, not time-paired.'};
 fs.writeFileSync(out+'/manifest.json',JSON.stringify(manifest,null,2));const results=[...reused];
 for(const repeat of [1,2])for(const note of cases){const captured=await captureRequest(note);assert.equal(captured.payload.model,models.Lightning);const row={...await runProviderCall(note,'Lightning',repeat,captured,key),reused:false};results.push(row);fs.writeFileSync(out+'/results.json',JSON.stringify({manifest:{started,models:manifest.models,timeout_ms:timeoutMs,new_calls_planned:16,reused_ultra_calls:16},results,summary:comparisonSummary(results)},null,2));console.log(JSON.stringify({new_calls_completed:results.filter(r=>!r.reused).length,planned:16,case_id:note.id,repeat,classification:row.classification,failure:row.failure,latency_ms:row.latency_ms,missing:row.missing_expected_atoms?.map(a=>a.kind),unexpected:row.unexpected_or_misclassified_atoms?.map(a=>a.kind)}));}
 const changed=Object.entries(manifest.source_hashes).filter(([file,expected])=>digest(file)!==expected).map(([file])=>file);
 fs.writeFileSync(out+'/source-check.json',JSON.stringify({finished:new Date().toISOString(),changed_source_files:changed,reused_ultra_unchanged:digest(referenceDir+'/results.json')===manifest.reference_results_sha256},null,2));assert.deepEqual(changed,[]);console.log('SUMMARY '+JSON.stringify(comparisonSummary(results)));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)main().catch(()=>{console.error('Follow-up stopped due to a harness error; no automatic retry. Inspect saved results.');process.exitCode=1;});
