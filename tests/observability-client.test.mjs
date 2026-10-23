import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {harness} from './helpers/analysis-harness.mjs';
const compile=file=>ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function client(fetcher){const exports={};vm.runInNewContext(compile('src/lib/observability/client.ts'),{exports,fetch:fetcher});return exports.createAnalysisTrace();}
test('disabled/untraced responses generate no completion request or correlation header',()=>{
 let calls=0;const t=client(()=>{calls++;throw Error();});t.observe(Response.json({}));t.finish('complete');assert.equal(calls,0);assert.deepEqual(JSON.parse(JSON.stringify(t.headers())),{'Content-Type':'application/json'});
});
test('signed context is opaque and completion is metadata-only, nonblocking and fail-open',async()=>{
 const calls=[],t=client((url,options)=>{calls.push({url,...options});return Promise.reject(Error('PRIVATE_TRANSPORT'));});
 t.observe(Response.json({},{headers:{'x-whats-left-trace':'opaque.signature'}}));t.finish('failed');await new Promise(setImmediate);
 assert.equal(calls.length,1);assert.equal(calls[0].url,'/api/observability/analysis');assert.equal(calls[0].keepalive,true);assert.equal(calls[0].body,'{"status":"failed"}');assert.equal(t.headers()['x-whats-left-trace'],'opaque.signature');
 const sync=client(()=>{throw Error('PRIVATE_TRANSPORT');});sync.observe(Response.json({},{headers:{'x-whats-left-trace':'opaque.signature'}}));assert.doesNotThrow(()=>sync.finish('complete'));
});
test('frontend failure preserves the input/error and reports no source data to telemetry',async()=>{
 const calls=[],h=harness(async(url,options)=>{calls.push({url,...options});return url.includes('/api/analyze/')?Response.json({error:'provider failed'},{status:502,headers:{'x-whats-left-trace':'opaque.signature'}}):new Response(null,{status:204});});
 h.render();await h.value.startAnalysis('PRIVATE_SOURCE_NOTE','PRIVATE_NOTE');h.render();assert.equal(h.value.workflow.complete,false);assert.match(h.value.analysisError,/Evidence/);
 assert.equal(calls.length,2);assert.equal(calls[1].url,'/api/observability/analysis');assert.equal(calls[1].body,'{"status":"failed"}');assert.doesNotMatch(calls[1].body,/PRIVATE/);h.unmount();
});
const fixture=JSON.parse(fs.readFileSync('tests/fixtures/decision.json')).cornhead;
function decision(input){const gate=input.decision_gate;return {decision_status:'needs_more_data',recommendation:{type:'collect_data',candidate_id:null,title:'Collect required decision inputs',rationale:'The Decision Gate requires more data.'},comparison:[...gate.candidates.map(c=>({candidate_id:c.candidate_id,target_leak:c.target_leak,scenario_status:c.scenario_status,verified_impact:c.verified_impact,currency:c.currency,assessment:'Readiness and impact are supplied upstream.'})),...gate.not_simulation_ready.map(c=>({candidate_id:null,target_leak:c.target_leak,scenario_status:'not_simulation_ready',verified_impact:null,currency:null,assessment:c.reason}))],priority_inputs:gate.missing_decision_inputs.map(key=>({source_type:'upstream_missing_input',key,why_it_matters:'Needed to establish the supplied decision prerequisite.'})),confidence:'low'};}
async function run(traced,throwingHeader=false){
 const calls=[],h=harness(async(url,options)=>{
  calls.push({url,body:JSON.parse(options.body),headers:options.headers});
  if(url==='/api/observability/analysis')return new Response(null,{status:204});
  const body=url.endsWith('/evidence')?{evidence:fixture.evidence}:url.endsWith('/leaks')?{leaks:fixture.leaks}:url.endsWith('/scenarios')?{scenarios:fixture.scenarios,input_facts:[]}:url.endsWith('/simulate')?fixture.simulation:url.endsWith('/decision-gate')?fixture.decision_gate:{decision:decision(fixture)};
  const response=Response.json(body,{headers:traced&&url.endsWith('/evidence')?{'x-whats-left-trace':'opaque.signature'}:{}});
  if(throwingHeader&&url.endsWith('/evidence'))Object.defineProperty(response,'headers',{value:{get(){throw Error('Correlation header unavailable');}}});
  return response;
 });
 h.render();const work=h.value.startAnalysis(JSON.stringify(fixture),'Original source notes');await h.settle();h.tick();await h.settle();h.tick();await h.settle();h.tick();await work;h.render();
 const value=JSON.parse(JSON.stringify({stage:h.value.stage,evidence:h.value.evidenceResult,leaks:h.value.leakResult,scenarios:h.value.scenarioResult,simulation:h.value.simulationResult,gate:h.value.decisionGateResult,decision:h.value.decisionResult,error:h.value.analysisError}));h.unmount();return {calls,value};
}
test('full frontend flow retains exact six analysis payloads, stage order and final outputs when tracing is enabled',async()=>{
 const off=await run(false),on=await run(true);
 assert.equal(off.value.stage,'complete');assert.deepEqual(on.value,off.value);assert.equal(off.calls.length,6);assert.equal(on.calls.length,7);
 assert.deepEqual(on.calls.slice(0,6).map(({url,body})=>({url,body})),off.calls.map(({url,body})=>({url,body})));
 assert.ok(on.calls.slice(1,6).every(c=>c.headers['x-whats-left-trace']==='opaque.signature'));assert.equal(on.calls.at(-1).body.status,'complete');
});
test('throwing correlation header access is isolated and the product still completes unchanged',async()=>{
 const baseline=await run(false),failedCorrelation=await run(false,true);
 assert.equal(failedCorrelation.value.stage,'complete');assert.equal(failedCorrelation.value.error,'');
 assert.deepEqual(failedCorrelation.value,baseline.value);
 assert.deepEqual(JSON.parse(JSON.stringify(failedCorrelation.calls)),JSON.parse(JSON.stringify(baseline.calls)));
});
