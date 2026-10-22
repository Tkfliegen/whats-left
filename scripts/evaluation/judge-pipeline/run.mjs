// Explicit one-pass live browser evaluation. Never imported by the app.
import fs from 'node:fs';import assert from 'node:assert/strict';import crypto from 'node:crypto';
import {cases as allCases} from './cases.mjs';import {auditCase} from './audit.mjs';
const option=name=>{const i=process.argv.indexOf(name);return i<0?undefined:process.argv[i+1];};
const selected=option('--cases')?.split(',');
const cases=selected?allCases.filter(c=>selected.includes(c.id)):allCases;
assert.ok(!selected||cases.length===selected.length,'Unknown or duplicate case selection');
const out=option('--out')??'docs/evaluations/judge-style-full-pipeline',logPath='/tmp/decision-integration-dev-turbo.log';
const resume=process.argv.includes('--resume-unsubmitted');
assert.ok(resume||!fs.existsSync(out+'/results.json'),'Refusing an accidental second suite');assert.equal(allCases.length,12);
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const sources=Object.fromEntries(fs.readdirSync('src',{recursive:true}).filter(f=>fs.statSync('src/'+f).isFile()).map(f=>['src/'+f,sha(fs.readFileSync('src/'+f))]));
const model=name=>fs.readFileSync(`src/app/api/analyze/${name}/route.ts`,'utf8').match(/(?:const NEBIUS_MODEL = |model: )"([^"]+)"/)[1];
const models=Object.fromEntries(['evidence','leaks','scenarios','decision'].map(n=>[n,model(n)]));
assert.deepEqual(models,{evidence:'nvidia/Nemotron-3-Ultra-550b-a55b',leaks:'nvidia/Nemotron-3-Ultra-550b-a55b',scenarios:'nvidia/Nemotron-3_5-Lightning',decision:'nvidia/nemotron-3-super-120b-a12b'});
if(!resume){
fs.mkdirSync(out+'/runs',{recursive:true});fs.writeFileSync(out+'/cases.json',JSON.stringify(cases,null,2));fs.writeFileSync(out+'/manifest.json',JSON.stringify({started:new Date().toISOString(),models,source_hashes:sources,cases_sha256:sha(JSON.stringify(cases)),planned_submissions:cases.length,maximum_provider_calls:cases.length*4,retries:false,repairs:false,fallbacks:false,method:'Sequential real browser form submissions through existing localhost app/production routes, one per fixed note, no response interception/replacement or agent mocks. Fetch wrapping records unchanged responses only; failures stop that application flow naturally. Independent cases continue. Source-bound expectations declared before submission; audit is offline and makes no network calls.'},null,2));
}else{
 const manifest=JSON.parse(fs.readFileSync(out+'/manifest.json'));assert.deepEqual(sources,manifest.source_hashes);assert.deepEqual(models,manifest.models);assert.equal(sha(JSON.stringify(cases)),manifest.cases_sha256);
}
const targets=await(await fetch('http://127.0.0.1:9223/json')).json();const target=targets.find(t=>t.type==='page');assert.ok(target);
const ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});let next=0;const pending=new Map();let consoleDiagnostics=[],exceptions=[];
ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.method==='Runtime.consoleAPICalled'){const args=m.params.args.map(a=>a.value);if(typeof args[0]==='string'&&args[0].includes("[What's Left?]")&&typeof args[1]==='string'){try{consoleDiagnostics.push({label:args[0],diagnostic:JSON.parse(args[1])});}catch{/* no arbitrary prose captured */}}}if(m.method==='Runtime.exceptionThrown')exceptions.push(m.params.exceptionDetails.text);if(m.id){const p=pending.get(m.id);pending.delete(m.id);if(m.error)p.reject(Error(JSON.stringify(m.error)));else p.resolve(m.result);}};
const send=(method,params={})=>new Promise((r,j)=>{const id=++next;pending.set(id,{resolve:r,reject:j});ws.send(JSON.stringify({id,method,params}));});
const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error('Browser evaluation failed');return r.result.value;};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));const results=[];
if(resume){
 const submitted=JSON.parse(fs.readFileSync(out+'/submitted.json'));
 for(const id of submitted){assert.ok(fs.existsSync(out+`/runs/${id}.json`),'A submitted note without a saved terminal response cannot be retried');const c=cases.find(c=>c.id===id);results.push(auditCase(c,JSON.parse(fs.readFileSync(out+`/runs/${id}.json`))));}
 fs.writeFileSync(out+'/results-before-audit-fix.json',fs.readFileSync(out+'/results.json'));
 fs.writeFileSync(out+'/results.json',JSON.stringify({results},null,2));
 fs.writeFileSync(out+'/harness-resume.json',JSON.stringify({reason:'Offline reader attempted to validate Scenario error envelope as a success. Raw J10 was already saved. Reader now audits only HTTP 200 success bodies.',previous_submissions:submitted,resume_only:cases.filter(c=>!submitted.includes(c.id)).map(c=>c.id),no_submitted_case_retried:true,production_source_unchanged:true},null,2));
}

try{
 await send('Runtime.enable');await send('Page.enable');
 for(const c of cases){
  if(results.some(r=>r.id===c.id))continue;
  await send('Page.navigate',{url:'about:blank'});await sleep(150);await send('Page.navigate',{url:'http://127.0.0.1:3000'});
  let ready=false;for(let i=0;i<150;i++){await sleep(200);ready=await evaluate("document.readyState==='complete'&&Object.keys(document.querySelector('form')||{}).some(k=>k.startsWith('__reactProps')&&typeof document.querySelector('form')[k].onSubmit==='function')");if(ready)break;}assert.ok(ready,'Form not ready; no submission was made');
  consoleDiagnostics=[];exceptions=[];const offset=fs.statSync(logPath).size;
  console.log(JSON.stringify({case:c.id,event:'single_submission',name:c.name}));
  fs.writeFileSync(out+'/submitted.json',JSON.stringify([...results.map(r=>r.id),c.id]));
  await evaluate(`(()=>{window.__judgeCalls=[];window.__judgeStarted=Date.now();const original=window.fetch;window.fetch=async(...args)=>{const url=String(args[0]);if(!url.startsWith('/api/analyze/'))return original(...args);const call={url,body:JSON.parse(args[1].body),started:Date.now()};window.__judgeCalls.push(call);try{const response=await original(...args);call.status=response.status;try{call.response=await response.clone().json();}catch{call.response_parse_failed=true;}call.finished=Date.now();return response;}catch(error){call.error=String(error);call.finished=Date.now();throw error;}};const set=(name,value)=>{const input=document.querySelector('[name='+name+']');const prototype=input.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:input.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(prototype,'value').set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));};set('businessName',${JSON.stringify(c.name)});set('businessType',${JSON.stringify(c.business_type)});set('notes',${JSON.stringify(c.note)});document.querySelector('form').requestSubmit();})()`);
  const timeline=[];let state,finished;
  for(let i=0;i<6000;i++){await sleep(50);state=await evaluate("({calls:window.__judgeCalls.map(c=>({url:c.url,status:c.status})),error:document.querySelector('[role=alert]')?.textContent,complete:document.querySelector('button[type=submit]')?.textContent.includes('Run Analysis Again')})");timeline.push({at:Date.now(),...state});if(state.error||state.complete){finished=Date.now();break;}}
  assert.ok(finished,'Application did not reach a terminal state; suite stops without retry');
  const raw=await evaluate("({calls:window.__judgeCalls,started:window.__judgeStarted,page_text:document.body.innerText})");
  assert.equal(new Set(raw.calls.map(c=>c.url)).size,raw.calls.length,'No endpoint retries permitted');
  assert.equal(raw.calls[0].body.input,`Business name: ${c.name}\nSelected business type: ${c.business_type}\nBusiness description / notes: ${c.note}`);
  const log=fs.readFileSync(logPath).subarray(offset).toString();const diagnostics=[];for(const line of log.split('\n')){const match=line.match(/\[What's Left\?\] (.+?) (\{.*\})/);if(match){try{diagnostics.push({label:match[1],diagnostic:JSON.parse(match[2])});}catch{/* no raw log copied */}}}
  Object.assign(raw,{complete:state.complete,error:state.error??null,total_latency_ms:finished-raw.started,timeline,server_diagnostics:diagnostics,console_diagnostics:consoleDiagnostics,exceptions});
  fs.writeFileSync(out+`/runs/${c.id}.json`,JSON.stringify(raw,null,2));const result=auditCase(c,raw);results.push(result);fs.writeFileSync(out+'/results.json',JSON.stringify({results},null,2));
  console.log(JSON.stringify({case:c.id,event:'terminal',provisional:result.classification,complete:raw.complete,stopping_stage:result.first_failing_stage,failure:result.failure_category,diagnostics:diagnostics,total_latency_ms:raw.total_latency_ms}));
 }
 const changed=Object.keys(sources).filter(f=>sha(fs.readFileSync(f))!==sources[f]);assert.deepEqual(changed,[]);fs.writeFileSync(out+'/source-check.json',JSON.stringify({finished:new Date().toISOString(),production_source_hashes_unchanged:true,changed_source_files:changed,models,submissions:results.length,endpoint_calls:results.reduce((n,r)=>n+Object.values(r.stages).filter(s=>s.reached).length,0),retries:false,repairs:false,fallbacks:false},null,2));
}finally{ws.close();}
