import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {productionModules} from './helpers/provenance.mjs';
import {analyzeResult,numericTokens,runOne} from '../scripts/evaluation/leak-reliability/evaluate.mjs';
const evidence=JSON.parse(fs.readFileSync('tests/fixtures/leak-case-a-failed.json')).evidence;
const fact=n=>evidence.provenance.citable_facts.find(f=>f.id.endsWith('_'+String(n).padStart(2,'0'))).id;
const labor=()=>({title:'Tuesday labor mismatch',category:'labor',intervention_ref:'headcount_reduction',evidence_refs:[12,14,16].map(fact),evidence:['Tuesday sales were USD 1,900 and staffing cost was USD 2,500.','Tuesday staffing was 4 people.'],interpretation:'Tuesday staffing cost exceeds sales.',confidence:'high'});
const waste=()=>({title:'Waste above target',category:'waste',intervention_ref:null,evidence_refs:[17,18].map(fact),evidence:['Actual waste is 9%, above the target of 5%.'],interpretation:'Waste exceeds target.',confidence:'high'});
const result=()=>({leaks:[waste(),labor()],insufficient_evidence:[]});
test('source-reported but uncited staffing 4 is rejected at the same synthetic field path as original diagnostic',()=>{
 const r=result(),a=analyzeResult(r,evidence);assert.equal(a.structural_reference_validation.ok,true);assert.equal(a.validation.reason,'unreported_number');assert.equal(a.validation.field,'leaks[1].evidence[1]');assert.equal(a.first_failure_excerpt,'Tuesday staffing was 4 people.');const u=a.unreported_numbers[0];assert.equal(u.normalized_number,'4');assert.deepEqual(u.cited_fact_ids,[12,14,16].map(fact));assert.deepEqual(u.allowed_numeric_tokens,['6','10','1900','2500','625','1']);assert.ok(u.trusted_catalog_matches.some(f=>f.fact_id===fact(13)));
});
test('controlled offline counterfactual confirms citation coverage, without changing numeric rules',()=>{
 const r=result();r.leaks[1].evidence_refs.push(fact(13));assert.equal(analyzeResult(r,evidence).validation.ok,true);
});
test('a derived Waste four-point gap has a different meaning but the same missing scalar token',()=>{
 const r={leaks:[waste()],insufficient_evidence:[]};r.leaks[0].evidence.push('The gap is 4 percentage points.');const a=analyzeResult(r,evidence);assert.equal(a.validation.reason,'unreported_number');assert.equal(a.unreported_numbers[0].normalized_number,'4');assert.deepEqual(a.unreported_numbers[0].allowed_numeric_tokens,['9','5']);
});
test('time range, fact-ID digits and array indices do not fabricate a numeric token 4',()=>{
 assert.deepEqual(numericTokens('6 PM to 10 PM'),['6','10']);const r=result();r.leaks[1].evidence=['Tuesday sales were USD 1,900.'];assert.equal(analyzeResult(r,evidence).validation.ok,true);
});
test('isolated real handler returns the unchanged failure after bounded correction and fallback',async()=>{
 let calls=0;const r=result();r.leaks.forEach(f=>delete f.intervention_ref);
 const modules=productionModules(async(url,options)=>{calls++;assert.equal(url,'https://api.tokenfactory.nebius.com/v1/chat/completions');const payload=JSON.parse(options.body);assert.equal(payload.model,'nvidia/Nemotron-3-Ultra-550b-a55b');assert.equal(payload.temperature,.2);assert.equal(payload.max_tokens,calls===3?8000:4000);assert.equal(payload.chat_template_kwargs.enable_thinking,calls===3);return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(r)}}]});});
 const response=await modules('src/app/api/analyze/leaks/route.ts').POST(new Request('http://localhost',{method:'POST',body:JSON.stringify({evidence,operational_context:[]})}));
 const body=await response.json();assert.equal(calls,3);assert.equal(response.status,502);assert.equal(analyzeResult(r,evidence).validation.reason,'unreported_number');assert.doesNotMatch(JSON.stringify(body),/TEST_KEY|Bearer|choices/);
});
test('a scheduled provider timeout is recorded without retry or downstream calls',async()=>{
 let calls=0;const row=await runOne({evidence,operational_context:[]},1,'TEST_KEY',async()=>{calls++;throw new DOMException('PRIVATE failure','TimeoutError');});assert.equal(calls,1);assert.equal(row.provider_failure,'provider_timeout');assert.equal(row.route_http_status,502);assert.equal(row.analysis,null);assert.doesNotMatch(JSON.stringify(row),/PRIVATE|TEST_KEY/);
});
