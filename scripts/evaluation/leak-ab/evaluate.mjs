// Evaluation only: the transport changes only the candidate model ID in memory.
import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import nextEnv from '@next/env';
import {productionModules,provenance} from '../../../tests/helpers/provenance.mjs';
import {runOne,numericTokens} from '../leak-reliability/evaluate.mjs';
const load=productionModules();
const {isLeakRequest}=load('src/app/api/analyze/leaks/leaks.ts');
const route=fs.readFileSync('src/app/api/analyze/leaks/route.ts','utf8');
export const models={current:route.match(/const NEBIUS_MODEL = "([^"]+)"/)[1],ultra:'nvidia/Nemotron-3-Ultra-550b-a55b'};
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
export function fixture(id,description,lines,expected){
 const evidence={business_type:'Cafe',period:'month',currency:'USD',revenue:{total:null,items:[]},costs:{total:null,items:[]},facts:lines,assumptions:[],missing_information:[],confidence:'high'};
 evidence.provenance=provenance.createEvidenceProvenance(evidence,lines.join('\n'));
 evidence.provenance.authorization_records=[];
 const input={evidence,operational_context:lines};assert.equal(isLeakRequest(input),true);
 return {id,description,input,expected};
}
export function cases(){return [
 {id:'case_a',description:'Exact saved accepted Ultra Case A Evidence/request, unchanged',input:JSON.parse(fs.readFileSync('docs/evaluations/leak-case-a-reliability/input.json')),expected:['labor','waste','delivery']},
 fixture('staffing_wording','Reported headcount must be cited if mentioned',[
 'Tuesday evenings used 7 staff members during the month.',
 'Tuesday evening monthly sales were USD 2,100.',
 'Tuesday evening staffing cost was USD 3,500 for the month.',
 'Friday evenings also used 7 staff but generated USD 8,400 in monthly sales.',
 'The owner has not approved a staffing change; no controlled intervention is authorized.'
 ],['labor']),
 fixture('percentage_gap','Baseline and target; unreported subtraction is forbidden',[
 'Measured ingredient waste is 12%.',
 'The internal ingredient waste target is 7%.',
 'Purchases for this ingredient category were USD 14,000 this month.',
 'The owner has not permitted a waste reduction test.'
 ],['waste']),
 fixture('separate_fact_numbers','Separate fact IDs for each supporting numeric claim',[
 'Average delivery revenue per order is USD 23.50.',
 'Some delivery orders have combined packaging, fees, discounts and food costs exceeding their revenue.',
 'Monthly delivery platform fees totaled USD 8,700.',
 'Total business revenue was USD 120,000 this month.',
 'No delivery pricing change is approved.'
 ],['delivery']),
 fixture('time_scope','Time windows and scoped financial values must not leak across refs',[
 'Tuesday service ran from 5 PM to 9 PM during the month.',
 'Tuesday monthly sales for that service were USD 1,600.',
 'Tuesday staffing cost for that service was USD 2,200 for the month.',
 'Tuesday service used 3 staff.',
 'Saturday service from 6 PM to 11 PM used 3 staff and generated USD 5,900 in monthly sales.',
 'No change in staffing has been approved.'
 ],['labor']),
 fixture('qualitative_only','Supported qualitative delivery loss; no amounts or derived metrics',[
 'Some delivery orders had combined packaging, platform fees, discounts and food costs exceeding the revenue from those orders.',
 'No loss amount, order count, cost breakdown, benchmark or approved intervention has been reported.'
 ],['delivery']),
 fixture('irrelevant_numbers','Unrelated numbers must not be borrowed as leak support',[
 'Ingredient waste was measured at 11%.',
 'The business internal ingredient waste target is 6%.',
 'The cafe street address is 44 Market Street.',
 'The owner has 2 pets.',
 'The inventory system version is 3.8.',
 'No waste test has been approved.'
 ],['waste']),
 fixture('ambiguous','Large costs without inefficiency evidence: conservative empty findings',[
 'Total monthly revenue was USD 90,000.',
 'Monthly labor cost was USD 32,000.',
 'Monthly rent was USD 10,000.',
 'The owner wonders whether labor or rent might be excessive.',
 'No staffing demand comparison, market rent benchmark, waste measurement, internal target or unprofitable orders have been reported.'
 ],[])
];}
export function numericInventory(result){
 if(!result||typeof result!=='object')return [];
 const fields=[];
 for(const [i,l] of (Array.isArray(result.leaks)?result.leaks:[]).entries()){
  for(const [k,v] of [['title',l.title],...((Array.isArray(l.evidence)?l.evidence:[]).map((v,j)=>[`evidence[${j}]`,v])),['interpretation',l.interpretation]])if(typeof v==='string')fields.push({field_path:`leaks[${i}].${k}`,text:v,numeric_tokens:numericTokens(v),cited_fact_ids:l.evidence_refs??[]});
 }
 for(const [i,item] of (Array.isArray(result.insufficient_evidence)?result.insufficient_evidence:[]).entries())for(const k of ['topic','reason'])if(typeof item[k]==='string')fields.push({field_path:`insufficient_evidence[${i}].${k}`,text:item[k],numeric_tokens:numericTokens(item[k]),cited_fact_ids:null});
 return fields;
}
export async function evaluateOne(c,model,repeat,key,liveFetch=fetch){
 let generated=null,actualHash,actualModel,baseWithoutModelHash;
 const row=await runOne(c.input,repeat,key,async(url,options)=>{
  const original=JSON.parse(options.body),payload={...original,model};
  assert.deepEqual({...payload,model:original.model},original);
  const {model:ignored,...rest}=payload;void ignored;baseWithoutModelHash=sha(JSON.stringify(rest));actualHash=sha(JSON.stringify(payload));actualModel=payload.model;
  const response=await liveFetch(url,{...options,body:JSON.stringify(payload)});
  if(response.ok){try{const env=await response.clone().json();generated=JSON.parse(env?.choices?.[0]?.message?.content);}catch{/* real handler classifies failures */}}
  return response;
 });
 const observed=Array.isArray(generated?.leaks)?[...new Set(generated.leaks.map(l=>l.category))]:[];
 const missing=c.expected.filter(k=>!observed.includes(k));const unexpected=observed.filter(k=>!c.expected.includes(k));
 return {...row,case_id:c.id,repeat,model:actualModel,request_sha256:actualHash,payload_without_model_sha256:baseWithoutModelHash,generated_result:generated,numeric_inventory:numericInventory(generated),missing_expected_categories:missing,unexpected_categories:unexpected,classification:row.classification==='FAIL'||unexpected.length?'FAIL':missing.length?'PARTIAL':'PASS',semantic_review:'pending manual source-grounded review; category recall is provisional',derived_number_violations:[],false_positive_conclusions:[]};
}
async function main(){
 const out=path.resolve('docs/evaluations/leak-lightning-ultra');assert.equal(fs.existsSync(out+'/results.json'),false,'Refusing accidental rerun');
 const notes=cases();assert.equal(notes.length,8);notes.forEach(c=>assert.equal(isLeakRequest(c.input),true));
 const hashes=Object.fromEntries(fs.readdirSync('src',{recursive:true}).filter(f=>fs.statSync('src/'+f).isFile()).map(f=>['src/'+f,sha(fs.readFileSync('src/'+f))]));
 fs.mkdirSync(out,{recursive:true});fs.writeFileSync(out+'/cases.json',JSON.stringify(notes,null,2));
 fs.writeFileSync(out+'/manifest.json',JSON.stringify({started:new Date().toISOString(),models,planned_calls:32,repeats:2,concurrency:2,timeout_ms:60000,source_hashes:hashes,method:'Unchanged isolated production Leak handler; evaluation-only transport substitutes model ID. Identical payloads per case except model; production acceptance authoritative. No downstream calls, retries, repairs or fallback. Semantic review follows fixed expected case categories plus manual source-grounded review.'},null,2));
 nextEnv.loadEnvConfig(process.cwd());assert.ok(process.env.NEBIUS_API_KEY);
 const jobs=notes.flatMap(c=>[1,2].flatMap(repeat=>Object.values(models).map(model=>({c,repeat,model}))));
 const results=[];let cursor=0;
 async function worker(){while(cursor<jobs.length){const job=jobs[cursor++];const row=await evaluateOne(job.c,job.model,job.repeat,process.env.NEBIUS_API_KEY);results.push(row);fs.writeFileSync(out+'/results.json',JSON.stringify({results},null,2));console.log(JSON.stringify({completed:results.length,case:row.case_id,model:row.model,repeat:row.repeat,result:row.classification,status:row.route_http_status,reason:row.analysis?.validation,latency_ms:row.provider_latency_ms}));}}
 await Promise.all([worker(),worker()]);
 for(const c of notes){const rows=results.filter(r=>r.case_id===c.id);assert.equal(new Set(rows.map(r=>r.payload_without_model_sha256)).size,1);}
 const changed=Object.entries(hashes).filter(([f,h])=>sha(fs.readFileSync(f))!==h).map(([f])=>f);
 fs.writeFileSync(out+'/source-check.json',JSON.stringify({finished:new Date().toISOString(),changed_source_files:changed,calls:results.length,identical_payloads_except_model:true},null,2));assert.deepEqual(changed,[]);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)main().catch(e=>{console.error('Evaluation stopped without retry:',e instanceof assert.AssertionError?e.message:'inspect saved results');process.exitCode=1;});
