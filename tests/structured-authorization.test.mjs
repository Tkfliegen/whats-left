import {atomsFromRecords} from './helpers/authorization-atoms.mjs';
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {productionModules,provenance,authorizationRecords} from './helpers/provenance.mjs';
const raw=JSON.parse(fs.readFileSync('tests/fixtures/authorization-current-note.json','utf8'));
const load=productionModules(),scenarios=load('src/app/api/analyze/scenarios/scenarios.ts');
const permission='The owner is willing to test reducing Tuesday evening staffing by 1 person while keeping the rest of the schedule unchanged.';
const wastePermission='The owner is willing to test reducing ingredient waste from the current 9% toward the internal target of 5%.';
const plain=x=>JSON.parse(JSON.stringify(x));
function body({input=raw.input,waste=false,labor=true}={}){
  const e=structuredClone(raw.evidence);e.provenance=provenance.createEvidenceProvenance(e,input);
  const records=authorizationRecords(e,{sales:11,cost:13,costValue:2500,laborPermission:15,current:16,target:17,wastePermission:waste?22:17});
  records[0].constraint='rest_schedule_unchanged';
  if(!labor){records[0].permission='absent';records[0].permission_source_refs=[];records[0].constraint='none';records[0].constraint_source_refs=[];}
  if(!waste){records[1].permission='absent';records[1].permission_source_refs=[];}
  e.provenance.authorization_records=records;
  const leaks=structuredClone(raw.leaks),source=i=>e.provenance.items.find(s=>s.source===`source_input[${i}]`).id;
  const fact=i=>e.provenance.citable_facts.find(f=>f.source_refs.length===1&&f.source_refs[0]===source(i)).id;
  // Source positions are explicit recorded fixture attribution, not a production parser.
  leaks.leaks.find(l=>l.category==='labor').evidence_refs=[11,12,13,14,...(labor?[15]:[])].map(fact);
  leaks.leaks.find(l=>l.category==='waste').evidence_refs=[16,17,18,...(waste?[22]:[])].map(fact);
  leaks.leaks.find(l=>l.category==='delivery').evidence_refs=[19,20,21].map(fact);
  return {evidence:e,leaks,operational_context:provenance.sourceStatements(input)};
}
const built=b=>scenarios.buildScenarioInput(b);
const allowed=(b,variable)=>built(b).authorized_changes.find(a=>a.variable_id===variable);
const labor=b=>allowed(b,'tuesday_evening_headcount');const waste=b=>allowed(b,'ingredient_waste_rate');

test('A/F: current recorded note grants Labor only; target is not Waste permission; Delivery stays unauthorized',()=>{
  const b=body();assert.equal(scenarios.isScenarioRequest(b),true);assert.equal(built(b).authorized_changes.length,1);
  assert.equal(labor(b).authorization_id,'tuesday_evening_headcount_reduction');assert.equal(labor(b).value,-1);assert.equal(labor(b).from,null);
  assert.equal(waste(b),undefined);assert.equal(built(b).authorized_changes.some(a=>a.target_leak.includes('Delivery')),false);
  const constraint=b.evidence.provenance.authorization_records[0].constraint_source_refs[0];assert.ok(labor(b).source_refs.includes(constraint));
  assert.equal(b.evidence.provenance.items.find(i=>i.id===constraint).text,permission);
});
test('B: explicit separate Waste permission authorizes both interventions, never Delivery',()=>{
  const b=body({input:raw.input+'\n'+wastePermission,waste:true});assert.equal(built(b).authorized_changes.length,2);
  assert.equal(waste(b).authorization_id,'ingredient_waste_rate_target');assert.equal(waste(b).from,9);assert.equal(waste(b).value,5);
});
test('C: source paraphrases preserve authorization through structured roles and fresh source IDs',()=>{
  const input=raw.input.replace('Tuesday evenings from 6 PM to 10 PM generated $1,900 in sales for the month.','Monthly sales for Tuesday 6 PM to 10 PM were $1,900.').replace(permission,'For Tuesday evening 6 PM to 10 PM, the owner approves testing a staffing reduction of 1 person; the rest of the schedule stays unchanged.');
  const b=body({input});b.leaks.leaks.find(l=>l.category==='labor').title='A different supported finding';b.leaks.leaks.find(l=>l.category==='labor').category='operations';
  assert.ok(labor(b));assert.equal(labor(b).value,-1);assert.notEqual(labor(b).source_refs[0],labor(body()).source_refs[0]);
});
test('D: no extracted owner grant means no authorization, with no prose fallback',()=>{
  const b=body({labor:false,input:raw.input.replace(permission,'No owner permission for any staffing change has been supplied.')});
  assert.equal(labor(b),undefined);
  const legacy=body();delete legacy.evidence.provenance.authorization_records;assert.equal(built(legacy).authorized_changes.length,0);
});
for(const missing of ['sales','staffing_cost'])test(`E: Labor missing required structured role ${missing} refuses authorization`,()=>{
  const b=body();const rec=b.evidence.provenance.authorization_records[0];rec.supporting_facts=rec.supporting_facts.filter(f=>f.role!==missing);assert.equal(labor(b),undefined);
});
for(const missing of ['current_waste_rate','target_waste_rate'])test(`G: Waste explicit permission with missing ${missing} refuses authorization`,()=>{
  const b=body({input:raw.input+'\n'+wastePermission,waste:true});b.evidence.provenance.authorization_records[1].supporting_facts=b.evidence.provenance.authorization_records[1].supporting_facts.filter(f=>f.role!==missing);assert.equal(waste(b),undefined);
});
for(const [name,edit]of[
 ['unknown source',r=>r.supporting_facts[0].source_refs=['src_forged']],
 ['unrelated known source', (r,b)=>r.supporting_facts[0].source_refs=[b.evidence.provenance.items.find(s=>s.source==='source_input[0]').id]],
 ['invented source value',r=>r.supporting_facts[0].value=1910],
 ['wrong intervention scope',r=>r.scope='ingredient_waste'],
 ['wrong operation',r=>r.operation='absolute_target'],
 ['wrong amount',r=>r.value=-2],
 ['invented baseline',r=>r.from=4],
 ['wrong unit',r=>r.unit='percent'],
 ['wrong currency',r=>r.supporting_facts[0].currency='EUR'],
 ['wrong period',r=>r.supporting_facts[0].period='week'],
 ['missing constraint refs',r=>r.constraint_source_refs=[]],
 ['missing explicit grant refs',r=>r.permission_source_refs=[]],
 ['fake model authorization object',r=>r.authorization_id='already_authorized'],
 ['duplicated support role',r=>r.supporting_facts.push(structuredClone(r.supporting_facts[0]))],
])test(`invalid structured candidate fails closed: ${name}`,()=>{
 const b=body();edit(b.evidence.provenance.authorization_records[0],b);const before=JSON.stringify(b);assert.equal(labor(b),undefined);assert.equal(JSON.stringify(b),before);
});
test('E: all supporting and permission IDs must actually be resolved from the Leak refs',()=>{
 const b=body();const l=b.leaks.leaks.find(l=>l.category==='labor');l.evidence_refs.pop();assert.equal(labor(b),undefined);
 const c=body();c.leaks.leaks.find(l=>l.category==='labor').evidence_refs=[c.evidence.provenance.citable_facts[0].id];assert.equal(labor(c),undefined);
});
test('G: explicit Waste grant cannot substitute for an uncited current rate or target',()=>{
 for(const index of [16,17]){const b=body({input:raw.input+'\n'+wastePermission,waste:true});const l=b.leaks.leaks.find(l=>l.category==='waste');l.evidence_refs=l.evidence_refs.filter(id=>id!==b.evidence.provenance.citable_facts[index].id);assert.equal(waste(b),undefined);}
});
test('denied permission and duplicate intervention records refuse authorization',()=>{
 const b=body();const r=b.evidence.provenance.authorization_records[0];r.permission='denied';r.permission_source_refs=[];assert.equal(labor(b),undefined);
 const c=body();c.evidence.provenance.authorization_records.push(structuredClone(c.evidence.provenance.authorization_records[0]));assert.equal(labor(c),undefined);
});
test('constraints are mandatory and cannot authorize extra variables or schedule changes',()=>{
 const b=body();const input=built(b),a=input.authorized_changes[0],auth=load('src/app/api/analyze/scenarios/authorization.ts');
 const result={scenarios:[{target_leak:a.target_leak,controlled_changes:[{variable:a.variable_label,change_type:a.change_type,from:a.from,value:a.value,unit:a.unit}],available_input_refs:a.source_refs}],not_simulation_ready:[]};
 assert.equal(auth.validateScenarioSupport(result,input.authorized_changes).ok,true);
 result.scenarios[0].controlled_changes.push({variable:'Friday evening headcount',change_type:'delta',from:null,value:-1,unit:'persons'});assert.equal(auth.validateScenarioSupport(result,input.authorized_changes).reason,'unauthorized_variable');
});
for(const wasteEnabled of [false,true])test(`real Evidence producer -> unchanged downstream routes offline; Waste permission ${wasteEnabled}`,async()=>{
 const b=body({input:raw.input+(wasteEnabled?'\n'+wastePermission:''),waste:wasteEnabled});let providers=[];const request=x=>new Request('http://localhost',{method:'POST',body:JSON.stringify(x)});
 const completion=x=>Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(x)}}]});
 const modules=productionModules(async(_url,options)=>{
  const payload=JSON.parse(options.body),name=payload.response_format.json_schema.name;providers.push(name);
  if(name==='evidence'){
   const catalog=JSON.parse(payload.messages[2].content).authorization_sources;
   const supplied=new Set(catalog.map(s=>s.id));assert.ok(b.evidence.provenance.authorization_records.every(r=>[...r.permission_source_refs,...r.constraint_source_refs,...r.supporting_facts.flatMap(f=>f.source_refs)].every(id=>supplied.has(id))));
   assert.match(payload.messages[0].content,/internal target is NOT permission/);assert.equal(payload.model,'nvidia/Nemotron-3-Ultra-550b-a55b');
   return completion({...raw.evidence,authorization_atoms:atomsFromRecords(b.evidence.provenance.authorization_records)});
  }
  if(name==='leak_detective_v1'){
   const supplied=JSON.parse(payload.messages[1].content);assert.equal(supplied.evidence.provenance,undefined);assert.doesNotMatch(JSON.stringify(supplied),/authorization_records|permission_source_refs/);return completion(b.leaks);
  }
  if(name==='scenario_agent_v1'){
   const input=JSON.parse(payload.messages[1].content);assert.equal(input.authorized_changes.length,wasteEnabled?2:1);
   return completion({scenarios:input.authorized_changes.map(a=>({title:'Test '+a.variable_label,target_leak:a.target_leak,controlled_changes:[{variable:a.variable_label,change_type:a.change_type,from:a.from,value:a.value,unit:a.unit}],available_input_refs:a.source_refs,missing_calculation_inputs:['Authoritative calculation input'],confidence:'high'})),not_simulation_ready:input.confirmed_leaks.filter(title=>!input.authorized_changes.some(a=>a.target_leak===title)).map(title=>({target_leak:title,reason:'Missing explicit controllable-change permission',missing_decision_input_categories:['Explicit permission for a controllable change']}))});
  }
  throw Error('Unexpected provider call');
 });
 const invoke=async(name,x)=>{const response=await modules(`src/app/api/analyze/${name}/route.ts`).POST(request(x));const v=await response.json();assert.equal(response.status,200,JSON.stringify(v));return v;};
 const {evidence}=await invoke('evidence',{input:b.evidence.provenance.source_input});
 const withoutRecords=structuredClone(evidence.provenance);delete withoutRecords.authorization_records;
 assert.deepEqual(withoutRecords,plain(provenance.createEvidenceProvenance(evidence,b.evidence.provenance.source_input)),'existing provenance IDs and lineage unchanged');
 const {leaks}=await invoke('leaks',{evidence,operational_context:b.operational_context});
 const scenario=await invoke('scenarios',{evidence,leaks,operational_context:b.operational_context});assert.equal(scenario.scenarios.scenarios.length,wasteEnabled?2:1);assert.equal(scenario.scenarios.not_simulation_ready.length,wasteEnabled?1:2);
 const simulation=await invoke('simulate',{evidence,...scenario});assert.ok(simulation.results.every(r=>r.status==='not_calculable_yet'&&r.calculation===null));
 assert.deepEqual(providers,['evidence','leak_detective_v1','scenario_agent_v1']);
});
test('Evidence producer rejects forged model source refs rather than repairing them',async()=>{
 const b=body();b.evidence.provenance.authorization_records[0].permission_source_refs=['src_forged'];let calls=0;
 const modules=productionModules(async()=>{calls++;return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({...raw.evidence,authorization_atoms:atomsFromRecords(b.evidence.provenance.authorization_records)})}}]});});
 const response=await modules('src/app/api/analyze/evidence/route.ts').POST(new Request('http://localhost',{method:'POST',body:JSON.stringify({input:raw.input})}));assert.equal(response.status,502);assert.equal(calls,1);
});
test('authorization builder has no literal sentence matcher or model/network fallback',()=>{
 const code=fs.readFileSync('src/app/api/analyze/scenarios/authorization.ts','utf8');assert.doesNotMatch(code,/recognizedFacts|laborStatement|factKey|sourceLines|\.normalize\([^)]*\).*identity|fetch\s*\(|embedding|similarity|leak\.category|leak\.evidence\b/);
});

test('Evidence extractor must return the atomic field; missing output is not silently repaired',async()=>{
 let calls=0;const modules=productionModules(async()=>{calls++;return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(raw.evidence)}}]});});
 const response=await modules('src/app/api/analyze/evidence/route.ts').POST(new Request('http://localhost',{method:'POST',body:JSON.stringify({input:raw.input})}));
 assert.equal(response.status,502);assert.equal(calls,1);
});
test('producer schema restricts every atom ref to original source IDs and forbids aggregate records',()=>{
 const output=load('src/app/api/analyze/evidence/evidence.ts').createEvidenceOutputSchema(['src_allowed']);
 for(const branch of output.properties.authorization_atoms.items.anyOf)assert.deepEqual(Array.from(branch.properties.source_refs.items.enum),['src_allowed']);
 assert.ok(output.required.includes('authorization_atoms'));assert.equal(output.properties.authorization_records,undefined);
});
