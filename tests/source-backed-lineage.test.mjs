import {atomsFromRecords} from './helpers/authorization-atoms.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {productionModules,provenance,authorizationRecords} from './helpers/provenance.mjs';
const load=productionModules();
const scenario=load('src/app/api/analyze/scenarios/scenarios.ts');
const leakHelpers=load('src/app/api/analyze/leaks/leaks.ts');
const authHelpers=load('src/app/api/analyze/scenarios/authorization.ts');
const saved=JSON.parse(readFileSync('tests/fixtures/provenance-recorded-cornhead.json','utf8'));
const base=JSON.parse(readFileSync('tests/fixtures/scenarios-bagel.json','utf8'));
const plain=x=>JSON.parse(JSON.stringify(x));
const sourceIds=e=>e.provenance.items.filter(i=>i.source.startsWith('source_input[')).map(i=>i.id);
const changes=body=>scenario.buildScenarioInput(body).authorized_changes;
const fact=(e,index)=>e.provenance.citable_facts.find(f=>f.source_refs.length===1&&f.source_refs[0]===sourceIds(e)[index]);
const request=body=>new Request('http://localhost',{method:'POST',body:JSON.stringify(body)});
const completion=result=>Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(result)}}]});
function recorded(){
  const evidence=structuredClone(saved.evidence);evidence.provenance=provenance.createEvidenceProvenance(evidence,saved.source_input);
  evidence.provenance.authorization_records=authorizationRecords(evidence,{sales:8,cost:8,laborPermission:18,current:13,target:14,wastePermission:19});
  const leaks=structuredClone(saved.recorded_leaks);
  leaks.leaks.forEach((leak,index)=>{leak.evidence_refs=saved.original_source_indices_by_leak[index].map(i=>fact(evidence,i).id);});
  return {evidence,leaks,operational_context:provenance.sourceStatements(saved.source_input)};
}

test('same original input creates stable unique source/fact IDs regardless of model paraphrases or extracted fact ordering',()=>{
  const a=recorded().evidence,b=structuredClone(a);b.facts=['The target waste rate is 5%.','Completely different summary.'];b.costs.items.reverse();
  b.provenance=provenance.createEvidenceProvenance(b,saved.source_input);
  assert.deepEqual(Array.from(sourceIds(a)),Array.from(sourceIds(b)));
  assert.deepEqual(plain(a.provenance.citable_facts),plain(b.provenance.citable_facts));
  assert.equal(new Set(a.provenance.citable_facts.map(f=>f.id)).size,a.provenance.citable_facts.length);
  assert.equal(new Set(a.provenance.items.map(f=>f.id)).size,a.provenance.items.length);
  for(const f of a.provenance.citable_facts){assert.ok(f.id.startsWith('fact_'));assert.ok(f.source_refs.length>0);assert.ok(f.source_refs.every(id=>sourceIds(a).includes(id)));}
});
test('Leak schema contains fact IDs only, excluding raw source IDs and model-prose item IDs',()=>{
  const e=recorded().evidence,ids=leakHelpers.createLeakSchema(e).properties.leaks.items.properties.evidence_refs.items.enum;
  assert.deepEqual(Array.from(ids),Array.from(e.provenance.citable_facts,f=>f.id));
  assert.ok(ids.every(id=>id.startsWith('fact_')));assert.ok(e.provenance.items.every(item=>!ids.includes(item.id)));
});
test('recorded Waste paraphrase and Labor title/category variants resolve fact IDs to the required original source set',()=>{
  const body=recorded();body.leaks.leaks[1].title='A quiet-shift staffing mismatch';body.leaks.leaks[1].category='operations';
  assert.ok(body.leaks.leaks[0].evidence.includes("The business's stated internal target is 5% waste rate."));
  assert.equal(fact(body.evidence,14).text,"The business's stated internal target is 5%.");
  const built=scenario.buildScenarioInput(body);assert.equal(built.authorized_changes.length,2);
  const labor=built.authorized_changes.find(a=>a.variable_id==='tuesday_evening_headcount');assert.equal(labor.value,-1);assert.equal(labor.from,null);
  const waste=built.authorized_changes.find(a=>a.variable_id==='ingredient_waste_rate');assert.equal(waste.from,9);assert.equal(waste.value,5);
  for(const authorization of built.authorized_changes)assert.ok(authorization.source_refs.every(id=>id.startsWith('src_')));
  assert.equal(built.authorized_changes.some(a=>a.target_leak===body.leaks.leaks[2].title),false);
});
for(const [name,mutate] of [
  ['unknown fact ID',b=>b.leaks.leaks[0].evidence_refs.push('fact_forged_999')],
  ['raw source ID',b=>b.leaks.leaks[0].evidence_refs=[sourceIds(b.evidence)[13]]],
  ['model-prose item ID',b=>b.leaks.leaks[0].evidence_refs=[b.evidence.provenance.items.find(i=>i.source==='evidence.facts[8]').id]],
  ['missing lineage',b=>delete b.evidence.provenance.citable_facts[13].source_refs],
  ['empty lineage',b=>b.evidence.provenance.citable_facts[13].source_refs=[]],
  ['unknown lineage source',b=>b.evidence.provenance.citable_facts[13].source_refs=['src_invented_999']],
  ['forged known-source lineage',b=>b.evidence.provenance.citable_facts[13].source_refs=[sourceIds(b.evidence)[0]]],
  ['duplicated lineage',b=>b.evidence.provenance.citable_facts[13].source_refs.push(sourceIds(b.evidence)[13])],
  ['duplicate fact ID',b=>b.evidence.provenance.citable_facts[14].id=b.evidence.provenance.citable_facts[13].id],
  ['model-supplied source mapping',b=>b.leaks.leaks[0].source_refs=[sourceIds(b.evidence)[13]]],
  ['extra lineage metadata',b=>b.evidence.provenance.citable_facts[13].model_source='claimed'],
])test(`${name} fails closed without repairing or comparing explanation text`,()=>{
  const body=recorded();mutate(body);const before=JSON.stringify(body);
  assert.equal(scenario.isScenarioRequest(body),false);assert.equal(changes(body).length,0);assert.equal(JSON.stringify(body),before);
});
for(const index of [13,14,19])test(`Waste partial required source set refuses authorization (missing source ${index})`,()=>{
  const body=recorded();body.leaks.leaks[0].evidence_refs=body.leaks.leaks[0].evidence_refs.filter(id=>id!==fact(body.evidence,index).id);
  assert.equal(leakHelpers.isLeakResult(body.leaks,body.evidence),true);
  assert.equal(changes(body).some(a=>a.variable_id==='ingredient_waste_rate'),false);
});
for(const which of [0,1])test(`unrelated fact cannot authorize ${which===0?'Waste':'Labor'}`,()=>{
  const body=recorded();body.leaks.leaks[which].evidence_refs=[fact(body.evidence,0).id];
  assert.equal(changes(body).some(a=>a.variable_id===(which===0?'ingredient_waste_rate':'tuesday_evening_headcount')),false);
});
test('multi-source fact preserves and resolves the complete set, including both Waste rates',()=>{
  const body=recorded(),p=body.evidence.provenance;
  const group=p.citable_facts.find(f=>f.source_refs.length===2&&f.source_refs.includes(sourceIds(body.evidence)[13]));
  assert.ok(group);assert.deepEqual(Array.from(group.source_refs),[sourceIds(body.evidence)[13],sourceIds(body.evidence)[14]]);
  assert.deepEqual(Array.from(provenance.resolveEvidenceRefs(body.evidence,[group.id])),Array.from(group.source_refs));
  body.leaks.leaks[0].evidence_refs=[group.id,fact(body.evidence,19).id];
  assert.equal(changes(body).some(a=>a.variable_id==='ingredient_waste_rate'),true);
  group.source_refs.pop();assert.equal(provenance.isEvidence(body.evidence,true),false);assert.equal(changes(body).length,0);
});
test('overlapping fact views deterministically union all source refs without dropping any',()=>{
  const body=recorded(),p=body.evidence.provenance,group=p.citable_facts.find(f=>f.source_refs.includes(sourceIds(body.evidence)[13])&&f.source_refs.length===2);
  const refs=provenance.resolveEvidenceRefs(body.evidence,[fact(body.evidence,13).id,group.id]);
  assert.deepEqual(Array.from(refs),Array.from(group.source_refs));
});
test('duplicate original authority still refuses authorization after lineage resolution',()=>{
  const body=recorded();body.evidence.provenance=provenance.createEvidenceProvenance(body.evidence,saved.source_input+'\nWaste rate may be tested from the current 9% toward the stated 5% target.');
  body.leaks.leaks[0].evidence_refs=body.evidence.provenance.citable_facts.map(f=>f.id);
  assert.equal(changes(body).some(a=>a.variable_id==='ingredient_waste_rate'),false);
});
test('model extraction cannot inject lineage or overwrite the citable fact table',async()=>{
  const model={...saved.evidence,provenance:{citable_facts:[{id:'fact_fake',source_refs:['src_fake'],text:'Claim'}]}};let calls=0;
  const modules=productionModules(async()=>{calls++;return completion(model);});
  const response=await modules('src/app/api/analyze/evidence/route.ts').POST(request({input:saved.source_input}));
  assert.equal(response.status,502);assert.equal(calls,1);
});
test('recorded case replays through all production routes with source-backed fact refs; original model IDs reject',async()=>{
  const body=recorded();let providers=[];
  const modules=productionModules(async(_url,options)=>{
    const payload=JSON.parse(options.body),name=payload.response_format.json_schema.name;providers.push(name);
    if(name==='evidence')return completion({...saved.evidence,authorization_atoms:atomsFromRecords(body.evidence.provenance.authorization_records)});
    if(name==='leak_detective_v1'){
      const supplied=JSON.parse(payload.messages[1].content);assert.equal(supplied.evidence.provenance,undefined);assert.deepEqual(supplied.citable_facts,plain(body.evidence.provenance.citable_facts.map(({id,text})=>({id,text}))));assert.doesNotMatch(JSON.stringify(supplied),/src_[a-f0-9]+_|ev_[a-f0-9]+_|source_refs/);
      assert.ok(body.leaks.leaks.every(l=>l.evidence_refs.every(id=>payload.response_format.json_schema.schema.properties.leaks.items.properties.evidence_refs.items.enum.includes(id))));
      return completion(body.leaks);
    }
    const input=JSON.parse(payload.messages[1].content);
    if(name==='scenario_agent_v1'){
      // This legacy source has no explicit unchanged-schedule atom; only Waste assembles.
      assert.equal(input.authorized_changes.length,1);assert.equal(input.authorized_changes[0].authorization_id,'ingredient_waste_rate_target');
      return completion({scenarios:input.authorized_changes.map(c=>({title:'Test '+c.variable_label,target_leak:c.target_leak,controlled_changes:[{variable:c.variable_label,change_type:c.change_type,from:c.from,value:c.value,unit:c.unit}],available_input_refs:c.source_refs,missing_calculation_inputs:['Authoritative calculation inputs'],confidence:'high'})),not_simulation_ready:input.confirmed_leaks.filter(title=>!input.authorized_changes.some(a=>a.target_leak===title)).map(title=>({target_leak:title,reason:'Missing explicit supported permission or schedule constraint.',missing_decision_input_categories:['Explicit permission and constraints']}))});
    }
    if(name==='decision_agent_v1')return completion({decision_status:'needs_more_data',recommendation:{type:'collect_data',candidate_id:null,title:input.recommendation_contract.title,rationale:'More data is needed because no calculable scenarios exist.'},comparison:input.comparison_sources.map(c=>({...c,assessment:'Authoritative calculation inputs remain missing.'})),priority_inputs:input.priority_input_options,confidence:'high'});
    throw Error('Unexpected provider call');
  });
  const invoke=async(name,input)=>{const response=await modules(`src/app/api/analyze/${name}/route.ts`).POST(request(input));const value=await response.json();assert.equal(response.status,200,JSON.stringify(value));return value;};
  const {evidence}=await invoke('evidence',{input:saved.source_input});assert.equal(evidence.currency,'USD');
  const {leaks}=await invoke('leaks',{evidence,operational_context:body.operational_context});
  assert.equal(leakHelpers.isLeakResult(saved.recorded_leaks,evidence),false,'old model-prose IDs must not silently acquire lineage');
  const scenarioResult=await invoke('scenarios',{evidence,leaks,operational_context:body.operational_context});
  assert.equal(scenarioResult.scenarios.scenarios.length,1);assert.equal(scenarioResult.scenarios.not_simulation_ready.length,2);
  const simulation=await invoke('simulate',{evidence,...scenarioResult});assert.equal(simulation.results.length,1);assert.ok(simulation.results.every(r=>r.status==='not_calculable_yet'&&r.calculation===null));
  const gateRequest={evidence,scenarios:scenarioResult.scenarios,simulation};const gate=await invoke('decision-gate',gateRequest);
  assert.equal(gate.decision_gate,'needs_more_data');assert.equal(gate.top_candidate_id,null);
  const result=await invoke('decision',{...gateRequest,leaks,decision_gate:gate});assert.equal(result.decision.recommendation.type,'collect_data');assert.equal(result.decision.recommendation.candidate_id,null);
  assert.deepEqual(providers,['evidence','leak_detective_v1','scenario_agent_v1','decision_agent_v1']);
});
test('authorization identity has no text fallback or model source attribution',()=>{
  const code=readFileSync('src/app/api/analyze/scenarios/authorization.ts','utf8');
  assert.match(code,/resolveEvidenceRefs\(input\.evidence, leak\.evidence_refs\)/);
  assert.doesNotMatch(code,/leak\.evidence\b|leak\.category\b|leak\.source_refs\b|embedding|cosine|levenshtein|similarity/);
  const lineage=readFileSync('src/app/api/analyze/evidence/provenance.ts','utf8');assert.doesNotMatch(lineage,/evidence\.facts.*(?:find|includes)|fetch\s*\(|embedding|levenshtein/);
  assert.ok(authHelpers.buildScenarioAuthorizations(base,scenario.buildScenarioInput(base).input_facts).length===2);
});
