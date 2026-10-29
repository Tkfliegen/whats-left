import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {productionModules,provenance} from './helpers/provenance.mjs';
const load=productionModules(),{validateLeakOutput,citationRequirements}=load('src/app/api/analyze/leaks/output.ts');
const {buildLeakInput,isLeakResult}=load('src/app/api/analyze/leaks/leaks.ts');
const scenario=load('src/app/api/analyze/scenarios/scenarios.ts');
const {usesReportedNumbers}=load('src/lib/leak-display.ts');
const recorded=JSON.parse(fs.readFileSync('tests/fixtures/leak-case-a-failed.json','utf8'));
const evidence=recorded.evidence,plain=x=>JSON.parse(JSON.stringify(x));
const fact=ordinal=>evidence.provenance.citable_facts.find(f=>f.id.endsWith('_'+String(ordinal).padStart(2,'0'))).id;
function valid(){
 return {leaks:[
  {title:'Labor inefficiency on Tuesday evenings',category:'labor',evidence_refs:[12,13,14,15,16].map(fact),evidence:['Tuesday monthly sales were USD 1,900, with 4 staff and staffing cost USD 2,500 for the affected month (USD 625 per staff member). Friday sales were USD 6,200 with the same staffing level.','The owner permits testing a reduction of 1 person on Tuesday evenings while keeping the rest of the schedule unchanged.'],interpretation:'The reported staffing pattern is mismatched with Tuesday evening demand.',confidence:'high'},
  {title:'Ingredient waste above target',category:'waste',evidence_refs:[17,18,19].map(fact),evidence:['Current waste is 9%, the internal target is 5%, and tracked purchases were USD 12,500.'],interpretation:'The reported waste rate exceeds the internal target. No test permission is supplied.',confidence:'high'},
  {title:'Delivery unit economics',category:'delivery',evidence_refs:[5,10,20,21,22].map(fact),evidence:['Average delivery revenue was USD 18.40 per order. Some orders had combined costs exceeding revenue.','Reported platform fees were USD 9,300 and total business revenue was USD 100,000.'],interpretation:'Poor unit economics are reported for some orders; no controllable intervention is approved.',confidence:'high'},
 ],insufficient_evidence:[{topic:'Rent market comparison',reason:'No market benchmark was reported.'}]};
}
const request=result=>({evidence,leaks:result,operational_context:provenance.sourceStatements(evidence.provenance.source_input)});
const authorized=result=>scenario.buildScenarioInput(request(result)).authorized_changes;

test('A/E: complete Case A output uses cited reported numbers and reaches Labor authorization only',()=>{
 const result=valid(),before=JSON.stringify(result);assert.equal(isLeakResult(result,evidence),true);assert.deepEqual(plain(validateLeakOutput(result,evidence)),{ok:true});
 assert.equal(usesReportedNumbers(result,JSON.stringify(evidence)),true);assert.equal(JSON.stringify(result),before);
 const auth=authorized(result);assert.equal(auth.length,1);assert.equal(auth[0].authorization_id,'tuesday_evening_headcount_reduction');assert.equal(auth[0].value,-1);
 assert.ok(result.leaks[0].evidence_refs.includes(fact(12)));assert.equal(auth[0].source_refs.length,3);
});
test('exact saved failure rejects missing sales citation first; independently exposes 33.4 without editing original payload',()=>{
 const before=JSON.stringify(recorded.leaks),reason=validateLeakOutput(recorded.leaks,evidence);
 assert.equal(reason.ok,false);assert.equal(reason.reason,'incomplete_citation_support');assert.equal(reason.field,'leaks[0].evidence_refs');assert.ok(reason.missing_fact_ids.includes(fact(12)));
 const isolated=structuredClone(recorded.leaks);isolated.leaks[0].evidence_refs.push(fact(12));const percentage=validateLeakOutput(isolated,evidence);
 assert.equal(percentage.field,'leaks[0].evidence[1]');assert.ok(percentage.numbers.includes('33.4'));assert.ok(percentage.numbers.includes('34000'));assert.equal(JSON.stringify(recorded.leaks),before);
 assert.equal(JSON.stringify(recorded.evidence).includes('33.4'),false);
 assert.equal(recorded.leaks.leaks[0].evidence[1],'Labor is the largest cost category at $34,000 (33.4% of revenue).');
});
for(const [value,which]of [['33.4',0],['9.3',2]])test(`B: arithmetic-derived ${value}% rejects even with otherwise complete valid refs`,()=>{
 const result=valid();result.leaks[which].interpretation+=` This was ${value}% of revenue.`;
 const reason=validateLeakOutput(result,evidence);assert.equal(reason.reason,'unreported_number');assert.deepEqual(Array.from(reason.numbers),[value]);
 assert.equal(usesReportedNumbers(result,JSON.stringify(evidence)),false);
});
test('a mathematically correct but unreported percentage is still rejected',()=>{
 const result=valid();result.leaks[2].interpretation='Platform fees were 9.3% of revenue.';assert.equal(validateLeakOutput(result,evidence).ok,false);
});
for(const value of ['4%','4 percent','4 percentage points'])test(`reported staff count cannot license derived rate wording ${value}`,()=>{
 const result=valid();result.leaks[0].interpretation=`The difference is ${value}.`;
 // Existing frontend scalar-presence behavior is intentionally unchanged.
 assert.equal(usesReportedNumbers(result,JSON.stringify(evidence)),true);
 assert.equal(validateLeakOutput(result,evidence).reason,'unreported_numeric_unit');
});
test('C/F: mentioning sales in prose without its fact ID fails validation and downstream authorization, without recovery',()=>{
 const result=valid();result.leaks[0].evidence_refs=result.leaks[0].evidence_refs.filter(id=>id!==fact(12));const before=JSON.stringify(result);
 const reason=validateLeakOutput(result,evidence);assert.equal(reason.reason,'incomplete_citation_support');assert.ok(reason.missing_fact_ids.includes(fact(12)));assert.equal(authorized(result).length,0);assert.equal(JSON.stringify(result),before);
});
test('partial required citation set rejects even when the explanation omits the missing numeric claim',()=>{
 const result=valid();result.leaks[0].evidence_refs=result.leaks[0].evidence_refs.filter(id=>id!==fact(12));result.leaks[0].evidence=['Reported staffing cost is USD 2,500. Owner permits reducing staffing by 1 person.'];
 const reason=validateLeakOutput(result,evidence);assert.equal(reason.reason,'incomplete_citation_support');assert.deepEqual(Array.from(reason.missing_fact_ids),[fact(12)]);assert.equal(authorized(result).length,0);
});
test('D: paraphrased explanations with the same complete fact IDs are valid',()=>{
 const result=valid();result.leaks[0].evidence=['The month brought USD 1,900 on Tuesday evenings, with USD 2,500 of staffing costs.'];result.leaks[0].interpretation='Owner-approved testing is limited to Tuesday evening staffing; other shifts stay unchanged.';result.leaks[0].category='operations';result.leaks[0].title='A supported staffing finding';
 assert.equal(validateLeakOutput(result,evidence).ok,true);assert.equal(authorized(result)[0].value,-1);
});
test('uncited optional comparison facts are not licensed by other cited numeric facts',()=>{
 const result=valid();result.leaks[0].evidence_refs=result.leaks[0].evidence_refs.filter(id=>id!==fact(15));
 const reason=validateLeakOutput(result,evidence);assert.equal(reason.reason,'unreported_number');assert.ok(reason.numbers.includes('6200'));
});
test('numbers in model Evidence prose are not trusted citable numeric support',()=>{
 const e=structuredClone(evidence);e.facts.push('A model-written percentage of 33.4%.');
 const records=e.provenance.authorization_records;e.provenance=provenance.createEvidenceProvenance(e,e.provenance.source_input);e.provenance.authorization_records=records;
 const result=valid();result.leaks[0].interpretation='Labor was 33.4% of revenue.';
 assert.equal(isLeakResult(result,e),true);assert.equal(validateLeakOutput(result,e).reason,'unreported_number');
});
test('numbers in provenance IDs never license numeric prose',()=>{
 const result=valid();const sourceDigits=result.leaks[0].evidence_refs[0].match(/\d{3,}/)[0];result.leaks[0].interpretation=`Claim ${sourceDigits}`;
 assert.equal(validateLeakOutput(result,evidence).reason,'unreported_number');
});
test('input supplies exact complete fact groups but does not modify model output or attach refs',()=>{
 const input=buildLeakInput({evidence,operational_context:[]});assert.deepEqual(plain(input.citation_requirements),[{fact_ids:[fact(12),fact(14),fact(16)]}]);
 assert.doesNotMatch(JSON.stringify(input.citation_requirements),/src_|source_refs/);
 assert.deepEqual(plain(citationRequirements(evidence)[0].source_refs),evidence.provenance.authorization_records[0].supporting_facts.flatMap(f=>f.source_refs).concat(evidence.provenance.authorization_records[0].permission_source_refs));
});
test('combined citable views resolve complete support without requiring duplicate single-source refs',()=>{
 const fixture=JSON.parse(fs.readFileSync('tests/fixtures/scenarios-bagel.json','utf8'));const result=structuredClone(fixture.leaks),p=fixture.evidence.provenance;
 const combined=p.citable_facts.find(f=>f.source_refs.length>1&&f.source_refs.includes(p.items.find(s=>s.source==='source_input[0]').id));
 result.leaks[0].evidence_refs=result.leaks[0].evidence_refs.filter(id=>id!==p.citable_facts.find(f=>f.source_refs.length===1&&f.source_refs[0]===combined.source_refs[0]).id).concat(combined.id);
 assert.equal(validateLeakOutput(result,fixture.evidence).ok,true);
});
test('insufficient-evidence text may use only catalog-reported numbers, without creating a derived-metric system',()=>{
 const result=valid();result.insufficient_evidence[0].reason='Estimated revenue gap is $600.';assert.equal(validateLeakOutput(result,evidence).reason,'unreported_number');
});
for(const [name,result,status]of [['valid',valid(),200],['derived',(()=>{const r=valid();r.leaks[0].interpretation='Labor was 33.4% of revenue.';return r;})(),502],['incomplete',(()=>{const r=valid();r.leaks[0].evidence_refs=r.leaks[0].evidence_refs.filter(id=>id!==fact(12));r.leaks[0].evidence=['Owner permits reducing staffing by 1 person.'];return r;})(),502]])test(`production Leak route ${name}: bounded generation, no repairs`,async()=>{
 let calls=0;const before=JSON.stringify(result);const modules=productionModules(async(_url,options)=>{calls++;const payload=JSON.parse(options.body),input=JSON.parse(payload.messages[1].content);
  assert.deepEqual(input.citation_requirements,[{fact_ids:[fact(12),fact(14),fact(16)]}]);assert.equal(Object.keys(payload.response_format.json_schema.schema.properties.leaks.items.properties)[0],'evidence_refs');assert.match(payload.messages[0].content,/Select evidence_refs FIRST/);
  assert.equal(payload.model,calls===3?'nvidia/nemotron-3-super-120b-a12b':'nvidia/Nemotron-3-Ultra-550b-a55b');assert.equal(payload.max_tokens,calls===3?8000:4000);return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(result)}}]});
 });
 const response=await modules('src/app/api/analyze/leaks/route.ts').POST(new Request('http://localhost',{method:'POST',body:JSON.stringify({evidence,operational_context:[]})}));
 assert.equal(response.status,status);assert.equal(calls,name==='derived'?3:1);assert.equal(JSON.stringify(result),before);
 const body=await response.json();if(status===200)assert.deepEqual(body,{leaks:{...result,leaks:result.leaks.map((f,index)=>({...f,intervention_ref:index===0?'headcount_reduction':null}))}});else {assert.deepEqual(Object.keys(body),['error']);assert.match(body.error,/output validation/);assert.doesNotMatch(body.error,/33\.4|PRIVATE|src_/);}
});
