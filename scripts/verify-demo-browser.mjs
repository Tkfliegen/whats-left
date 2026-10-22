// Explicit opt-in verification only; never imported by the application.
// --cornhead: four real provider calls via the UI.
// --actionable: fixture Evidence/Leak/Scenario; real Calculator/Gate/Super via UI.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {prepareDemoFixture} from './demo-fixture.mjs';
import {checkDemoReport} from './check-demo-report.mjs';
const mode=process.argv[2];
if(!['--cornhead','--actionable'].includes(mode))throw Error('Choose --cornhead or --actionable explicitly; each submits one analysis without retries.');
const outputDir=process.env.DEMO_VERIFY_OUTPUT??'/tmp/whats-left-final-demo';fs.mkdirSync(outputDir,{recursive:true});
const targets=await(await fetch('http://127.0.0.1:9223/json')).json();
const ws=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);
await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
let nextId=0;const pending=new Map();const exceptions=[];
ws.onmessage=e=>{const message=JSON.parse(e.data);if(message.method==='Runtime.exceptionThrown')exceptions.push(message.params.exceptionDetails.text);if(message.id){const task=pending.get(message.id);pending.delete(message.id);if(message.error)task.reject(Error(JSON.stringify(message.error)));else task.resolve(message.result);}};
const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++nextId;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
const evaluate=async expression=>{const result=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));return result.result.value;};
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
await send('Page.enable');await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
await send('Page.navigate',{url:'about:blank'});await sleep(300);await send('Page.navigate',{url:'http://127.0.0.1:3000'});
let hydrated=false;
for(let i=0;i<100;i++){await sleep(200);hydrated=await evaluate("document.readyState==='complete' && Object.keys(document.querySelector('form')||{}).some(k=>k.startsWith('__reactProps')&&typeof document.querySelector('form')[k].onSubmit==='function')");if(hydrated)break;}
assert.ok(hydrated,'React form must be hydrated before submission');
const cornhead=JSON.parse(fs.readFileSync('tests/fixtures/simulation-cornhead.json','utf8'));
const complete=JSON.parse(fs.readFileSync('tests/fixtures/complete-clear-winner.json','utf8'));
const prepared=prepareDemoFixture(complete);
const fixtureResponses=mode==='--actionable'?{
  '/api/analyze/evidence':{evidence:complete.scenario_request.evidence},
  '/api/analyze/leaks':{leaks:complete.scenario_request.leaks},
  '/api/analyze/scenarios':prepared.scenarioResponse,
}:{};
const notes=mode==='--cornhead'?[
  'Currency:\nUSD',
  'Cornhead is a bagel shop. Last month revenue was $100,000 and total operating costs were $95,800. Known cost items: labor $34,000; ingredients $18,000; rent and utilities $12,500; delivery platform fees $9,300. Remaining operating costs were not itemized.',
  ...cornhead.input_facts.filter(f=>f.source.startsWith('operational_context')).map(f=>f.fact),
].join('\n'):JSON.stringify(complete);
await evaluate(`(()=>{const fixtures=${JSON.stringify(fixtureResponses)};window.__verifyCalls=[];window.__verifyStarted=Date.now();const original=window.fetch;window.fetch=async(...args)=>{const url=String(args[0]);if(!url.startsWith('/api/analyze/'))return original(...args);const item={url,body:JSON.parse(args[1].body),started:Date.now(),fixture:Object.hasOwn(fixtures,url)};window.__verifyCalls.push(item);await new Promise(resolve=>requestAnimationFrame(resolve));item.agents=[...document.querySelectorAll('img')].map(i=>i.alt).filter(a=>/Agent:|Detective:/.test(a));item.disabled=document.querySelector('button[type=submit]').disabled;if(item.fixture)await new Promise(resolve=>setTimeout(resolve,200));try{const response=item.fixture?Response.json(fixtures[url]):await original(...args);item.status=response.status;item.response=await response.clone().json();item.finished=Date.now();return response;}catch(error){item.error=String(error);throw error;}};const set=(name,value)=>{const input=document.querySelector('[name='+name+']');Object.getOwnPropertyDescriptor(input.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));};set('businessName',${JSON.stringify(mode==='--cornhead'?'Cornhead Bagel':'Synthetic complete fixture')});set('notes',${JSON.stringify(notes)});document.querySelector('form').requestSubmit();})()`);
let outcome,previous='',completedAt;const timeline=[];
for(let i=0;i<4800;i++){
  await sleep(50);
  outcome=await evaluate(`({calls:window.__verifyCalls.map(c=>({url:c.url,status:c.status,fixture:c.fixture})),error:document.querySelector('[role=alert]')?.textContent,complete:document.querySelector('button[type=submit]')?.textContent.includes('Run Analysis Again'),agents:[...document.querySelectorAll('img')].map(i=>i.alt).filter(a=>/Agent:|Detective:/.test(a))})`);
  timeline.push({at:Date.now(),...outcome});
  const signature=JSON.stringify(outcome);if(signature!==previous){console.log(signature);previous=signature;}
  if(outcome.error||outcome.complete){completedAt=Date.now();break;}
}
const calls=await evaluate('window.__verifyCalls'),started=await evaluate('window.__verifyStarted');
const report={mode,outcome,total_latency_ms:completedAt-started,calls,exceptions,timeline};
const name=mode.slice(2);
fs.writeFileSync(`${outputDir}/${name}.json`,JSON.stringify(report,null,2));fs.writeFileSync(`${outputDir}/${name}.txt`,await evaluate('document.body.innerText'));
const layouts=[];
for(const [label,width,height] of [['desktop',1440,1000],['tablet',768,1024],['mobile',390,844]]){
  await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await sleep(300);
  await evaluate("document.querySelector('[aria-labelledby=decision-title]')?.scrollIntoView({block:'start'})");await sleep(200);
  const layout=await evaluate(`(()=>{const s=document.querySelector('[aria-labelledby=decision-title]'),o=document.querySelector('[aria-labelledby=office-title]'),f=document.querySelector('footer');return {viewport:innerWidth,documentWidth:document.documentElement.scrollWidth,decisionText:s?.innerText,decisionArticles:s?.querySelectorAll('article').length,overflow:s?[...s.querySelectorAll('*')].filter(e=>e.clientWidth>0&&e.scrollWidth>e.clientWidth+1).map(e=>e.tagName):[],footerOverlaps:s?f.getBoundingClientRect().top<s.getBoundingClientRect().bottom:false,officeWidth:o.getBoundingClientRect().width,officeFits:o.getBoundingClientRect().right<=innerWidth};})()`);
  const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(`${outputDir}/${name}-${label}.png`,Buffer.from(shot.data,'base64'));layouts.push({label,...layout});
  await evaluate("document.querySelector('[aria-labelledby=office-title]').scrollIntoView({block:'start'})");await sleep(200);const officeShot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(`${outputDir}/${name}-${label}-office.png`,Buffer.from(officeShot.data,'base64'));
}
report.layouts=layouts;fs.writeFileSync(`${outputDir}/${name}.json`,JSON.stringify(report,null,2));
try{
  const expectedAgents=['Evidence Agent: active','Leak Detective: active','Scenario Agent: active','Scenario Agent: active','Decision Agent: active','Decision Agent: active'];
  report.agent_states_verified=calls.every((c,index)=>c.agents.includes(expectedAgents[index])||timeline.some(t=>t.calls.at(-1)?.url===c.url&&!t.calls.at(-1)?.status&&t.agents.includes(expectedAgents[index])));
  assert.ok(report.agent_states_verified);assert.ok(calls.every(c=>c.disabled));
  report.checks=checkDemoReport(report);
  fs.writeFileSync(`${outputDir}/${name}.json`,JSON.stringify(report,null,2));
  console.log('VERIFIED',name,report.total_latency_ms+'ms',JSON.stringify(report.checks));
  if(!report.checks.ready_for_unqualified_demo)process.exitCode=1;
}finally{ws.close();}
