import {createRequire} from 'node:module';
const nativeRequire=createRequire(import.meta.url);
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const fixtures=JSON.parse(readFileSync(new URL('./fixtures/decision-gate.json',import.meta.url),'utf8'));
let externalCalls=0;const cache=new Map();
function load(filename){if(cache.has(filename))return cache.get(filename);const exports={};cache.set(filename,exports);
  const code=ts.transpileModule(readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(code,{exports,structuredClone,Response,fetch(){externalCalls++;throw Error('No external call permitted');},require:s=>s.startsWith('node:')?nativeRequire(s):load(s.startsWith('@/')?path.resolve('src',s.slice(2)+'.ts'):path.resolve(path.dirname(filename),s+'.ts'))});return exports;}
const {evaluateDecisionGate,isDecisionGateRequest,compareImpactGap,validatePolicyRequiredInputs}=load(path.resolve('src/lib/decision-gate.ts'));
const {POST}=load(path.resolve('src/app/api/analyze/decision-gate/route.ts'));
const fixture=name=>structuredClone(fixtures[name]);const plain=v=>JSON.parse(JSON.stringify(v));
const gate=input=>plain(evaluateDecisionGate(input));
const calc=(input,index=0)=>input.simulation.results[index].calculation;
const request=body=>new Request('http://localhost/api/analyze/decision-gate',{method:'POST',body:JSON.stringify(body)});

test('Cornhead missing impact -> needs_more_data, no top candidate, correct authoritative missing inputs',()=>{
  const input=fixture('cornhead');const result=gate(input);assert.equal(result.decision_gate,'needs_more_data');assert.equal(result.comparison_gap_status,'not_applicable');assert.equal(result.top_candidate_id,null);
  assert.equal(result.candidates.length,2);for(const c of result.candidates){assert.equal(c.scenario_status,'not_calculable_yet');assert.equal(c.verified_impact,null);assert.equal(c.currency,null);assert.equal(c.period,null);}
  assert.deepEqual(result.missing_decision_inputs,[...new Set(input.simulation.results.flatMap(r=>r.missing_inputs))]);assert.equal(result.not_simulation_ready.length,1);assert.match(result.not_simulation_ready[0].target_leak,/delivery/i);
});
for(const [name,state,gap,top] of [
  ['close_call','needs_more_data','below_threshold','candidate_02'],
  ['clear_winner','action_allowed','meets_or_exceeds_threshold','candidate_01'],
  ['moderate_winner','action_allowed','meets_or_exceeds_threshold','candidate_01'],
  ['exact_boundary','action_allowed','meets_or_exceeds_threshold','candidate_01'],
  ['just_below','needs_more_data','below_threshold','candidate_01'],
])test(`${name}: exact deterministic gate and top candidate`,()=>{
  const input=fixture(name),result=gate(input);assert.equal(result.decision_gate,state);assert.equal(result.comparison_gap_status,gap);assert.equal(result.top_candidate_id,top);
  const topCandidate=result.candidates.find(c=>c.candidate_id===top);assert.ok(topCandidate);assert.equal(topCandidate.verified_impact,Math.max(...input.simulation.results.map(r=>r.calculation.impact_value)));
  assert.equal(result.candidates.some(c=>/delivery/i.test(c.target_leak)),false);assert.deepEqual(result.not_simulation_ready,input.scenarios.not_simulation_ready);
  assert.equal('relative_gap' in result,false);assert.equal('recommendation' in result,false);
});
test('one calculable candidate permits action even with separate non-ready delivery context',()=>{
  const input=fixture('close_call');input.scenarios.scenarios.pop();input.simulation.results.pop();const result=gate(input);
  assert.equal(result.decision_gate,'action_allowed');assert.equal(result.comparison_gap_status,'not_applicable');assert.equal(result.top_candidate_id,'candidate_01');assert.equal(result.not_simulation_ready.length,1);
});
test('mixed calculable and unresolved authorized candidates prevent action',()=>{
  const input=fixture('close_call');input.simulation.results[1]=fixture('cornhead').simulation.results[1];const result=gate(input);
  assert.equal(result.decision_gate,'needs_more_data');assert.equal(result.comparison_gap_status,'not_applicable');assert.equal(result.top_candidate_id,null);assert.deepEqual(result.reason_codes,['unresolved_authorized_scenarios']);
  assert.deepEqual(result.missing_decision_inputs,input.simulation.results[1].missing_inputs);
});
for(const [label,edit,reason] of [
  ['different currencies',b=>calc(b,1).currency='EUR','currency_mismatch'],
  ['different periods',b=>calc(b,1).period='next_month','period_mismatch'],
  ['unknown impact meaning',b=>calc(b,1).formula_id='REVENUE_GAIN','unsupported_impact_metric'],
])test(`${label} returns needs_more_data without normalization or inferred equivalence`,()=>{
  const input=fixture('clear_winner');edit(input);const before=JSON.stringify(input);const result=gate(input);
  assert.equal(result.decision_gate,'needs_more_data');assert.equal(result.comparison_gap_status,'not_applicable');assert.equal(result.top_candidate_id,null);assert.ok(result.reason_codes.includes(reason));assert.equal(JSON.stringify(input),before);assert.deepEqual(result.missing_decision_inputs,[]);
});
test('unknown formula is unsupported even when it is the only calculable scenario',()=>{
  const input=fixture('clear_winner');input.scenarios.scenarios.pop();input.simulation.results.pop();calc(input).formula_id='NEW_COST_REDUCTION';assert.equal(gate(input).decision_gate,'needs_more_data');
});
test('no authorized scenarios -> no_actionable_scenario; explicit delivery blockers preserved separately and as missing inputs',()=>{
  const input=fixture('cornhead');input.scenarios.scenarios=[];input.simulation.results=[];const result=gate(input);
  assert.equal(result.decision_gate,'no_actionable_scenario');assert.equal(result.comparison_gap_status,'not_applicable');assert.equal(result.top_candidate_id,null);assert.deepEqual(result.candidates,[]);
  assert.deepEqual(result.missing_decision_inputs,input.scenarios.not_simulation_ready[0].missing_decision_input_categories);
});
test('no scenarios and no non-ready context remain empty without invented blockers',()=>{
  const input=fixture('cornhead');input.scenarios={scenarios:[],not_simulation_ready:[]};input.simulation.results=[];const result=gate(input);assert.equal(result.decision_gate,'no_actionable_scenario');assert.deepEqual(result.missing_decision_inputs,[]);
});
test('zero top impact gives no permission and never divides by zero',()=>{
  const input=fixture('clear_winner');calc(input).impact_value=0;calc(input,1).impact_value=0;const result=gate(input);
  assert.equal(result.decision_gate,'needs_more_data');assert.equal(result.comparison_gap_status,'not_applicable');assert.equal(result.top_candidate_id,null);assert.deepEqual(result.reason_codes,['non_positive_top_impact']);
  input.scenarios.scenarios.pop();input.simulation.results.pop();assert.equal(gate(input).decision_gate,'needs_more_data');
});
test('tied positive impacts use a stable display top but do not permit action',()=>{
  const input=fixture('clear_winner');calc(input,1).impact_value=calc(input).impact_value;const result=gate(input);assert.equal(result.decision_gate,'needs_more_data');assert.equal(result.comparison_gap_status,'below_threshold');assert.equal(result.top_candidate_id,'candidate_01');
});
test('zero runner-up with positive top meets threshold',()=>{
  const input=fixture('clear_winner');calc(input,1).impact_value=0;assert.equal(gate(input).decision_gate,'action_allowed');
});
test('exact 10% threshold uses unrounded numeric inputs and handles decimal/scientific notation boundaries',()=>{
  for(const [top,second,expected] of [
    [800,770,'below_threshold'],[2500,500,'meets_or_exceeds_threshold'],[1100,900,'meets_or_exceeds_threshold'],
    [1000,900,'meets_or_exceeds_threshold'],[1000,901,'below_threshold'],[1000,900.0000000001,'below_threshold'],
    [.3,.27,'meets_or_exceeds_threshold'],[1.1,.99,'meets_or_exceeds_threshold'],[1.1,.9900000000000001,'below_threshold'],
    [1e-10,9e-11,'meets_or_exceeds_threshold'],[1e300,9e299,'meets_or_exceeds_threshold'],[1e-300,9.01e-301,'below_threshold'],
  ])assert.equal(compareImpactGap(top,second),expected);
  for(const [a,b] of [[0,0],[-1,0],[1,-1],[1,2],[Infinity,1],[NaN,1]])assert.throws(()=>compareImpactGap(a,b),/Finite/);
});
for(const [name,edit] of [
  ['negative impact',b=>calc(b).impact_value=-1],['NaN impact',b=>calc(b).impact_value=NaN],['Infinity impact',b=>calc(b).impact_value=Infinity],
  ['missing currency',b=>delete calc(b).currency],['blank currency',b=>calc(b).currency=''],['missing period',b=>delete calc(b).period],['blank period',b=>calc(b).period=' '],
  ['invalid evidence',b=>b.evidence={}],['unexpected blocker property',b=>b.blocking_conditions=['restricted']],
  ['duplicate simulation result',b=>b.simulation.results[1]=structuredClone(b.simulation.results[0])],
  ['unknown result',b=>b.simulation.results[1].target_leak='Unknown'],['missing result',b=>b.simulation.results.pop()],['extra result',b=>b.simulation.results.push(structuredClone(b.simulation.results[0]))],
  ['duplicate scenarios',b=>b.scenarios.scenarios.push(structuredClone(b.scenarios.scenarios[0]))],
  ['non-ready result enters results',b=>b.simulation.results[1].target_leak=b.scenarios.not_simulation_ready[0].target_leak],
  ['non-ready leak duplicated as candidate',b=>b.scenarios.not_simulation_ready[0].target_leak=b.scenarios.scenarios[0].target_leak],
  ['changed controlled value',b=>b.simulation.results[0].controlled_changes[0].value=-2],
  ['inconsistent status',b=>b.simulation.results[0].status='not_calculable_yet'],
  ['calculable with missing inputs',b=>b.simulation.results[0].missing_inputs=['Missing cost']],
  ['extra calculation field',b=>calc(b).recommendation='Choose this'],
  ['nonfinite calculation input',b=>calc(b).inputs[0].value=Infinity],['empty calculation source',b=>calc(b).inputs[0].source_ref=''],
  ['empty controlled changes',b=>b.scenarios.scenarios[0].controlled_changes=[]],
])test(`reject ${name}, never silently repair`,()=>{
  const input=fixture('clear_winner');edit(input);const before=JSON.stringify(input);assert.equal(isDecisionGateRequest(input),false);assert.throws(()=>evaluateDecisionGate(input),/Invalid Decision Gate request/);assert.equal(JSON.stringify(input),before);
});
test('missing inputs come only from calculator; no invented execution categories, prose blockers or extra currency arithmetic',()=>{
  const input=fixture('cornhead');input.evidence.facts.push('Cannot implement this month');input.scenarios.scenarios[0].missing_calculation_inputs.push('market research');
  const result=gate(input);const allowed=input.simulation.results.flatMap(r=>r.missing_inputs);assert.ok(result.missing_decision_inputs.every(s=>allowed.includes(s)));assert.doesNotMatch(JSON.stringify(result),/market research|Cannot implement|service disruption|training plans/);
  const complete=fixture('clear_winner');complete.evidence.missing_information.push('Implementation-cost information','Operational-risk information');complete.evidence.facts.push('Scenario A cannot be implemented this month due to regulatory restriction.');
  // These are prose, not a structured blocking contract. V1 does not interpret them.
  assert.equal(gate(complete).decision_gate,'action_allowed');assert.deepEqual(gate(complete).missing_decision_inputs,[]);
});
test('candidate IDs and joins are exact and stable within the response, independent of simulation order',()=>{
  const input=fixture('close_call');input.simulation.results.reverse();const before=JSON.stringify(input);const result=gate(input);
  assert.deepEqual(result.candidates.map(c=>c.candidate_id),['candidate_01','candidate_02']);assert.equal(result.top_candidate_id,'candidate_02');assert.equal(JSON.stringify(input),before);assert.deepEqual(gate(input),result);
  input.simulation.results[0].scenario_title+=' ';assert.equal(isDecisionGateRequest(input),false);
});
test('every candidate appears once and not-ready delivery is never ranked across all fixtures',()=>{
  for(const input of Object.values(fixtures)){const result=gate(input);assert.equal(result.candidates.length,input.scenarios.scenarios.length);assert.equal(new Set(result.candidates.map(c=>c.candidate_id)).size,result.candidates.length);assert.equal(result.candidates.some(c=>/delivery/i.test(c.target_leak)),false);assert.ok(result.top_candidate_id===null||result.candidates.some(c=>c.candidate_id===result.top_candidate_id));}
});
test('no recommendation prose or external/model calls exist in the gate',()=>{
  for(const input of Object.values(fixtures)){const result=gate(input);assert.doesNotMatch(JSON.stringify(result),/"recommendation"|"rationale"|choose Waste|recommend Labor|best scenario|strongest move/);}
  const source=readFileSync(new URL('../src/lib/decision-gate.ts',import.meta.url),'utf8');assert.doesNotMatch(source,/\bfetch\s*\(|NEBIUS_API_KEY|https?:\/\//);assert.equal(externalCalls,0);
});
test('endpoint returns deterministic fixture results with no-store, safe 400s, and zero provider calls',async()=>{
  for(const name of ['cornhead','close_call','clear_winner','exact_boundary']){const input=fixture(name);const response=await POST(request(input));assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.deepEqual(await response.json(),gate(input));}
  assert.equal((await POST(request({}))).status,400);assert.equal((await POST(new Request('http://localhost',{method:'POST',body:'{'}))).status,400);const input=fixture('clear_winner');calc(input).impact_value=-1;assert.equal((await POST(request(input))).status,400);assert.equal(externalCalls,0);
});
test('three comparable candidates use only the top two for the gap; local IDs retain source order',()=>{
  const input=fixture('clear_winner');const scenario=structuredClone(input.scenarios.scenarios[0]);scenario.title='Scenario C';scenario.target_leak='Additional authorized leak';input.scenarios.scenarios.push(scenario);
  const result=structuredClone(input.simulation.results[0]);result.scenario_title=scenario.title;result.target_leak=scenario.target_leak;result.calculation.impact_value=2450;input.simulation.results.push(result);
  const response=gate(input);assert.equal(response.candidates.length,3);assert.equal(response.decision_gate,'needs_more_data');assert.equal(response.comparison_gap_status,'below_threshold');assert.equal(response.top_candidate_id,'candidate_01');
});
const expectedPolicy=[
  {category:'implementation_cost',reason_code:'CLOSE_CALL_REQUIRES_EXECUTION_CONTEXT'},
  {category:'operational_constraints',reason_code:'CLOSE_CALL_REQUIRES_EXECUTION_CONTEXT'},
];
for(const name of ['cornhead','close_call','clear_winner','moderate_winner','exact_boundary','just_below'])test(`${name}: separates upstream missing inputs from deterministic policy inputs`,()=>{
  const input=fixture(name),response=gate(input);const close=['close_call','just_below'].includes(name);
  assert.deepEqual(response.policy_required_inputs,close?expectedPolicy:[]);
  assert.equal(validatePolicyRequiredInputs(response.policy_required_inputs,response),true);
  assert.deepEqual(response.missing_decision_inputs,[...new Set(input.simulation.results.flatMap(r=>r.missing_inputs))]);
  if(close)assert.deepEqual(response.missing_decision_inputs,[]);
  if(name==='cornhead')assert.ok(response.missing_decision_inputs.length>0);
  assert.doesNotMatch(JSON.stringify(response.policy_required_inputs),/service_quality|production_shortage|product_quality|market_research|service disruption/);
});
for(const [name,edit] of [
  ['single calculable candidate',b=>{b.scenarios.scenarios.pop();b.simulation.results.pop();}],
  ['unresolved competitor',b=>b.simulation.results[1]=fixture('cornhead').simulation.results[1]],
  ['different currency',b=>calc(b,1).currency='EUR'],['different period',b=>calc(b,1).period='next_month'],
  ['unsupported impact metric',b=>calc(b,1).formula_id='UNSUPPORTED'],
  ['zero top impact',b=>{calc(b).impact_value=0;calc(b,1).impact_value=0;}],
  ['no actionable scenario',b=>{b.scenarios.scenarios=[];b.simulation.results=[];}],
])test(`${name} never receives close-call policy inputs`,()=>{
  const input=fixture('close_call');edit(input);const response=gate(input);assert.deepEqual(response.policy_required_inputs,[]);assert.equal(validatePolicyRequiredInputs([],response),true);
});
for(const [name,invalid] of [
  ['null',null],['string','implementation_cost'],['free-text array',['Check service quality']],
  ['unknown category',[{category:'service_quality',reason_code:'CLOSE_CALL_REQUIRES_EXECUTION_CONTEXT'}]],
  ['unknown reason',[{category:'implementation_cost',reason_code:'GET_MORE_DATA'}]],
  ['missing reason',[{category:'implementation_cost'}]],
  ['extra prose',[{...expectedPolicy[0],explanation:'Check service disruption'},expectedPolicy[1]]],
  ['duplicate category',[expectedPolicy[0],expectedPolicy[0]]],
  ['extra duplicate',[...expectedPolicy,expectedPolicy[0]]],
  ['missing required category',[expectedPolicy[0]]],['empty close-call set',[]],
])test(`reject ${name} policy field without automatic repair`,()=>{
  const context=gate(fixture('close_call'));const before=JSON.stringify(invalid);assert.equal(validatePolicyRequiredInputs(invalid,context),false);assert.equal(JSON.stringify(invalid),before);
});
test('valid complete external policy category set is accepted in either order without rewriting',()=>{
  const value=[...expectedPolicy].reverse();const before=JSON.stringify(value);assert.equal(validatePolicyRequiredInputs(value,gate(fixture('close_call'))),true);assert.equal(JSON.stringify(value),before);
});
for(const name of ['cornhead','clear_winner','moderate_winner','exact_boundary'])test(`${name}: externally supplied close-call categories are rejected`,()=>{
  assert.equal(validatePolicyRequiredInputs(expectedPolicy,gate(fixture(name))),false);
});
test('below-threshold status alone cannot create policy inputs for a different gate reason',()=>{
  const context=gate(fixture('close_call'));context.reason_codes=['currency_mismatch'];assert.equal(validatePolicyRequiredInputs(expectedPolicy,context),false);
  context.reason_codes=['close_call_below_threshold','currency_mismatch'];assert.equal(validatePolicyRequiredInputs(expectedPolicy,context),false);
});
test('action_allowed and non-below-threshold contexts always reject nonempty policy inputs',()=>{
  const context=gate(fixture('close_call'));context.decision_gate='action_allowed';assert.equal(validatePolicyRequiredInputs(expectedPolicy,context),false);
  context.decision_gate='needs_more_data';context.comparison_gap_status='not_applicable';assert.equal(validatePolicyRequiredInputs(expectedPolicy,context),false);
});
test('caller cannot supply policy categories in the unchanged Gate request contract',async()=>{
  const input=fixture('close_call');input.policy_required_inputs=expectedPolicy;assert.equal(isDecisionGateRequest(input),false);assert.equal((await POST(request(input))).status,400);
});
test('mutating a response cannot alter deterministic policy categories in subsequent evaluations',()=>{
  const first=gate(fixture('close_call'));first.policy_required_inputs[0].category='product_quality';assert.deepEqual(gate(fixture('close_call')).policy_required_inputs,expectedPolicy);
});
