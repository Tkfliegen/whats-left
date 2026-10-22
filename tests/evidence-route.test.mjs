import {createRequire} from 'node:module';
const nativeRequire=createRequire(import.meta.url);
import {provenance} from './helpers/provenance.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Exercise the real route with isolated environment/fetch; never read the real key.
function loadRoute(fetcher, key = 'test-key') {
  const cache = new Map();
  function load(name) {
    if (cache.has(name)) return cache.get(name);
    const code = ts.transpileModule(readFileSync(new URL(`../src/app/api/analyze/evidence/${name}.ts`, import.meta.url), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const exports = {};
    cache.set(name, exports);
    vm.runInNewContext(code, { exports, require: specifier => specifier.startsWith('node:') ? nativeRequire(specifier) : load(specifier.slice(2)), Response, AbortSignal,
      process: { env: { NEBIUS_API_KEY: key } }, fetch: fetcher });
    return exports;
  }
  return { ...load('route'), ...load('evidence') };
}
const request = body => new Request('http://localhost/api/analyze/evidence', {
  method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' },
});
const fixture = () => ({
  business_type: 'bagel shop', period: 'Last month', currency: '$',
  revenue: { total: null, items: [] },
  costs: { total: null, items: [
    { name: 'Labor', amount: 34000, reported_category: null, source_text: 'Labor was $34,000' },
    { name: 'Ingredients', amount: 18000, reported_category: null, source_text: 'ingredients were $18,000' },
    { name: 'Rent and utilities', amount: 12500, reported_category: null, source_text: 'rent and utilities were $12,500' },
    { name: 'Delivery platform fees', amount: 9300, reported_category: null, source_text: 'delivery platform fees were $9,300' },
  ] }, facts: [], assumptions: [], missing_information: ['Exact amounts for packaging, waste, software and other expenses'], confidence: 'high',
});
const completion = evidence => Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({...evidence,authorization_atoms:[]}) } }] });

test('validates input before contacting provider', async () => {
  const { POST } = loadRoute(() => { throw Error('must not fetch'); });
  for (const body of [null, [], {}, {input: null}, {input: 5}, {input: ''}, {input: ' \n '}]) {
    assert.equal((await POST(request(body))).status, 400);
  }
  assert.equal((await POST(new Request('http://localhost', {method:'POST', body:'{'}))).status, 400);
});
test('missing key returns safe 500 without fetching', async () => {
  const { POST } = loadRoute(() => { throw Error('must not fetch'); }, '');
  assert.equal((await POST(request({input:'test'}))).status, 500);
});
test('sends fixed model/settings/schema and returns only validated evidence', async () => {
  const { POST } = loadRoute(async (url, options) => {
    assert.equal(url, 'https://api.tokenfactory.nebius.com/v1/chat/completions');
    const body = JSON.parse(options.body);
    assert.equal(body.model, 'nvidia/Nemotron-3-Ultra-550b-a55b');
    assert.equal(body.temperature, 0.2); assert.equal(body.max_tokens, 4000);
    assert.equal(body.chat_template_kwargs.enable_thinking, false);
    assert.equal(body.response_format.type, 'json_schema');
    assert.equal(body.messages[1].content, 'bagel shop');
    return completion(fixture());
  });
  const response = await POST(request({input:' bagel shop '}));
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /application\/json/);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), {evidence:{...fixture(),currency:null,provenance:JSON.parse(JSON.stringify({...provenance.createEvidenceProvenance({...fixture(),currency:null},'bagel shop'),authorization_records:[]}))}});
});
test('rejects wrong types, missing fields, extra fields and non-finite numbers', () => {
  const { matchesSchema } = loadRoute();
  assert.equal(matchesSchema(fixture()), true);
  for (const mutate of [e=>{e.confidence='certain';}, e=>{e.facts={};}, e=>{e.assumptions=[3];},
    e=>{delete e.period;}, e=>{e.recommendations=[];}, e=>{e.costs.total='95800';},
    e=>{e.costs.total=Infinity;}, e=>{e.costs.items[0].amount=NaN;},
    e=>{e.costs.items[0].reported_category=5;}, e=>{e.revenue.items=[{}];}]) {
    const e=fixture();mutate(e);assert.equal(matchesSchema(e),false);
  }
  const e=fixture();e.revenue.total=null;e.costs.items[0].amount=null;assert.equal(matchesSchema(e),true);
});
for (const [name, fetcher] of [
  ['upstream non-2xx', async()=>new Response('private provider internals',{status:429})],
  ['network failure', async()=>{throw Error('private provider internals');}],
  ['invalid upstream envelope JSON', async()=>new Response('{')],
  ['null envelope', async()=>Response.json(null)],
  ['missing message', async()=>Response.json({choices:[]})],
  ['truncated output', async()=>Response.json({choices:[{finish_reason:'length',message:{content:'{}'}}]})],
  ['refusal', async()=>Response.json({choices:[{finish_reason:'stop',message:{refusal:'private provider internals'}}]})],
  ['malformed model JSON', async()=>Response.json({choices:[{finish_reason:'stop',message:{content:'not json'}}]})],
  ['invalid evidence schema', async()=>completion({confidence:'high'})],
]) test(`safe 502 for ${name}`, async()=>{
  const {POST}=loadRoute(fetcher);const response=await POST(request({input:'test'}));
  assert.equal(response.status,502);const body=await response.json();
  assert.deepEqual(Object.keys(body),['error']);assert.doesNotMatch(body.error,/private|test-key/);
});
