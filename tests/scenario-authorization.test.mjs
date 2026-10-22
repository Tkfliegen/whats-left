import {createRequire} from 'node:module';
const nativeRequire=createRequire(import.meta.url);
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
const fixture=JSON.parse(readFileSync(new URL('./fixtures/scenarios-bagel.json',import.meta.url),'utf8'));
const resultFixture=JSON.parse(readFileSync(new URL('./fixtures/simulation-cornhead.json',import.meta.url),'utf8')).scenarios;
function load(fetcher){
  const cache=new Map();function module(filename){if(cache.has(filename))return cache.get(filename);const exports={};cache.set(filename,exports);
    const code=ts.transpileModule(readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
    vm.runInNewContext(code,{exports,require:s=>s.startsWith('node:')?nativeRequire(s):module(path.resolve(path.dirname(filename),s+'.ts')),fetch:fetcher,process:{env:{NEBIUS_API_KEY:'test-key'}},Response,AbortSignal});return exports;}
  return {...module(path.resolve('src/app/api/analyze/scenarios/scenarios.ts')),...module(path.resolve('src/app/api/analyze/scenarios/authorization.ts')),...module(path.resolve('src/app/api/analyze/scenarios/route.ts'))};
}
const helpers=load();const input=helpers.buildScenarioInput(fixture);const valid=()=>{const result=structuredClone(resultFixture);result.scenarios.forEach((scenario,i)=>scenario.available_input_refs=Array.from(input.authorized_changes[i].source_refs));return result;};
const check=result=>helpers.validateScenarioSupport(result,input.authorized_changes);
const plain=value=>JSON.parse(JSON.stringify(value));

test('exact Cornhead authorization mapping contains only labor delta -1 and waste 9 to 5',()=>{
  assert.deepEqual(plain(input.authorized_changes),[
    {authorization_id:'tuesday_evening_headcount_reduction',target_leak:fixture.leaks.leaks[0].title,variable_id:'tuesday_evening_headcount',variable_label:'Tuesday evening headcount',change_type:'delta',from:null,value:-1,unit:'persons',source_refs:plain(input.authorized_changes[0].source_refs)},
    {authorization_id:'ingredient_waste_rate_target',target_leak:fixture.leaks.leaks[2].title,variable_id:'ingredient_waste_rate',variable_label:'Ingredient waste rate',change_type:'absolute_target',from:9,value:5,unit:'percent',source_refs:plain(input.authorized_changes[1].source_refs)},
  ]);
  assert.equal(input.authorized_changes.some(a=>/delivery/i.test(a.target_leak)),false);
});
test('authorized labor and waste pass without unrelated calculation inputs',()=>{
  const result=valid();assert.equal(helpers.validateScenarioResult(result,input.input_facts,input.confirmed_leaks),true);
  assert.equal(check(result).ok,true);assert.equal(result.scenarios[0].controlled_changes[0].from,null);
  assert.equal(result.scenarios[0].available_input_refs.includes('input_06'),false);
  assert.equal(result.scenarios[1].available_input_refs.includes('input_07'),false);
});
const deliveryScenario=()=>({title:fixture.leaks.leaks[1].title,target_leak:fixture.leaks.leaks[1].title,controlled_changes:[{variable:'Delivery unit economics',change_type:'delta',from:null,value:-1,unit:'orders'}],available_input_refs:['input_11'],missing_calculation_inputs:['A controllable variable'],confidence:'low'});
for(const [name,edit,reason] of [
  ['unsupported Delivery',r=>{r.scenarios.push(deliveryScenario());r.not_simulation_ready=[];},'no_authorized_change'],
  ['unknown variable',r=>r.scenarios[0].controlled_changes[0].variable='Tuesday sales','unauthorized_variable'],
  ['wrong delta',r=>r.scenarios[0].controlled_changes[0].value=-2,'unauthorized_change'],
  ['wrong target',r=>r.scenarios[1].controlled_changes[0].value=4,'unauthorized_change'],
  ['invented baseline',r=>r.scenarios[0].controlled_changes[0].from=4,'unauthorized_change'],
  ['wrong rate baseline',r=>r.scenarios[1].controlled_changes[0].from=10,'unauthorized_change'],
  ['wrong type',r=>r.scenarios[1].controlled_changes[0].change_type='delta','unauthorized_change'],
  ['wrong unit',r=>r.scenarios[0].controlled_changes[0].unit='workers','unauthorized_change'],
  ['missing permission reference',r=>r.scenarios[0].available_input_refs=['input_10'],'missing_authorization_refs'],
  ['missing waste baseline/target source',r=>r.scenarios[1].available_input_refs=['input_16'],'missing_authorization_refs'],
  ['additional unauthorized change',r=>r.scenarios[0].controlled_changes.push({variable:'Tuesday sales',change_type:'delta',from:null,value:100,unit:'USD'}),'unauthorized_variable'],
  ['duplicate controlled change',r=>r.scenarios[0].controlled_changes.push({...r.scenarios[0].controlled_changes[0]}),'duplicate_controlled_change'],
  ['known variable on wrong leak',r=>r.scenarios[1].controlled_changes[0]={...r.scenarios[0].controlled_changes[0]},'unauthorized_variable'],
])test(`reject ${name} deterministically, without automatic repair`,()=>{
  const result=valid();edit(result);const before=JSON.stringify(result);
  assert.equal(helpers.validateScenarioResult(result,input.input_facts,input.confirmed_leaks),true);
  assert.deepEqual(plain(check(result)),{ok:false,reason});assert.equal(JSON.stringify(result),before);
});
test('no-authority leak may only abstain; supported changes cannot be hidden in abstentions',()=>{
  assert.equal(check(valid()).ok,true);const result=valid();const labor=result.scenarios.shift();
  result.not_simulation_ready.push({target_leak:labor.target_leak,reason:'Missing data',missing_decision_input_categories:['Data']});
  assert.equal(check(result).reason,'authorized_leak_abstained');
});
test('duplicate destination guard still rejects before semantics',()=>{
  const result=valid();result.not_simulation_ready.push({target_leak:' TUESDAY—EVENING LABOR INEFFICIENCY! ',reason:'x',missing_decision_input_categories:['x']});
  assert.equal(helpers.validateScenarioResult(result,input.input_facts,input.confirmed_leaks),false);
});
test('exact aliases map to stable IDs; unknown or semantically similar labels do not',()=>{
  assert.equal(helpers.scenarioVariableId('Tuesday evening 6 PM to 10 PM headcount'),'tuesday_evening_headcount');
  assert.equal(helpers.scenarioVariableId('ingredient_waste_rate'),'ingredient_waste_rate');
  assert.equal(helpers.scenarioVariableId('Tuesday staffing'),undefined);assert.equal(helpers.scenarioVariableId('Delivery headcount'),undefined);
  const result=valid();result.scenarios[0].controlled_changes[0].variable='tuesday_evening_headcount';assert.equal(check(result).ok,true);
});
