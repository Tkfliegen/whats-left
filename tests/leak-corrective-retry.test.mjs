import test from 'node:test';
import assert from 'node:assert/strict';
import {completeLabor} from './helpers/complete-labor.mjs';
import {productionModules} from './helpers/provenance.mjs';
import {harness} from './helpers/analysis-harness.mjs';

const completion=result=>Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(result)}}]});
function setup(kind='number',options={}) {
 const f=completeLabor();
 const valid={leaks:[{...f.finding,title:'Tuesday evening staffing cost is lower than sales revenue'}],insufficient_evidence:[]};
 const invalid=structuredClone(valid);
 if(kind==='comparison')invalid.leaks[0].title='Tuesday evening staffing cost exceeds sales revenue';
 else if(kind==='unit')invalid.leaks[0].interpretation='The staffing cost share is 1%.';
 else invalid.leaks[0].interpretation='The staffing cost represents 31.3% of sales.';
 return {f,valid,invalid,...options};
}
async function run(sequence,{f=completeLabor(),logger}={}) {
 const calls=[],logs=[];
 const modules=productionModules(async(url,options)=>{
  calls.push({url,payload:JSON.parse(options.body),signal:options.signal});
  const item=sequence[Math.min(calls.length-1,sequence.length-1)];
  if(item instanceof Error)throw item;
  return item instanceof Response?item:completion(item);
 },{console:logger??{info:(label,data)=>logs.push({label,...JSON.parse(data)}),warn:()=>{}}});
 const response=await modules('src/app/api/analyze/leaks/route.ts').POST(new Request('http://localhost/api/analyze/leaks',{method:'POST',body:JSON.stringify({evidence:f.evidence,operational_context:[]})}));
 return {response,body:await response.json(),calls,logs};
}
for(const [kind,reason] of [['number','unreported_number'],['comparison','unverified_comparison'],['unit','unreported_numeric_unit']])test(`eligible ${reason} triggers one corrective generation and accepts a validated second result`,async()=>{
 const s=setup(kind),before=JSON.stringify(s);
 const result=await run([s.invalid,s.valid],s);
 assert.equal(result.response.status,200);assert.equal(result.calls.length,2);
 assert.equal(result.body.leaks.leaks[0].intervention_ref,'headcount_reduction');
 const [first,second]=result.calls.map(c=>c.payload);
 assert.deepEqual(second.messages.slice(0,2),first.messages);assert.equal(first.messages.length,2);assert.equal(second.messages.length,3);
 assert.deepEqual(second.response_format,first.response_format);assert.equal(second.model,first.model);
 assert.equal(second.temperature,first.temperature);assert.equal(second.max_tokens,first.max_tokens);
 assert.equal(result.calls[0].signal,result.calls[1].signal);
 assert.match(second.messages[2].content,/Do not calculate|Do not calculate or introduce/);
 assert.doesNotMatch(second.messages[2].content,/31\.3|unreported_number|unverified_comparison|stack|fact_/);
 assert.equal(JSON.stringify(s),before);
 assert.ok(result.logs.some(log=>log.generation==='primary_initial'&&log.retry_reason===reason&&log.final_validation_result==='corrective_retry_pending'));
 assert.ok(result.logs.some(log=>log.generation==='primary_corrective_retry'&&log.retry_reason===reason&&log.final_validation_result==='accepted'));
});
test('valid first output requires exactly one generation and no corrective feedback',async()=>{
 const s=setup(),r=await run([s.valid],s);assert.equal(r.response.status,200);assert.equal(r.calls.length,1);
 assert.equal(r.calls[0].payload.messages.length,2);assert.ok(r.logs.some(log=>log.generation==='primary_initial'&&log.retry_reason===null&&log.final_validation_result==='accepted'));
});
test('two eligible rejections switch once to the configured fallback and accept its validated output',async()=>{
 const s=setup(),r=await run([s.invalid,s.invalid,s.valid],s);
 assert.equal(r.calls.length,3);assert.equal(r.response.status,200);
 assert.deepEqual(r.calls.map(c=>c.payload.model),['nvidia/Nemotron-3-Ultra-550b-a55b','nvidia/Nemotron-3-Ultra-550b-a55b','nvidia/nemotron-3-super-120b-a12b']);
 const [first,,last]=r.calls.map(c=>c.payload);
 assert.deepEqual(last.messages.slice(0,2),first.messages);assert.deepEqual(last.response_format,first.response_format);
 assert.equal(last.chat_template_kwargs.enable_thinking,true);assert.equal(last.max_tokens,8000);
 assert.equal(r.calls[0].signal,r.calls[2].signal);
 assert.ok(r.logs.some(log=>log.generation==='fallback_attempt'&&log.model===last.model&&log.final_outcome==='accepted'));
});
test('three invalid outputs stop safely; an available fourth output is never requested',async()=>{
 const s=setup(),r=await run([s.invalid,s.invalid,s.invalid,s.valid],s);
 assert.equal(r.calls.length,3);assert.equal(r.response.status,502);
 assert.deepEqual(r.body,{error:'Leak analysis result rejected by output validation: unreported_number.'});
 assert.ok(r.logs.some(log=>log.generation==='fallback_attempt'&&log.final_outcome==='rejected'));
});
test('fallback still rejects a false comparative claim after unsupported numeric failures',async()=>{
 const s=setup(),other=setup('comparison');const r=await run([s.invalid,other.invalid,other.invalid,s.valid],s);
 assert.equal(r.calls.length,3);assert.equal(r.response.status,502);assert.match(r.body.error,/unverified_comparison/);
 const feedback=r.calls[2].payload.messages[2].content;
 assert.match(feedback,/unsupported numeric value/);assert.match(feedback,/comparative claim/);assert.doesNotMatch(feedback,/31\.3|PRIVATE|fact_/);
});
for(const [name,make] of [
 ['transport error',()=>new Error('PRIVATE transport')],
 ['HTTP error',()=>Response.json({error:'PRIVATE'},{status:503})],
 ['invalid envelope',()=>Response.json({choices:[]})],
 ['invalid JSON',()=>Response.json({choices:[{finish_reason:'stop',message:{content:'PRIVATE malformed JSON'}}]})],
 ['schema corruption',()=>({leaks:'PRIVATE',insufficient_evidence:[]})],
])test(`${name} never triggers corrective regeneration`,async()=>{
 const r=await run([make()]);assert.equal(r.calls.length,1);assert.equal(r.response.status,502);
 assert.ok(r.logs.some(log=>['rejected','provider_failure'].includes(log.final_outcome)));
});
test('infrastructure failure during correction stops without another attempt',async()=>{
 const s=setup(),r=await run([s.invalid,new Error('PRIVATE transport'),s.valid],s);
 assert.equal(r.calls.length,2);assert.equal(r.response.status,502);assert.match(r.body.error,/unavailable/);
});
test('source identity and incomplete citation failures never retry',async()=>{
 const s=setup();s.valid.leaks[0].evidence_refs=['fact_nonexistent'];let r=await run([s.valid],s);assert.equal(r.calls.length,1);assert.equal(r.response.status,502);
 const other=setup();other.invalid.leaks[0].evidence_refs.pop();r=await run([other.invalid],other);assert.equal(r.calls.length,1);assert.match(r.body.error,/incomplete_citation_support/);
});
test('invalid input authorization never reaches the provider',async()=>{
 const s=setup();s.f.record.permission_source_refs=['src_nonexistent'];const r=await run([s.invalid],s);
 assert.equal(r.calls.length,0);assert.equal(r.response.status,400);
});
test('ambiguous authorization records suppress the quantitative retry',async()=>{
 const s=setup();s.f.evidence.provenance.authorization_records.push(structuredClone(s.f.record));const r=await run([s.invalid,s.valid],s);
 assert.equal(r.calls.length,1);assert.equal(r.response.status,502);
});
test('the deterministic validator is unchanged and still rejects both quantitative defects directly',()=>{
 for(const kind of ['number','comparison']){
  const s=setup(kind),validate=s.f.load('src/app/api/analyze/leaks/output.ts').validateLeakOutput;
  assert.equal(validate(s.invalid,s.f.evidence).ok,false);assert.equal(validate(s.valid,s.f.evidence).ok,true);
 }
});
test('safe diagnostics contain no source text, completion content or numeric business values',async()=>{
 const s=setup(),r=await run([s.invalid,s.valid],s),serialized=JSON.stringify(r.logs);
 for(const privateText of ['Monthly revenue','31.3','2500','8000','625','source_input','fact_','headcount_reduction'])assert.equal(serialized.includes(privateText),false);
 for(const log of r.logs)assert.deepEqual(Object.keys(log).sort(),['final_outcome','final_validation_result','generation','label','model','retry_reason']);
});
test('logger failure cannot change the retry or response',async()=>{
 const s=setup(),r=await run([s.invalid,s.valid],{...s,logger:{info:()=>{throw Error('PRIVATE logger');},warn:()=>{}}});
 assert.equal(r.calls.length,2);assert.equal(r.response.status,200);
});
test('failed fallback stops the real frontend before Scenario and Decision',async()=>{
 const s=setup(),endpoints=[];let generations=0;
 const modules=productionModules(async()=>{generations++;return completion(s.invalid);});
 const h=harness(async(url,options)=>{
  endpoints.push(url);
  if(url==='/api/analyze/evidence')return Response.json({evidence:s.f.evidence});
  if(url==='/api/analyze/leaks')return modules('src/app/api/analyze/leaks/route.ts').POST(new Request('http://localhost'+url,options));
  throw Error('Invalid output escaped downstream');
 });
 h.render();const pending=h.value.startAnalysis(s.f.note,s.f.note);
 for(let i=0;i<8;i++){await h.settle();if(h.timers.size)h.tick();if(h.value.analysisError)break;}
 await pending;h.render();assert.equal(generations,3);assert.deepEqual(endpoints,['/api/analyze/evidence','/api/analyze/leaks']);
 assert.equal(h.value.scenarioResult,null);assert.equal(h.value.decisionResult,null);assert.equal(h.value.analysisStatus.category,'verification');h.unmount();
});

test('non-eligible second validation failures never trigger fallback',async()=>{
 const s=setup(),missing=structuredClone(s.valid);missing.leaks[0].evidence_refs.pop();
 const r=await run([s.invalid,missing,s.valid],s);assert.equal(r.calls.length,2);assert.equal(r.response.status,502);assert.match(r.body.error,/incomplete_citation_support/);
});
test('missing explicit permission prevents model fallback',async()=>{
 const s=setup();s.f.record.permission='absent';s.f.record.permission_source_refs=[];
 const r=await run([s.invalid,s.invalid,s.valid],s);assert.equal(r.calls.length,2);assert.equal(r.response.status,502);
});
test('valid missing-data abstention needs neither corrective retry nor fallback',async()=>{
 const s=setup(),abstention={leaks:[],insufficient_evidence:[{topic:'Staffing efficiency',reason:'An approved test does not establish inefficiency.'}]};
 const r=await run([abstention],s);assert.equal(r.calls.length,1);assert.equal(r.response.status,200);
 assert.ok(r.logs.some(log=>log.final_validation_result==='accepted'&&log.final_outcome==='abstained'));
});
test('fallback gets no citation/source-validation exemption',async()=>{
 const s=setup(),missing=structuredClone(s.valid);missing.leaks[0].evidence_refs.pop();
 const r=await run([s.invalid,s.invalid,missing],s);assert.equal(r.calls.length,3);assert.equal(r.response.status,502);assert.match(r.body.error,/incomplete_citation_support/);
});
test('fallback cannot repair source identity or return malformed schema',async()=>{
 for(const output of [{leaks:'PRIVATE',insufficient_evidence:[]},{...setup().valid,leaks:[{...setup().valid.leaks[0],evidence_refs:['fact_unknown']}]}]){
  const s=setup(),r=await run([s.invalid,s.invalid,output],s);assert.equal(r.calls.length,3);assert.equal(r.response.status,502);
 }
});
