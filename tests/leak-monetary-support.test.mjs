import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {productionModules,provenance} from './helpers/provenance.mjs';
const load=productionModules(),{validateLeakOutput}=load('src/app/api/analyze/leaks/output.ts');
const plain=v=>JSON.parse(JSON.stringify(v));
function fixture(source,claim,global=false){
 const e={business_type:'shop',period:'month',currency:'USD',revenue:{total:null,items:[]},costs:{total:null,items:[]},facts:[],assumptions:[],missing_information:[],confidence:'high'};
 e.provenance={...provenance.createEvidenceProvenance(e,source),authorization_records:[]};
 const result=global?{leaks:[],insufficient_evidence:[{topic:'Reported issue',reason:claim}]}:{leaks:[{title:'Reported issue',category:'delivery',evidence_refs:e.provenance.citable_facts.map(f=>f.id),evidence:['Reported issue.'],interpretation:claim,confidence:'high',intervention_ref:null}],insufficient_evidence:[]};
 return {e,result};
}
for(const global of [false,true])for(const [name,source,claim,ok,reason='unreported_numeric_unit'] of [
 ['lowercase code','Cost usd 4.','Reported cost USD 4.',true],
 ['mixed money/percent cannot borrow rate','Waste 4%.','Reported cost USD 4%.',false],
 ['malformed source monetary rate','Reported USD 4%.','Reported cost USD 4.',false],
 ['literal money','Cost USD 4.','Reported cost USD 4.',true],
 ['percent is not money','Waste 4%.','Reported cost USD 4.',false],
 ['count is not money','There are 4 workers.','Reported cost USD 4.',false],
 ['ID is not money','Room 4.','Reported cost USD 4.',false],
 ['bare digit is not money','Reported value 4.','Reported cost USD 4.',false],
 ['money is not percent','Cost USD 4.','Reported rate 4%.',false],
 ['wrong currency','Cost EUR 4.','Reported cost USD 4.',false],
 ['suffix currency','Cost 4 USD.','Reported cost USD 4.',true],
 ['prefix currency','Cost USD 4.','Reported cost 4 USD.',true],
 ['prose parentheses','Cost USD 4.','Known amount (USD 4).',true],
 ['suffix prose parentheses','Cost 4 USD.','Known amount (4 USD).',true],
 ['matching literal symbol','Cost $4.','Reported cost $4.',true],
 ['explicit existing alias','Cost US$4.','Reported cost USD 4.',true],
 ['explicit source currency field','Currency: USD.\nCost $4.','Reported cost USD 4.',true],
 ['no inference from extracted currency','Cost $4.','Reported cost USD 4.',false],
 ['no inference from unrelated amount','Revenue USD 26. Cost $4.','Reported cost USD 4.',false],
 ['existing Euro alias','Cost €4.','Reported cost EUR 4.',true],
 ['negative mismatch','Cost USD -4.','Reported cost USD 4.',false],
 ['negative claim mismatch','Cost USD 4.','Reported cost USD -4.',false],
 ['matching negative','Cost USD -4.','Reported cost USD -4.',true],
 ['negative prefix notation','Cost -USD 4.','Reported cost USD -4.',true],
 ['spaced negative prefix','Cost - USD 4.','Reported cost USD 4.',false],
 ['spaced negative suffix','Cost - 4 USD.','Reported cost USD 4.',false],
 ['positive explicit sign','Cost USD +4.','Reported cost USD 4.',true],
 ['accounting negative','Cost USD (4).','Reported cost USD -4.',true],
 ['accounting mismatch','Cost USD (4).','Reported cost USD 4.',false],
 ['normalization','Cost USD 1,000.00.','Reported cost 1000 USD.',true],
 ['literal rates unchanged','Waste 4%.','Reported waste 4%.',true],
 ['derived 600','Revenue USD 1900. Cost USD 2500.','Reported gap USD 600.',false,'unreported_number'],
 ['amount/currency separated','Currency USD.\nReported number 4.','Reported cost USD 4.',false],
 ['cross-fact whitespace','USD\n4','Reported cost USD 4.',false],
])test(`${global?'global':'selected'}: ${name}`,()=>{
 const {e,result}=fixture(source,claim,global),before=JSON.stringify({e,result});
 const validation=validateLeakOutput(result,e);
 assert.equal(validation.ok,ok);
 if(!ok){assert.equal(validation.reason,reason);assert.equal(validation.field,global?'insufficient_evidence[0].reason':'leaks[0].interpretation');}
 assert.equal(JSON.stringify({e,result}),before);
});
test('global monetary support cannot replace a selected citation',()=>{
 const {e,result}=fixture('Staffing 4 people.\nCost USD 4.','Reported cost USD 4.');
 result.leaks[0].evidence_refs=[e.provenance.citable_facts[0].id];
 assert.deepEqual(plain(validateLeakOutput(result,e)),{ok:false,reason:'unreported_numeric_unit',field:'leaks[0].interpretation',numbers:['4']});
});
test('saved Case 10 rejects the monetary margin while preserving its output',()=>{
 const raw=JSON.parse(fs.readFileSync('docs/evaluations/judge-style-final-10/live-2026-10-26/runs/F10.json'));
 const e=raw.calls[0].response.evidence,result=raw.calls[1].response.leaks,before=JSON.stringify({e,result});
 assert.deepEqual(plain(validateLeakOutput(result,e)),{ok:false,reason:'unreported_numeric_unit',field:'insufficient_evidence[3].reason',numbers:['4']});
 assert.equal(JSON.stringify({e,result}),before);
});
test('headcount omitted from selected support keeps its exact scalar diagnostic',()=>{
 const {e,result}=fixture('Sales USD 1900; cost USD 2500.\nBaseline 4 staff.','There were 4 staff.');
 result.leaks[0].evidence_refs=[e.provenance.citable_facts[0].id];const diagnostics=[];
 const v=validateLeakOutput(result,e,undefined,d=>diagnostics.push(d));
 assert.equal(v.reason,'unreported_number');assert.deepEqual(Array.from(v.numbers),['4']);
 assert.equal(diagnostics[0].rejection_branch,'scalar_not_in_selected_support');
 assert.equal(diagnostics[0].number_in_global_support,true);assert.equal(diagnostics[0].number_in_selected_support,false);
});
