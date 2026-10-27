import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import {renderToStaticMarkup} from 'react-dom/server';
import {harness} from './helpers/analysis-harness.mjs';

const fixtures=JSON.parse(readFileSync(new URL('./fixtures/decision.json',import.meta.url),'utf8'));
const plain=value=>JSON.parse(JSON.stringify(value));
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
function decisionFor(input){
  const gate=input.decision_gate,action=gate.decision_gate==='action_allowed';
  return {decision_status:action?'actionable':'needs_more_data',recommendation:{type:action?'business_action':'collect_data',candidate_id:action?gate.top_candidate_id:null,title:action?gate.candidates.find(c=>c.candidate_id===gate.top_candidate_id).scenario_title:'Collect required decision inputs',rationale:action?'The decision gate allows an action recommendation.':'The decision gate requires more data.'},
    comparison:[...gate.candidates.map(c=>({candidate_id:c.candidate_id,target_leak:c.target_leak,scenario_status:c.scenario_status,verified_impact:c.verified_impact,currency:c.currency,assessment:'Readiness and impact are supplied upstream.'})),...gate.not_simulation_ready.map(c=>({candidate_id:null,target_leak:c.target_leak,scenario_status:'not_simulation_ready',verified_impact:null,currency:null,assessment:c.reason}))],
    priority_inputs:[...gate.missing_decision_inputs.map(key=>({source_type:'upstream_missing_input',key,why_it_matters:'Needed to establish the supplied decision prerequisite.'})),...gate.policy_required_inputs.map(c=>({source_type:'policy_required_input',key:c.category,why_it_matters:'Needed to compare the close decision under the supplied policy.'}))],confidence:action?'high':'low'};
}
const input=fixtures.cornhead;
const scenarioBody={scenarios:input.scenarios,input_facts:[]};
function success(url){return Response.json(url.endsWith('/evidence')?{evidence:input.evidence}:url.endsWith('/leaks')?{leaks:input.leaks}:url.endsWith('/scenarios')?scenarioBody:url.endsWith('/simulate')?input.simulation:url.endsWith('/decision-gate')?input.decision_gate:{decision:decisionFor(input)});}
async function reachDecision(h){h.render();const run=h.value.startAnalysis(JSON.stringify(input),'User notes');await h.settle();h.tick();await h.settle();h.tick();await h.settle();assert.equal(h.value.workflow.phase,'handoff');h.tick();await h.settle();return {run};}

const compile=source=>ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const display={exports:{}};vm.runInNewContext(compile(readFileSync('src/lib/decision-display.ts','utf8')),display);
const scenarioDisplay={exports:{}};vm.runInNewContext(compile(readFileSync('src/lib/scenario-display.ts','utf8')),scenarioDisplay);
const source=readFileSync('src/components/decision-panel.tsx','utf8');
const component={exports:{},require:s=>s==='react/jsx-runtime'?jsxRuntime:s==='@/lib/scenario-display'?scenarioDisplay.exports:display.exports};vm.runInNewContext(compile(source),component);
const render=(result,failed=false)=>renderToStaticMarkup(React.createElement(component.exports.DecisionPanel,{result,failed}));

test('Simulation -> Gate -> Decision sequencing stores exact provenance; workstation stays active and duplicate clicks are blocked',async()=>{
  const simulation=deferred(),gate=deferred(),decision=deferred(),calls=[];
  const h=harness((url,options)=>{calls.push({url,body:JSON.parse(options.body)});return url.endsWith('/simulate')?simulation.promise:url.endsWith('/decision-gate')?gate.promise:url.endsWith('/decision')?decision.promise:Promise.resolve(success(url));});
  h.render();const run=h.value.startAnalysis(JSON.stringify(input),'User notes');await h.settle();h.tick();await h.settle();h.tick();await h.settle();
  assert.equal(calls.length,4);assert.equal(h.value.stage,'scenario');assert.equal(h.timers.size,0);
  simulation.resolve(success('/simulate'));await h.settle();assert.equal(calls.length,4);h.tick();await h.settle();
  assert.equal(h.value.stage,'decision');assert.equal(h.value.workflow.index,3);assert.equal(h.value.workflow.phase,'working');assert.equal(h.value.workflow.complete,false);assert.equal(h.timers.size,0);
  assert.deepEqual(calls[4].body,{evidence:input.evidence,scenarios:input.scenarios,simulation:input.simulation});
  await h.value.startAnalysis('duplicate Gate');assert.equal(calls.length,5);
  const exactGate=structuredClone(input.decision_gate);exactGate.reason_codes.reverse();exactGate.missing_decision_inputs.reverse();
  gate.resolve(Response.json(exactGate));await h.settle();
  assert.deepEqual(plain(h.value.decisionGateResult),exactGate);
  assert.deepEqual(calls[5].body,{evidence:input.evidence,leaks:input.leaks,scenarios:input.scenarios,simulation:input.simulation,decision_gate:exactGate});
  assert.equal(h.value.workflow.index,3);assert.equal(h.value.workflow.phase,'working');assert.equal(h.value.stage,'decision');assert.equal(h.value.decisionResult,null);assert.equal(h.value.isRunning,true);assert.equal(h.timers.size,0);
  await h.value.startAnalysis('duplicate Decision');assert.equal(calls.length,6);
  decision.resolve(success('/decision'));await run;h.render();
  assert.equal(h.value.stage,'complete');assert.equal(h.value.workflow.complete,true);assert.equal(h.value.isRunning,false);
  assert.deepEqual(plain(h.value.decisionResult),decisionFor(input));assert.equal(h.timers.size,0);h.unmount();
});
for(const stage of ['decision-gate','decision'])for(const failure of ['HTTP 502','network','invalid JSON','invalid envelope'])test(`${stage} ${failure} preserves completed state, stops Decision, and permits a full fresh retry`,async()=>{
  const calls=[];let fail=true;
  const h=harness(async url=>{calls.push(url);if(fail&&url.endsWith('/'+stage)){
    if(failure==='HTTP 502')return Response.json({error:'private provider detail'},{status:502});
    if(failure==='network')throw Error('private provider detail');
    if(failure==='invalid JSON')return new Response('{');return Response.json({});
  }return success(url);});
  const {run}=await reachDecision(h);await run;h.render();
  assert.equal(h.value.stage,'decision');assert.equal(h.value.workflow.phase,'idle');assert.equal(h.value.workflow.complete,false);assert.equal(h.value.isRunning,false);assert.equal(h.timers.size,0);
  assert.deepEqual(plain(h.value.evidenceResult),input.evidence);assert.deepEqual(plain(h.value.leakResult),input.leaks);assert.deepEqual(plain(h.value.scenarioResult),scenarioBody);assert.deepEqual(plain(h.value.simulationResult),input.simulation);
  assert.equal(h.value.decisionResult,null);assert.equal(calls.length,stage==='decision-gate'?5:6);
  if(stage==='decision')assert.deepEqual(plain(h.value.decisionGateResult),input.decision_gate);else assert.equal(h.value.decisionGateResult,null);
  assert.match(h.value.analysisError,/Decision.*Please try again/);assert.doesNotMatch(h.value.analysisError,/private/);
  if(failure==='HTTP 502')assert.match(h.value.analysisError,/HTTP 502/);
  assert.doesNotMatch(render(h.value.decisionResult,true),/Recommended candidate|\$/);
  fail=false;const before=calls.length;const retry=await reachDecision(h);await retry.run;h.render();assert.equal(calls[before],'/api/analyze/evidence');assert.equal(h.value.stage,'complete');assert.equal(h.value.analysisError,'');h.unmount();
});
for(const stage of ['decision-gate','decision'])test(`unmount during ${stage} aborts and ignores late results`,async()=>{
  const pending=deferred();let signal;const calls=[];
  const h=harness((url,options)=>{calls.push(url);if(url.endsWith('/'+stage)){signal=options.signal;return pending.promise;}return Promise.resolve(success(url));});
  const {run}=await reachDecision(h);h.unmount();assert.equal(signal.aborted,true);pending.resolve(success('/'+stage));await run;h.render();
  assert.equal(h.value.stage,'decision');assert.equal(h.value.workflow.complete,false);assert.equal(h.value.decisionResult,null);assert.equal(calls.length,stage==='decision-gate'?5:6);assert.equal(h.timers.size,0);
});
test('Cornhead collect-data UI covers Labor, Waste and Delivery exactly once without a fake winner or null money',()=>{
  const html=render(decisionFor(input));assert.match(html,/Needs more data/);assert.match(html,/Collect required decision inputs/);assert.match(html,/low confidence/);
  assert.equal((html.match(/<article/g)||[]).length,3);assert.equal((html.match(/Impact needs more data/g)||[]).length,2);assert.equal((html.match(/Needs a controllable decision input/g)||[]).length,1);
  for(const row of decisionFor(input).comparison)assert.ok(html.includes(row.target_leak));
  for(const key of input.decision_gate.missing_decision_inputs)assert.ok(html.includes(key));
  assert.match(html,/Missing data/);assert.doesNotMatch(html,/Recommended candidate|Recommended next move|\$|N\/A|service risk|employee impact|customer impact|training cost|product quality|operational disruption/i);
});
test('close call displays only authoritative policy context, without selecting a winner or adding consequences',()=>{
  const html=render(decisionFor(fixtures.close_call));assert.match(html,/Needs more data/);assert.match(html,/Decision context/);assert.match(html,/Implementation cost/);assert.match(html,/Operational constraints/);assert.match(html,/\$800\.00/);assert.match(html,/\$770\.00/);
  assert.doesNotMatch(html,/Recommended candidate|implementation_cost|operational_constraints|service disruption|employee impact|training|ROI|\$30|10%/i);
});
test('clear winner renders backend recommendation, exact returned order and values, and marks only its exact candidate ID',()=>{
  const result=decisionFor(fixtures.clear_winner);result.comparison.reverse();const html=render(result);
  assert.match(html,/Actionable/);assert.match(html,/Recommended next move/);assert.ok(html.includes(result.recommendation.title));assert.match(html,/high confidence/);assert.match(html,/\$2,500\.00/);assert.match(html,/\$500\.00/);
  assert.equal((html.match(/Recommended candidate/g)||[]).length,1);assert.ok(html.indexOf(result.comparison[0].target_leak)<html.indexOf(result.comparison[1].target_leak));
  assert.doesNotMatch(html,/\$2,000|10%|ROI|annual|margin|gap percentage/i);
});
test('empty no-actionable priority inputs render safely; zero verified impact is distinct from null',()=>{
  const html=render(decisionFor(fixtures.empty));assert.match(html,/Needs more data/);assert.doesNotMatch(html,/Priority inputs|Recommended candidate|\$/);
  const result=decisionFor(fixtures.clear_winner);result.comparison[0].verified_impact=0;assert.match(render(result),/\$0\.00/);result.comparison[0].verified_impact=null;assert.doesNotMatch(render(result),/\$0\.00/);
});
test('transport guards reject malformed responses without modifying valid output',()=>{
  const gate=structuredClone(input.decision_gate),response={decision:decisionFor(input)},before=JSON.stringify({gate,response});
  assert.equal(display.exports.isDecisionGateResponse(gate),true);assert.equal(display.exports.isDecisionResponse(response),true);assert.equal(JSON.stringify({gate,response}),before);
  for(const v of [null,{}, {decision:{}},{decision:{...response.decision,comparison:[{verified_impact:Infinity}]}}])assert.equal(display.exports.isDecisionResponse(v),false);
  for(const v of [null,{}, {...gate,candidates:null},{...gate,policy_required_inputs:[{}]}])assert.equal(display.exports.isDecisionGateResponse(v),false);
});
test('actual dashboard renders real Decision, footer is current, and Decision presentation adds no policy or financial logic',()=>{
  const dashboard=readFileSync('src/components/dashboard.tsx','utf8'),office=readFileSync('src/components/agent-office.tsx','utf8'),hook=readFileSync('src/components/use-demo-analysis.ts','utf8');
  assert.match(dashboard,/<DecisionPanel result=\{decisionResult\}/);assert.match(dashboard,/AI analysis with deterministic validation and scenario calculations/);
  assert.doesNotMatch(dashboard+office,/illustrative|demo decision|fake winner/i);
  assert.doesNotMatch(source+hook,/\.sort\s*\(|compareImpactGap|evaluateDecisionGate|0\.1\b|10%|impact_value\s*[-+*/]|verified_impact\s*[-+*/]/);
  assert.doesNotMatch(source,/impact below threshold|savings above threshold|result meets action threshold/i);
  assert.match(source,/sm:grid-cols-2 xl:grid-cols-3/);assert.match(source,/overflow-wrap:anywhere/);assert.match(source,/min-w-0/);
  assert.match(office,/index === active && phase === "working"/);assert.match(office,/analysisError && index === active \? "stopped"/);
});
test('long and dynamic content keeps every comparison and priority, without fixed widths',()=>{
  const result=decisionFor(input);result.recommendation.title='LongTitle'.repeat(100);result.comparison.push({...result.comparison[0],candidate_id:'candidate_99'});result.priority_inputs=[];
  assert.equal((render(result).match(/<article/g)||[]).length,4);assert.doesNotMatch(source,/w-\[\d+px\]|min-w-\[\d+px\]/);
});

test('needs-more-data hierarchy puts the valid conclusion, why and priority inputs before comparison',()=>{
  const html=render(decisionFor(input));
  assert.match(html,/<h4[^>]*>More data needed before a confident decision<\/h4>/);
  assert.ok(html.indexOf('Why')<html.indexOf('Priority inputs'));
  assert.ok(html.indexOf('Priority inputs')<html.indexOf('Scenario comparison'));
  assert.doesNotMatch(html,/role="alert"|text-red|bg-red|error|failed/i);
});
test('actionable hierarchy shows recommendation then verified context then confidence; no demo financial values or files remain',()=>{
  const html=render(decisionFor(fixtures.clear_winner));assert.ok(html.indexOf('Recommended next move')<html.indexOf('Scenario comparison'));assert.ok(html.indexOf('Scenario comparison')<html.indexOf('confidence in this conclusion'));
  const dashboard=readFileSync('src/components/dashboard.tsx','utf8');
  assert.doesNotMatch(dashboard,/value: "\$4,200"|value: "4\.2%"|september-pos\.csv|staff-rota\.xlsx|Demo workspace/);
  assert.match(dashboard,/AI interprets business evidence\. Code verifies scenarios and calculates impact\. AI recommends within verified boundaries\./);
  assert.match(readFileSync('src/components/business-input-panel.tsx','utf8'),/Retry full analysis/);assert.match(dashboard,/bounded decision support/);
});
