import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {cases,models,evaluateOne,numericInventory} from '../scripts/evaluation/leak-ab/evaluate.mjs';
const notes=cases();
test('eight fixed valid inputs include exact saved Case A and conservative ambiguous oracle',()=>{
 assert.equal(notes.length,8);assert.deepEqual(notes[0].input,JSON.parse(fs.readFileSync('docs/evaluations/leak-case-a-reliability/input.json')));assert.deepEqual(notes.at(-1).expected,[]);assert.equal(models.current,'nvidia/Nemotron-3-Ultra-550b-a55b');
});
const output={leaks:[],insufficient_evidence:[{topic:'Labor and rent',reason:'No comparison establishes inefficiency.'}]};
test('A/B transport changes only model; unchanged handler accepts safe conservative output with one call',async()=>{
 let base;for(const model of Object.values(models)){let calls=0;const r=await evaluateOne(notes.at(-1),model,1,'PRIVATE',async(url,options)=>{calls++;const body=JSON.parse(options.body);assert.equal(body.model,model);const {model:ignored,...rest}=body;void ignored;if(base)assert.deepEqual(rest,base);else base=rest;assert.equal(body.temperature,.2);assert.equal(body.max_tokens,4000);return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(output)}}]});});assert.equal(calls,1);assert.equal(r.classification,'PASS');assert.equal(r.route_http_status,200);assert.doesNotMatch(JSON.stringify(r),/PRIVATE|Bearer/);}
});
test('safe missing qualitative finding is PARTIAL; false-positive category is FAIL',async()=>{
 const mock=result=>async()=>Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(result)}}]});
 const row=await evaluateOne(notes[5],models.ultra,1,'PRIVATE',mock(output));assert.equal(row.classification,'PARTIAL');
 const c=notes.at(-1),id=c.input.evidence.provenance.citable_facts[0].id;
 const wrong={leaks:[{title:'Labor is excessive',category:'labor',evidence_refs:[id],evidence:['Monthly revenue was USD 90,000.'],interpretation:'Labor is excessive.',confidence:'high'}],insufficient_evidence:[]};
 const bad=await evaluateOne(c,models.ultra,1,'PRIVATE',mock(wrong));assert.equal(bad.route_http_status,200);assert.equal(bad.classification,'FAIL');assert.deepEqual(bad.unexpected_categories,['labor']);
});
test('numeric inventory excludes ID digits and includes all prose field tokens',()=>{
 const r=numericInventory({leaks:[{title:'Waste 12%',evidence:['Target 7%.'],interpretation:'Gap 5 points.',evidence_refs:['fact_123_99']}],insufficient_evidence:[]});assert.deepEqual(r.flatMap(f=>f.numeric_tokens),['12','7','5']);
});
test('provider failure is FAIL with no retry',async()=>{let calls=0;const r=await evaluateOne(notes[5],models.ultra,1,'PRIVATE',async()=>{calls++;return Response.json({private:'secret'}, {status:429});});assert.equal(calls,1);assert.equal(r.classification,'FAIL');assert.equal(r.provider_http_status,429);assert.doesNotMatch(JSON.stringify(r),/secret|PRIVATE/);});
