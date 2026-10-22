import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {productionModules,provenance} from './helpers/provenance.mjs';
const raw=JSON.parse(fs.readFileSync('tests/fixtures/authorization-current-note.json'));
const load=productionModules();
const {validateAuthorizationAtoms:valid,assembleAuthorizationRecords:assemble,createAuthorizationAtomsSchema}=load('src/app/api/analyze/evidence/authorization-atoms.ts');
const {validateAuthorizationRecords:validateRecords,requiredAuthorizationSources}=load('src/app/api/analyze/evidence/authorization-records.ts');
const {matchesSchema,createEvidenceOutputSchema}=load('src/app/api/analyze/evidence/evidence.ts');
const plain=x=>JSON.parse(JSON.stringify(x));
const grant='The owner is willing to test reducing ingredient waste from the current 9% toward the internal target of 5%.';
function fixture({waste=false,input=raw.input}={}){
 if(waste)input+='\n'+grant;
 const evidence=plain(raw.evidence);evidence.provenance=provenance.createEvidenceProvenance(evidence,input);
 const sources=evidence.provenance.items,source=n=>sources.find(s=>s.source===`source_input[${n-1}]`).id;
 const scope='tuesday_evening_6pm_10pm';
 const atoms=[
  {kind:'scoped_sales',scope,period:'month',amount:1900,currency:'USD',source_refs:[source(12)]},
  {kind:'scoped_staffing_cost',scope,period:'month',amount:2500,currency:'USD',source_refs:[source(14)]},
  {kind:'headcount_reduction_permission',scope,operation:'delta',value:-1,unit:'persons',permission:'explicit',source_refs:[source(16)]},
  {kind:'schedule_constraint',intervention:'headcount_reduction',scope,constraint:'rest_schedule_unchanged',source_refs:[source(16)]},
  {kind:'current_waste_rate',scope:'ingredient_waste',value:9,unit:'percent',source_refs:[source(17)]},
  {kind:'waste_target_rate',scope:'ingredient_waste',value:5,unit:'percent',source_refs:[source(18)]},
 ];
 if(waste)atoms.push({kind:'waste_reduction_permission',scope:'ingredient_waste',from:9,value:5,unit:'percent',permission:'explicit',source_refs:[source(23)]});
 return {evidence,sources,source,atoms,input};
}
const assembled=f=>assemble(f.atoms,f.sources,'USD');
test('A/B: complete Labor atoms assemble exactly; shared permission/constraint source preserved',()=>{
 const f=fixture(),before=JSON.stringify(f.atoms);assert.equal(valid(f.atoms,f.sources,'USD'),true);
 assert.deepEqual(plain(assembled(f)),[{intervention:'headcount_reduction',scope:'tuesday_evening_6pm_10pm',operation:'delta',from:null,value:-1,unit:'persons',permission:'explicit',permission_source_refs:[f.source(16)],constraint:'rest_schedule_unchanged',constraint_source_refs:[f.source(16)],supporting_facts:[{role:'sales',value:1900,unit:'currency',period:'month',currency:'USD',source_refs:[f.source(12)]},{role:'staffing_cost',value:2500,unit:'currency',period:'month',currency:'USD',source_refs:[f.source(14)]}]}]);
 assert.deepEqual(Array.from(requiredAuthorizationSources(assembled(f)[0])),[f.source(12),f.source(14),f.source(16)]);assert.equal(JSON.stringify(f.atoms),before);assert.equal(validateRecords(assembled(f),f.sources,'USD'),true);
});
for(const kind of ['schedule_constraint','headcount_reduction_permission','scoped_sales','scoped_staffing_cost'])test(`C–F: absent ${kind} is never completed from source prose`,()=>{
 const f=fixture();f.atoms=f.atoms.filter(a=>a.kind!==kind);assert.deepEqual(plain(assembled(f)),[]);
});
for(const [name,mutate]of[
 ['conflicting scope',a=>a[1].scope='ingredient_waste'],['wrong period',a=>a[1].period='week'],['wrong currency',a=>a[1].currency='EUR'],
 ['unknown source ID',a=>a[0].source_refs=['src_forged']],['citable fact instead of original source ID', (a,f)=>a[0].source_refs=[f.evidence.provenance.citable_facts[11].id]],
 ['model-prose source ID',(a,f)=>a[0].source_refs=[f.sources.find(s=>s.source==='evidence.business_type').id]],
 ['known unrelated numeric-free source',(a,f)=>a[0].source_refs=[f.source(1)]],['missing refs',a=>a[0].source_refs=[]],
 ['duplicate refs',a=>a[0].source_refs.push(a[0].source_refs[0])],['derived amount',a=>a[0].amount=1901],['negative amount',a=>a[0].amount=-1900],
 ['wrong permission delta',a=>a[2].value=-2],['wrong unit',a=>a[2].unit='percent'],['absent permission cannot claim explicit atom',a=>a[2].permission='absent'],
 ['missing permission numeric anchor',(a,f)=>a[2].source_refs=[f.source(17)]],['invented constraint',a=>a[3].constraint='none'],['wrong constraint action',a=>a[3].intervention='waste_rate_target'],
 ['free-form prose injected into atom',a=>a[0].text='PRIVATE extra prose'],
])test(`G/H: ${name} rejects before assembly, without mutation`,()=>{
 const f=fixture();mutate(f.atoms,f);const before=JSON.stringify(f.atoms);assert.equal(valid(f.atoms,f.sources,'USD'),false);assert.equal(assembled(f),null);assert.equal(JSON.stringify(f.atoms),before);
});
test('I/K: Waste baseline + target, target-only, or permission without baseline never authorize',()=>{
 const f=fixture();for(const kinds of [['current_waste_rate','waste_target_rate'],['waste_target_rate']])assert.deepEqual(plain(assemble(f.atoms.filter(a=>kinds.includes(a.kind)),f.sources,'USD')),[]);
 const permitted=fixture({waste:true});permitted.atoms=permitted.atoms.filter(a=>a.kind!=='current_waste_rate');assert.equal(assembled(permitted).some(r=>r.intervention==='waste_rate_target'),false);
});
test('J: explicit Waste grant assembles separate complete record; rates are not permission',()=>{
 const f=fixture({waste:true}),records=assembled(f);assert.equal(records.length,2);const r=records[1];assert.equal(r.intervention,'waste_rate_target');assert.equal(r.from,9);assert.equal(r.value,5);assert.equal(r.permission,'explicit');assert.equal(r.constraint,'none');assert.deepEqual(Array.from(r.permission_source_refs),[f.source(23)]);assert.equal(validateRecords(records,f.sources,'USD'),true);
 const mismatch=fixture({waste:true});mismatch.atoms.find(a=>a.kind==='current_waste_rate').value=5;mismatch.atoms.find(a=>a.kind==='current_waste_rate').source_refs=[mismatch.source(18)];assert.equal(assembled(mismatch).some(r=>r.intervention==='waste_rate_target'),false);
});
test('duplicate/conflicting atom kinds fail closed for that candidate regardless of array order',()=>{
 const f=fixture();f.atoms.push(plain(f.atoms[0]));assert.deepEqual(plain(assembled(f)),[]);f.atoms.reverse();assert.deepEqual(plain(assembled(f)),[]);
 const g=fixture({waste:true});g.atoms.push(plain(g.atoms[0]));assert.deepEqual(Array.from(assembled(g),r=>r.intervention),['waste_rate_target']);
});
test('L: descriptive prose/order changes do not change assembly identity or original-source lineage',()=>{
 const f=fixture(),expected=plain(assembled(f));f.evidence.facts=['A different model paraphrase'];f.evidence.provenance=provenance.createEvidenceProvenance(f.evidence,f.input);f.sources=f.evidence.provenance.items;f.atoms.reverse();assert.deepEqual(plain(assembled(f)),expected);
 const alternate=fixture({input:raw.input.replace('The owner is willing to test reducing Tuesday evening staffing by 1 person while keeping the rest of the schedule unchanged.','For Tuesday evening, a trial staffing reduction of 1 person is approved; every other shift stays unchanged.')});assert.equal(assembled(alternate)[0].constraint,'rest_schedule_unchanged');assert.notEqual(alternate.source(16),f.source(16));
});
test('M: existing final-record validator still rejects malformed assembly output',()=>{
 const f=fixture();for(const mutate of [r=>r.constraint='none',r=>r.supporting_facts[0].role='current_waste_rate',r=>r.value=-2,r=>r.permission_source_refs=['src_forged']]){const records=plain(assembled(f));mutate(records[0]);assert.equal(validateRecords(records,f.sources,'USD'),false);}
});
test('provider schema is a strict seven-way typed union; aggregates and missing atom field reject',()=>{
 const f=fixture(),schema=createEvidenceOutputSchema(f.sources.map(s=>s.id));assert.equal(createAuthorizationAtomsSchema().items.anyOf.length,7);assert.equal(schema.properties.authorization_records,undefined);
 assert.equal(matchesSchema({...raw.evidence,authorization_atoms:f.atoms,business_total_support:[]},schema),true);
 for(const payload of [{...raw.evidence,authorization_records:assembled(f)},{...raw.evidence,authorization_atoms:f.atoms,authorization_records:assembled(f)},raw.evidence])assert.equal(matchesSchema(payload,schema),false);
});
test('N: atomic producer through all unchanged downstream routes preserves Case A contract offline',async()=>{
 const f=fixture(),leaks=plain(raw.leaks);const categoryRefs={labor:[12,13,14,15,16],waste:[17,18,19],delivery:[20,21,22]};
 for(const leak of leaks.leaks){leak.evidence_refs=categoryRefs[leak.category].map(n=>f.evidence.provenance.citable_facts.find(fact=>fact.source_refs.length===1&&fact.source_refs[0]===f.source(n)).id);leak.intervention_ref=leak.category==='labor'?'headcount_reduction':null;}
 const calls=[];const modules=productionModules(async(_url,options)=>{const payload=JSON.parse(options.body),name=payload.response_format.json_schema.name;calls.push(name);const completion=result=>Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(result)}}]});
  if(name==='evidence'){assert.equal(payload.response_format.json_schema.schema.properties.authorization_records,undefined);return completion({...raw.evidence,authorization_atoms:f.atoms});}
  const input=JSON.parse(payload.messages[1].content);
  if(name==='leak_detective_v1')return completion({...leaks,leaks:leaks.leaks.map(({intervention_ref,...finding})=>{void intervention_ref;return finding;})});
  if(name==='scenario_agent_v1')return completion({scenarios:input.authorized_changes.map(a=>({title:'Test '+a.variable_label,target_leak:a.target_leak,controlled_changes:[{variable:a.variable_label,change_type:a.change_type,from:a.from,value:a.value,unit:a.unit}],available_input_refs:a.source_refs,missing_calculation_inputs:[],confidence:'high'})),not_simulation_ready:input.confirmed_leaks.filter(title=>!input.authorized_changes.some(a=>a.target_leak===title)).map(title=>({target_leak:title,reason:'No approved controllable change or explicit test permission.',missing_decision_input_categories:['Explicit permission for a controllable change']}))});
  if(name==='decision_agent_v1')return completion({decision_status:'needs_more_data',recommendation:{type:'collect_data',candidate_id:null,title:input.recommendation_contract.title,rationale:'More data is needed because no calculable scenarios exist.'},comparison:input.comparison_sources.map(c=>({...c,assessment:'Authoritative calculation inputs remain missing.'})),priority_inputs:input.priority_input_options,confidence:'high'});
  throw Error('Unexpected mocked provider call');
 });
 const invoke=async(name,body)=>{const response=await modules(`src/app/api/analyze/${name}/route.ts`).POST(new Request('http://localhost',{method:'POST',body:JSON.stringify(body)}));const result=await response.json();assert.equal(response.status,200,JSON.stringify(result));return result;};
 const {evidence}=await invoke('evidence',{input:f.input});assert.deepEqual(evidence.provenance.authorization_records,plain(assembled(f)));assert.equal(evidence.authorization_atoms,undefined);
 const {authorization_records,...manifest}=evidence.provenance;void authorization_records;assert.deepEqual(manifest,plain(provenance.createEvidenceProvenance(evidence,f.input)));
 const {leaks:accepted}=await invoke('leaks',{evidence,operational_context:[]});
 const input=modules('src/app/api/analyze/scenarios/scenarios.ts').buildScenarioInput({evidence,leaks:accepted,operational_context:[]});assert.equal(input.authorized_changes.length,1);assert.equal(input.authorized_changes[0].authorization_id,'tuesday_evening_headcount_reduction');
 const scenario=await invoke('scenarios',{evidence,leaks:accepted,operational_context:[]});assert.equal(scenario.scenarios.scenarios.length,1);assert.equal(scenario.scenarios.not_simulation_ready.length,2);
 const simulation=await invoke('simulate',{evidence,...scenario});assert.equal(simulation.results[0].status,'not_calculable_yet');assert.equal(simulation.results[0].calculation,null);
 const body={evidence,scenarios:scenario.scenarios,simulation};const gate=await invoke('decision-gate',body);assert.equal(gate.decision_gate,'needs_more_data');assert.equal(gate.top_candidate_id,null);
 const {decision}=await invoke('decision',{...body,leaks:accepted,decision_gate:gate});assert.equal(decision.recommendation.type,'collect_data');assert.equal(decision.recommendation.candidate_id,null);assert.deepEqual(calls,['evidence','leak_detective_v1','scenario_agent_v1','decision_agent_v1']);
});
