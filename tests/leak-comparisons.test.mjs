import test from 'node:test';
import assert from 'node:assert/strict';
import {completeLabor} from './helpers/complete-labor.mjs';
import {productionModules} from './helpers/provenance.mjs';
import {harness} from './helpers/analysis-harness.mjs';

function check(text,options={},mutate=()=>{},field='title') {
 const f=completeLabor(options);mutate(f);f.finding[field]=text;
 const result={leaks:[f.finding],insufficient_evidence:[]};
 const before=JSON.stringify({result,evidence:f.evidence});
 const validation=f.load('src/app/api/analyze/leaks/output.ts').validateLeakOutput(result,f.evidence);
 assert.equal(JSON.stringify({result,evidence:f.evidence}),before);
 return validation;
}
for(const word of ['exceeds','exceeded','is greater than','is higher than','is above','equals','is equal to'])test(`2500 vs 8000 rejects number-free staffing comparison: ${word}`,()=>{
 const r=check(`Tuesday evening staffing cost ${word} sales revenue`);assert.equal(r.ok,false);assert.equal(r.reason,'unverified_comparison');
});
for(const field of ['title','interpretation'])test(`false monetary comparison is checked in ${field}`,()=>{
 assert.equal(check('Tuesday evening staffing cost exceeds sales revenue',{},()=>{},field).ok,false);
});
test('false comparison is checked in evidence and insufficient-evidence text',()=>{
 const f=completeLabor(),validate=f.load('src/app/api/analyze/leaks/output.ts').validateLeakOutput;
 f.finding.evidence.push('Tuesday evening staffing cost exceeds sales revenue');
 assert.equal(validate({leaks:[f.finding],insufficient_evidence:[]},f.evidence).field,'leaks[0].evidence[2]');
 assert.equal(validate({leaks:[],insufficient_evidence:[{topic:'Tuesday staffing',reason:'Tuesday evening staffing cost exceeds sales revenue'}]},f.evidence).ok,false);
});
for(const word of ['is less than','is lower than','is below'])test(`supported strict comparison passes: ${word}`,()=>assert.equal(check(`Tuesday evening staffing cost ${word} sales revenue`).ok,true));
test('correct greater-than and reverse comparisons pass',()=>{
 assert.equal(check('Tuesday evening staffing cost exceeds sales revenue',{sales:1900}).ok,true);
 assert.equal(check('Tuesday evening sales are greater than staffing cost').ok,true);
 assert.equal(check('Tuesday evening labor inefficiency — staffing cost exceeds sales',{sales:1900}).ok,true);
 assert.equal(check('Tuesday evening labor inefficiency — staffing cost exceeds sales').ok,false);
});
test('equality is exact; equality does not satisfy a strict comparison',()=>{
 assert.equal(check('Tuesday evening staffing cost equals sales revenue',{sales:2500}).ok,true);
 assert.equal(check('Tuesday evening staffing cost is equal to sales revenue',{sales:2500}).ok,true);
 assert.equal(check('Tuesday evening staffing cost is equivalent to sales revenue',{sales:2500}).ok,true);
 assert.equal(check('Tuesday evening staffing cost is below sales revenue',{sales:2500}).ok,false);
});
for(const [name,mutate] of [
 ['scope',f=>{f.record.scope='friday_evening';}],
 ['period',f=>{f.record.supporting_facts[0].period='week';}],
 ['currency',f=>{f.record.supporting_facts[0].currency='EUR';}],
 ['unit',f=>{f.record.supporting_facts[0].unit='percent';}],
 ['ambiguous records',f=>{f.evidence.provenance.authorization_records.push(structuredClone(f.record));}],
 ['absent numeric binding',f=>{f.evidence.provenance.authorization_records=[];}],
])test(`incompatible or ambiguous ${name} fails closed`,()=>assert.equal(check('Tuesday evening staffing cost is lower than sales revenue',{},mutate).ok,false));
for(const text of ['Friday evening staffing cost is below sales revenue','Weekly staffing cost is below sales revenue','Staffing cost is below an unknown benchmark','Staffing cost and delivery costs are below sales revenue','Staffing cost is not greater than sales revenue','Staffing cost is below sales revenue across the entire business','Staffing cost is below unrelated sales revenue'])test(`unsupported operand binding fails closed: ${text}`,()=>assert.equal(check(text).ok,false));
test('component values do not authorize a derived percentage share',()=>{
 assert.equal(check('Staffing cost is 31.25% of Tuesday evening sales').reason,'unreported_number');
});
test('inline amounts must match the correct operand, not just selected scalar values',()=>{
 assert.equal(check('Tuesday evening staffing cost USD 2,500 is below sales revenue USD 8,000').ok,true);
 assert.equal(check('Tuesday evening staffing cost USD 8,000 is below sales revenue USD 2,500').ok,false);
 assert.equal(check('Tuesday evening staffing cost USD 2,500.00 is below sales revenue USD 8,000.00').ok,true);
});
for(const text of ['Staffing cost in EUR is below sales revenue in USD','Staffing cost in eur is below sales revenue in usd','Staffing cost per worker is below sales revenue','Staffing cost is below sales revenue per week','Staffing cost is below sales revenue per evening','Staffing cost plus rent is below sales revenue'])test(`incompatible explicit operand qualifier rejects: ${text}`,()=>assert.equal(check(text).ok,false));
test('comparison truth does not require test permission',()=>{
 assert.equal(check('Tuesday evening staffing cost is lower than sales revenue',{},f=>{f.record.permission='absent';f.record.permission_source_refs=[];}).ok,true);
});
test('model-assigned roles cannot swap the literal sales and staffing-cost amounts',()=>{
 assert.equal(check('Tuesday evening staffing cost exceeds sales revenue',{},f=>{
  for(const fact of f.record.supporting_facts)fact.role=fact.role==='sales'?'staffing_cost':'sales';
 }).ok,false);
});
test('changing category cannot bypass a cost-sales comparison bound to Labor sources',()=>{
 assert.equal(check('Tuesday evening cost exceeds sales revenue',{},f=>{f.finding.category='operations';}).ok,false);
});
function replaceOriginal(f,from,to) {
 const old=f.evidence.provenance;
 f.note=f.note.replace(from,to);
 for(const group of [f.evidence.revenue,f.evidence.costs])for(const item of group.items)item.source_text=item.source_text.replace(from,to);
 const next=f.load('src/app/api/analyze/evidence/provenance.ts').createEvidenceProvenance(f.evidence,f.note,[]);
 const remap=id=>next.items.find(item=>item.source===old.items.find(source=>source.id===id).source).id;
 for(const fact of f.record.supporting_facts)fact.source_refs=fact.source_refs.map(remap);
 f.record.permission_source_refs=f.record.permission_source_refs.map(remap);
 f.record.constraint_source_refs=f.record.constraint_source_refs.map(remap);
 f.finding.evidence_refs=f.finding.evidence_refs.map(id=>{
  const refs=old.citable_facts.find(fact=>fact.id===id).source_refs.map(remap);
  return next.citable_facts.find(fact=>JSON.stringify(fact.source_refs)===JSON.stringify(refs)).id;
 });
 f.finding.evidence=f.finding.evidence.map(text=>text.replace(from,to));
 next.authorization_records=[f.record];f.evidence.provenance=next;
}
for(const [name,from,to] of [
 ['scope','The total Tuesday evening staffing cost','The total Friday evening staffing cost'],
 ['period','USD 2,500 per month','USD 2,500 per week'],
 ['currency','USD 2,500 per month','EUR 2,500 per month'],
 ['unit','USD 2,500 per month','USD 2,500 per worker per month'],
])test(`literal source ${name} mismatch rejects even if the model labels the record as compatible`,()=>{
 assert.equal(check('Tuesday evening staffing cost is below sales revenue',{},f=>replaceOriginal(f,from,to)).ok,false);
});
test('existing numeric errors retain precedence over a false number-free title',()=>{
 const f=completeLabor();f.finding.title='Tuesday evening staffing cost exceeds sales revenue';f.finding.interpretation='The unsupported impact is USD 600.';
 const r=f.load('src/app/api/analyze/leaks/output.ts').validateLeakOutput({leaks:[f.finding],insufficient_evidence:[]},f.evidence);
 assert.equal(r.reason,'unreported_number');assert.equal(r.field,'leaks[0].interpretation');
});
test('a single literal scoped monetary pair can verify a claim without creating authorization',()=>{
 const f=completeLabor(),statement='Tuesday evening sales were USD 8,000 per month, but staffing costs were USD 2,500 per month.';
 f.evidence.provenance=f.load('src/app/api/analyze/evidence/provenance.ts').createEvidenceProvenance(f.evidence,statement,[]);
 f.evidence.provenance.authorization_records=[];
 f.finding.evidence_refs=[f.evidence.provenance.citable_facts.find(fact=>fact.text===statement&&fact.source_refs.length===1).id];
 f.finding.evidence=[statement];f.finding.title='Tuesday evening staffing cost is below sales revenue';
 const result={leaks:[f.finding],insufficient_evidence:[]},before=JSON.stringify(f.evidence);
 assert.equal(f.load('src/app/api/analyze/leaks/output.ts').validateLeakOutput(result,f.evidence).ok,true);
 assert.equal(f.load('src/app/api/analyze/scenarios/scenarios.ts').buildScenarioInput({evidence:f.evidence,leaks:result,operational_context:[]}).authorized_changes.length,0);
 assert.equal(JSON.stringify(f.evidence),before);
});
test('real Leak route blocks false title before Scenario or Decision can run',async()=>{
 const f=completeLabor(),calls=[];f.finding.title='Tuesday evening staffing cost exceeds sales revenue';
 const modules=productionModules(async()=>Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({leaks:[f.finding],insufficient_evidence:[]})}}]}));
 const h=harness(async(url,options)=>{
  calls.push(url);
  if(url==='/api/analyze/evidence')return Response.json({evidence:f.evidence});
  if(url==='/api/analyze/leaks')return modules('src/app/api/analyze/leaks/route.ts').POST(new Request('http://localhost'+url,options));
  throw Error('False finding escaped to '+url);
 });
 h.render();const run=h.value.startAnalysis(f.note,f.note);
 for(let i=0;i<8;i++){await h.settle();if(h.timers.size)h.tick();if(h.value.analysisError)break;}
 await run;h.render();assert.ok(h.value.analysisError);assert.equal(h.value.scenarioResult,null);assert.equal(h.value.decisionResult,null);
 assert.deepEqual(calls,['/api/analyze/evidence','/api/analyze/leaks']);h.unmount();
});
