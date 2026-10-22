import {createRequire} from 'node:module';
const nativeRequire=createRequire(import.meta.url);
import {provenance} from './helpers/provenance.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/leaks-bagel.json', import.meta.url), 'utf8'));
fixture.evidence.provenance=provenance.createEvidenceProvenance(fixture.evidence,fixture.operational_context.join('\n'));
const refs=index=>Array.from(fixture.evidence.provenance.citable_facts.filter(item=>item.source_refs.length===1&&provenance.sourceStatements(fixture.operational_context[index]).includes(item.text)).map(item=>item.id));
const validResult = () => ({
  leaks: [
    {title:'Tuesday evening staffing mismatch',category:'labor',evidence_refs:refs(0),evidence:[fixture.operational_context[0]],interpretation:'Staffing costs exceed Tuesday evening sales despite similar staffing to busier Friday evenings.',confidence:'high'},
    {title:'Poor delivery unit economics',category:'delivery',evidence_refs:refs(1),evidence:[fixture.operational_context[1]],interpretation:'Combined costs exceed revenue for some delivery orders. Exact financial impact remains unquantified.',confidence:'high'},
    {title:'Ingredient waste above target',category:'waste',evidence_refs:refs(2),evidence:[fixture.operational_context[2]],interpretation:'Actual waste is 9%, above the stated 5% target.',confidence:'high'},
  ],
  insufficient_evidence:[
    {topic:'Rent and utilities',reason:'No market comparison establishes inefficiency.'},
    {topic:'Overall labor magnitude',reason:'Being the largest cost alone does not establish inefficiency.'},
  ],
});
function loadRoute(fetcher, key='test-key') {
  const cache=new Map();
  function load(filename) {
    if(cache.has(filename))return cache.get(filename);
    const exports={};cache.set(filename,exports);
    const code=ts.transpileModule(readFileSync(filename,'utf8'),{
      compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
    }).outputText;
    vm.runInNewContext(code,{exports,require:specifier=>specifier.startsWith('node:')?nativeRequire(specifier):load(path.resolve(path.dirname(filename),specifier+'.ts')),
      Response,AbortSignal,process:{env:{NEBIUS_API_KEY:key}},fetch:fetcher});
    return exports;
  }
  const dir=fileURLToPath(new URL('../src/app/api/analyze/leaks/',import.meta.url));
  return {...load(path.join(dir,'route.ts')),...load(path.join(dir,'leaks.ts'))};
}
const request=body=>new Request('http://localhost/api/analyze/leaks',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
const completion=result=>Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(result)}}]});

test('valid request uses exact model/configuration/schema and returns typed findings envelope',async()=>{
  let calls=0;
  const {POST,buildLeakInput}=loadRoute(async(url,options)=>{
    calls++;assert.equal(url,'https://api.tokenfactory.nebius.com/v1/chat/completions');
    assert.equal(options.headers.Authorization,'Bearer test-key');assert.equal(options.cache,'no-store');
    assert.ok(options.signal instanceof AbortSignal);
    const body=JSON.parse(options.body);
    assert.equal(body.model,'nvidia/Nemotron-3-Ultra-550b-a55b');assert.equal(body.temperature,0.2);assert.equal(body.max_tokens,4000);
    assert.equal(body.chat_template_kwargs.enable_thinking,false);
    assert.equal(body.response_format.type,'json_schema');assert.equal(body.response_format.json_schema.name,'leak_detective_v1');
    assert.equal(body.response_format.json_schema.strict,true);
    assert.deepEqual(JSON.parse(body.messages[1].content),JSON.parse(JSON.stringify(buildLeakInput(fixture))));
    return completion(validResult());
  });
  const response=await POST(request(fixture));assert.equal(response.status,200);assert.equal(calls,1);
  assert.equal(response.headers.get('cache-control'),'no-store');assert.match(response.headers.get('content-type'),/application\/json/);
  assert.deepEqual(await response.json(),{leaks:{...validResult(),leaks:validResult().leaks.map(f=>({...f,intervention_ref:null}))}});
});
test('invalid bodies, Evidence schema, and operational context are rejected before upstream fetch',async()=>{
  const {POST}=loadRoute(()=>{throw Error('must not fetch');});
  const invalid=[null,[],{}, {evidence:fixture.evidence}, {operational_context:[]},
    {...fixture,evidence:{}}, {...fixture,evidence:null}, {...fixture,evidence:{...fixture.evidence,confidence:'certain'}},
    {...fixture,evidence:{...fixture.evidence,costs:{total:'95800',items:[]}}},
    {...fixture,evidence:{...fixture.evidence,recommendations:[]}},
    ...[null,'text',{},[null],[1],[''],[' \n '],['ok',false]].map(operational_context=>({...fixture,operational_context})),
  ];
  for(const body of invalid)assert.equal((await POST(request(body))).status,400);
  assert.equal((await POST(new Request('http://localhost',{method:'POST',body:'{'}))).status,400);
});
test('empty operational context is valid input; an evidence-only assessment may abstain',async()=>{
  const {POST}=loadRoute(async()=>completion({leaks:[],insufficient_evidence:[{topic:'Cost efficiency',reason:'No operational comparisons supplied.'}]}));
  assert.equal((await POST(request({...fixture,operational_context:[]}))).status,200);
});
test('missing API key returns safe 500 without contacting provider',async()=>{
  const {POST}=loadRoute(()=>{throw Error('must not fetch');},'');
  const response=await POST(request(fixture));assert.equal(response.status,500);
  assert.deepEqual(Object.keys(await response.json()),['error']);
});
test('rejects all malformed fields/enums, extra properties, and empty/blank evidence citations',()=>{
  const {isLeakResult}=loadRoute();assert.equal(isLeakResult(validResult()),true);
  for(const mutate of [
    r=>{delete r.leaks;},r=>{r.leaks={};},r=>{r.insufficient_evidence=null;},r=>{r.recommendations=[];},
    r=>{delete r.leaks[0].title;},r=>{r.leaks[0].category='rent';},r=>{r.leaks[0].confidence='certain';},
    r=>{r.leaks[0].evidence=[];},r=>{r.leaks[0].evidence=['   '];},r=>{r.leaks[0].evidence=[2];},
    r=>{r.leaks[0].interpretation=null;},r=>{r.leaks[0].impact=1180;},
    r=>{delete r.insufficient_evidence[0].reason;},r=>{r.insufficient_evidence[0].topic=2;},r=>{r.insufficient_evidence[0].extra='x';},
  ]){const result=validResult();mutate(result);assert.equal(isLeakResult(result),false);}
});
for(const [name,fetcher] of [
  ['provider non-2xx',async()=>new Response('private provider details',{status:429,headers:{'x-private':'hidden'}})],
  ['network exception',async()=>{throw Error('private provider details');}],
  ['timeout',async()=>{throw new DOMException('private provider details','TimeoutError');}],
  ['malformed upstream envelope',async()=>new Response('{')],
  ['null envelope',async()=>Response.json(null)],
  ['missing choices',async()=>Response.json({choices:[]})],
  ['refusal',async()=>Response.json({choices:[{finish_reason:'stop',message:{refusal:'private provider details'}}]})],
  ['truncated output',async()=>Response.json({choices:[{finish_reason:'length',message:{content:'{}'}}]})],
  ['non-string content',async()=>Response.json({choices:[{finish_reason:'stop',message:{content:[]}}]})],
  ['malformed model JSON',async()=>Response.json({choices:[{finish_reason:'stop',message:{content:'not JSON'}}]})],
  ['schema failure',async()=>completion({leaks:[],insufficient_evidence:[{}]})],
  ['empty citations',async()=>{const result=validResult();result.leaks[0].evidence=[];return completion(result);}],
])test(`safe 502 for ${name}`,async()=>{
  const {POST}=loadRoute(fetcher);const response=await POST(request(fixture));assert.equal(response.status,502);
  const body=await response.json();assert.deepEqual(Object.keys(body),['error']);
  assert.doesNotMatch(body.error,/private|test-key/);assert.equal(response.headers.get('x-private'),null);
});
