import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {evaluateResolved} from '../scripts/evaluation/leak-ab/deterministic-binding.mjs';
const cases=JSON.parse(fs.readFileSync('docs/evaluations/leak-lightning-ultra/cases.json'));
test('evaluation preserves raw semantics and records server-owned Case A bindings without repair',async()=>{
 const c=cases[0],f=n=>c.input.evidence.provenance.citable_facts.find(f=>f.id.endsWith('_'+n)).id;
 const result={leaks:[{category:'labor',title:'Tuesday staffing mismatch',evidence_refs:['12','14','16'].map(f),evidence:['Tuesday sales USD 1,900 and staffing cost USD 2,500.'],interpretation:'The owner permits reducing Tuesday staffing by 1 person.',confidence:'high'},{category:'waste',title:'Waste above target',evidence_refs:['17','18'].map(f),evidence:['Waste is 9%, above the stated target of 5%.'],interpretation:'Waste exceeds target.',confidence:'high'},{category:'delivery',title:'Some delivery orders unprofitable',evidence_refs:['21'].map(f),evidence:['Some delivery orders cost more than their revenue.'],interpretation:'Some delivery orders have poor unit economics.',confidence:'high'}],insufficient_evidence:[]};
 let calls=0;const row=await evaluateResolved(c,1,'PRIVATE',async(_url,options)=>{calls++;const p=JSON.parse(options.body);assert.equal(p.model,'nvidia/Nemotron-3-Ultra-550b-a55b');assert.equal(p.response_format.json_schema.schema.properties.leaks.items.properties.intervention_ref,undefined);return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(result)}}]});});
 assert.equal(calls,1);assert.equal(row.classification,'PASS');assert.equal(row.raw_semantic_finding_validity,true);assert.deepEqual(row.bindings.map(f=>f.intervention_ref),['headcount_reduction',null,null]);assert.deepEqual(row.generated_result,result);assert.equal(row.only_binding_added,true);assert.doesNotMatch(JSON.stringify(row),/PRIVATE|Bearer/);
});
test('stale model identity is a schema FAIL rather than repaired by evaluation or route',async()=>{
 const c=cases.at(-1),r={leaks:[{category:'waste',title:'Unsupported',evidence_refs:[c.input.evidence.provenance.citable_facts[0].id],evidence:['Monthly revenue was USD 90,000.'],interpretation:'Unsupported.',confidence:'high',intervention_ref:'headcount_reduction'}],insufficient_evidence:[]};
 const row=await evaluateResolved(c,1,'PRIVATE',async()=>Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(r)}}]}));assert.equal(row.classification,'FAIL');assert.equal(row.raw_semantic_finding_validity,false);assert.equal(row.trusted_result,null);assert.equal(row.only_binding_added,null);
});
