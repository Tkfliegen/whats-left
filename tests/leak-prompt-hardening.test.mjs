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
