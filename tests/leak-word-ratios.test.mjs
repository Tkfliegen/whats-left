import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {productionModules,provenance} from './helpers/provenance.mjs';
const load=productionModules(),{validateLeakOutput}=load('src/app/api/analyze/leaks/output.ts');
const plain=x=>JSON.parse(JSON.stringify(x));
function fixture(source,claim){
 const e={business_type:'shop',period:'month',currency:'USD',revenue:{total:null,items:[]},costs:{total:null,items:[]},facts:[],assumptions:[],missing_information:[],confidence:'high'};
 e.provenance={...provenance.createEvidenceProvenance(e,source),authorization_records:[]};
 return {e,result:{leaks:[{title:'Reported staffing issue',category:'labor',evidence_refs:e.provenance.citable_facts.map(f=>f.id),evidence:['Reported staffing issue.'],interpretation:claim,confidence:'high',intervention_ref:null}],insufficient_evidence:[]}};
}
for(const [claim,value] of [
 ['over four times the revenue','4'],['twice the revenue','2'],['two times the revenue','2'],
 ['three times higher','3'],['four times the sales','4'],['double the cost','2'],['triple the amount','3'],
 ['threefold increase','3'],['three-fold increase','3'],['three fold increase','3'],['half the revenue','0.5'],
 ['half of the revenue','0.5'],['four times the revenue','4'],
])test(`unsupported word ratio rejects: ${claim}`,()=>{
 const {e,result}=fixture('Revenue was USD 1,000. Costs were USD 4,500. There were 4 staff.',claim);const before=JSON.stringify(result);
 assert.deepEqual(plain(validateLeakOutput(result,e)),{ok:false,reason:'unreported_number',field:'leaks[0].interpretation',numbers:[value]});assert.equal(JSON.stringify(result),before);
});
for(const word of ['one','two','three','four','five','six','seven','eight','nine','ten'])test(`minimal word vocabulary detects ${word} times and ${word}fold`,()=>{
 for(const claim of [`${word} times the revenue`,`${word}fold increase`]){
  const {e,result}=fixture('Reported revenue and costs.',claim);assert.equal(validateLeakOutput(result,e).reason,'unreported_number');
 }
});
for(const claim of ['Please double-check the source.','A double espresso is sold.','There was a half-day closure.','The ledger was checked twice last month.','The team reviewed the other half.','The team checked staffing four times last month.'])test(`non-ratio prose stays accepted: ${claim}`,()=>{
 const {e,result}=fixture('Reported staffing issue.',claim);assert.equal(validateLeakOutput(result,e).ok,true);
});
for(const [source,claim] of [
 ['Friday generated over four times the revenue.','Friday generated over four times the revenue.'],
 ['Revenue was twice the amount.','Revenue was double the amount.'],
 ['Cost was 2 times the revenue.','Cost was twice the revenue.'],
 ['There was a 3-fold increase.','There was a threefold increase.'],
 ['Reported half of the revenue.','Reported half the revenue.'],
 ['Reported double the cost.','Reported double the cost.'],
])test(`explicit cited ratio supports normalized claim: ${claim}`,()=>{
 const {e,result}=fixture(source,claim);assert.equal(validateLeakOutput(result,e).ok,true);
});
test('same component values or a ratio elsewhere in Evidence do not license an uncited ratio',()=>{
 const {e,result}=fixture('There were 4 staff.\nRevenue was explicitly over four times the cost.','Over four times the cost.');
 result.leaks[0].evidence_refs=[e.provenance.citable_facts[0].id];assert.equal(validateLeakOutput(result,e).reason,'unreported_number');
});
test('ratio qualifiers and measures are not interchangeable',()=>{
 for(const claim of ['Four times the revenue.','Over four times the cost.','Under four times the revenue.']){
  const {e,result}=fixture('Over four times the revenue.',claim);assert.equal(validateLeakOutput(result,e).reason,'unreported_number');
 }
});
test('all existing numeric-grounded text surfaces enforce word ratios',()=>{
 for(const field of ['title','evidence','interpretation','topic','reason']){
  const {e,result}=fixture('Reported revenue.','Reported issue.');
  if(field==='evidence')result.leaks[0].evidence=['Double the cost.'];
  else if(field==='topic'||field==='reason')result.insufficient_evidence=[{topic:'Reported topic',reason:'Missing input', [field]:'Double the cost.'}];
  else result.leaks[0][field]='Double the cost.';
  assert.equal(validateLeakOutput(result,e).reason,'unreported_number',field);
 }
});
test('existing digit grounding and reference-first ordering stay unchanged',()=>{
 const {e,result}=fixture('Reported revenue USD 1,000.','Reported revenue USD 1,000.');assert.equal(validateLeakOutput(result,e).ok,true);
 result.leaks[0].interpretation='USD 600';assert.equal(validateLeakOutput(result,e).numbers[0],'600');
 result.leaks[0].interpretation='Four times the revenue.';result.leaks[0].evidence_refs=['unknown'];assert.equal(validateLeakOutput(result,e).reason,'invalid_evidence_refs');
});
test('exact accepted J09 escape now rejects, preserving complete citations and trusted binding resolver',()=>{
 const raw=JSON.parse(fs.readFileSync('docs/evaluations/judge-style-final-combined/runs/J09.json'));
 const e=raw.calls[0].response.evidence,result=raw.calls[1].response.leaks;
 const resolver=load('src/app/api/analyze/leaks/binding.ts').resolveLeakInterventions;
 const before=JSON.stringify(result);assert.deepEqual(plain(resolver(result.leaks,e)),['headcount_reduction']);
 assert.deepEqual(plain(validateLeakOutput(result,e)),{ok:false,reason:'unreported_number',field:'leaks[0].interpretation',numbers:['4']});assert.equal(JSON.stringify(result),before);
});
test('J11 source-reported but uncited digit still rejects unchanged',()=>{
 const raw=JSON.parse(fs.readFileSync('docs/evaluations/judge-style-final-combined/runs/J11.json')),e=raw.calls[0].response.evidence;
 const {result}=fixture('Reported issue.','The till reports USD 3,100.');result.leaks[0].evidence_refs=[e.provenance.citable_facts.find(f=>f.id.endsWith('_04')).id];
 assert.deepEqual(plain(validateLeakOutput(result,e)),{ok:false,reason:'unreported_number',field:'leaks[0].interpretation',numbers:['3100']});
});
test('directly negated source ratios cannot license a positive ratio',()=>{
 for(const source of ['Not twice the revenue.','Never over four times the revenue.']){
  const {e,result}=fixture(source,source.replace(/^(Not|Never) /,''));assert.equal(validateLeakOutput(result,e).reason,'unreported_number');
 }
 const {e,result}=fixture('Not twice the revenue.','Not twice the revenue.');assert.equal(validateLeakOutput(result,e).ok,true);
});
test('route rejects the saved J09 output without invoking binding or altering provider prose',async()=>{
 const raw=JSON.parse(fs.readFileSync('docs/evaluations/judge-style-final-combined/runs/J09.json'));
 const request=raw.calls.find(c=>c.url.endsWith('/leaks')).body;
 const result=structuredClone(raw.calls.find(c=>c.url.endsWith('/leaks')).response.leaks);
 result.leaks=result.leaks.map(({intervention_ref,...finding})=>{void intervention_ref;return finding;});
 let calls=0;const before=JSON.stringify(result);
 const modules=productionModules(async()=>{calls++;return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(result)}}]});});
 const response=await modules('src/app/api/analyze/leaks/route.ts').POST(new Request('http://localhost',{method:'POST',body:JSON.stringify(request)}));
 assert.equal(response.status,502);assert.deepEqual(await response.json(),{error:'Leak analysis result rejected by output validation: unreported_number.'});
 assert.equal(calls,3);assert.equal(JSON.stringify(result),before);
});
