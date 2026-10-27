// Isolated evaluation only. No production modules/configuration are mutated.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {productionModules} from '../../../tests/helpers/provenance.mjs';
import {cases} from './cases.mjs';
import nextEnv from '@next/env';
const load=productionModules();
const {matchesSchema}=load('src/app/api/analyze/evidence/evidence.ts');
const {normalizeEvidenceCurrency}=load('src/app/api/analyze/evidence/currency.ts');
const {validateAuthorizationAtoms,assembleAuthorizationRecords}=load('src/app/api/analyze/evidence/authorization-atoms.ts');
const {validateAuthorizationRecords,requiredAuthorizationSources}=load('src/app/api/analyze/evidence/authorization-records.ts');
const {createEvidenceProvenance}=load('src/app/api/analyze/evidence/provenance.ts');
const {groundCalculationFacts}=load('src/app/api/analyze/evidence/calculation-facts.ts');
const {buildScenarioInput}=load('src/app/api/analyze/scenarios/scenarios.ts');
const routeSource=fs.readFileSync('src/app/api/analyze/evidence/route.ts','utf8');
export const timeoutMs=Number(routeSource.match(/UPSTREAM_TIMEOUT_MS = ([\d_]+)/)[1].replaceAll('_',''));
export const productionModel=routeSource.match(/NEBIUS_MODEL = "([^"]+)"/)[1];
export const models={Super:'nvidia/nemotron-3-super-120b-a12b',Ultra:'nvidia/Nemotron-3-Ultra-550b-a55b',Lightning:'nvidia/Nemotron-3_5-Lightning'};
const plain=x=>JSON.parse(JSON.stringify(x));
const kinds=['scoped_sales','scoped_staffing_cost','headcount_reduction_permission','schedule_constraint','current_waste_rate','waste_target_rate','waste_reduction_permission'];
export async function captureRequest(note){
 let captured;const modules=productionModules(async(url,options)=>{captured={url,payload:JSON.parse(options.body)};return Response.json({choices:[]});});
 await modules('src/app/api/analyze/evidence/route.ts').POST(new Request('http://localhost',{method:'POST',body:JSON.stringify({input:note.input})}));
 if(!captured)throw Error('Unable to capture production request');return captured;
}
function safeAtoms(value){
 if(!Array.isArray(value))return [];
 const enums={kind:kinds,scope:['tuesday_evening_6pm_10pm','ingredient_waste'],operation:['delta'],intervention:['headcount_reduction'],unit:['persons','percent'],permission:['explicit'],constraint:['rest_schedule_unchanged'],period:['month']};
 return value.map(atom=>{
  if(!atom||typeof atom!=='object'||Array.isArray(atom))return {kind:'[invalid_atom]'};
  const safe={};for(const [key,allowed]of Object.entries(enums))if(key in atom)safe[key]=allowed.includes(atom[key])?atom[key]:'[invalid_enum]';
  if('currency'in atom)safe.currency=typeof atom.currency==='string'&&/^[A-Z]{3}$/.test(atom.currency)?atom.currency:'[invalid_currency]';
  for(const key of ['amount','value','from'])if(key in atom)safe[key]=typeof atom[key]==='number'&&Number.isFinite(atom[key])?atom[key]:'[invalid_number]';
  if('source_refs'in atom)safe.source_refs=Array.isArray(atom.source_refs)?atom.source_refs.map(id=>typeof id==='string'&&/^src_[a-f0-9]{32}_\d+$/.test(id)?id:'[invalid_source_id]'):['[invalid_source_refs]'];
  return safe;
 });
}
export function judgeAtoms(note,value){
 const actual=Array.isArray(value)?value:[],missing=[],unexpected=[],matched=[];const used=new Set();
 for(const expected of note.expected_atoms){
  const candidates=actual.map((atom,index)=>({atom,index})).filter(({atom})=>atom?.kind===expected.kind);
  const match=candidates.find(({atom,index})=>!used.has(index)&&Object.entries(expected).filter(([key])=>!['source_refs','allowed_source_refs'].includes(key)).every(([key,v])=>atom[key]===v)&&Array.isArray(atom.source_refs)&&expected.source_refs.every(id=>atom.source_refs.includes(id))&&atom.source_refs.every(id=>expected.allowed_source_refs.includes(id)));
  if(match){used.add(match.index);matched.push(expected.kind);}else missing.push({kind:expected.kind,expected_fields:Object.fromEntries(Object.entries(expected).filter(([key])=>key!=='allowed_source_refs'))});
 }
 actual.forEach((atom,index)=>{if(!used.has(index))unexpected.push({atom_index:index,kind:kinds.includes(atom?.kind)?atom.kind:'[invalid_kind]',reason:note.expected_atoms.some(e=>e.kind===atom?.kind)?'incorrect_fields_source_support_or_duplicate':'unexpected_atom_kind'});});
 return {matched_expected_atoms:matched,missing_expected_atoms:missing,unexpected_or_misclassified_atoms:unexpected,expected_atom_count:note.expected_atoms.length,returned_atom_count:actual.length};
}
export async function judgeCompletion(note,completion,captured){
 const result={schema_valid:false,atom_validation:false,record_validation:false,assembled_authorization_records:null,downstream_authorization:null};
 const choice=completion?.choices?.[0],content=choice?.message?.content;
 if(choice?.finish_reason!=='stop'||choice?.message?.refusal||typeof content!=='string')return {...result,classification:'FAIL',failure:'provider_response_invalid',extracted_atoms:[]};
 let parsed;try{parsed=JSON.parse(content);}catch{return {...result,classification:'FAIL',failure:content.trim()?'provider_invalid_json':'provider_empty_response',extracted_atoms:[]};}
 const atoms=parsed?.authorization_atoms;const judged=judgeAtoms(note,atoms);Object.assign(result,judged,{extracted_atoms:safeAtoms(atoms)});
 result.schema_valid=matchesSchema(parsed,captured.payload.response_format.json_schema.schema);
 if(!result.schema_valid)return {...result,classification:'FAIL',failure:'provider_schema_invalid'};
 const normalized=normalizeEvidenceCurrency(parsed.currency,note.input);
 if(!normalized.ok)return {...result,classification:'FAIL',failure:'currency_invalid'};
 const diagnostics=[];result.atom_validation=validateAuthorizationAtoms(atoms,note.sources,normalized.currency,d=>diagnostics.push(plain(d)));
 result.validation_diagnostics=diagnostics;
 if(!result.atom_validation)return {...result,classification:'FAIL',failure:'atom_validation_failed'};
 const assemblyDiagnostics=[];const records=assembleAuthorizationRecords(atoms,note.sources,normalized.currency,undefined,d=>assemblyDiagnostics.push(plain(d)));
 result.assembly_diagnostics=assemblyDiagnostics;result.record_validation=validateAuthorizationRecords(records,note.sources,normalized.currency);
 if(!result.record_validation)return {...result,classification:'FAIL',failure:'authorization_record_validation_failed'};
 result.assembled_authorization_records=plain(records);
 const {authorization_atoms:ignored,business_total_support,calculation_support,...base}=parsed;void ignored;const evidence=load('src/app/api/analyze/evidence/business-totals.ts').groundBusinessTotals({...base,currency:normalized.currency},business_total_support,note.sources).evidence;
 const calculationFacts=calculation_support===undefined?undefined:groundCalculationFacts(calculation_support,note.sources,evidence);
 evidence.provenance={...createEvidenceProvenance(evidence,note.input,calculationFacts),authorization_records:records};
 // Deterministic authorization probe only, never a live Leak/Scenario call. Each
 // controlled finding cites exactly the candidate's code-resolved source set.
 const leaks={leaks:records.flatMap(record=>{const refs=requiredAuthorizationSources(record);if(!refs)return [];return [{title:'Evaluation '+record.intervention,category:record.intervention==='headcount_reduction'?'labor':'waste',intervention_ref:record.intervention,evidence_refs:refs.map(ref=>evidence.provenance.citable_facts.find(f=>f.source_refs.length===1&&f.source_refs[0]===ref).id),evidence:['Source-bound evaluation candidate.'],interpretation:'Evaluation candidate.',confidence:'high'}];}),insufficient_evidence:[]};
 const authorized=buildScenarioInput({evidence,leaks,operational_context:[]}).authorized_changes;
 const ids=Array.from(authorized,a=>a.authorization_id),unexpectedIds=ids.filter(id=>!note.expected_authorizations.includes(id)),missingIds=note.expected_authorizations.filter(id=>!ids.includes(id));
 result.downstream_authorization={actual_ids:ids,expected_ids:note.expected_authorizations,unexpected_ids:unexpectedIds,missing_ids:missingIds,correct:unexpectedIds.length===0&&missingIds.length===0,safe:unexpectedIds.length===0,probe:'offline synthetic complete-ref findings; no live downstream model evaluation'};
 const falsePermissions=judged.unexpected_or_misclassified_atoms.filter(a=>['headcount_reduction_permission','waste_reduction_permission'].includes(a.kind));result.false_positive_permission_count=falsePermissions.length;
 if(judged.unexpected_or_misclassified_atoms.length||unexpectedIds.length)return {...result,classification:'FAIL',failure:'incorrect_atomic_extraction'};
 if(judged.missing_expected_atoms.length||missingIds.length)return {...result,classification:'PARTIAL',failure:null};
 return {...result,classification:'PASS',failure:null};
}
export function summarize(results){
 return Object.fromEntries(Object.keys(models).map(label=>{
  const rows=results.filter(r=>r.model_label===label),parsed=rows.filter(r=>typeof r.returned_atom_count==='number'),expected=rows.reduce((n,r)=>n+(r.expected_atom_count??cases.find(c=>c.id===r.case_id).expected_atoms.length),0),matched=rows.reduce((n,r)=>n+(r.matched_expected_atoms?.length??0),0);
  return [label,{calls:rows.length,pass:rows.filter(r=>r.classification==='PASS').length,partial:rows.filter(r=>r.classification==='PARTIAL').length,fail:rows.filter(r=>r.classification==='FAIL').length,full_pass_rate:rows.length?rows.filter(r=>r.classification==='PASS').length/rows.length:0,expected_atoms:expected,matched_atoms:matched,atom_completeness:expected?matched/expected:0,misclassified_runs:rows.filter(r=>r.unexpected_or_misclassified_atoms?.length).length,parsed_runs:parsed.length,misclassified_atoms:rows.reduce((n,r)=>n+(r.unexpected_or_misclassified_atoms?.length??0),0),returned_atoms:rows.reduce((n,r)=>n+(r.returned_atom_count??0),0),false_positive_permissions:rows.reduce((n,r)=>n+(r.false_positive_permission_count??r.unexpected_or_misclassified_atoms?.filter(a=>a.kind.endsWith('_permission')).length??0),0),unsafe_authorization_runs:rows.filter(r=>r.downstream_authorization?.safe===false).length,timeouts:rows.filter(r=>r.failure==='provider_timeout').length,provider_failures:rows.filter(r=>r.failure?.startsWith('provider_')).length,average_latency_ms:rows.length?Math.round(rows.reduce((n,r)=>n+r.latency_ms,0)/rows.length):null,max_latency_ms:rows.length?Math.max(...rows.map(r=>r.latency_ms)):null}];
 }));
}
export async function runProviderCall(note,label,repeat,captured,key,fetcher=fetch){
 const started=Date.now(),signal=AbortSignal.timeout(timeoutMs);let phase='request',status=null;
 try{
  const response=await fetcher(captured.url,{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},cache:'no-store',signal,body:JSON.stringify({...captured.payload,model:models[label]})});status=response.status;
  if(!response.ok)return {case_id:note.id,model_label:label,model:models[label],repeat,status,classification:'FAIL',failure:'provider_http_error',latency_ms:Date.now()-started};
  phase='response_json';const completion=await response.json();const latency_ms=Date.now()-started;phase='scoring';const judged=await judgeCompletion(note,completion,captured);
  return {case_id:note.id,model_label:label,model:models[label],repeat,status,latency_ms,...judged};
 }catch(error){if(phase==='scoring')throw error;const failure=signal.aborted||['TimeoutError','AbortError'].includes(error?.name)?'provider_timeout':phase==='response_json'&&error?.name==='SyntaxError'?'provider_invalid_json':phase==='request'||error?.name==='TypeError'?'provider_network_error':'provider_response_invalid';return {case_id:note.id,model_label:label,model:models[label],repeat,status,classification:'FAIL',failure,latency_ms:Date.now()-started};}
}
async function main(){
 nextEnv.loadEnvConfig(process.cwd());const key=process.env.NEBIUS_API_KEY;if(!key)throw Error('NEBIUS_API_KEY not configured');
 const out=path.resolve(process.argv[2]??'docs/evaluations/evidence-super-ultra');fs.mkdirSync(out,{recursive:true});
 const results=[],started=new Date().toISOString();const protectedFiles=fs.readdirSync('src',{recursive:true}).filter(p=>fs.statSync(path.join('src',p)).isFile()).map(p=>path.join('src',p));const hashes=Object.fromEntries(protectedFiles.map(p=>[p,crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')]));
 const manifest={started,production_model:productionModel,models,timeout_ms:timeoutMs,repeats:2,notes:cases.map(({sources,...note})=>{void sources;return note;}),settings:'Exact captured production request except model; two concurrent calls maximum, one per model; no retries; two scheduled repetitions even after failures.',source_hashes:hashes};fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2));
 for(let repeat=1;repeat<=2;repeat++)for(const note of cases){const captured=await captureRequest(note);const labels=repeat===1?['Super','Ultra']:['Ultra','Super'];await Promise.all(labels.map(async label=>{const row=await runProviderCall(note,label,repeat,captured,key);results.push(row);fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({manifest:{started,models,production_model:productionModel,timeout_ms:timeoutMs,repeats:2},results,summary:summarize(results)},null,2));console.log(JSON.stringify({completed:results.length,planned:32,case_id:note.id,model:label,repeat,classification:row.classification,failure:row.failure,latency_ms:row.latency_ms,missing:row.missing_expected_atoms?.map(a=>a.kind),unexpected:row.unexpected_or_misclassified_atoms?.map(a=>a.kind)}));}));}
 const changed=protectedFiles.filter(p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')!==hashes[p]);fs.writeFileSync(path.join(out,'source-check.json'),JSON.stringify({changed_source_files:changed,finished:new Date().toISOString()},null,2));console.log('SUMMARY '+JSON.stringify(summarize(results)));if(changed.length)throw Error('Production source changed during evaluation');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)main().catch(()=>{console.error('Evaluation stopped due to a harness error; no automatic retry. Inspect saved results.');process.exitCode=1;});
