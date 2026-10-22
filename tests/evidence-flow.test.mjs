import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {harness} from './helpers/analysis-harness.mjs';

const evidence = {
  business_type:'bagel shop',period:'last month',currency:'$',
  revenue:{total:100000,items:[]},costs:{total:95800,items:[{name:'Labor',amount:34000,reported_category:null,source_text:'Labor was $34,000'}]},
  facts:[],assumptions:[],missing_information:['Packaging amount'],confidence:'high',
};
const leakResult={leaks:[{title:'Supported staffing mismatch',category:'labor',evidence:['Staffing exceeds demand'],interpretation:'Staffing does not match demand.',confidence:'high'}],insufficient_evidence:[{topic:'Rent',reason:'No comparison supplied.'}]};
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
const plain=value=>JSON.parse(JSON.stringify(value));

const fixture=JSON.parse(readFileSync(new URL('./fixtures/simulation-cornhead.json',import.meta.url),'utf8'));
const scenarioBody={scenarios:fixture.scenarios,input_facts:fixture.input_facts};
const simulationBody={results:fixture.scenarios.scenarios.map(s=>({scenario_title:s.title,target_leak:s.target_leak,controlled_changes:s.controlled_changes,status:'not_calculable_yet',calculation:null,missing_inputs:['Authoritative calculation input'],notes:[]}))};
const gate=JSON.parse(readFileSync(new URL('./fixtures/decision.json',import.meta.url),'utf8')).cornhead.decision_gate;
const decision={decision_status:'needs_more_data',recommendation:{type:'collect_data',candidate_id:null,title:'Collect required inputs',rationale:'The gate requires additional inputs.'},comparison:[],priority_inputs:[],confidence:'low'};
const successful=url=>Response.json(url.endsWith('/evidence')?{evidence}:url.endsWith('/leaks')?{leaks:leakResult}:url.endsWith('/scenarios')?scenarioBody:url.endsWith('/decision-gate')?gate:url.endsWith('/decision')?{decision}:simulationBody);
async function beginScenario(h){h.render();const run=h.value.startAnalysis('Business input','User notes');await h.settle();h.tick();await h.settle();h.tick();await h.settle();return {run};}
const complete=async h=>{if(h.value.workflow.phase==='handoff')assert.equal(h.tick(),1150);await h.settle();assert.equal(h.value.stage,'complete');assert.equal(h.timers.size,0);};

test('Evidence -> Leak -> Scenario -> calculator sequencing waits for requests and blocks duplicate submits',async()=>{
  const requests=Array.from({length:6},deferred),calls=[];
  const h=harness((url,options)=>{calls.push({url,body:JSON.parse(options.body)});return requests[calls.length-1].promise;});
  h.render();const notes='Orders average $18.40. User context.';const run=h.value.startAnalysis('Business input',notes);h.render();
  assert.equal(h.value.stage,'evidence');assert.equal(h.timers.size,0);await h.value.startAnalysis('duplicate');assert.equal(calls.length,1);
  requests[0].resolve(Response.json({evidence}));await h.settle();assert.equal(h.tick(),1150);await h.settle();assert.equal(h.value.stage,'leaks');
  requests[1].resolve(Response.json({leaks:leakResult}));await h.settle();assert.equal(h.value.workflow.phase,'handoff');assert.equal(h.tick(),1150);await h.settle();
  assert.equal(h.value.stage,'scenario');assert.equal(h.value.workflow.phase,'working');assert.equal(h.timers.size,0);
  assert.deepEqual(calls[2].body,{evidence,leaks:leakResult,operational_context:['Orders average $18.40.','User context.']});
  assert.equal(h.value.scenarioResult,null);assert.equal(calls.length,3);
  requests[2].resolve(Response.json(scenarioBody));await h.settle();
  assert.deepEqual(plain(h.value.scenarioResult),scenarioBody);assert.equal(h.value.simulationResult,null);
  assert.equal(h.value.stage,'scenario');assert.equal(h.value.workflow.phase,'working');assert.equal(h.value.workflow.index,2);assert.equal(h.timers.size,0);
  assert.deepEqual(calls[3].body,{evidence,scenarios:fixture.scenarios,input_facts:fixture.input_facts});
  await h.value.startAnalysis('duplicate during calculator');h.render();assert.equal(calls.length,4);assert.equal(h.value.isRunning,true);
  requests[3].resolve(Response.json(simulationBody));await h.settle();
  assert.deepEqual(plain(h.value.simulationResult),simulationBody);assert.equal(h.value.workflow.phase,'handoff');h.tick();await h.settle();requests[4].resolve(Response.json(gate));await h.settle();requests[5].resolve(Response.json({decision}));await run;await complete(h);assert.equal(h.value.isRunning,false);
  assert.deepEqual(calls.map(c=>c.url),['/api/analyze/evidence','/api/analyze/leaks','/api/analyze/scenarios','/api/analyze/simulate','/api/analyze/decision-gate','/api/analyze/decision']);h.unmount();
});
for(const stage of ['evidence','leaks'])test(`${stage} failure preserves earlier state and never calls later agents`,async()=>{
  const calls=[];const h=harness(url=>{calls.push(url);return Promise.resolve(url.endsWith('/'+stage)?Response.json({error:'private'},{status:502}):successful(url));});
  h.render();const run=h.value.startAnalysis('preserved input');await h.settle();if(stage==='leaks'){h.tick();await h.settle();}await run;h.render();
  assert.equal(h.value.isRunning,false);assert.equal(h.timers.size,0);assert.equal(h.value.leakResult,null);assert.equal(h.value.scenarioResult,null);
  if(stage==='leaks')assert.deepEqual(plain(h.value.evidenceResult),evidence);
  assert.equal(calls.length,stage==='evidence'?1:2);assert.doesNotMatch(h.value.analysisError,/private/);h.unmount();
});
for(const stage of ['scenarios','simulate'])for(const failure of ['HTTP 502','network','invalid JSON','invalid envelope'])test(`${stage} ${failure} stops at Scenario, preserves completed results, and permits retry`,async()=>{
  let fail=true;const calls=[];
  const h=harness(async url=>{
    calls.push(url);
    if(fail&&url.endsWith('/'+stage)){
      if(failure==='HTTP 502')return Response.json({error:'private provider details'},{status:502});
      if(failure==='network')throw Error('private details');
      if(failure==='invalid JSON')return new Response('{');
      return Response.json({});
    }
    return successful(url);
  });
  const {run}=await beginScenario(h);await run;h.render();
  assert.equal(h.value.stage,'scenario');assert.equal(h.value.workflow.phase,'idle');assert.equal(h.value.isRunning,false);assert.equal(h.timers.size,0);
  assert.deepEqual(plain(h.value.evidenceResult),evidence);assert.deepEqual(plain(h.value.leakResult),leakResult);
  assert.equal(h.value.simulationResult,null);assert.equal(calls.length,stage==='scenarios'?3:4);
  if(stage==='simulate')assert.deepEqual(plain(h.value.scenarioResult),scenarioBody);else assert.equal(h.value.scenarioResult,null);
  assert.match(h.value.analysisError,/Scenario.*Please try again/);assert.doesNotMatch(h.value.analysisError,/private/);
  if(failure==='HTTP 502')assert.match(h.value.analysisError,/HTTP 502/);
  fail=false;const retry=await beginScenario(h);await complete(h);await retry.run;assert.equal(h.value.analysisError,'');h.unmount();
});
test('missing/mismatched calculator results are rejected rather than allowing a demo fallback or Decision',async()=>{
  for(const results of [[],[{...simulationBody.results[0],target_leak:'Unknown'}],simulationBody.results.map(r=>({...r,scenario_title:'Wrong title'}))]){
    const h=harness(async url=>url.endsWith('/simulate')?Response.json({results}):successful(url));
    const {run}=await beginScenario(h);await run;h.render();assert.equal(h.value.stage,'scenario');assert.equal(h.value.workflow.phase,'idle');assert.equal(h.value.simulationResult,null);assert.ok(h.value.scenarioResult);h.unmount();
  }
});
test('zero real scenarios and empty notes remain empty, without fabricated fallback',async()=>{
  const calls=[];const h=harness(async(url,options)=>{
    calls.push(JSON.parse(options.body));
    if(url.endsWith('/scenarios'))return Response.json({scenarios:{scenarios:[],not_simulation_ready:[]},input_facts:[]});
    if(url.endsWith('/simulate'))return Response.json({results:[]});return successful(url);
  });
  h.render();const run=h.value.startAnalysis('Business');await h.settle();h.tick();await h.settle();h.tick();await h.settle();await complete(h);await run;h.render();
  assert.deepEqual(calls[1].operational_context,[]);assert.deepEqual(calls[2].operational_context,[]);assert.equal(h.value.scenarioResult.scenarios.scenarios.length,0);h.unmount();
});
for(const stage of ['scenarios','simulate'])test(`unmount during ${stage} aborts the request and ignores a late response`,async()=>{
  const pending=deferred();let signal;const calls=[];
  const h=harness((url,options)=>{calls.push(url);if(url.endsWith('/'+stage)){signal=options.signal;return pending.promise;}return Promise.resolve(successful(url));});
  const {run}=await beginScenario(h);assert.equal(h.value.workflow.phase,'working');h.unmount();assert.equal(signal.aborted,true);
  pending.resolve(successful('/'+stage));await run;h.render();assert.equal(h.value.simulationResult,null);assert.equal(h.timers.size,0);assert.equal(calls.length,stage==='scenarios'?3:4);
});
test('unmount during real-stage handoff cancels its timer',async()=>{
  const calls=[];const h=harness(async url=>{calls.push(url);return successful(url);});h.render();const run=h.value.startAnalysis('notes');await h.settle();h.unmount();await run;assert.equal(h.timers.size,0);assert.equal(calls.length,1);
});
test('unreported Leak numbers remain rejected before Scenario',async()=>{
  const h=harness(async url=>url.endsWith('/leaks')?Response.json({leaks:{...leakResult,insufficient_evidence:[{topic:'Profit',reason:'$4,200 surplus'}]}}):successful(url));
  h.render();const run=h.value.startAnalysis('notes');await h.settle();h.tick();await run;h.render();assert.equal(h.value.stage,'leaks');assert.equal(h.value.scenarioResult,null);h.unmount();
});
for(const stage of ['evidence','leaks'])for(const kind of ['network','invalid JSON','invalid envelope'])test(`existing ${stage} ${kind} protection remains intact`,async()=>{
  const calls=[];const h=harness(async url=>{
    calls.push(url);if(url.endsWith('/'+stage)){
      if(kind==='network')throw Error('private details');
      if(kind==='invalid JSON')return new Response('{');
      return Response.json(stage==='evidence'?{evidence:{}}:{leaks:{}});
    }return successful(url);
  });
  h.render();const run=h.value.startAnalysis('notes');await h.settle();if(stage==='leaks'){h.tick();await h.settle();}await run;h.render();
  assert.equal(h.value.workflow.phase,'idle');assert.equal(h.timers.size,0);assert.equal(h.value.isRunning,false);assert.equal(h.value.scenarioResult,null);assert.equal(calls.length,stage==='evidence'?1:2);h.unmount();
});
test('existing pending Leak unmount cancellation remains intact',async()=>{
  const pending=deferred();let signal;const h=harness((url,options)=>{if(url.endsWith('/leaks')){signal=options.signal;return pending.promise;}return Promise.resolve(successful(url));});
  h.render();const run=h.value.startAnalysis('notes');await h.settle();h.tick();await h.settle();h.unmount();assert.equal(signal.aborted,true);
  pending.resolve(successful('/leaks'));await run;h.render();assert.equal(h.value.leakResult,null);assert.equal(h.value.scenarioResult,null);assert.equal(h.timers.size,0);
});

test('provenance ID digits cannot supply an invented Leak numeric claim',async()=>{
  const withIds={...evidence,provenance:{source_input:'Reported context',items:[{id:'ev_987654_01',source:'source_input[0]',text:'Reported context'}]}};
  const findings=structuredClone(leakResult);findings.leaks[0].evidence_refs=['ev_987654_01'];findings.leaks[0].interpretation='Invented savings of $987654';
  const calls=[];const h=harness(async url=>{calls.push(url);return Response.json(url.endsWith('/evidence')?{evidence:withIds}:{leaks:findings});});
  h.render();const run=h.value.startAnalysis('Reported context','Reported context');await h.settle();h.tick();await h.settle();await run;h.render();
  assert.equal(calls.length,2);assert.equal(h.value.leakResult,null);assert.equal(h.value.scenarioResult,null);assert.equal(h.value.isRunning,false);assert.ok(h.value.analysisError);h.unmount();
});
