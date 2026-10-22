import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {productionModules,provenance,rawEvidence} from './helpers/provenance.mjs';
const load=productionModules();
const {groundBusinessTotals,createBusinessTotalSupportSchema}=load('src/app/api/analyze/evidence/business-totals.ts');
const {matchesSchema,createEvidenceOutputSchema}=load('src/app/api/analyze/evidence/evidence.ts');
const plain=x=>JSON.parse(JSON.stringify(x));
const base=()=>({business_type:'shop',period:'month',currency:'USD',revenue:{total:10000,items:[{name:'Tuesday',amount:2100,source_text:'Tuesday sales were USD 2,100.'}]},costs:{total:8500,items:[{name:'Labor',amount:3300,reported_category:'staffing',source_text:'Staffing was USD 3,300.'}]},facts:[],assumptions:[],missing_information:[],confidence:'high'});
const source=(text,id='src_test_01')=>({id,source:'source_input[0]',text});
const record=(field,value,source_refs=['src_test_01'])=>({field,value,scope:'whole_business',period:'month',currency:'USD',source_refs});
const ground=(records,sources,e=base())=>groundBusinessTotals(e,records,sources);
test('explicit whole-business revenue and costs retain supported totals alongside granular items',()=>{
 const e=base(),sources=[source('Total revenue for the month was USD 10,000.'),source('Total operating costs for the month were USD 8,500.','src_test_02')];
 const result=ground([record('revenue.total',10000),record('costs.total',8500,['src_test_02'])],sources,e);
 assert.equal(result.evidence.revenue.total,10000);assert.equal(result.evidence.costs.total,8500);
 assert.equal(result.evidence.revenue.items,e.revenue.items);assert.equal(result.evidence.costs.items,e.costs.items);
});
test('J02 components, staffing subtotal and component sums without business-total support become null',()=>{
 const e=base();e.costs.total=3300;const before=JSON.stringify(e);
 const result=ground([], [source('Tuesday sales were USD 2,100. Friday sales were USD 7,900. Tuesday staffing cost was USD 3,300.')],e);
 assert.equal(result.evidence.revenue.total,null);assert.equal(result.evidence.costs.total,null);
 assert.equal(JSON.stringify(e),before);assert.equal(result.evidence.facts,e.facts);
});
test('a computed total support value without a literal anchor does not validate',()=>{
 const result=ground([record('revenue.total',10000)], [source('Tuesday sales were USD 2,100. Friday sales were USD 7,900.')]);
 assert.equal(result.evidence.revenue.total,null);assert.ok(result.diagnostic.fields[0].reasons.includes('numeric_anchor_source_missing'));
});
for(const [name,mutate,reason] of [
 ['wrong field',r=>r.field='staffing_cost','missing_support'],
 ['wrong scope',r=>r.scope='tuesday_evening','invalid_support_record'],
 ['unknown refs',r=>r.source_refs=['unknown'],'invalid_source_refs'],
 ['no refs',r=>r.source_refs=[],'invalid_source_refs'],
 ['duplicate refs',r=>r.source_refs=['src_test_01','src_test_01'],'invalid_source_refs'],
 ['currency',r=>r.currency='EUR','currency_mismatch'],
 ['period',r=>r.period='year','period_mismatch'],
 ['value',r=>r.value=10001,'total_value_mismatch'],
])test(`invalid total support (${name}) nulls the total`,()=>{
 const r=record('revenue.total',10000);mutate(r);const result=ground([r],[source('Total revenue for the month was USD 10,000.')]);
 assert.equal(result.evidence.revenue.total,null);assert.ok(result.diagnostic.fields[0].reasons.includes(reason));
});
test('revenue support cannot validate costs even if digits match',()=>{
 const e=base();e.costs.total=10000;const result=ground([record('revenue.total',10000)],[source('Total revenue for the month was USD 10,000.')],e);
 assert.equal(result.evidence.revenue.total,10000);assert.equal(result.evidence.costs.total,null);
});
test('duplicate support, non-array support and unknown reporting currency/period fail closed locally',()=>{
 const r=record('revenue.total',10000),sources=[source('Total revenue for the month was USD 10,000.')];
 for(const records of [[r,r],null,{},undefined])assert.equal(ground(records,sources).evidence.revenue.total,null);
 for(const key of ['period','currency']){const e=base();e[key]=null;assert.equal(ground([r],sources,e).evidence.revenue.total,null);}
});
test('only original source IDs qualify, not descriptive Evidence items',()=>{
 assert.equal(ground([record('revenue.total',10000)],[{...source('10000'),source:'evidence.revenue.total'}]).evidence.revenue.total,null);
});
test('provider schema adds only extraction support and leaves downstream Evidence shape intact',()=>{
 const schema=createEvidenceOutputSchema(['src_test_01']);assert.ok(schema.required.includes('business_total_support'));
 assert.equal(matchesSchema([record('revenue.total',10000)],createBusinessTotalSupportSchema(['src_test_01'])),true);
 assert.equal(matchesSchema([record('revenue.total',10000,['unknown'])],createBusinessTotalSupportSchema(['src_test_01'])),false);
 assert.equal(matchesSchema(base()),true);
});
test('real route preserves authorization, original source IDs, granular items and J05 currency behavior',async()=>{
 const saved=JSON.parse(fs.readFileSync('docs/evaluations/scenario-abstention-ownership/full/runs/J01.json'));
 const e=saved.calls[0].response.evidence;
 const {atomsFromRecords}=await import('./helpers/authorization-atoms.mjs');
 const input=saved.calls[0].body.input;let calls=0;
 const modules=productionModules(async()=>{calls++;return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({...rawEvidence(e),authorization_atoms:atomsFromRecords(e.provenance.authorization_records),business_total_support:[]})}}]});});
 const response=await modules('src/app/api/analyze/evidence/route.ts').POST(new Request('http://localhost',{method:'POST',body:JSON.stringify({input})}));
 assert.equal(response.status,200);assert.equal(calls,1);const out=(await response.json()).evidence;
 assert.equal(out.revenue.total,null);assert.equal(out.costs.total,null);assert.deepEqual(out.revenue.items,e.revenue.items);assert.deepEqual(out.costs.items,e.costs.items);
 assert.deepEqual(out.provenance.authorization_records,e.provenance.authorization_records);assert.deepEqual(out.provenance.citable_facts,e.provenance.citable_facts);
 assert.equal('business_total_support' in out,false);
 assert.deepEqual(plain(load('src/app/api/analyze/evidence/currency.ts').normalizeEvidenceCurrency('USD','Currency: USD. The reporting period is the month just ended.')),{ok:true,currency:'USD'});
});
test('route keeps explicit supported totals and strips extraction metadata',async()=>{
 const input='Total revenue for the month was USD 10,000.\nTotal operating costs for the month were USD 8,500.';
 const e=base(),sources=provenance.createEvidenceProvenance(e,input).items.filter(s=>s.source.startsWith('source_input['));
 const support=[record('revenue.total',10000,[sources[0].id]),record('costs.total',8500,[sources[1].id])];
 const modules=productionModules(async()=>Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({...e,authorization_atoms:[],business_total_support:support})}}]}));
 const response=await modules('src/app/api/analyze/evidence/route.ts').POST(new Request('http://localhost',{method:'POST',body:JSON.stringify({input})}));
 assert.equal(response.status,200);const actual=(await response.json()).evidence;
 assert.equal(actual.revenue.total,10000);assert.equal(actual.costs.total,8500);assert.equal('business_total_support' in actual,false);
});
test('malformed extraction-only support nulls totals without rejecting granular Evidence',async()=>{
 const e=base();const modules=productionModules(async()=>Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({...e,authorization_atoms:[],business_total_support:[{field:'costs.total',scope:'staffing',value:8500}]})}}]}));
 const response=await modules('src/app/api/analyze/evidence/route.ts').POST(new Request('http://localhost',{method:'POST',body:JSON.stringify({input:'Staffing costs were USD 8,500.'})}));
 assert.equal(response.status,200);const actual=(await response.json()).evidence;assert.equal(actual.costs.total,null);assert.deepEqual(actual.costs.items,e.costs.items);
});
