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
   result={business_type:null,period:'monthly',currency:'USD',revenue:{total:100000,items:[]},costs:{total:95800,items:[]},facts:[],assumptions:[],missing_information:[],confidence:'high',
    authorization_atoms:[{kind:'scoped_staffing_cost',scope:'tuesday_evening_6pm_10pm',period:'month',amount:2500,currency:'USD',source_refs:[ref(3)]},
     {kind:'headcount_reduction_permission',scope:'tuesday_evening_6pm_10pm',operation:'delta',value:-1,unit:'persons',permission:'explicit',source_refs:[ref(5)]}],
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
 const html=render(h.value.analysisStatus);assert.match(html,/Tuesday evening sales or revenue/);assert.match(html,/staffing schedule will remain unchanged/);
 assert.deepEqual(models,['evidence','leak_detective_v1','scenario_agent_v1','decision_agent_v1']);h.unmount();
});
