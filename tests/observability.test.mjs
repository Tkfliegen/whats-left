import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {createRequire} from 'node:module';
import {RunTree} from 'langsmith';
import {productionModules} from './helpers/provenance.mjs';
const native=createRequire(import.meta.url),plain=v=>JSON.parse(JSON.stringify(v));
function helper(){
 const exports={},logs=[];
 vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/observability/langsmith.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,Buffer,process:{env:{}},console:{warn:(...v)=>logs.push(v)},require:native});
 return {...exports,logs};
}
function tracing(env={LANGSMITH_TRACING:'true',LANGSMITH_API_KEY:'PRIVATE_API_KEY',LANGSMITH_PROJECT:'whats-left'},rejectDuplicateUpdates=false){
 const h=helper(),tasks=[],creates=[],updates=[],configs=[];let fail=false,loads=0;
 class Client {constructor(config){configs.push(config);}async createRun(run){if(fail)throw Error('PRIVATE_TRANSPORT_RESPONSE');creates.push(plain(run));}async updateRun(id,run){if(fail)throw Error('PRIVATE_TRANSPORT_RESPONSE');if(rejectDuplicateUpdates&&updates.some(r=>r.id===id))throw Object.assign(Error('payload_already_received'),{name:'LangSmithConflictError',status:409});updates.push({id,...plain(run)});}}
 const api=h.createObservability(env,{sdk:async()=>{loads++;return {Client,RunTree};},schedule:task=>tasks.push(task)});
 return {...api,tasks,creates,updates,configs,logs:h.logs,get loads(){return loads;},fail(){fail=true;},async flush(){while(tasks.length)await tasks.shift()();}};
}
for(const env of [{},{LANGSMITH_TRACING:'false',LANGSMITH_API_KEY:'unused'},{LANGSMITH_TRACING:'true'}])test(`disabled/missing-key tracing preserves exact handler response ${JSON.stringify(env)}`,async()=>{
 const t=tracing(env),response=Response.json({accepted:true}),handlerCalls=[];
 const result=await t.observeRoute('evidence-agent','original-model',async r=>{handlerCalls.push(r);return response;})(new Request('http://local'));
 assert.equal(result,response);assert.equal(handlerCalls.length,1);assert.equal(result.headers.get('x-whats-left-trace'),null);assert.equal(t.tasks.length,0);assert.equal(t.loads,0);
});
test('uploads are background-only and transport failure cannot fail or repeat business execution',async()=>{
 const t=tracing();t.fail();let calls=0;
 const response=await t.observeRoute('evidence-agent','same-model',async()=>{calls++;return Response.json({evidence:{business_type:'bakery'},private:'PRIVATE_BUSINESS_PROSE'});})(new Request('http://local'));
 assert.equal(calls,1);assert.equal(t.loads,0);assert.equal(response.status,200);await t.flush();assert.equal(calls,1);assert.equal(t.loads,1);assert.equal((await response.json()).private,'PRIVATE_BUSINESS_PROSE');
});
test('SDK loading and scheduler failures preserve successful business outputs',async()=>{
 for(const kind of ['sdk','scheduler']){
  const tasks=[];let calls=0;const h=helper();const api=h.createObservability({LANGSMITH_TRACING:'true',LANGSMITH_API_KEY:'key'},
   {sdk:async()=>{throw Error('SECRET');},schedule:task=>{if(kind==='scheduler')throw Error('SECRET');tasks.push(task);}});
  const r=await api.observeRoute('evidence-agent',undefined,async()=>{calls++;return Response.json({exact:42});})(new Request('http://local'));
  for(const task of tasks)await task();assert.equal(calls,1);assert.deepEqual(await r.json(),{exact:42});
 }
});
test('unresolved scheduler or SDK never blocks the unchanged business response',{timeout:2000},async()=>{
 for(const kind of ['scheduler','sdk']){
  const h=helper(),pending=new Promise(()=>{});let calls=0,loads=0,timer,signalSDK;
  const sdkStarted=new Promise(resolve=>{signalSDK=resolve;});
  const api=h.createObservability({LANGSMITH_TRACING:'true',LANGSMITH_API_KEY:'test-only'},
   {sdk:()=>{loads++;signalSDK();return pending;},schedule:task=>kind==='scheduler'?pending:task()});
  const expected=Response.json({accepted:true},{status:201});
  const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Telemetry blocked the response')),500);});
  try {
   const result=await Promise.race([
    api.observeRoute('evidence-agent','unchanged-model',async()=>{calls++;return expected;})(new Request('http://local')),
    deadline,
   ]);
   assert.equal(calls,1);assert.equal(result,expected);assert.equal(result.status,201);
   assert.deepEqual(await result.json(),{accepted:true});
   if(kind==='sdk')await Promise.race([sdkStarted,deadline]);
   assert.equal(loads,kind==='scheduler'?0:1);
  } finally {clearTimeout(timer);}
 }
});
test('business exceptions propagate unchanged and are never retried',async()=>{
 const t=tracing(),expected=Error('business failure');let calls=0;
 await assert.rejects(t.observeRoute('evidence-agent',undefined,async()=>{calls++;throw expected;})(new Request('http://local')),e=>e===expected);
 await t.flush();assert.equal(calls,1);assert.equal(t.creates.find(r=>r.name==='evidence-agent').extra.metadata.error_type,'internal_route_error');
});
test('one signed distributed root contains every actual stage, model and authorization child',async()=>{
 const t=tracing();let token;
 const stages=['evidence-agent','leak-detective','scenario-agent','scenario-calculator','decision-gate','decision-agent'];
 for(const stage of stages){
  const response=await t.observeRoute(stage,stage.endsWith('agent')?'fixed-model':undefined,async()=>{
   if(stage==='scenario-agent'){
    assert.equal(t.traceStage('scenario-authorization',()=>42),42);
    assert.equal(t.traceStage('scenario-authorization-validation',()=>({ok:false})).ok,false);
   }
   return Response.json({evidence:{business_type:'bakery',facts:['PRIVATE_BUSINESS_PROSE']},decision:{decision_status:'needs_more_data'},provider:{headers:{Authorization:'PRIVATE_SECRET'}}});
  })(new Request('http://local',{headers:token?{'x-whats-left-trace':token}:{}}));
  token??=response.headers.get('x-whats-left-trace');assert.equal(response.headers.get('x-whats-left-trace'),token);await t.flush();
 }
 assert.equal(t.updates.length,0); // Even Decision leaves the correlated root to the completion endpoint.
 await t.completeTrace(token,'complete');await t.flush();assert.equal(t.updates.length,1);
 assert.equal(t.creates.filter(r=>r.name==='whats-left-analysis').length,1);
 const root=t.creates[0],routeRuns=t.creates.filter(r=>stages.includes(r.name));assert.equal(routeRuns.length,6);
 for(const r of t.creates){assert.equal(r.trace_id,root.id);assert.ok(r.dotted_order.startsWith(root.dotted_order));assert.deepEqual(r.inputs,{});assert.deepEqual(r.outputs,{});}
 for(const r of routeRuns)assert.equal(r.parent_run_id,root.id);
 const auth=t.creates.find(r=>r.name==='scenario-authorization');assert.equal(auth.parent_run_id,routeRuns.find(r=>r.name==='scenario-agent').id);
 assert.equal(t.creates.find(r=>r.name==='scenario-authorization-validation').extra.metadata.outcome,'rejected');
 assert.equal(t.updates.at(-1).outcome,undefined);assert.equal(t.updates.at(-1).extra.metadata.outcome,'complete');
 assert.doesNotMatch(JSON.stringify(t.creates)+JSON.stringify(t.updates),/PRIVATE|Authorization|headers|facts|PRIVATE_API_KEY/);
 assert.ok(t.configs.every(c=>c.hideInputs&&c.hideOutputs&&c.omitTracedRuntimeInfo&&c.callerOptions.maxRetries===0&&c.autoBatchTracing===false));
 const count=t.updates.length;await t.completeTrace(token+'tampered','complete');await t.completeTrace('arbitrary','complete');await t.flush();assert.equal(t.updates.length,count);
});
test('validation and provider failures remain distinct without retaining messages',async()=>{
 const t=tracing();
 for(const message of ['Leak analysis result rejected by output validation: unreported_number.','Evidence provider is unavailable or returned an invalid response.']){
  await t.observeRoute('evidence-agent',undefined,async()=>Response.json({error:message},{status:502}))(new Request('http://local'));await t.flush();
 }
 const stages=t.creates.filter(r=>r.name==='evidence-agent');assert.equal(stages[0].extra.metadata.validation_reason,'unreported_number');assert.equal(stages[1].extra.metadata.validation_result,'not_reached');
 assert.doesNotMatch(JSON.stringify(t.creates),/Leak analysis result|Evidence provider is unavailable/);
});
test('deterministic calculator and Gate routes return identical bodies with tracing disabled or enabled',async()=>{
 const load=productionModules(),simulation=load('src/app/api/analyze/simulate/route.ts').POST,gate=load('src/app/api/analyze/decision-gate/route.ts').POST;
 for(const [stage,route,body] of [['scenario-calculator',simulation,JSON.parse(fs.readFileSync('tests/fixtures/simulation-labor.json'))],['decision-gate',gate,JSON.parse(fs.readFileSync('tests/fixtures/decision-gate.json')).cornhead]]){
  const req=()=>new Request('http://local',{method:'POST',body:JSON.stringify(body)}),baseline=await route(req()),t=tracing();
  const observed=await t.observeRoute(stage,undefined,route)(req());assert.equal(observed.status,baseline.status);assert.deepEqual(await observed.json(),await baseline.json());await t.flush();
 }
});
test('development diagnostic reports only enablement, never a key or endpoint',()=>{
 const t=tracing({NODE_ENV:'development',LANGSMITH_TRACING:'true',LANGSMITH_API_KEY:'PRIVATE_API_KEY',LANGSMITH_ENDPOINT:'https://PRIVATE_ENDPOINT'});
 assert.equal(t.tracingEnabled(),true);assert.equal(t.tracingEnabled(),true);assert.equal(t.logs.length,1);assert.match(JSON.stringify(t.logs),/enabled/);assert.doesNotMatch(JSON.stringify(t.logs),/PRIVATE/);
});
async function rejectedUpload(error,{operation='root_create',nodeEnv='development',stage='decision-agent'}={}){
 const h=helper(),tasks=[],creates=[],updates=[];let calls=0,createCount=0;
 class Client {
  async createRun(run){createCount++;if(operation==='root_create'&&createCount===1||operation==='child_create'&&createCount===2)throw error;creates.push(plain(run));}
  async updateRun(id,run){if(operation==='end_update')throw error;updates.push({id,...plain(run)});}
 }
 const api=h.createObservability({NODE_ENV:nodeEnv,LANGSMITH_TRACING:'true',LANGSMITH_API_KEY:'PRIVATE_KEY'},
  {sdk:async()=>{if(operation==='sdk_load')throw error;return {Client,RunTree};},schedule:task=>tasks.push(task)});
 const expected=Response.json({private:'PRIVATE_BUSINESS_NOTES',accepted:true});
 const response=await api.observeRoute(stage,undefined,async()=>{calls++;return expected;})(new Request('http://local'));
 assert.equal(response,expected);assert.equal(calls,1);assert.equal(h.logs.some(v=>JSON.stringify(v).includes('upload_failed')),false);
 for(const task of tasks)await task();assert.equal(calls,1);assert.equal((await response.json()).accepted,true);
 const diagnostic=h.logs.map(v=>JSON.parse(v[1])).find(v=>v.reason==='upload_failed');
 return {diagnostic,logs:h.logs,creates,updates};
}
for(const operation of ['root_create','child_create','end_update','sdk_load'])test(`development identifies ${operation} and HTTP status without exposing the exception`,async()=>{
 const error=Object.assign(Error('PRIVATE_KEY PRIVATE_BUSINESS_NOTES Authorization X-Tenant-ID response body'),{status:403,code:'PRIVATE_KEY',headers:{Authorization:'PRIVATE_KEY'},body:'PRIVATE_BUSINESS_NOTES'});
 const result=await rejectedUpload(error,{operation});
 assert.deepEqual(result.diagnostic,{reason:'upload_failed',error_name:'Error',category:'http_error',http_status:403,before_http_response:false,operation,stage:'decision-agent'});
 assert.doesNotMatch(JSON.stringify(result.logs),/PRIVATE|Authorization|Tenant|response body/);
});
test('development classifies safe timeout/network codes and does not invent response timing',async()=>{
 for(const [error,category,code,before] of [
  [Object.assign(Error('PRIVATE'),{name:'TimeoutError'}),'timeout',undefined,'unknown'],
  [Object.assign(Error('PRIVATE'),{name:'AbortError'}),'aborted',undefined,'unknown'],
  [new TypeError('PRIVATE',{cause:{code:'ENOTFOUND',hostname:'PRIVATE'}}),'network_error','ENOTFOUND',true],
  [new TypeError('PRIVATE',{cause:{code:'UND_ERR_BODY_TIMEOUT'}}),'timeout','UND_ERR_BODY_TIMEOUT','unknown'],
  [new TypeError('PRIVATE',{cause:{code:'ECONNRESET'}}),'network_error','ECONNRESET','unknown'],
 ]){
  const {diagnostic,logs}=await rejectedUpload(error);
  assert.equal(diagnostic.category,category);assert.equal(diagnostic.error_code,code);assert.equal(diagnostic.before_http_response,before);
  assert.equal(diagnostic.http_status,undefined);assert.doesNotMatch(JSON.stringify(logs),/PRIVATE/);
 }
});
test('unknown names, codes, invalid statuses and throwing getters never disclose data or escape',async()=>{
 for(const error of [
  {name:'PRIVATE_KEY',code:'PRIVATE_BUSINESS_NOTES',status:95800,message:'PRIVATE'},
  Object.defineProperties({},Object.fromEntries(['name','code','status','statusCode','response','cause'].map(key=>[key,{get(){throw Error('PRIVATE');}}]))),
 ]){
  const {diagnostic,logs}=await rejectedUpload(error);
  assert.equal(diagnostic.error_name,'unknown');assert.equal(diagnostic.category,'unknown');assert.equal(diagnostic.http_status,undefined);assert.equal(diagnostic.error_code,undefined);
  assert.doesNotMatch(JSON.stringify(logs),/PRIVATE|95800/);
 }
});
for(const nodeEnv of ['production','test'])test(`${nodeEnv} retains existing silence with no diagnostic details`,async()=>{
 const {logs}=await rejectedUpload(Object.assign(Error('PRIVATE'),{status:429}),{nodeEnv});assert.equal(logs.length,0);
});
test('successful development uploads keep the same spans and emit no failure diagnostic',async()=>{
 const {diagnostic,creates,updates}=await rejectedUpload(Error('unused'),{operation:'none'});
 assert.equal(diagnostic,undefined);assert.equal(creates.length,2);assert.equal(updates.length,1);
 assert.deepEqual(creates.map(r=>r.name),['whats-left-analysis','decision-agent']);
 assert.ok(creates.every(r=>Object.keys(r.inputs).length===0&&Object.keys(r.outputs).length===0));
});
for(const order of ['decision-first','completion-first'])test(`single root owner eliminates duplicate-payload 409 with ${order} scheduling`,async()=>{
 const t=tracing({NODE_ENV:'development',LANGSMITH_TRACING:'true',LANGSMITH_API_KEY:'PRIVATE_KEY'},true);
 const evidence=await t.observeRoute('evidence-agent',undefined,async()=>Response.json({}))(new Request('http://local'));
 const token=evidence.headers.get('x-whats-left-trace');await t.flush();
 const response=await t.observeRoute('decision-agent',undefined,async()=>Response.json({accepted:true}))(new Request('http://local',{headers:{'x-whats-left-trace':token}}));
 assert.equal(response.status,200);assert.deepEqual(await response.json(),{accepted:true});assert.equal(t.updates.length,0);
 const decisionTask=t.tasks.shift();await t.completeTrace(token,'complete');const completionTask=t.tasks.shift();
 for(const task of order==='decision-first'?[decisionTask,completionTask]:[completionTask,decisionTask])await task();
 const root=t.creates.find(r=>r.name==='whats-left-analysis'),child=t.creates.filter(r=>r.name==='decision-agent');
 assert.equal(child.length,1);assert.equal(child[0].parent_run_id,root.id);assert.equal(typeof child[0].end_time,'number');
 assert.equal(t.updates.length,1);assert.equal(t.updates[0].id,root.id);assert.equal(t.updates[0].extra.metadata.outcome,'complete');
 assert.doesNotMatch(JSON.stringify(t.logs),/upload_failed|payload_already_received|409/);
});
for(const stage of ['evidence-agent','leak-detective','scenario-agent','decision-agent'])test(`correlated ${stage} rejection delegates root finalization to completeTrace`,async()=>{
 const t=tracing();let token;
 if(stage!=='evidence-agent'){
  const evidence=await t.observeRoute('evidence-agent',undefined,async()=>Response.json({}))(new Request('http://local'));
  token=evidence.headers.get('x-whats-left-trace');await t.flush();
 }
 const response=await t.observeRoute(stage,undefined,async()=>Response.json({error:'unchanged failure'},{status:502}))(new Request('http://local',{headers:token?{'x-whats-left-trace':token}:{}}));
 token=response.headers.get('x-whats-left-trace');await t.flush();assert.equal(response.status,502);assert.equal(t.updates.length,0);
 const child=t.creates.find(r=>r.name===stage);assert.equal(typeof child.end_time,'number');assert.equal(child.extra.metadata.outcome,'rejected');
 await t.completeTrace(token,'failed');await t.flush();assert.equal(t.updates.length,1);assert.equal(t.updates[0].extra.metadata.outcome,'failed');
});
for(const stage of ['leak-detective','scenario-agent','scenario-calculator','decision-gate','decision-agent'])for(const status of [200,502])test(`standalone ${stage} HTTP ${status} retains one root completion`,async()=>{
 const t=tracing(),expected=Response.json({unchanged:true},{status});
 const response=await t.observeRoute(stage,undefined,async()=>expected)(new Request('http://local'));
 assert.equal(response,expected);await t.flush();assert.equal(t.creates.length,2);assert.equal(t.updates.length,1);
 assert.equal(t.updates[0].id,t.creates[0].id);assert.equal(t.updates[0].extra.metadata.outcome,status===200?'complete':'failed');
});
test('correlated cancellation has one endpoint-owned root completion',async()=>{
 const t=tracing(),response=await t.observeRoute('evidence-agent',undefined,async()=>Response.json({}))(new Request('http://local'));
 await t.flush();assert.equal(t.updates.length,0);await t.completeTrace(response.headers.get('x-whats-left-trace'),'cancelled');await t.flush();
 assert.equal(t.updates.length,1);assert.equal(t.updates[0].extra.metadata.outcome,'cancelled');
});
