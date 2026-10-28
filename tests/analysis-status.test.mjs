import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import * as jsx from 'react/jsx-runtime';
import {renderToStaticMarkup} from 'react-dom/server';
import {productionModules} from './helpers/provenance.mjs';
import {harness} from './helpers/analysis-harness.mjs';

const load=productionModules(),status=load('src/lib/analysis-status.ts');
const gate={decision_gate:'no_actionable_scenario',reason_codes:['no_authorized_scenarios'],policy_required_inputs:[]};
const decision={decision_status:'needs_more_data'};
const complete={complete:true,gate,decision};
const motion=tag=>function MotionMock({children,...props}){return React.createElement(tag,Object.fromEntries(Object.entries(props).filter(([key])=>!['initial','animate','exit','transition'].includes(key))),children);};
const office={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/components/agent-office.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports:office.exports,require:name=>{
 if(name==='react/jsx-runtime')return jsx;
 if(name==='next/image')return {default:({children,...props})=>React.createElement('img',props,children)};
 if(name==='framer-motion')return {motion:{div:motion('div'),p:motion('p')},AnimatePresence:({children})=>children,useReducedMotion:()=>true};
 if(name==='./use-demo-analysis')return {HANDOFF_MS:1150};
 if(name==='@/lib/analysis-status')return status;
 return {leakSummary:()=>'',evidenceSummary:()=>''};
}});
const render=(notice,error='')=>renderToStaticMarkup(React.createElement(office.exports.AgentOffice,{
 workflow:{index:3,phase:error?'idle':'pause',runId:1,started:true,complete:!error},stage:error?'evidence':'complete',
 evidence:null,leakResult:null,scenarioResult:null,simulationResult:null,decisionGateResult:gate,decisionResult:decision,analysisError:error,notice,
}));
const privateCodes=/evidence_authorization_atom_invalid|invalid_source_refs|numeric_anchor_source_missing|scope_missing_unit_anchor|schema.invalid|provider envelope|src_PRIVATE|SECRET|PRIVATE/i;

test('complete no-sales Labor guidance renders only the two actual missing assembler requirements',()=>{
 const notice=status.analysisNotice({...complete,guidance:{missing_requirements:['tuesday_evening_sales','unchanged_schedule']}});
 const html=render(notice);
 assert.equal(notice.category,'more_data_needed');
 assert.match(html,/More data needed before a confident decision/);
 assert.match(html,/Tuesday evening sales or revenue for the relevant reporting period/);
 assert.match(html,/rest of the relevant staffing schedule will remain unchanged/);
 assert.match(html,/Add these details and run the analysis again/);
 assert.doesNotMatch(html,/Please try again|permission to test|staffing cost for the same|tuesday_evening_sales|unchanged_schedule/);
});
test('complete authorized action has no missing-data warning, even if stale guidance is supplied',()=>{
 const notice=status.analysisNotice({complete:true,gate:{...gate,decision_gate:'action_allowed'},decision:{decision_status:'actionable'},guidance:{missing_requirements:['unchanged_schedule']}});
 const html=render(notice);assert.equal(notice.category,'complete_confident');
 assert.match(html,/Action recommendation ready/);assert.doesNotMatch(html,/More data needed|still need|remain unchanged/);
});
test('existing service-error responses produce temporary failure, never invented missing business facts',async()=>{
 const failure=await status.failureFromResponse(Response.json({error:'Evidence provider returned an invalid response.'},{status:502}));
 const notice=status.analysisNotice({complete:false,failure}),html=render(notice,'PRIVATE legacy error');
 assert.equal(failure,'temporary_failure');assert.match(html,/Analysis temporarily unavailable/);assert.match(html,/Please try again/);
 assert.equal(notice.items.length,0);assert.doesNotMatch(html,privateCodes);assert.doesNotMatch(html,/Tuesday evening|still need/);
});
test('network failure is mapped in the real hook without claiming missing business evidence',async()=>{
 const h=harness(async()=>{throw new TypeError('PRIVATE SECRET network error');});h.render();
 await h.value.startAnalysis('PRIVATE source');h.render();
 assert.equal(h.value.analysisStatus.category,'temporary_failure');assert.equal(h.value.workflow.complete,false);
 assert.equal(h.value.analysisStatus.items.length,0);assert.doesNotMatch(render(h.value.analysisStatus,h.value.analysisError),privateCodes);h.unmount();
});
test('existing deterministic source-support rejection gives verification guidance, without diagnostic codes',async()=>{
 const h=harness(async()=>Response.json({error:'Evidence authorization atoms have invalid source support.'},{status:502}));h.render();
 await h.value.startAnalysis('PRIVATE source');h.render();
 assert.equal(h.value.analysisStatus.category,'verification');
 const html=render(h.value.analysisStatus,'evidence_authorization_atom_invalid invalid_source_refs src_PRIVATE');
 assert.match(html,/Some information couldn&#x27;t be verified/);assert.match(html,/Review the figures and supporting statements/);
 assert.doesNotMatch(html,/Please try again/);assert.doesNotMatch(html,privateCodes);h.unmount();
});
test('existing currency conflict maps to plain-language correction guidance',async()=>{
 const failure=await status.failureFromResponse(Response.json({error:'Evidence currency conflicts with the explicit source currency or is unsupported.'},{status:502}));
 const html=render(status.analysisNotice({complete:false,failure}),'PRIVATE');
 assert.equal(failure,'conflict');assert.match(html,/Review the currency used for your amounts/);
 assert.doesNotMatch(html,/Please try again/);assert.doesNotMatch(html,privateCodes);
});
test('Gate reporting-period conflict and known policy prerequisites use fixed copy only',()=>{
 const conflict=status.analysisNotice({...complete,gate:{...gate,reason_codes:['period_mismatch']}});
 assert.equal(conflict.category,'conflict');assert.match(render(conflict),/Review the reporting periods/);
 const notice=status.analysisNotice({...complete,gate:{...gate,policy_required_inputs:[{category:'implementation_cost'},{category:'operational_constraints'}],missing_decision_inputs:['PRIVATE schema-invalid']}});
 const html=render(notice);assert.match(html,/Implementation cost/);assert.match(html,/Operational constraints/);assert.doesNotMatch(html,privateCodes);
});
test('unknown server text and unknown guidance are never rendered or treated as missing facts',async()=>{
 for(const error of ['evidence_authorization_atom_invalid','invalid_source_refs','numeric_anchor_source_missing','scope_missing_unit_anchor','schema-invalid provider envelope src_PRIVATE SECRET']){
  const failure=await status.failureFromResponse(Response.json({error},{status:502}));assert.equal(failure,'unclassified_failure');
  assert.doesNotMatch(render(status.analysisNotice({complete:false,failure}),error),privateCodes);
 }
 const guidance=status.readEvidenceGuidance({missing_requirements:['PRIVATE','tuesday_evening_sales','tuesday_evening_sales']});
 assert.deepEqual(JSON.parse(JSON.stringify(guidance)),{missing_requirements:['tuesday_evening_sales']});
 assert.equal(status.analysisNotice({complete:false}),null);
});

test('exact Golden Labor input completes all real route validators with mocked models and displays actual missing requirements',async()=>{
 const input=fs.readFileSync('tests/fixtures/golden-labor-no-scoped-sales.txt','utf8'),models=[];
 const modules=productionModules(async(_url,options)=>{
  const request=JSON.parse(options.body),name=request.response_format.json_schema.name;models.push(name);
  let result;
  if(name==='evidence'){
   const sources=JSON.parse(request.messages[2].content).authorization_sources,ref=i=>sources[i].id;
   result={business_type:null,period:'monthly',currency:'USD',revenue:{total:100000,items:[]},costs:{total:95800,items:[{name:'Tuesday evening staffing',amount:2500,reported_category:null,source_text:'The total Tuesday evening staffing cost is USD 2,500.'}]},facts:[],assumptions:[],missing_information:[],confidence:'high',
    authorization_atoms:[{kind:'headcount_reduction_permission',scope:'tuesday_evening_6pm_10pm',operation:'delta',value:-1,unit:'persons',permission:'explicit',source_refs:[ref(5)]}],
    business_total_support:[{field:'revenue.total',value:100000,scope:'whole_business',period:'monthly',currency:'USD',source_refs:[ref(0)]},
     {field:'costs.total',value:95800,scope:'whole_business',period:'monthly',currency:'USD',source_refs:[ref(1)]}],calculation_support:[]};
  }else if(name==='leak_detective_v1')result={leaks:[],insufficient_evidence:[{topic:'Tuesday evening staffing',reason:'Tuesday evening sales were not supplied.'}]};
  else if(name==='scenario_agent_v1')result={scenarios:[],not_simulation_ready:[]};
  else if(name==='decision_agent_v1')result={decision_status:'needs_more_data',recommendation:{type:'collect_data',candidate_id:null,title:'More information needed',rationale:'The supplied information does not support an action recommendation.'},comparison:[],priority_inputs:[],confidence:'low'};
  else throw Error('Unexpected mock model');
  return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(result)}}]});
 });
 const h=harness((url,options)=>modules('src/app'+url+'/route.ts').POST(new Request('http://localhost'+url,options)));
 h.render();const run=h.value.startAnalysis(input,input);
 for(let i=0;i<8;i++){await h.settle();if(h.timers.size)h.tick();if(h.value.workflow.complete||h.value.analysisError)break;}
 await h.settle();assert.equal(h.value.workflow.complete,true,h.value.analysisError);await run;h.render();
 assert.equal(h.value.analysisError,'');assert.deepEqual(JSON.parse(JSON.stringify(h.value.evidenceResult.provenance.authorization_records)),[]);
 assert.equal(h.value.analysisStatus.category,'more_data_needed');assert.equal(h.value.analysisStatus.items.length,2);
 assert.equal(h.value.analysisStatus.staffing_test_approved,true);
 assert.deepEqual(JSON.parse(JSON.stringify(h.value.scenarioResult.scenarios.scenarios)),[]);
 assert.deepEqual(JSON.parse(JSON.stringify(h.value.simulationResult.results)),[]);
 assert.deepEqual(JSON.parse(JSON.stringify(h.value.decisionGateResult.candidates)),[]);
 const html=render(h.value.analysisStatus);assert.match(html,/Tuesday evening sales or revenue/);assert.match(html,/staffing schedule will remain unchanged/);
 assert.deepEqual(models,['evidence','leak_detective_v1','scenario_agent_v1','decision_agent_v1']);h.unmount();
});

const staffingSource='The total Tuesday evening staffing cost is USD 2,500.';
const reportedCost={costs:{items:[{name:'Tuesday evening staffing',amount:2500,source_text:staffingSource}]},provenance:{items:[{id:'src_private',source:'source_input[0]',text:staffingSource}]}};
const missingCost={missing_requirements:['tuesday_evening_sales','tuesday_evening_staffing_cost','unchanged_schedule'],staffing_test_permission_present:true};
test('reported staffing cost suppresses only its missing-data label; raw missing-atom state is unchanged',()=>{
 const snapshot=JSON.stringify({reportedCost,missingCost});
 const notice=status.analysisNotice({...complete,evidence:reportedCost,guidance:missingCost});
 assert.deepEqual(Array.from(notice.items),[status.requirementLabels.tuesday_evening_sales,status.requirementLabels.unchanged_schedule]);
 assert.equal(notice.staffing_test_approved,true);assert.equal(JSON.stringify({reportedCost,missingCost}),snapshot);
});
for(const [label,edit] of [
 ['wrong day',e=>{e.provenance.items[0].text=staffingSource.replace('Tuesday','Friday');e.costs.items[0].source_text=e.provenance.items[0].text;}],
 ['invented source quote',e=>{e.costs.items[0].source_text='PRIVATE invented paraphrase';}],
 ['unsupported amount',e=>{e.costs.items[0].amount=3120;}],
 ['headcount instead of cost',e=>{e.provenance.items[0].text='Tuesday evening staffing has 4 workers.';e.costs.items[0]={amount:4,source_text:e.provenance.items[0].text};}],
 ['per-worker cost instead of staffing cost',e=>{e.provenance.items[0].text='Tuesday evening labor cost is USD 625 per worker.';e.costs.items[0]={amount:625,source_text:e.provenance.items[0].text};}],
])test(`cost display suppression requires existing literal support: ${label}`,()=>{
 const evidence=structuredClone(reportedCost);edit(evidence);
 const notice=status.analysisNotice({...complete,evidence,guidance:missingCost});
 assert.ok(notice.items.includes(status.requirementLabels.tuesday_evening_staffing_cost));
});
test('display cost detection does not hardcode a business amount',()=>{
 const evidence=structuredClone(reportedCost),text=staffingSource.replace('2,500','3,120');
 evidence.costs.items[0]={amount:3120,source_text:text};evidence.provenance.items[0].text=text;
 assert.equal(status.analysisNotice({...complete,evidence,guidance:missingCost}).items.includes(status.requirementLabels.tuesday_evening_staffing_cost),false);
});
const decisionComponent={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/components/decision-panel.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports:decisionComponent.exports,require:name=>{
 if(name==='react/jsx-runtime')return jsx;
 if(name==='./section-icon')return {SectionIcon:()=>null};
 if(name==='@/lib/decision-display')return load('src/lib/decision-display.ts');
 if(name==='@/lib/scenario-display')return load('src/lib/scenario-display.ts');
 throw Error('Unexpected UI dependency');
}});
const rejectedDecision={decision_status:'needs_more_data',recommendation:{type:'collect_data',candidate_id:null,title:'Collect required decision inputs',rationale:'The decision gate indicates no actionable scenario due to lack of authorized changes.'},priority_inputs:[{source_type:'upstream_missing_input',key:'An eligible authorized change',why_it_matters:'An authorized change is missing.'}],comparison:[],confidence:'low'};
test('Decision copy separates explicit test permission from incomplete authorization without changing results',()=>{
 const notice=status.analysisNotice({...complete,evidence:reportedCost,guidance:missingCost});
 const before=JSON.stringify(rejectedDecision);
 const html=renderToStaticMarkup(React.createElement(decisionComponent.exports.DecisionPanel,{result:rejectedDecision,notice}));
 assert.match(html,/The proposed staffing change is approved for testing, but more supporting evidence is required before it can be evaluated safely/);
 assert.match(html,/Supporting inputs for the approved staffing test/);
 assert.doesNotMatch(html,/lack of authorized changes|An eligible authorized change|An authorized change is missing|Recommended candidate|\$/);
 assert.equal(JSON.stringify(rejectedDecision),before);
});
test('UI never infers testing approval from absent metadata or from arbitrary flags',()=>{
 for(const flag of [undefined,false,'true','PRIVATE']){
  const parsed=status.readEvidenceGuidance({...missingCost,staffing_test_permission_present:flag});
  const notice=status.analysisNotice({...complete,evidence:reportedCost,guidance:parsed});
  assert.equal(notice.staffing_test_approved,undefined);
  const html=renderToStaticMarkup(React.createElement(decisionComponent.exports.DecisionPanel,{result:rejectedDecision,notice}));
  assert.doesNotMatch(html,/staffing change is approved for testing/);
 }
});

test('schedule guidance follows accepted missing prerequisites rather than earlier Golden expectations',()=>{
 for(const scheduleMissing of [true,false]){
  const guidance={...missingCost,missing_requirements:missingCost.missing_requirements.filter(key=>scheduleMissing||key!=='unchanged_schedule')};
  const before=JSON.stringify(guidance);
  const notice=status.analysisNotice({...complete,evidence:reportedCost,guidance});
  assert.deepEqual(Array.from(notice.items),[status.requirementLabels.tuesday_evening_sales,...(scheduleMissing?[status.requirementLabels.unchanged_schedule]:[])]);
  assert.equal(JSON.stringify(guidance),before);
 }
});

test('non-ready comparison uses supporting-input copy when testing permission exists without creating impact',()=>{
 const result={...rejectedDecision,comparison:[{candidate_id:null,target_leak:'Tuesday evening staffing',scenario_status:'not_simulation_ready',verified_impact:null,currency:null,assessment:'Not simulation ready due to lack of eligible authorized change.'}]};
 const before=JSON.stringify(result);
 const notice=status.analysisNotice({...complete,evidence:reportedCost,guidance:missingCost});
 const html=renderToStaticMarkup(React.createElement(decisionComponent.exports.DecisionPanel,{result,notice}));
 assert.match(html,/Not simulation ready because required supporting inputs are still missing\./);
 assert.doesNotMatch(html,/lack of eligible authorized change|Needs a controllable decision input|Verified impact|Recommended candidate|\$/);
 assert.equal(JSON.stringify(result),before);
 const withoutPermission=renderToStaticMarkup(React.createElement(decisionComponent.exports.DecisionPanel,{result}));
 assert.match(withoutPermission,/Not simulation ready due to lack of eligible authorized change/);
});
