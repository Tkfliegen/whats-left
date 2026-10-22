import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {productionModules} from './helpers/provenance.mjs';
const load=productionModules();
const {leakSystemPrompt,isLeakResult,buildLeakInput,createLeakSchema}=load('src/app/api/analyze/leaks/leaks.ts');
const {validateLeakOutput,validateLeakReferences}=load('src/app/api/analyze/leaks/output.ts');
const {scenarioSystemPrompt,buildScenarioInput,validateScenarioResult}=load('src/app/api/analyze/scenarios/scenarios.ts');
const {validateScenarioSupport}=load('src/app/api/analyze/scenarios/authorization.ts');
const {usesReportedNumbers}=load('src/lib/leak-display.ts');
const evidence=JSON.parse(fs.readFileSync('tests/fixtures/leak-case-a-failed.json')).evidence;
const plain=x=>JSON.parse(JSON.stringify(x));
const fact=n=>evidence.provenance.citable_facts.find(f=>f.id.endsWith('_'+String(n).padStart(2,'0'))).id;
const labor='Tuesday evenings used 4 staff, generated USD 1,900 in sales, and incurred USD 2,500 in staffing cost for that affected monthly period. Friday evenings used the same staffing level of 4 but generated USD 6,200 in sales.';
const wasteReason='Missing explicit permission to test reducing waste toward the stated 5% target.';
const leaks=()=>({leaks:[
 {title:'Tuesday evening staffing inefficiency',category:'labor',intervention_ref:'headcount_reduction',evidence_refs:[12,13,14,15,16].map(fact),evidence:[labor],interpretation:labor,confidence:'high'},
 {title:'Ingredient waste above internal target',category:'waste',intervention_ref:null,evidence_refs:[17,18,19].map(fact),evidence:['Actual waste is 9%, above the stated 5% target.'],interpretation:'Waste exceeds the stated internal target.',confidence:'high'},
 {title:'Delivery unit economics — some orders unprofitable',category:'delivery',intervention_ref:null,evidence_refs:[20,21,22].map(fact),evidence:['Average delivery revenue per order is USD 18.40. Some orders have combined costs exceeding revenue.'],interpretation:'Some delivery orders have combined costs exceeding revenue.',confidence:'high'},
],insufficient_evidence:[]});
const request=()=>({evidence,leaks:leaks(),operational_context:[]});
function scenarios(){const input=buildScenarioInput(request()),grant=input.authorized_changes[0];return {scenarios:[{title:'Tuesday evening staffing test',target_leak:grant.target_leak,controlled_changes:[{variable:grant.variable_label,change_type:grant.change_type,from:grant.from,value:grant.value,unit:grant.unit}],available_input_refs:Array.from(grant.source_refs),missing_calculation_inputs:[],confidence:'high'}],not_simulation_ready:[{target_leak:leaks().leaks[1].title,reason:wasteReason,missing_decision_input_categories:['Explicit test permission for the stated waste target']},{target_leak:leaks().leaks[2].title,reason:'No approved controllable intervention for delivery.',missing_decision_input_categories:['A controllable decision variable','Constraints governing that variable','Unit-level cost data']}]};}
test('Waste target-only wording names missing permission and keeps the supplied target distinct',()=>{
 assert.match(scenarioSystemPrompt,/identify the missing permission in reason and missing_decision_input_categories/);
 assert.match(scenarioSystemPrompt,/Do not say the waste variable or target is unknown/);
 assert.ok(scenarioSystemPrompt.includes(wasteReason));assert.match(scenarioSystemPrompt,/Mention that value only when supplied/);
 const result=scenarios();assert.equal(result.not_simulation_ready[0].reason,wasteReason);assert.doesNotMatch(result.not_simulation_ready[0].reason,/missing controllable decision variable/i);
});
test('Labor wording scopes cost to Tuesday and limits Friday comparison to reported staffing and sales',()=>{
 assert.match(leakSystemPrompt,/same headcount does not establish the same Friday staffing cost/);assert.ok(leakSystemPrompt.includes(labor));assert.match(leakSystemPrompt,/Never copy example values unless supplied by the cited facts/);
 const [tuesday,friday]=labor.split('. ');assert.match(tuesday,/Tuesday.*USD 2,500.*affected monthly period/);assert.match(friday,/Friday.*4.*USD 6,200/);assert.doesNotMatch(friday,/2,500|cost/);
});
test('Delivery wording uses observed combined costs exceeding revenue without introducing a threshold',()=>{
 assert.match(leakSystemPrompt,/Without an explicitly source-backed threshold concept/);
 for(const phrase of ['threshold','break-even threshold','minimum profitable revenue','margin threshold'])assert.ok(leakSystemPrompt.includes('"'+phrase+'"'));
 const finding=leaks().leaks[2];assert.ok(leakSystemPrompt.includes(finding.title));assert.doesNotMatch(JSON.stringify(finding),/threshold|break-even|minimum profitable revenue/i);
});
test('wording-only Case A preserves refs, binding, structural validation, and numeric acceptance',()=>{
 const result=leaks(),before=JSON.stringify(result);assert.equal(isLeakResult(result,evidence),true);assert.equal(validateLeakReferences(result,evidence).ok,true);assert.equal(validateLeakOutput(result,evidence).ok,true);assert.equal(usesReportedNumbers(result,JSON.stringify(evidence)),true);assert.equal(JSON.stringify(result),before);
 assert.deepEqual(result.leaks[0].evidence_refs,[12,13,14,15,16].map(fact));assert.equal(result.leaks[0].intervention_ref,'headcount_reduction');assert.equal(result.leaks[1].intervention_ref,null);assert.equal(result.leaks[2].intervention_ref,null);
 const bad=leaks();bad.leaks[0].interpretation+=' Labor is 33.4% of revenue.';assert.equal(validateLeakOutput(bad,evidence).reason,'unreported_number');
 bad.leaks[0].evidence_refs=bad.leaks[0].evidence_refs.filter(id=>id!==fact(12));assert.equal(validateLeakOutput(bad,evidence).reason,'incomplete_citation_support');
});
test('Case A still authorizes Labor only and keeps Waste and Delivery not_simulation_ready',()=>{
 const input=buildScenarioInput(request()),result=scenarios();assert.equal(input.authorized_changes.length,1);assert.equal(input.authorized_changes[0].authorization_id,'tuesday_evening_headcount_reduction');assert.equal(input.authorized_changes[0].value,-1);
 assert.equal(validateScenarioResult(result,input.input_facts,input.confirmed_leaks),true);assert.equal(validateScenarioSupport(result,input.authorized_changes).ok,true);assert.equal(result.scenarios.length,1);assert.deepEqual(result.not_simulation_ready.map(f=>f.target_leak),[leaks().leaks[1].title,leaks().leaks[2].title]);
 const unauthorized=scenarios();unauthorized.scenarios.push({...unauthorized.scenarios[0],target_leak:leaks().leaks[1].title});assert.equal(validateScenarioSupport(unauthorized,input.authorized_changes).reason,'no_authorized_change');
});
test('Leak route sends wording constraints with unchanged schema/input and returns mocked wording unchanged',async()=>{
 let calls=0;const result=leaks();const modules=productionModules(async(_url,options)=>{calls++;const body=JSON.parse(options.body);assert.equal(body.messages[0].content,leakSystemPrompt);assert.deepEqual(JSON.parse(body.messages[1].content),plain(buildLeakInput(request())));assert.deepEqual(body.response_format.json_schema.schema,plain(createLeakSchema(evidence)));assert.equal(body.model,'nvidia/Nemotron-3-Ultra-550b-a55b');return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({...result,leaks:result.leaks.map(({intervention_ref,...finding})=>{void intervention_ref;return finding;})})}}]});});
 const response=await modules('src/app/api/analyze/leaks/route.ts').POST(new Request('http://localhost',{method:'POST',body:JSON.stringify(request())}));assert.equal(response.status,200);assert.deepEqual(await response.json(),{leaks:result});assert.equal(calls,1);
});
test('Scenario route preserves provider contract and authorization while code owns abstention wording',async()=>{
 let calls=0;const result=scenarios(),input=buildScenarioInput(request());const modules=productionModules(async(_url,options)=>{calls++;const body=JSON.parse(options.body);assert.ok(body.messages[0].content.startsWith(scenarioSystemPrompt));assert.ok(body.messages[0].content.includes(wasteReason));assert.deepEqual(JSON.parse(body.messages[1].content),plain(input));assert.equal(body.model,'nvidia/Nemotron-3_5-Lightning');return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(result)}}]});});
 const response=await modules('src/app/api/analyze/scenarios/route.ts').POST(new Request('http://localhost',{method:'POST',body:JSON.stringify(request())}));assert.equal(response.status,200);assert.deepEqual((await response.json()).scenarios,plain(modules('src/app/api/analyze/scenarios/abstention.ts').ownAbstentionExplanations(result)));assert.equal(calls,1);
});
