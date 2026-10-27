import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {productionModules} from './helpers/provenance.mjs';
const load=productionModules();
const {filterMissingInformation}=load('src/app/api/analyze/evidence/missing-information.ts');
const sources=(...text)=>text.map((text,i)=>({id:`src_${i}`,source:`source_input[${i}]`,text}));
const filter=(entries,...text)=>JSON.parse(JSON.stringify(filterMissingInformation(entries,sources(...text))));
const root='docs/evaluations/judge-style-final-10/live-2026-10-26/';
for(const [name,entry,source,accepted] of [
 ['supported percentages','Permission to test from 9% toward 5%','Waste is 9%; target is 5%.',true],
 ['one unsupported rate','Permission to test from 9% toward 5%','Waste is 9%.',false],
 ['count cannot support rate','Need target 9%','There are 9 staff members.',false],
 ['identifier cannot support rate','Need target 9%','Room 9.',false],
 ['money cannot support rate','Need target 9%','Cost USD 9.',false],
 ['bare digit cannot support rate','Need target 9%','The number is 9.',false],
 ['percent cannot support points','Need reduction 9 percentage points','Waste is 9%.',false],
 ['points cannot support percent','Need reduction 9%','Reduction is 9 percentage points.',false],
 ['literal points','Need reduction 9 percentage points','Reduction is 9 percentage points.',true],
 ['unsupported money','Need cost USD 625','Cost USD 2500.',false],
 ['different currency','Need cost EUR 625','Cost USD 625.',false],
 ['same currency and amount','Need cost USD 625','Cost USD 625.',true],
 ['literal grouped money','Need cost USD 12,500','Cost USD 12,500.',true],
 ['literal symbol money','Need cost $625','Cost $625.',true],
 ['no invented alias conversion','Need cost USD 625','Cost $625.',false],
 ['literal per-worker money','Need cost USD 625 per worker','Cost USD 625 per worker.',true],
 ['different per-unit money','Need cost USD 625 per order','Cost USD 625 per worker.',false],
 ['suffix money','Need cost 625 USD','Cost 625 USD.',true],
 ['staff unit is part of support','Need baseline 4 staff members','Baseline 4 staff members.',true],
 ['different count unit','Need baseline 4 orders','Baseline 4 staff members.',false],
 ['derived difference','Need difference USD 600','Sales USD 1900; staffing USD 2500.',false],
 ['partial numeric token','Need cost USD 625','Cost USD 1625.',false],
 ['partial decimal','Need count 4','Count 4.5.',false],
 ['malformed grouping','Need cost USD 6,25','Cost USD 6,25.',false],
 ['malformed decimal','Need rate 9..5%','Rate 9..5%.',false],
 ['duplicate percent','Need rate 9%%','Rate 9%%.',false],
 ['scientific notation','Need cost USD 6e2','Cost USD 6e2.',false],
 ['double currency','Need cost USD 625 EUR','Cost USD 625 EUR.',false],
 ['unknown currency','Need cost JPY 625','Cost JPY 625.',false],
 ['unknown unit','Need quantity 9 widgets','Quantity 9 widgets.',false],
 ['signed value cannot lose sign','Need amount USD 625','Amount USD -625.',false],
 ['fraction cannot pool scalar tokens','Need value 1/2','Value 1 and 2.',false],
 ['time cannot pool scalar tokens','Need time 6:10','Values 6 and 10.',false],
 ['malformed percent points','Need reduction 9% points','Waste 9%.',false],
 ['spaced duplicate percent','Need rate 9% %','Waste 9%.',false],
 ['word-form money fails closed','Need USD six','Cost USD six.',false],
 ['list punctuation','Need cost USD 625, then confirmation','Cost USD 625, including fees.',true],
 ['sentence punctuation','Need rate 9%.','Rate 9%.',true],
])test(name,()=>assert.deepEqual(filter([entry],source),accepted?[entry]:[]));
test('saved Case 8 rates are dropped using only original sources',()=>{
 const raw=JSON.parse(fs.readFileSync(root+'runs/F08.json'));
 const e=raw.calls[0].response.evidence;
 const actual=filterMissingInformation(e.missing_information,e.provenance.items);
 assert.equal(actual.includes(e.missing_information[5]),false);
 assert.deepEqual(JSON.parse(JSON.stringify(actual)),e.missing_information.slice(0,5));
});
test('source statements cannot pool monetary amounts and currency declarations',()=>{
 assert.deepEqual(filter(['Need USD 625'],'Currency: USD.','Room 625.'),[]);
 assert.deepEqual(filter(['Need USD 625'],'USD','625'),[]);
});
test('model prose, prompt examples and numeric entries cannot support each other',()=>{
 const model={id:'ev',source:'evidence.facts[0]',text:'Waste 9%; target 5%.'};
 assert.deepEqual(JSON.parse(JSON.stringify(filterMissingInformation(['Need 9%'],[model]))),[]);
 assert.deepEqual(filter(['Need 9%','Target 9%'],'No waste rate was reported.'),[]);
});
test('safe entries retain exact bytes and order; objects are never mutated',()=>{
 const entries=['  Need purchase details.  ','Need 9%','Need cost USD 625','Need 5%','No approved trial is supplied.'];
 const s=sources('Waste 9%.','Cost USD 625.'),before=JSON.stringify({entries,s});
 assert.deepEqual(JSON.parse(JSON.stringify(filterMissingInformation(entries,s))),[entries[0],entries[1],entries[2],entries[4]]);
 assert.equal(JSON.stringify({entries,s}),before);
});

function extractionFor(raw,missing){
 const e=structuredClone(raw.calls[0].response.evidence),p=e.provenance;delete e.provenance;
 const atoms=(p.authorization_records??[]).flatMap(r=>[
  ...r.supporting_facts.map(f=>({kind:f.role==='sales'?'scoped_sales':'scoped_staffing_cost',scope:r.scope,period:f.period,amount:f.value,currency:f.currency,source_refs:f.source_refs})),
  {kind:'headcount_reduction_permission',scope:r.scope,operation:'delta',value:-1,unit:'persons',permission:'explicit',source_refs:r.permission_source_refs},
  {kind:'schedule_constraint',scope:r.scope,intervention:'headcount_reduction',constraint:'rest_schedule_unchanged',source_refs:r.constraint_source_refs},
 ]);
 const totalSource=p.items.find(s=>s.source.startsWith('source_input[')&&s.text.includes('100,000')&&s.text.includes('95,800'));
 return {...e,missing_information:missing,authorization_atoms:atoms,
  business_total_support:totalSource?['revenue','costs'].map(key=>({field:`${key}.total`,value:e[key].total,scope:'whole_business',period:e.period,currency:e.currency,source_refs:[totalSource.id]})):[],
  calculation_support:(p.calculation_facts??[]).map(({concept,scope,period,support})=>({concept,scope,period,support})),
 };
}
async function extract(raw,missing){
 const output=extractionFor(raw,missing),before=JSON.stringify(output);let calls=0;
 const modules=productionModules(async()=>{calls++;return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(output)}}]});});
 const response=await modules('src/app/api/analyze/evidence/route.ts').POST(new Request('http://local',{method:'POST',body:JSON.stringify(raw.calls[0].body)}));
 assert.equal(response.status,200);assert.equal(calls,1);assert.equal(JSON.stringify(output),before);
 return (await response.json()).evidence;
}
test('real Evidence route removes unsafe Case 8 text before returned provenance and downstream handoff',async()=>{
 const raw=JSON.parse(fs.readFileSync(root+'runs/F08.json'));
 const original=raw.calls[0].response.evidence;
 const e=await extract(raw,original.missing_information);
 assert.deepEqual(e.missing_information,original.missing_information.slice(0,5));
 assert.equal(load('src/app/api/analyze/evidence/provenance.ts').isEvidence(e,true),true);
 assert.deepEqual(e.provenance,original.provenance);
 const downstream={evidence:e,leaks:raw.calls[1].response.leaks,operational_context:[]};
 assert.doesNotMatch(JSON.stringify(downstream),/9% toward 5%/);
 const input=load('src/app/api/analyze/scenarios/scenarios.ts').buildScenarioInput(downstream);
 assert.doesNotMatch(JSON.stringify(input),/9% toward 5%/);
});
test('frozen Case 1 retains identical trusted Labor facts, totals, authorization and provenance',async()=>{
 const raw=JSON.parse(fs.readFileSync(root+'runs/F01.json'));
 assert.equal(raw.calls[0].body.input,fs.readFileSync('docs/evaluations/judge-style-final-10/F01-frozen-input.txt','utf8'));
 const original=raw.calls[0].response.evidence;
 const e=await extract(raw,['Need operating details.','Need target 9%','Confirm cost USD 625']);
 assert.deepEqual(e.missing_information,['Need operating details.','Confirm cost USD 625']);
 const {missing_information:_missing,...rest}=e;void _missing;
 const {missing_information:_original,...expected}=original;void _original;
 assert.deepEqual(rest,expected);
 const modules=productionModules(),provenance=modules('src/app/api/analyze/evidence/provenance.ts');
 assert.equal(provenance.isEvidence(e,true),true);
 assert.equal(modules('src/app/api/analyze/evidence/calculation-facts.ts').validateCalculationFacts(e.provenance.calculation_facts,e.provenance.items,e),true);
});
