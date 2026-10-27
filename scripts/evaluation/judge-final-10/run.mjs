// Dedicated approved final-10 live frontend runner. Never imported by production.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import crypto from 'node:crypto';
import {auditFinal,safetyKeys} from './audit.mjs';
const option=(name,fallback)=>{const i=process.argv.indexOf(name);return i<0?fallback:process.argv[i+1];};
const manifestPath='docs/evaluations/judge-style-final-10/cases.json',frozenPath='docs/evaluations/judge-style-final-10/F01-frozen-input.txt';
const bytes=fs.readFileSync(manifestPath),fixture=JSON.parse(bytes),cases=fixture.cases;
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
assert.equal(cases.length,10);assert.equal(new Set(cases.map(c=>c.id)).size,10);
for(const c of cases)assert.equal(sha(c.input),c.input_sha256,`${c.id} input hash`);
assert.ok(fs.readFileSync(frozenPath).equals(Buffer.from(cases[0].input)),'Frozen F01 must match byte-for-byte');
const sourceHashes=()=>Object.fromEntries(fs.readdirSync('src',{recursive:true}).filter(f=>fs.statSync(path.join('src',f)).isFile()).map(f=>['src/'+f,sha(fs.readFileSync('src/'+f))]));
const protectedHashes=()=>Object.fromEntries(['scripts/evaluation/judge-pipeline','docs/evaluations/judge-style-full-pipeline','docs/evaluations/judge-style-final-acceptance'].flatMap(dir=>fs.readdirSync(dir,{recursive:true}).filter(f=>fs.statSync(path.join(dir,f)).isFile()).map(f=>[path.join(dir,f),sha(fs.readFileSync(path.join(dir,f)))])));
if(process.argv.includes('--check')){console.log('PASS: ten unique cases, all input SHA-256 hashes, byte-for-byte frozen F01; no network calls.');process.exit(0);}
const out=option('--out','docs/evaluations/judge-style-final-10/live-2026-10-26'),base=option('--base','http://127.0.0.1:3000'),cdp=option('--cdp','http://127.0.0.1:9223'),logPath=option('--log','.next/dev/logs/next-development.log');
assert.ok(!fs.existsSync(out),'Refusing to overwrite or repeat an existing run');
const sources=sourceHashes(),historical=protectedHashes();
const models=Object.fromEntries(['evidence','leaks','scenarios','decision'].map(n=>[n,fs.readFileSync(`src/app/api/analyze/${n}/route.ts`,'utf8').match(/(?:const NEBIUS_MODEL = |model: )"([^"]+)"/)?.[1]??'see source']));
const targets=await(await fetch(cdp+'/json')).json(),target=targets.find(t=>t.type==='page');assert.ok(target,'Dedicated browser target required');
const ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});let sequence=0;const pending=new Map();let consoleDiagnostics=[],exceptions=[];
ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.method==='Runtime.consoleAPICalled'){const args=m.params.args.map(a=>a.value);if(typeof args[0]==='string'&&args[0].includes("[What's Left?]")&&typeof args[1]==='string'){try{consoleDiagnostics.push({label:args[0],diagnostic:JSON.parse(args[1])});}catch{}}}if(m.method==='Runtime.exceptionThrown')exceptions.push(m.params.exceptionDetails.text);if(m.id){const p=pending.get(m.id);pending.delete(m.id);if(m.error)p.reject(Error(JSON.stringify(m.error)));else p.resolve(m.result);}};
const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error('Browser evaluation failed: '+r.exceptionDetails.text);return r.result.value;};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const write=(name,value)=>fs.writeFileSync(out+'/'+name,JSON.stringify(value,null,2)+'\n');
fs.mkdirSync(out+'/runs',{recursive:true});fs.writeFileSync(out+'/approved-cases.json',bytes);fs.copyFileSync(frozenPath,out+'/F01-frozen-input.txt');
write('manifest.json',{started:new Date().toISOString(),timezone:'Asia/Dubai',models,source_hashes:sources,historical_hashes:historical,approved_manifest_sha256:sha(bytes),frozen_input_sha256:sha(fs.readFileSync(frozenPath)),planned_submissions:10,maximum_model_route_calls:40,retries:false,repairs:false,fallbacks:false,case_1_rerun_authorized:'User explicitly requested all 10 live cases after freezing the input; frozen source input and prior PASS unchanged.',method:'Invoke existing BusinessInputPanel onAnalyze/startAnalysis callback in the live browser with each exact approved input. Original frontend hook, validators, requests, handoffs, routes and real provider calls run unchanged. Fetch wrapper records unchanged request/response bodies. Does not mock responses, modify input, inject oracle values or change production state/code.'});
const results=[],submitted=[];
function diagnostics(offset){
 if(!fs.existsSync(logPath))return [];
 const rows=[];for(const line of fs.readFileSync(logPath).subarray(offset).toString().split('\n'))try{
  const row=JSON.parse(line);if(row.source!=='Server')continue;
  const m=row.message?.match(/\[What's Left\?\] (.+?) ("[\s\S]*"|\{[\s\S]*\})$/);if(!m)continue;
  let value=m[2];for(let i=0;i<5&&typeof value==='string';i++){try{value=JSON.parse(value);}catch{value=value.replaceAll('\\"','"');}}
  if(value&&typeof value==='object')rows.push({label:m[1],diagnostic:value});
 }catch{}return rows;
}
function report(){
 const count=k=>results.filter(r=>r.classification===k).length;
 const latencies=results.map(r=>r.total_latency_ms);
 const totals=Object.fromEntries(safetyKeys.map(k=>[k,results.reduce((n,r)=>n+r.safety_counters[k],0)]));
 const summary={cases_planned:10,cases_submitted:submitted.length,cases_recorded:results.length,PASS:count('PASS'),PARTIAL:count('PARTIAL'),FAIL:count('FAIL'),safe_completed_outcomes:results.filter(r=>r.safe_completed).length,frontend_complete:results.filter(r=>r.frontend.complete).length,provider_failures:results.filter(r=>r.provider_failure).length,runtime_or_validation_failures:results.filter(r=>r.execution_failure&&!r.provider_failure).length,behavioral_failures:results.filter(r=>r.behavioral_failure).length,average_latency_ms:latencies.length?Math.round(latencies.reduce((a,b)=>a+b,0)/latencies.length):null,max_latency_ms:latencies.length?Math.max(...latencies):null,safety_violation_counts:totals,unreached_stages_are_not_passes:true};
 write('results.json',{results});write('summary.json',summary);
 const lines=['# Final 10-case live validation','','Real live providers through the existing frontend and current application routes. Exact approved inputs; no retries, repairs, fallbacks or production changes.','','```json',JSON.stringify(summary,null,2),'```','','| Case | Result | Frontend Complete | Safe completed | Latency ms | Failure / coverage reason |','|---|---|---|---|---|---|',...results.map(r=>`| ${r.id} | ${r.classification} | ${r.frontend.complete} | ${r.safe_completed} | ${r.total_latency_ms} | ${(r.execution_failure?.stage+': '+r.execution_failure?.reason).replace('undefined: undefined','')||r.violations.map(v=>v.stage+': '+(v.reason??v.kind)).join('; ')||r.missed.map(x=>x.stage+': '+x.kind).join('; ')||'None'} |`),'','Safety counters are incident counts and may overlap. Zero observed violations does not establish safety for unreached stages. Provider/runtime/schema failures are reported independently from behavioral safety violations. Correct completed source-justified abstention counts as PASS.',''];
 for(const r of results){lines.push(`## ${r.id}: ${r.classification}`,'',`Raw artifact: [runs/${r.id}.json](runs/${r.id}.json).`,'',`Execution failure: ${r.execution_failure?JSON.stringify(r.execution_failure):'none'}.`,'',`Safety violations: ${JSON.stringify(r.violations)}.`,'',`Coverage misses: ${JSON.stringify(r.missed)}.`,'');for(const [stage,outcome] of Object.entries(r.stage_outcomes))lines.push(`**${stage}:** ${outcome===null?'Not reached / no accepted result.':JSON.stringify(outcome)}`,'');}
 fs.writeFileSync(out+'/report.md',lines.join('\n'));
}
try{
 await send('Runtime.enable');await send('Page.enable');
 for(const c of cases){
  await send('Page.navigate',{url:'about:blank'});await sleep(150);await send('Page.navigate',{url:base});
  let ready=false;for(let i=0;i<150;i++){await sleep(200);ready=await evaluate(`(()=>{const f=document.querySelector('form');if(!f)return false;let n=f[Object.keys(f).find(k=>k.startsWith('__reactFiber'))];for(;n;n=n.return)if(typeof n.memoizedProps?.onAnalyze==='function')return true;return false;})()`);if(ready)break;}
  const offset=fs.existsSync(logPath)?fs.statSync(logPath).size:0;consoleDiagnostics=[];exceptions=[];
  const timeline=[];let raw,state,finished;
  if(ready){
   submitted.push(c.id);write('submitted.json',submitted);console.log(JSON.stringify({case:c.id,event:'single_live_submission',input_sha256:c.input_sha256}));
   await evaluate(`(()=>{window.__finalCalls=[];window.__finalStarted=Date.now();window.__finalDone=false;const original=window.fetch;window.fetch=async(...args)=>{const url=String(args[0]);if(!url.startsWith('/api/analyze/'))return original(...args);const call={url,body:JSON.parse(args[1].body),started:Date.now()};window.__finalCalls.push(call);try{const response=await original(...args);call.status=response.status;try{call.response=await response.clone().json();}catch{call.response_parse_failed=true;}call.finished=Date.now();return response;}catch(error){call.error=String(error);call.finished=Date.now();throw error;}};const f=document.querySelector('form');let n=f[Object.keys(f).find(k=>k.startsWith('__reactFiber'))];for(;n;n=n.return)if(typeof n.memoizedProps?.onAnalyze==='function'){n.memoizedProps.onAnalyze(${JSON.stringify(c.input)},${JSON.stringify(c.note)}).then(value=>{window.__finalDone=true;window.__finalSuccess=value===true;},error=>{window.__finalDone=true;window.__finalError=String(error);});return true;}throw Error('Existing frontend analysis callback unavailable');})()`);
   for(let i=0;i<660;i++){
    await sleep(500);state=await evaluate(`({calls:window.__finalCalls,started:window.__finalStarted,done:window.__finalDone,success:window.__finalSuccess,error:window.__finalError??document.querySelector('[role=alert]')?.textContent,complete:document.querySelector('form button.analyze-button')?.textContent.includes('Run Analysis Again')??false})`);
    timeline.push({at:Date.now(),done:state.done,complete:state.complete,calls:state.calls.map(x=>({url:x.url,status:x.status})),error:state.error});
    write(`runs/${c.id}.inflight.json`,state);
    if(state.done){await sleep(150);finished=Date.now();break;}
   }
   raw=await evaluate(`({calls:window.__finalCalls,started:window.__finalStarted,page_text:document.body.innerText,complete:document.querySelector('form button.analyze-button')?.textContent.includes('Run Analysis Again')??false,error:window.__finalError??document.querySelector('[role=alert]')?.textContent})`);
   raw.complete=!!(finished&&state.success&&raw.complete);raw.error=raw.error??(finished?null:'Runner terminal timeout; no retry');
  }else raw={calls:[],started:Date.now(),complete:false,error:'Frontend callback not ready; case not submitted'};
  Object.assign(raw,{id:c.id,total_latency_ms:(finished??Date.now())-raw.started,timeline,server_diagnostics:diagnostics(offset),console_diagnostics:consoleDiagnostics,exceptions,input_sha256:c.input_sha256});
  write(`runs/${c.id}.json`,raw);
  if(raw.calls.length)assert.equal(raw.calls[0].body.input,c.input,'Exact input mismatch');
  assert.equal(new Set(raw.calls.map(x=>x.url)).size,raw.calls.length,'Duplicate endpoint call; no retries allowed');
  let audited;try{audited=auditFinal(c,raw);}catch(error){write(`runs/${c.id}.audit-error.json`,{error:String(error),stack:error.stack});throw error;}
  results.push(audited);report();console.log(JSON.stringify({case:c.id,event:'terminal',classification:audited.classification,frontend_complete:raw.complete,execution_failure:audited.execution_failure?.category??null,safety_counters:audited.safety_counters,total_latency_ms:raw.total_latency_ms}));
  if(!finished&&ready)throw Error('Terminal timeout: preserve artifacts and stop to avoid overlap.');
 }
}finally{
 write('source-check.json',{finished:new Date().toISOString(),production_source_hashes_unchanged:JSON.stringify(sourceHashes())===JSON.stringify(sources),historical_files_unchanged:JSON.stringify(protectedHashes())===JSON.stringify(historical),approved_manifest_unchanged:sha(fs.readFileSync(manifestPath))===sha(bytes),frozen_input_unchanged:sha(fs.readFileSync(frozenPath))===cases[0].input_sha256});report();ws.close();
}
