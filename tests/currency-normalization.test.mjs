import {atomsFromRecords} from './helpers/authorization-atoms.mjs';
import {createRequire} from 'node:module';
const nativeRequire=createRequire(import.meta.url);
import {provenance,rawEvidence,authorizationRecords} from './helpers/provenance.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

function modules(fetcher=()=>{throw Error('Unexpected external call');}) {
  const cache=new Map();
  return function load(filename) {
    filename=path.resolve(filename);
    if(cache.has(filename))return cache.get(filename);
    const exports={};cache.set(filename,exports);
    const code=ts.transpileModule(readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
    vm.runInNewContext(code,{exports,structuredClone,Response,AbortSignal,process:{env:{NEBIUS_API_KEY:'test-key'}},fetch:fetcher,
      require:s=>s.startsWith('node:')?nativeRequire(s):load(s.startsWith('@/')?path.resolve('src',s.slice(2)+'.ts'):path.resolve(path.dirname(filename),s+'.ts'))});
    return exports;
  };
}
const helperPath='src/app/api/analyze/evidence/currency.ts';
const {normalizeEvidenceCurrency}=modules()(helperPath);
const plain=value=>JSON.parse(JSON.stringify(value));
const request=body=>new Request('http://localhost',{method:'POST',body:JSON.stringify(body)});
const completion=result=>Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(result.revenue?{...result,authorization_atoms:[]}:result)}}]});
const fixture=JSON.parse(readFileSync('tests/fixtures/scenarios-bagel.json','utf8'));
for(const [raw,source,expected] of [
  ['$', 'Currency: USD', 'USD'], ['US$', 'Currency: USD', 'USD'],
  ['USD', '', 'USD'], ['usd', '', 'USD'], [' usd ', '', 'USD'],
  ['NT$', 'Currency: TWD', 'TWD'], ['TWD', '', 'TWD'],
  ['€', 'Currency: EUR', 'EUR'], ['£', 'Currency: GBP', 'GBP'], ['AED', 'Currency: AED', 'AED'],
  ['US$', '', 'USD'], ['NT$', '', 'TWD'], ['€', '', 'EUR'], ['£', '', 'GBP'],
  ['د.إ', 'Currency: AED', 'AED'], ['د.إ', '', null],
  ['$', '', null], ['$', 'Cornhead in America uses dollars.', null],
  ['$', 'USD revenue with no currency field.', null],
  ['$', 'Business name: USD\nSelected business type: Café', null],
  ['$', 'Currency:\nUSD', 'USD'], ['$', 'Currency:\r\nUSD', 'USD'],
  ['$', 'Business description / notes: Currency: USD\nRevenue: $100,000', 'USD'],
  ['$', '{"currency":"USD"}', 'USD'], ['NT$', '{"business_currency":"twd"}', 'TWD'],
  [null, 'Currency: USD', 'USD'], [null, '', null], ['', '', null], ['NTD', '', null],
]) test(`currency normalization ${JSON.stringify(raw)} with ${JSON.stringify(source)} -> ${expected}`,()=>{
  assert.deepEqual(plain(normalizeEvidenceCurrency(raw,source)),{ok:true,currency:expected});
});
for(const [raw,source] of [
  ['$', 'Currency: TWD'], ['US$', 'Currency: TWD'], ['USD','Currency: TWD'], ['NT$','Currency: USD'],
  ['€','Currency: GBP'], ['د.إ','Currency: USD'],
  ['$', 'Currency: USD\nCurrency: TWD'], ['USD','Currency: USD / TWD'],
  ['USD','{"currency":"TWD","business_currency":"USD"}'],
  ['USD','Currency: CAD'], ['USD','Currency: unknown'], ['$', 'Currency: USDollar'],
]) test(`conflicting or unsupported currency fails closed: ${JSON.stringify(raw)} / ${source}`,()=>{
  assert.deepEqual(plain(normalizeEvidenceCurrency(raw,source)),{ok:false});
});
test('Evidence route normalizes only currency after schema validation; amounts and source text remain exact; no retry or new model behavior',async()=>{
  const evidence={...rawEvidence(structuredClone(fixture.evidence)),currency:'$'};evidence.revenue.total=null;evidence.costs.total=null;const before=JSON.stringify(evidence);let calls=0;
  const load=modules(async(_url,options)=>{calls++;assert.equal(JSON.parse(options.body).messages[1].content,'Currency:\nUSD');return completion(evidence);});
  const response=await load('src/app/api/analyze/evidence/route.ts').POST(request({input:'Currency:\nUSD'}));
  assert.equal(response.status,200);assert.equal(calls,1);assert.deepEqual(await response.json(),{evidence:{...evidence,currency:'USD',provenance:plain({...provenance.createEvidenceProvenance({...evidence,currency:'USD'},'Currency:\nUSD'),authorization_records:[]})}});assert.equal(JSON.stringify(evidence),before);
});
test('ambiguous dollar produces missing currency; conflicting currency returns explicit 502 with one provider call and no partial Evidence',async()=>{
  for(const [source,status] of [['No explicit currency context',200],['Currency: TWD',502],['Currency: USD\nCurrency: TWD',502]]){
    let calls=0;const load=modules(async()=>{calls++;return completion({...rawEvidence(fixture.evidence),currency:'$'});});
    const response=await load('src/app/api/analyze/evidence/route.ts').POST(request({input:source}));
    assert.equal(response.status,status);assert.equal(calls,1);const result=await response.json();
    if(status===200)assert.equal(result.evidence.currency,null);else {assert.deepEqual(Object.keys(result),['error']);assert.match(result.error,/currency conflicts/);}
  }
});
test('recorded Waste paraphrase: Evidence -> Leak -> ID-bound Scenario -> Calculator -> Gate -> neutral Decision',async()=>{
  const sourceFixture=structuredClone(fixture);
  sourceFixture.leaks.leaks[0].title='Tuesday evening staffing cost exceeds sales revenue';
  sourceFixture.leaks.leaks[0].category='operations';
  sourceFixture.leaks.leaks[0].evidence=['Tuesday evenings from 6 PM to 10 PM average only $1,900 in monthly sales.','Staffing during those hours costs $3,080 per month.'];
  const requests=[];
  const load=modules(async(_url,options)=>{
    const body=JSON.parse(options.body),name=body.response_format.json_schema.name;requests.push({name,body});
    if(name==='evidence'){const e={...rawEvidence(sourceFixture.evidence),currency:'$'};const manifest=provenance.createEvidenceProvenance(e,body.messages[1].content);return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({...e,authorization_atoms:atomsFromRecords(authorizationRecords({provenance:manifest},{sales:4,cost:4,laborPermission:14,current:9,target:10,wastePermission:15}))})}}]});}
    if(name==='leak_detective_v1')return completion(sourceFixture.leaks);
    if(name==='scenario_agent_v1'){
      const input=JSON.parse(body.messages[1].content);
      assert.equal(input.input_facts.find(f=>f.source==='evidence.currency').fact,'USD');
      // Legacy input has no explicit unchanged-schedule constraint. The atomic
      // producer must not manufacture one; currency still flows through Waste.
      assert.equal(input.authorized_changes.length,1);assert.equal(input.authorized_changes[0].authorization_id,'ingredient_waste_rate_target');
      return completion({scenarios:input.authorized_changes.map(a=>({title:'Test ingredient waste target',target_leak:a.target_leak,controlled_changes:[{variable:a.variable_label,change_type:a.change_type,from:a.from,value:a.value,unit:a.unit}],available_input_refs:a.source_refs,missing_calculation_inputs:['Ingredient purchases baseline'],confidence:'high'})),not_simulation_ready:input.confirmed_leaks.filter(title=>!input.authorized_changes.some(a=>a.target_leak===title)).map(title=>({target_leak:title,reason:'Missing explicit permission or schedule constraint.',missing_decision_input_categories:['Explicit permission and constraints']}))});
    }
    if(name==='decision_agent_v1'){
      const input=JSON.parse(body.messages[1].content);
      assert.doesNotMatch(JSON.stringify(input.missing_decision_inputs),/Explicit currency code/);
      return completion({decision_status:'needs_more_data',recommendation:{type:'collect_data',candidate_id:null,title:input.recommendation_contract.title,rationale:'The decision gate requires more data.'},comparison:input.comparison_sources.map(c=>({...c,assessment:'Authoritative calculation inputs are still missing.'})),priority_inputs:input.priority_input_options,confidence:'high'});
    }
    throw Error('Unexpected provider call');
  });
  const invoke=async(route,body)=>{const response=await load(`src/app/api/analyze/${route}/route.ts`).POST(request(body));const result=await response.json();assert.equal(response.status,200,JSON.stringify(result));return result;};
  const extracted=await invoke('evidence',{input:'Business name: Cornhead\nCurrency:\nUSD\nRevenue: $100,000\n'+sourceFixture.operational_context.join('\n')});
  const oldItems=sourceFixture.evidence.provenance.citable_facts;
  sourceFixture.leaks.leaks.forEach(leak=>{leak.evidence_refs=leak.evidence_refs.map(id=>{const original=oldItems.find(item=>item.id===id);return extracted.evidence.provenance.citable_facts.find(item=>item.source_refs.length===1&&item.text===original.text).id;});});
  assert.equal(extracted.evidence.currency,'USD');
  sourceFixture.leaks.leaks[2].evidence=["Ingredient waste last month was 9% of ingredient purchases.","The business's stated internal target is 5% waste rate."];
  assert.ok(extracted.evidence.provenance.items.some(item=>item.text==="The business's stated internal target is 5%."));
  const findings=await invoke('leaks',{evidence:extracted.evidence,operational_context:sourceFixture.operational_context});
  const scenarios=await invoke('scenarios',{...sourceFixture,leaks:findings.leaks,evidence:extracted.evidence});
  const simulationRequest={evidence:extracted.evidence,scenarios:scenarios.scenarios,input_facts:scenarios.input_facts};
  assert.equal(simulationRequest.evidence.currency,'USD');const simulation=await invoke('simulate',simulationRequest);
  const gateRequest={evidence:extracted.evidence,scenarios:scenarios.scenarios,simulation};assert.equal(gateRequest.evidence.currency,'USD');
  const gate=await invoke('decision-gate',gateRequest);
  assert.equal(gate.decision_gate,'needs_more_data');assert.doesNotMatch(JSON.stringify(gate.missing_decision_inputs),/Explicit currency code/);
  assert.match(JSON.stringify(gate.missing_decision_inputs),/ingredient purchases/);
  // Uncalculable candidates retain null currency under the unchanged contract.
  assert.ok(gate.candidates.every(c=>c.currency===null&&c.verified_impact===null));
  const decisionRequest={...gateRequest,leaks:sourceFixture.leaks,decision_gate:gate};assert.equal(decisionRequest.evidence.currency,'USD');
  const result=await invoke('decision',decisionRequest);assert.equal(result.decision.decision_status,'needs_more_data');assert.equal(result.decision.recommendation.candidate_id,null);
  assert.doesNotMatch(JSON.stringify(result.decision.priority_inputs),/Explicit currency code/);assert.equal(result.decision.comparison.length,3);
  assert.deepEqual(requests.map(r=>r.name),['evidence','leak_detective_v1','scenario_agent_v1','decision_agent_v1']);
});
test('canonical code also survives calculable outputs through Calculator, Gate and Decision without downstream normalization',async()=>{
  const labor=JSON.parse(readFileSync('tests/fixtures/simulation-labor.json','utf8'));
  const load=modules();labor.evidence.currency=normalizeEvidenceCurrency('$','Currency: USD').currency;
  const calculated=load('src/lib/scenario-calculator.ts').calculateScenarios(labor);assert.equal(calculated.results[0].calculation.currency,'USD');
  const gate=load('src/lib/decision-gate.ts').evaluateDecisionGate({evidence:labor.evidence,scenarios:labor.scenarios,simulation:calculated});assert.equal(gate.candidates[0].currency,'USD');
  const projected=load('src/app/api/analyze/decision/decision.ts').buildDecisionInput({evidence:labor.evidence,scenarios:labor.scenarios,simulation:calculated,decision_gate:gate,leaks:fixture.leaks});
  assert.equal(projected.candidates[0].currency,'USD');assert.equal(projected.comparison_sources[0].currency,'USD');
});
test('currency normalization has no external/LLM calls or locale/geography inference',()=>{
  const source=readFileSync(helperPath,'utf8');assert.doesNotMatch(source,/fetch\s*\(|Intl\.|navigator\.|process\.env|evidenceSystemPrompt|model:/);
});

for(const source of [
  'Currency: USD. The reporting period is the month just ended.',
  'Business description / notes: Currency: USD. The reporting period is the month just ended.',
  'Currency: USD', 'Currency: USD. Currency: USD.',
]) test(`explicit USD token terminates safely: ${source}`,()=>{
  assert.deepEqual(plain(normalizeEvidenceCurrency('USD',source)),{ok:true,currency:'USD'});
});
for(const [source,expected] of [
  ['Currency: EUR.','EUR'],
  ['Currency: GBP, reporting period: last month','GBP'],
  ['Business currency: GBP, reporting period: last month','GBP'],
]) test(`punctuated explicit currency token: ${source}`,()=>{
  assert.deepEqual(plain(normalizeEvidenceCurrency(null,source)),{ok:true,currency:expected});
});
for(const source of [
  'Currency: USD. Currency: EUR.',
  'Currency: USD, currency: EUR.',
  'Currency: USD. The report is monthly; currency: EUR.',
  'Currency: USD. The report is monthly. Currency: CAD.',
  'Currency: USD. The period is last month. Business currency: EUR.',
  'Currency: USD\nCurrency: EUR',
  'Currency: CAD. The period is last month.',
  'Currency: XYZ, reporting period: last month',
  'Currency: USD / EUR', 'Currency: USD, EUR',
  'Currency: USDollar. The period is last month.',
  'Currency: USD. EUR.', 'Currency: USD. / EUR',
  'Currency:', 'Currency: USD extra',
  'Currency: USD. Currency: unknown',
]) test(`explicit malformed/unsupported/conflicting declarations still reject: ${source}`,()=>{
  assert.deepEqual(plain(normalizeEvidenceCurrency('USD',source)),{ok:false});
});
test('J05 explicit currency sentence passes route normalization without changing source or amounts',async()=>{
  const saved=JSON.parse(readFileSync(new URL('../docs/evaluations/scenario-abstention-ownership/full/runs/J05.json',import.meta.url),'utf8'));
  const input=saved.calls[0].body.input,evidence={...rawEvidence(structuredClone(fixture.evidence)),currency:'USD'};evidence.revenue.total=null;evidence.costs.total=null;
  let calls=0;const load=modules(async(_url,options)=>{calls++;assert.equal(JSON.parse(options.body).messages[1].content,input);return completion(evidence);});
  const response=await load('src/app/api/analyze/evidence/route.ts').POST(request({input}));
  assert.equal(response.status,200);assert.equal(calls,1);const actual=(await response.json()).evidence;
  assert.equal(actual.currency,'USD');assert.deepEqual(actual.revenue,evidence.revenue);assert.deepEqual(actual.costs,evidence.costs);
});
