import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {observedMetadata,runFollowup} from '../scripts/evaluation/leak-ab/ultra-hardened.mjs';
import {productionModules} from './helpers/provenance.mjs';
const saved=JSON.parse(fs.readFileSync('docs/evaluations/leak-lightning-ultra/cases.json'));
test('identifier and numeric prompt discipline survives the deterministic binding contract',()=>{
 const {leakSystemPrompt,modelLeakSchema}=productionModules()('src/app/api/analyze/leaks/leaks.ts');
 assert.match(leakSystemPrompt,/insufficient_evidence topic\/reason/);assert.match(leakSystemPrompt,/Do not derive percentages, ratios, differences/);
 assert.match(leakSystemPrompt,/Intervention identity and authorization are resolved by server code/);
 assert.equal(modelLeakSchema.properties.leaks.items.properties.intervention_ref,undefined);
});
test('evaluation flags cross-category binding without accepting or repairing it',()=>{
 const row={generated_result:{leaks:[{category:'waste',intervention_ref:'headcount_reduction',evidence_refs:[]}]},numeric_inventory:[]};assert.equal(observedMetadata(row).incorrect_intervention_bindings.length,1);assert.equal(row.generated_result.leaks[0].intervention_ref,'headcount_reduction');
});
test('IDs in prose are recorded; structural references alone are not prose',()=>{
 const row={generated_result:{leaks:[{category:'labor',intervention_ref:'headcount_reduction',evidence_refs:['fact_abc_12']}]},numeric_inventory:[{field_path:'insufficient_evidence[0].reason',text:'See fact_abc_12, src_16 and _12.'}]};assert.equal(observedMetadata(row).fact_source_ids_in_prose.length,3);assert.equal(observedMetadata({...row,numeric_inventory:[]}).fact_source_ids_in_prose.length,0);
});
test('follow-up uses Ultra with unchanged settings, schema, input and one provider call',async()=>{
 let calls=0;const row=await runFollowup(saved.at(-1),1,'PRIVATE',async(_url,options)=>{calls++;const p=JSON.parse(options.body);assert.equal(p.model,'nvidia/Nemotron-3-Ultra-550b-a55b');assert.equal(p.temperature,.2);assert.equal(p.max_tokens,4000);assert.match(p.messages[0].content,/IDs are metadata, not prose/);return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({leaks:[],insufficient_evidence:[{topic:'Labor and rent',reason:'No comparative evidence establishes inefficiency.'}]})}}]});});assert.equal(calls,1);assert.equal(row.classification,'PASS');assert.doesNotMatch(JSON.stringify(row),/PRIVATE|Bearer/);
});

test('prompt distinguishes minimum authorization groups from complete finding-level numeric support',()=>{
 const {leakSystemPrompt}=productionModules()('src/app/api/analyze/leaks/leaks.ts');
 for(const instruction of [
  'citation_requirements groups are minimum citation obligations, not exhaustive support for your prose.',
  'For every number in title, evidence, and interpretation—including headcounts and time ranges—select a relevant citable fact containing that number.',
  "If baseline headcount is reported in a separate fact, include that fact's exact ID in this finding's evidence_refs whenever mentioning the count.",
  'Global catalog presence does not substitute for selected citations.',
  'Otherwise omit the unsupported numeric statement; never infer it or rely on citation repair.',
  'evidence_refs MUST select only exact fact IDs from citable_facts.',
 ])assert.ok(leakSystemPrompt.includes(instruction),instruction);
});
const citationEvidence=JSON.parse(fs.readFileSync('tests/fixtures/leak-case-a-failed.json')).evidence;
const citationOutput=productionModules()('src/app/api/analyze/leaks/output.ts');
const citationFact=n=>citationEvidence.provenance.citable_facts.find(f=>f.id.endsWith('_'+String(n).padStart(2,'0'))).id;
const citationFinding=()=>({leaks:[{title:'Tuesday staffing mismatch',category:'labor',evidence_refs:[12,14,16].map(citationFact),evidence:['Tuesday sales were USD 1,900 and staffing cost was USD 2,500.'],interpretation:'The supplied evidence establishes a staffing mismatch.',confidence:'high'}],insufficient_evidence:[]});
for(const field of ['title','evidence','interpretation'])test(`complete authorization citations do not permit uncited scalar 4 in ${field}`,()=>{
 const result=citationFinding(),finding=result.leaks[0],text='Tuesday staffing used 4 staff members.';
 if(field==='evidence')finding.evidence=[text];else finding[field]=text;
 assert.equal(citationOutput.validateLeakReferences(result,citationEvidence).ok,true);
 const logs=[],before=JSON.stringify(result),validation=citationOutput.validateLeakOutput(result,citationEvidence,undefined,d=>logs.push(d));
 assert.equal(validation.reason,'unreported_number');assert.equal(logs[0].rejection_branch,'scalar_not_in_selected_support');
 assert.equal(logs[0].number_in_global_support,true);assert.equal(logs[0].number_in_selected_support,false);
 assert.equal(logs[0].normalized_number,'4');assert.equal(logs[0].field_path,`leaks[0].${field}${field==='evidence'?'[0]':''}`);
 assert.equal(JSON.stringify(result),before);
 finding.evidence_refs.push(citationFact(13));assert.equal(citationOutput.validateLeakOutput(result,citationEvidence).ok,true);
});
test('a cited scalar still does not authorize an unsupported word-form ratio',()=>{
 const result=citationFinding();result.leaks[0].evidence_refs.push(citationFact(13));result.leaks[0].interpretation='Staffing is four times baseline.';
 const logs=[],validation=citationOutput.validateLeakOutput(result,citationEvidence,undefined,d=>logs.push(d));
 assert.equal(validation.reason,'unreported_number');assert.equal(logs[0].rejection_branch,'unsupported_derived_numeric_claim');assert.equal(logs[0].number_in_selected_support,true);
});
test('headcount citation supplements rather than replaces mandatory authorization support',()=>{
 const group=citationOutput.citationRequirements(citationEvidence).find(g=>g.intervention==='headcount_reduction');
 assert.deepEqual(Array.from(group.fact_ids),[12,14,16].map(citationFact));
 const result=citationFinding();result.leaks[0].evidence_refs=[13,14,16].map(citationFact);
 const validation=citationOutput.validateLeakOutput(result,citationEvidence);
 assert.equal(validation.reason,'incomplete_citation_support');assert.ok(validation.missing_fact_ids.includes(citationFact(12)));
});
