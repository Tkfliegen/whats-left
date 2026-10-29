import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {productionModules} from './helpers/provenance.mjs';
const load=productionModules();
const {resolveLeakInterventions:resolve}=load('src/app/api/analyze/leaks/binding.ts');
const {isModelLeakResult,createLeakSchema,modelLeakSchema,leakSystemPrompt,isLeakResult}=load('src/app/api/analyze/leaks/leaks.ts');
const {validateLeakOutput:validate}=load('src/app/api/analyze/leaks/output.ts');
const input=JSON.parse(fs.readFileSync('docs/evaluations/leak-ultra-hardened/cases.json'))[0].input;
const evidence=input.evidence,plain=x=>JSON.parse(JSON.stringify(x));
const fact=n=>evidence.provenance.citable_facts.find(f=>f.id.endsWith('_'+String(n).padStart(2,'0'))).id;
const identity=(category,ids)=>({category,evidence_refs:ids.map(fact)});
const semantic=()=>({leaks:[
 {...identity('labor',[12,13,14,15,16]),title:'Tuesday staffing mismatch',evidence:['Tuesday staffing was 4 people, with sales USD 1,900 and cost USD 2,500.'],interpretation:'The owner permits a reduction of 1 person while keeping other shifts unchanged.',confidence:'high'},
 {...identity('waste',[17,18,19]),title:'Waste above target',evidence:['Waste is 9%, above the internal target of 5%.'],interpretation:'A target is not permission.',confidence:'high'},
 {...identity('delivery',[20,21,22]),title:'Delivery unit economics',evidence:['Average delivery revenue is USD 18.40 per order. Some orders cost more than their revenue.'],interpretation:'Combined delivery costs exceed revenue for some orders.',confidence:'high'}
],insufficient_evidence:[]});
async function post(result,e=evidence,expectedCalls=1){let calls=0;const modules=productionModules(async(_url,options)=>{calls++;const p=JSON.parse(options.body);assert.equal(p.model,calls===3?'nvidia/nemotron-3-super-120b-a12b':'nvidia/Nemotron-3-Ultra-550b-a55b');assert.equal(p.max_tokens,calls===3?8000:4000);assert.equal(p.temperature,.2);assert.equal(Object.hasOwn(p.response_format.json_schema.schema.properties.leaks.items.properties,'intervention_ref'),false);return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(result)}}]});});const response=await modules('src/app/api/analyze/leaks/route.ts').POST(new Request('http://localhost',{method:'POST',body:JSON.stringify({evidence:e,operational_context:input.operational_context})}));assert.equal(calls,expectedCalls);return {status:response.status,body:await response.json()};}
test('A/B/C/D/F: complete source-backed Labor binds; Waste and Delivery cannot borrow global Labor identity',()=>{
 const r=semantic(),before=JSON.stringify(r);assert.equal(validate(r,evidence).ok,true);assert.deepEqual(plain(resolve(r.leaks,evidence)),['headcount_reduction',null,null]);assert.equal(JSON.stringify(r),before);
});
test('E/J: missing support does not bind and existing completeness rejects before numeric prose',()=>{
 const r=semantic();r.leaks[0].evidence_refs=[14,16].map(fact);assert.equal(resolve(r.leaks,evidence)[0],null);r.leaks[0].title='Unsupported 33.4%';assert.equal(validate(r,evidence).reason,'incomplete_citation_support');
});
test('G: multiple compatible records remain unbound; duplicate finding associations also remain unbound',()=>{
 const e=structuredClone(evidence);e.provenance.authorization_records.push(structuredClone(e.provenance.authorization_records[0]));assert.equal(resolve([identity('labor',[12,14,16])],e)[0],null);
 assert.deepEqual(plain(resolve([identity('labor',[12,14,16]),identity('labor',[12,14,16])],evidence)),[null,null]);
});
test('category alone, prose, model binding and partial/unknown lineage never establish identity',()=>{
 assert.equal(resolve([identity('labor',[13])],evidence)[0],null);
 const spoof={...identity('waste',[17,18]),intervention_ref:'headcount_reduction',interpretation:'Labor permission has been approved.'};assert.equal(resolve([spoof],evidence)[0],null);
 assert.equal(resolve([{category:'labor',evidence_refs:['fact_'+'0'.repeat(32)+'_99']}],evidence)[0],null);
 // Complete Labor refs still cannot bind a cross-category finding.
 assert.equal(resolve([identity('waste',[12,14,16])],evidence)[0],null);
});
test('invalid authorization/source data remains unbound; records are revalidated',()=>{
 const e=structuredClone(evidence);e.provenance.authorization_records[0].permission_source_refs=['src_'+'0'.repeat(32)+'_99'];assert.equal(resolve([identity('labor',[12,14,16])],e)[0],null);
});
test('combined citable lineage binds without duplicate refs; prose changes cannot change binding',()=>{
 const f=identity('labor',[12,16,24]);assert.equal(resolve([f],evidence)[0],'headcount_reduction');assert.equal(resolve([{...f,title:'Totally different words',interpretation:'Waste'}],evidence)[0],'headcount_reduction');
});
test('Waste binds only with its own existing eligible source-backed permission, not its target',()=>{
 const e=JSON.parse(fs.readFileSync('tests/fixtures/scenarios-bagel.json')).evidence;
 const {citationRequirements}=load('src/app/api/analyze/leaks/output.ts');const group=citationRequirements(e).find(g=>g.intervention==='waste_rate_target');
 assert.equal(resolve([{category:'waste',evidence_refs:Array.from(group.fact_ids)}],e)[0],'waste_rate_target');assert.equal(resolve([{category:'labor',evidence_refs:Array.from(group.fact_ids)}],e)[0],null);
});
test('model contract/prompt contain no intervention field or identity choice; provider and prompt share one schema',()=>{
 const s=createLeakSchema(evidence).properties.leaks.items;assert.equal(Object.hasOwn(s.properties,'intervention_ref'),false);assert.equal(s.required.includes('intervention_ref'),false);assert.equal(Object.hasOwn(modelLeakSchema.properties.leaks.items.properties,'intervention_ref'),false);
 const printed=JSON.parse(leakSystemPrompt.split('Match this JSON schema exactly:\n')[1]);assert.deepEqual(printed,plain(modelLeakSchema));assert.equal(leakSystemPrompt.includes('otherwise return null'),false);
 const r=semantic();assert.equal(isModelLeakResult(r,evidence),true);r.leaks[1].intervention_ref='headcount_reduction';assert.equal(isModelLeakResult(r,evidence),false);
});
test('route validates semantic findings then attaches trusted bindings without mutating provider output',async()=>{
 const r=semantic(),before=JSON.stringify(r);const result=await post(r);assert.equal(result.status,200);assert.deepEqual(result.body.leaks.leaks.map(l=>l.intervention_ref),['headcount_reduction',null,null]);assert.equal(isLeakResult(result.body.leaks,evidence),true);assert.equal(JSON.stringify(r),before);
});
test('H: malicious or stale model-selected bindings are rejected, never discarded to rescue an invalid response',async()=>{
 for(const binding of ['headcount_reduction',null]){const r=semantic();r.leaks[1].intervention_ref=binding;const result=await post(r);assert.equal(result.status,502);assert.deepEqual(result.body,{error:'Leak analysis provider returned invalid findings.'});}
});
test('I: valid finding survives without any eligible authorization and has explicit null binding',async()=>{
 const e=structuredClone(evidence);e.provenance.authorization_records=[];const r=semantic();const result=await post(r,e);assert.equal(result.status,200);assert.deepEqual(result.body.leaks.leaks.map(f=>f.intervention_ref),[null,null,null]);
});
test('J: numeric and unit guards still reject before any trusted response is returned',async()=>{
 for(const claim of ['A derived 4 percentage points.','An unsupported 33.4%.']){const r=semantic();r.leaks[1].interpretation=claim;const response=await post(r,evidence,3);assert.equal(response.status,502);assert.match(response.body.error,/unreported_number/);assert.equal(Object.hasOwn(response.body,'leaks'),false);}
 const r=semantic();r.leaks[0].interpretation='A new 1% rate.';assert.equal(validate(r,evidence).reason,'unreported_numeric_unit');
});
