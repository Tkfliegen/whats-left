import test from 'node:test';
import assert from 'node:assert/strict';
import {harness} from './helpers/analysis-harness.mjs';
import {laborDemo} from './helpers/labor-demo.mjs';

test('accepted empty Leak result ends safely without any downstream endpoint or fabricated result',async()=>{
 const f=laborDemo(),calls=[],evidenceBefore=JSON.stringify(f.evidence),findings={leaks:[],insufficient_evidence:[{topic:'Labor efficiency',reason:'No supplied target establishes inefficiency.'}]};
 const h=harness(async(url)=>{calls.push(url);if(url.endsWith('/evidence'))return Response.json({evidence:f.evidence});if(url.endsWith('/leaks'))return Response.json({leaks:findings});throw Error('Downstream must never execute after empty Leak');});
 h.render();const run=h.value.startAnalysis(f.note,f.note);
 for(let i=0;i<5;i++){await h.settle();if(h.timers.size)h.tick();}
 assert.equal(await run,false);h.render();
 assert.deepEqual(calls,['/api/analyze/evidence','/api/analyze/leaks']);assert.equal(h.value.isRunning,false);assert.equal(h.value.analysisError,'');
 assert.equal(h.value.analysisStatus.category,'more_data_needed');assert.match(h.value.analysisStatus.explanation,/no profit leak was confirmed/);
 assert.equal(h.value.scenarioResult,null);assert.equal(h.value.simulationResult,null);assert.equal(h.value.decisionGateResult,null);assert.equal(h.value.decisionResult,null);
 assert.equal(JSON.stringify(f.evidence),evidenceBefore);assert.deepEqual(JSON.parse(JSON.stringify(h.value.leakResult)),findings);h.unmount();
});
test('a confirmed source-backed finding still reaches Scenario normally',async()=>{
 const f=laborDemo(),calls=[];
 const h=harness(async(url)=>{calls.push(url);if(url.endsWith('/evidence'))return Response.json({evidence:f.evidence});if(url.endsWith('/leaks'))return Response.json({leaks:{leaks:[f.finding],insufficient_evidence:[]}});return Response.json({error:'Scenario provider unavailable'},{status:503});});
 h.render();const run=h.value.startAnalysis(f.note,f.note);
 for(let i=0;i<6;i++){await h.settle();if(h.timers.size)h.tick();}
 await run;assert.deepEqual(calls,['/api/analyze/evidence','/api/analyze/leaks','/api/analyze/scenarios']);h.unmount();
});
test('accepted abstention finishes tracing successfully without source payloads or downstream calls',async()=>{
 const f=laborDemo(),calls=[];
 const h=harness(async(url,options)=>{
  calls.push({url,body:JSON.parse(options.body)});
  if(url.endsWith('/evidence'))return Response.json({evidence:f.evidence},{headers:{'x-whats-left-trace':'SAFE.SIGNED'}});
  if(url.endsWith('/leaks'))return Response.json({leaks:{leaks:[],insufficient_evidence:[]}});
  if(url==='/api/observability/analysis')return Response.json({});
  throw Error('Unexpected downstream call');
 });
 h.render();const run=h.value.startAnalysis(f.note,f.note);
 for(let i=0;i<5;i++){await h.settle();if(h.timers.size)h.tick();}
 await run;await h.settle();assert.deepEqual(calls.map(call=>call.url),['/api/analyze/evidence','/api/analyze/leaks','/api/observability/analysis']);
 assert.deepEqual(calls.at(-1).body,{status:'complete'});h.unmount();
});
