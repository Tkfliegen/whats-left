import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {productionModules} from './helpers/provenance.mjs';
const load=productionModules();
const {validateLeakOutput:validate,validateLeakReferences:references,citationRequirements}=load('src/app/api/analyze/leaks/output.ts');
const {isLeakResult,createLeakSchema,buildLeakInput}=load('src/app/api/analyze/leaks/leaks.ts');
const {buildScenarioInput}=load('src/app/api/analyze/scenarios/scenarios.ts');
const evidence=JSON.parse(fs.readFileSync('tests/fixtures/leak-case-a-failed.json')).evidence;
const plain=x=>JSON.parse(JSON.stringify(x));
const fact=n=>evidence.provenance.citable_facts.find(f=>f.id.endsWith('_'+String(n).padStart(2,'0'))).id;
const valid=()=>({leaks:[{title:'Tuesday staffing mismatch',category:'labor',intervention_ref:'headcount_reduction',evidence_refs:[12,14,16].map(fact),evidence:['Tuesday evenings from 6 PM to 10 PM generated USD 1,900; staffing cost was USD 2,500.'],interpretation:'The owner permits reducing staffing by 1 person while keeping the rest of the schedule unchanged.',confidence:'high'}],insufficient_evidence:[]});
test('A: complete bound group passes references; existing numeric checks then run',()=>{
 const result=valid();assert.equal(isLeakResult(result,evidence),true);assert.equal(references(result,evidence).ok,true);assert.equal(validate(result,evidence).ok,true);
 result.leaks[0].interpretation='Unsupported 33.4%';assert.equal(references(result,evidence).ok,true);const failure=validate(result,evidence);assert.equal(failure.reason,'unreported_number');assert.equal(failure.field,'leaks[0].interpretation');assert.deepEqual(Array.from(failure.numbers),['33.4']);
});
test('B: omitted sales fact rejects before the unsupported time-of-day token in prose',()=>{
 const result=valid();result.leaks[0].evidence_refs=[14,16].map(fact);const before=JSON.stringify(result);const failure=validate(result,evidence);
 assert.equal(failure.reason,'incomplete_citation_support');assert.equal(failure.field,'leaks[0].evidence_refs');assert.deepEqual(Array.from(failure.missing_fact_ids),[fact(12)]);assert.equal(JSON.stringify(result),before);
});
test('C: explicit binding detects whole-group omission without intersection or prose recovery',()=>{
 const result=valid();result.leaks[0].evidence_refs=[fact(13)];const failure=validate(result,evidence);
 assert.equal(failure.reason,'incomplete_citation_support');assert.deepEqual(Array.from(failure.missing_fact_ids),[12,14,16].map(fact));
});
test('D: unknown or empty refs reject before prose',()=>{
 for(const ids of [[],['fact_'+'0'.repeat(32)+'_99']]){const result=valid();result.leaks[0].evidence_refs=ids;result.leaks[0].title='Unsupported 33.4';assert.equal(isLeakResult(result,evidence),false);assert.equal(validate(result,evidence).reason,'invalid_evidence_refs');}
});
test('E: unbound finding has no invented authorization requirement, but ordinary numeric checks remain',()=>{
 const result=valid();Object.assign(result.leaks[0],{intervention_ref:null,evidence_refs:[fact(13)],title:'Staffing observation',evidence:['Reported staffing was 4 people.'],interpretation:'No intervention binding.'});
 assert.equal(validate(result,evidence).ok,true);result.leaks[0].evidence=['Reported staffing was 33.4 people.'];assert.equal(validate(result,evidence).reason,'unreported_number');
});
test('F: Case A waste target creates neither binding candidate nor grant',()=>{
 const result=valid();Object.assign(result.leaks[0],{intervention_ref:null,category:'waste',evidence_refs:[17,18].map(fact),title:'Waste above target',evidence:['Waste is 9%, above the internal target of 5%.'],interpretation:'A target does not authorize a test.'});
 assert.equal(validate(result,evidence).ok,true);assert.equal(citationRequirements(evidence).some(g=>g.intervention==='waste_rate_target'),false);
 assert.equal(buildScenarioInput({evidence,leaks:result,operational_context:[]}).authorized_changes.length,0);
 result.leaks[0].intervention_ref='waste_rate_target';assert.equal(validate(result,evidence).reason,'invalid_intervention_ref');
});
test('G: explicit Waste candidate requires full group even if bound finding omits every member',()=>{
 const fixture=JSON.parse(fs.readFileSync('tests/fixtures/scenarios-bagel.json'));const e=fixture.evidence;const group=citationRequirements(e).find(g=>g.intervention==='waste_rate_target');assert.ok(group);
 const result=valid();Object.assign(result.leaks[0],{intervention_ref:'waste_rate_target',category:'waste',evidence_refs:Array.from(group.fact_ids),title:'Waste above target',evidence:['Waste is 9%, above the target of 5%.'],interpretation:'Explicit permission is source-backed.'});assert.equal(validate(result,e).ok,true);
 result.leaks[0].evidence_refs=[e.provenance.citable_facts.find(f=>!f.source_refs.some(id=>group.source_refs.includes(id))).id];assert.equal(validate(result,e).reason,'incomplete_citation_support');
 result.leaks[0].evidence_refs=Array.from(group.fact_ids).slice(1);assert.equal(validate(result,e).reason,'incomplete_citation_support');
});
test('H/I: complete support preserves numeric/unit rejection and allows paraphrase without changing identity',()=>{
 const result=valid();result.leaks[0].title='An alternate supported finding';result.leaks[0].evidence=['For the affected month, staffing cost USD 2,500 against sales USD 1,900.'];result.leaks[0].interpretation='Other shifts remain unchanged during the permitted staffing test.';assert.equal(validate(result,evidence).ok,true);
 result.leaks[0].interpretation='A new derived rate is 33.4%.';assert.equal(validate(result,evidence).reason,'unreported_number');
 result.leaks[0].interpretation='A new derived rate is 1%.';assert.equal(validate(result,evidence).reason,'unreported_numeric_unit');
});
test('all findings pass references before any finding prose is inspected',()=>{
 const result=valid();result.leaks.push(plain(result.leaks[0]));result.leaks[0].title='Unsupported 33.4%';result.leaks[1].evidence_refs=[fact(13)];
 const failure=validate(result,evidence);assert.equal(failure.reason,'incomplete_citation_support');assert.equal(failure.field,'leaks[1].evidence_refs');
});
test('model schema has no binding field; citation groups retain complete support without identity selection',()=>{
 const schema=createLeakSchema(evidence).properties.leaks.items;assert.equal(schema.required.includes('intervention_ref'),false);assert.equal(schema.properties.intervention_ref,undefined);
 assert.deepEqual(plain(buildLeakInput({evidence,operational_context:[]}).citation_requirements),[{fact_ids:[12,14,16].map(fact)}]);
 const result=valid();result.leaks[0].intervention_ref='unknown';assert.equal(isLeakResult(result,evidence),false);assert.equal(validate(result,evidence).reason,'invalid_intervention_ref');
});
test('combined fact lineage satisfies binding without requiring duplicate single-source refs',()=>{
 const result=valid();result.leaks[0].evidence_refs=[12,16,24].map(fact);assert.equal(validate(result,evidence).ok,true);
});
test('duplicate structured intervention candidates cannot create an ambiguous binding',()=>{
 const e=plain(evidence);e.provenance.authorization_records.push(plain(e.provenance.authorization_records[0]));assert.equal(validate(valid(),e).reason,'invalid_intervention_ref');
});
test('real route rejects a stale model binding with one mocked provider call, without repair',async()=>{
 const result=valid();result.leaks[0].evidence_refs=[fact(13)];const before=JSON.stringify(result);let calls=0;
 const modules=productionModules(async(_url,options)=>{calls++;const body=JSON.parse(options.body);assert.equal(body.response_format.json_schema.schema.properties.leaks.items.properties.intervention_ref,undefined);return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(result)}}]});});
 const response=await modules('src/app/api/analyze/leaks/route.ts').POST(new Request('http://localhost',{method:'POST',body:JSON.stringify({evidence,operational_context:[]})}));assert.equal(response.status,502);assert.deepEqual(await response.json(),{error:'Leak analysis provider returned invalid findings.'});assert.equal(calls,1);assert.equal(JSON.stringify(result),before);
});
