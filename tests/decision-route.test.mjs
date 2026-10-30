import {createRequire} from 'node:module';
const nativeRequire=createRequire(import.meta.url);
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
const fixtures=JSON.parse(readFileSync(new URL('./fixtures/decision.json',import.meta.url),'utf8'));
function load(fetcher,key='test-key'){
  const cache=new Map();function module(filename){if(cache.has(filename))return cache.get(filename);const exports={};cache.set(filename,exports);
    const code=ts.transpileModule(readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
    vm.runInNewContext(code,{exports,structuredClone,Response,AbortSignal,process:{env:{NEBIUS_API_KEY:key}},fetch:fetcher,require:s=>s.startsWith('node:')?nativeRequire(s):module(path.resolve(path.dirname(filename),s+'.ts'))});return exports;}
  return {...module(path.resolve('src/app/api/analyze/decision/decision.ts')),...module(path.resolve('src/app/api/analyze/decision/route.ts'))};
}
const helpers=load();const fixture=name=>structuredClone(fixtures[name]);const plain=value=>JSON.parse(JSON.stringify(value));
function validResult(input){
  const gate=input.decision_gate,action=gate.decision_gate==='action_allowed',top=gate.candidates.find(c=>c.candidate_id===gate.top_candidate_id);
  return {decision_status:action?'actionable':'needs_more_data',recommendation:{type:action?'business_action':'collect_data',candidate_id:action?top.candidate_id:null,title:action?top.scenario_title:'Collect supplied decision inputs',rationale:action?'The authoritative gate permits the top modeled candidate.':'The gate requires additional supplied inputs before action.'},
    comparison:[...gate.candidates.map(c=>({candidate_id:c.candidate_id,target_leak:c.target_leak,scenario_status:c.scenario_status,assessment:'Readiness and impact are supplied upstream.',verified_impact:c.verified_impact,currency:c.currency})),...gate.not_simulation_ready.map(item=>({candidate_id:null,target_leak:item.target_leak,scenario_status:'not_simulation_ready',assessment:'No authorized scenario exists yet.',verified_impact:null,currency:null}))],
    priority_inputs:[...gate.missing_decision_inputs.map(key=>({source_type:'upstream_missing_input',key,why_it_matters:'Needed to establish the supplied decision prerequisite.'})),...gate.policy_required_inputs.map(item=>({source_type:'policy_required_input',key:item.category,why_it_matters:item.category==='implementation_cost'?'Needed to compare net decision value when modeled impacts are close.':'Needed to determine whether execution constraints materially affect a close decision.'}))],confidence:action?'high':'low'};
}
const validate=(result,input)=>helpers.validateDecisionResult(result,input);
const request=value=>new Request('http://localhost/api/analyze/decision',{method:'POST',body:JSON.stringify(value)});
const completion=result=>Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(result)}}],usage:{completion_tokens_details:{reasoning_tokens:0}}});
for(const name of ['cornhead','close_call','clear_winner','no_actionable','empty'])test(`${name} valid grounded Decision passes`,()=>{
  const input=fixture(name);assert.equal(helpers.isDecisionRequest(input),true);const result=validResult(input);assert.equal(validate(result,input).ok,true);
});
for(const [name,base,edit,reason] of [
  ['Cornhead business action','cornhead',r=>{r.decision_status='actionable';r.recommendation.type='business_action';r.recommendation.candidate_id='candidate_01';},'gate_noncompliance'],
  ['Cornhead nonnull recommendation','cornhead',r=>r.recommendation.candidate_id='candidate_01','candidate_selection'],
  ['close-call action','close_call',r=>{r.decision_status='actionable';r.recommendation.type='business_action';},'gate_noncompliance'],
  ['clear-winner retreat','clear_winner',r=>{r.decision_status='needs_more_data';r.recommendation.type='collect_data';r.recommendation.candidate_id=null;},'gate_noncompliance'],
  ['second-ranked candidate','clear_winner',r=>{r.recommendation.candidate_id='candidate_02';r.recommendation.title='Scenario B';},'candidate_selection'],
  ['unknown candidate','clear_winner',r=>r.recommendation.candidate_id='candidate_99','candidate_selection'],
  ['wrong action title','clear_winner',r=>r.recommendation.title='Unknown scenario','candidate_selection'],
  ['missing candidate comparison','cornhead',r=>r.comparison.shift(),'comparison_coverage'],
  ['duplicate candidate comparison','cornhead',r=>r.comparison[1]=structuredClone(r.comparison[0]),'comparison_coverage'],
  ['extra comparison','cornhead',r=>r.comparison.push(structuredClone(r.comparison[0])),'comparison_coverage'],
  ['missing non-ready comparison','cornhead',r=>r.comparison.pop(),'comparison_coverage'],
  ['unknown comparison candidate','cornhead',r=>r.comparison[0].candidate_id='candidate_99','comparison_coverage'],
  ['non-ready recommendation','no_actionable',r=>{r.recommendation.type='business_action';r.decision_status='actionable';},'gate_noncompliance'],
  ['modified impact','clear_winner',r=>r.comparison[0].verified_impact=2600,'comparison_copy'],
  ['invented null impact','cornhead',r=>r.comparison[0].verified_impact=0,'comparison_copy'],
  ['non-ready impact','cornhead',r=>r.comparison.at(-1).verified_impact=800,'comparison_copy'],
  ['changed scenario status','cornhead',r=>r.comparison[0].scenario_status='calculable','comparison_copy'],
  ['changed currency','clear_winner',r=>r.comparison[0].currency='EUR','comparison_copy'],
  ['changed target leak','clear_winner',r=>r.comparison[0].target_leak='Unknown','comparison_copy'],
  ['unknown upstream priority','cornhead',r=>r.priority_inputs[0].key='Market research','priority_provenance'],
  ['unknown policy category','close_call',r=>r.priority_inputs[0].key='service_quality','priority_provenance'],
  ['source type mismatch','close_call',r=>r.priority_inputs[0].source_type='upstream_missing_input','priority_provenance'],
  ['empty priorities with sources','cornhead',r=>r.priority_inputs=[],'missing_priority_inputs'],
  ['empty close-call priorities','close_call',r=>r.priority_inputs=[],'missing_priority_inputs'],
  ['invented training input','cornhead',r=>r.priority_inputs.push({source_type:'upstream_missing_input',key:'Training requirement',why_it_matters:'Required.'}),'priority_provenance'],
  ['duplicate priority source','cornhead',r=>r.priority_inputs.push(structuredClone(r.priority_inputs[0])),'priority_provenance'],
  ['extra schema field','cornhead',r=>r.reasoning='private','schema_failure'],
  ['nested extra field','cornhead',r=>r.recommendation.roi=5,'schema_failure'],
  ['service-disruption expansion','close_call',r=>r.priority_inputs[1].why_it_matters='Needed to assess service disruption.','unsupported_consequence'],
  ['production-shortage expansion','close_call',r=>r.recommendation.rationale='Production shortages would affect this decision.','unsupported_consequence'],
  ['new financial amount in prose','clear_winner',r=>r.recommendation.rationale='It produces $2,000 more.','unprovided_numeric_value'],
  ['derived financial multiple','clear_winner',r=>r.recommendation.rationale='It is 5x the impact.','unprovided_numeric_value'],
  ['headcount magnitude used as money','cornhead',r=>r.recommendation.rationale='The impact is $1.','unprovided_numeric_value'],
])test(`reject ${name} without repair`,()=>{
  const input=fixture(base),result=validResult(input);edit(result);const before=JSON.stringify(result);assert.deepEqual(plain(validate(result,input)),{ok:false,reason});assert.equal(JSON.stringify(result),before);
});
test('both allowed policy inputs pass without invented risk examples',()=>{
  const input=fixture('close_call');const result=validResult(input);assert.equal(validate(result,input).ok,true);assert.deepEqual(result.priority_inputs.map(p=>p.key),['implementation_cost','operational_constraints']);
});
for(const phrase of ['service disruption','SERVICE-DISRUPTIONS','production shortage','product quality','employee impact','customer impact','training requirement','higher ROI','low operational risk','easy to implement'])test(`phrase guard rejects unsupported ${phrase}`,()=>{
  assert.equal(helpers.hasUnsupportedConsequences(`This could involve ${phrase}.`,'Authoritative gate allows only supplied inputs.'),true);
});
test('phrase guard permits supplied phrases, safe wording, and exact harmless no-claim sentences',()=>{
  assert.equal(helpers.hasUnsupportedConsequences('Need production shortage information.','A production shortage was explicitly supplied.'),false);
  assert.equal(helpers.hasUnsupportedConsequences('The serviceable model compares production costs and retraining inputs.',''),false);
  assert.equal(helpers.hasUnsupportedConsequences('No service disruption is asserted.',''),false);
  assert.equal(helpers.hasUnsupportedConsequences('No service disruption is asserted. Service disruption is certain.',''),true);
  assert.equal(helpers.hasUnsupportedConsequences('Needed to determine whether execution constraints materially affect a close decision.',''),false);
});
test('finite structured financial values required and zero recomputation/threshold logic exists in Decision code',()=>{
  const input=fixture('clear_winner');const result=validResult(input);result.comparison[0].verified_impact=Infinity;assert.equal(validate(result,input).reason,'schema_failure');
  const source=readFileSync(new URL('../src/app/api/analyze/decision/decision.ts',import.meta.url),'utf8');assert.doesNotMatch(source,/evaluateDecisionGate\s*\(|compareImpactGap\s*\(|calculateScenarios\s*\(|\.sort\s*\(|impact_value\s*[-+*/]/);
});
test('request rejects forged Gate, inconsistent upstream data, unknown fields and ungrounded priority sources before provider',async()=>{
  for(const edit of [
    b=>b.decision_gate.candidates[0].verified_impact=100,
    b=>b.decision_gate.candidates[0].currency='EUR',
    b=>b.decision_gate.top_candidate_id='candidate_99',
    b=>b.decision_gate.missing_decision_inputs=['Market research'],
    b=>b.decision_gate.policy_required_inputs=[{category:'service_quality',reason_code:'CLOSE_CALL_REQUIRES_EXECUTION_CONTEXT'}],
    b=>b.simulation.results.pop(),b=>b.leaks.leaks.pop(),b=>b.extra=true,
    b=>b.decision_gate.candidates.push(structuredClone(b.decision_gate.candidates[0])),
  ]){const input=fixture('cornhead');edit(input);assert.equal(helpers.isDecisionRequest(input),false);}
  const {POST}=load(()=>{throw Error('must not fetch');});assert.equal((await POST(request({}))).status,400);assert.equal((await POST(new Request('http://localhost',{method:'POST',body:'{'}))).status,400);
});
test('data-required Gate with no grounded source is rejected; no-action empty-source exception remains valid',()=>{
  const input=fixture('clear_winner');input.decision_gate.decision_gate='needs_more_data';input.decision_gate.comparison_gap_status='not_applicable';input.decision_gate.top_candidate_id=null;input.decision_gate.reason_codes=['unsupported_impact_metric'];assert.equal(helpers.isDecisionRequest(input),false);
  const empty=fixture('empty');assert.equal(helpers.isDecisionRequest(empty),true);const result=validResult(empty);assert.deepEqual(result.priority_inputs,[]);assert.equal(validate(result,empty).ok,true);
});
test('endpoint uses Super, strict production schema, thinking disabled, timeout and safe response envelope',async()=>{
  const input=fixture('close_call');let calls=0;const {POST}=load(async(url,options)=>{
    calls++;assert.equal(url,'https://api.tokenfactory.nebius.com/v1/chat/completions');assert.equal(options.headers.Authorization,'Bearer test-key');assert.equal(options.cache,'no-store');assert.ok(options.signal instanceof AbortSignal);
    const body=JSON.parse(options.body);assert.equal(body.model,'nvidia/Nemotron-3-Ultra-550b-a55b');assert.equal(body.temperature,.2);assert.equal(body.max_tokens,2000);assert.equal(body.chat_template_kwargs.enable_thinking,false);assert.equal(body.response_format.type,'json_schema');assert.equal(body.response_format.json_schema.strict,true);assert.equal(body.response_format.json_schema.name,'decision_agent_v1');
    const projected=JSON.parse(body.messages[1].content);assert.equal(projected.decision_gate,'needs_more_data');assert.equal(projected.comparison_gap_status,'below_threshold');assert.equal('revenue' in projected,false);assert.deepEqual(projected.priority_input_options.map(p=>p.key),['implementation_cost','operational_constraints']);
    return completion(validResult(input));
  });
  const response=await POST(request(input));assert.equal(response.status,200);assert.equal(calls,1);assert.equal(response.headers.get('cache-control'),'no-store');assert.deepEqual(await response.json(),{decision:validResult(input)});
});
test('missing server key returns safe 500 without fetching',async()=>{
  const {POST}=load(()=>{throw Error('must not fetch');},'');assert.equal((await POST(request(fixture('cornhead')))).status,500);
});
for(const [name,fetcher] of [
  ['HTTP error',async()=>new Response('private internals',{status:429})],
  ['network failure',async()=>{throw Error('private internals');}],
  ['timeout',async()=>{throw new DOMException('private internals','TimeoutError');}],
  ['bad envelope',async()=>Response.json(null)],
  ['bad provider JSON',async()=>new Response('{')],
  ['truncated',async()=>Response.json({choices:[{finish_reason:'length',message:{content:'{}'}}]})],
  ['refusal',async()=>Response.json({choices:[{finish_reason:'stop',message:{refusal:'private internals',content:'{}'}}]})],
  ['bad final JSON',async()=>Response.json({choices:[{finish_reason:'stop',message:{content:'not JSON'}}]})],
  ['reasoning channel',async()=>Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(validResult(fixture('cornhead'))),reasoning_content:'private internals'}}]})],
  ['thought tags',async()=>Response.json({choices:[{finish_reason:'stop',message:{content:'<think>private internals</think>{}'}}]})],
  ['extra schema reasoning',async()=>completion({...validResult(fixture('cornhead')),reasoning:'private internals'})],
  ['validation failure',async()=>{const result=validResult(fixture('cornhead'));result.comparison=[];return completion(result);}],
])test(`safe explicit 502 for ${name}, no automatic retry or repair`,async()=>{
  let calls=0;const {POST}=load(async(...args)=>{calls++;return fetcher(...args);});const response=await POST(request(fixture('cornhead')));assert.equal(response.status,502);assert.equal(calls,1);
  const body=await response.json();assert.deepEqual(Object.keys(body),['error']);assert.doesNotMatch(body.error,/private|test-key/);
});
test('blank recommendation title is rejected, while model input supplies nonempty deterministic contract fields',()=>{
  const input=fixture('cornhead'),result=validResult(input);result.recommendation.title='';assert.equal(validate(result,input).reason,'schema_failure');
  const projected=helpers.buildDecisionInput(input);assert.equal(projected.recommendation_contract.title,'Collect required decision inputs');assert.equal(projected.recommendation_contract.candidate_id,null);assert.equal(projected.comparison_sources.length,3);
  assert.equal(projected.comparison_sources.at(-1).candidate_id,null);assert.equal(projected.comparison_sources.at(-1).scenario_status,'not_simulation_ready');
});
test('Decision-layer Gate consistency checks do not accept changed reason/state metadata',()=>{
  for(const name of ['cornhead','close_call','clear_winner','empty']){const input=fixture(name);input.decision_gate.reason_codes=['unsupported_impact_metric'];assert.equal(helpers.isDecisionRequest(input),false);}
});

const forbiddenThresholdPhrases = [
  'Impact is below the action threshold.',
  'The $770 savings does not meet the decision threshold.',
  "This scenario's cost reduction passes the action threshold.",
  'The modeled result is under the threshold for action.',
  'The impact is above the action threshold.',
  'The value is over the decision threshold.',
  'The dollar amount meets the action threshold.',
  'The scenario impact fails the action threshold.',
  'The savings passes the decision threshold.',
  'The verified impact exceeds the decision threshold.',
  'The value crosses the threshold.',
  'The impact meets or exceeds the decision threshold.',
  'The decision threshold is exceeded by the modeled impact.',
  'ＩＭＰＡＣＴ is BELOW the ACTION-THRESHOLD.',
  'The impact\t is\tbelow the action threshold.',
];
for (const phrase of forbiddenThresholdPhrases) test(`wording guard rejects ${phrase}`, () => {
  assert.equal(helpers.hasMisleadingThresholdWording(phrase), true);
  const input = fixture('close_call'), result = validResult(input);
  result.recommendation.rationale = phrase;
  const before = JSON.stringify(result);
  assert.deepEqual(plain(validate(result, input)), {ok: false, reason: 'misleading_threshold_wording'});
  assert.equal(JSON.stringify(result), before);
});
for (const phrase of [
  'The comparison gap is below the decision threshold.',
  'The verified results are too close to support a definitive action recommendation.',
  'The comparison gap meets or exceeds the decision threshold.',
  'The decision gate allows an action recommendation.',
  'The decision gate requires more data.',
  'The impact is supplied upstream.',
  'The comparison_gap is below the decision threshold.',
  'The decision gap exceeds the action threshold.',
  'The decision policy defines the threshold.',
  'The impact is verified, and the comparison gap is below the decision threshold.',
  'The threshold for action applies to the comparison gap, not the individual impact.',
  'The impact meets the quality threshold.',
  'The value. Below the action threshold is the comparison gap.',
  'The resulting comparison gap is below the decision threshold.',
]) test(`wording guard allows ${phrase}`, () => {
  assert.equal(helpers.hasMisleadingThresholdWording(phrase), false);
  const input = fixture('close_call'), result = validResult(input);
  result.recommendation.rationale = phrase;
  assert.equal(validate(result, input).ok, true);
});
for (const [field, edit] of [
  ['recommendation.title', (r, phrase) => r.recommendation.title = phrase],
  ['recommendation.rationale', (r, phrase) => r.recommendation.rationale = phrase],
  ['comparison.assessment', (r, phrase) => r.comparison[0].assessment = phrase],
  ['priority_inputs.why_it_matters', (r, phrase) => r.priority_inputs[0].why_it_matters = phrase],
]) test(`wording guard returns explicit 502 for ${field} without retry or repair`, async () => {
  const input = fixture('close_call'), result = validResult(input);
  edit(result, 'Impact is below the action threshold.');
  const before = JSON.stringify(result);
  let calls = 0;
  const {POST} = load(async () => { calls++; return completion(result); });
  const response = await POST(request(input));
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), {error: 'Decision analysis result rejected by deterministic validation: misleading_threshold_wording.'});
  assert.equal(calls, 1);
  assert.equal(JSON.stringify(result), before);
});

for(const phrase of ['Top candidate meets threshold.','Scenario A passes the action threshold.','The savings meet the action threshold.','This candidate exceeds the decision threshold.','The decision threshold is exceeded by the candidate.'])test(`Gate prose rejects candidate/scenario threshold claim: ${phrase}`,()=>{
  const input=fixture('clear_winner'),result=validResult(input);result.recommendation.rationale=phrase;
  assert.deepEqual(plain(validate(result,input)),{ok:false,reason:'misleading_threshold_wording'});
});
for(const phrase of ['The top candidate is not calculable yet.','The leading candidate should be evaluated further.','Evaluate the highest-ranked candidate.','The selected candidate is ready.','The recommended candidate needs more data.','No top candidate exists, but the selected candidate should proceed.'])test(`Gate prose rejects absent-candidate claim: ${phrase}`,()=>{
  const input=fixture('cornhead'),result=validResult(input);assert.equal(input.decision_gate.top_candidate_id,null);
  result.recommendation.rationale=phrase;const before=JSON.stringify(result);
  assert.deepEqual(plain(validate(result,input)),{ok:false,reason:'ungrounded_candidate_reference'});assert.equal(JSON.stringify(result),before);
});
for(const phrase of ['The comparison gap is below the decision threshold.','The Decision Gate requires more data.','No top candidate exists.','No top candidate.','No top candidate is available.','There is no leading candidate.','The selected candidate does not exist.'])test(`Gate prose accepts neutral/explicit absence wording: ${phrase}`,()=>{
  const input=fixture('cornhead'),result=validResult(input);result.recommendation.rationale=phrase;assert.equal(validate(result,input).ok,true);
});
test('non-null authoritative top candidate can be named by its exact ID; contradicting ID is rejected',()=>{
  const input=fixture('clear_winner'),result=validResult(input);
  result.recommendation.rationale=`The top candidate is ${input.decision_gate.top_candidate_id}. The comparison gap meets or exceeds the decision threshold.`;
  assert.equal(validate(result,input).ok,true);
  result.recommendation.rationale='The top candidate is candidate_02.';assert.equal(validate(result,input).reason,'ungrounded_candidate_reference');
});
for(const token of ['needs_more_data','not_calculable_yet','not_simulation_ready','collect_data','comparison_gap_meets_threshold','upstream_missing_input','policy_required_input','cost_reduction'])test(`Gate prose rejects raw enum ${token}`,()=>{
  const input=fixture('cornhead'),result=validResult(input);result.recommendation.rationale=`The current state is ${token}.`;
  assert.equal(validate(result,input).reason,'raw_enum_wording');
});
for(const [field,edit] of [
  ['title',(r,p)=>r.recommendation.title=p],['rationale',(r,p)=>r.recommendation.rationale=p],
  ['assessment',(r,p)=>r.comparison[0].assessment=p],['why_it_matters',(r,p)=>r.priority_inputs[0].why_it_matters=p],
])for(const [phrase,reason] of [['The leading candidate should be evaluated further.','ungrounded_candidate_reference'],['The status is needs_more_data.','raw_enum_wording'],['Top candidate meets threshold.','misleading_threshold_wording']])test(`${field} ${reason} returns explicit 502, one provider call, no repair`,async()=>{
  const input=fixture('cornhead'),result=validResult(input);edit(result,phrase);const before=JSON.stringify(result);let calls=0;
  const {POST}=load(async()=>{calls++;return completion(result);});const response=await POST(request(input));
  assert.equal(response.status,502);assert.equal(calls,1);assert.deepEqual(await response.json(),{error:`Decision analysis result rejected by deterministic validation: ${reason}.`});assert.equal(JSON.stringify(result),before);
});
