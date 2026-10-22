import {createRequire} from 'node:module';
const nativeRequire=createRequire(import.meta.url);
// Test/demo tooling only. No fixture imports or special cases in production UI.
import {readFileSync} from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
const cache=new Map();
function load(filename){
  filename=path.resolve(filename);if(cache.has(filename))return cache.get(filename);
  const exports={};cache.set(filename,exports);
  const code=ts.transpileModule(readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(code,{exports,structuredClone,require:s=>s.startsWith('node:')?nativeRequire(s):load(s.startsWith('@/')?path.resolve('src',s.slice(2)+'.ts'):path.resolve(path.dirname(filename),s+'.ts'))});
  return exports;
}
export function prepareDemoFixture(fixture){
  const helpers=load('src/app/api/analyze/scenarios/scenarios.ts');
  const auth=load('src/app/api/analyze/scenarios/authorization.ts');
  const input=helpers.buildScenarioInput(fixture.scenario_request);
  const scenarios={scenarios:input.authorized_changes.map(change=>({
    title:`Test ${change.variable_label}`,target_leak:change.target_leak,
    controlled_changes:[{variable:change.variable_label,change_type:change.change_type,from:change.from,value:change.value,unit:change.unit}],
    available_input_refs:change.source_refs,missing_calculation_inputs:[],confidence:'high',
  })),not_simulation_ready:[]};
  if(!helpers.validateScenarioResult(scenarios,input.input_facts,input.confirmed_leaks)||!auth.validateScenarioSupport(scenarios,input.authorized_changes).ok)throw Error('Demo fixture violates production Scenario authorization');
  const input_facts=[...input.input_facts,...fixture.calculation_inputs.map((fact,index)=>({id:`input_${String(input.input_facts.length+index+1).padStart(2,'0')}`,source:`calculation_inputs.${fact.concept}`,fact:JSON.stringify(fact)}))];
  const simulationRequest={evidence:fixture.scenario_request.evidence,scenarios,input_facts};
  const simulation=load('src/lib/scenario-calculator.ts').calculateScenarios(simulationRequest);
  const gateRequest={evidence:simulationRequest.evidence,scenarios,simulation};
  const gate=load('src/lib/decision-gate.ts').evaluateDecisionGate(gateRequest);
  const decisionRequest={...gateRequest,leaks:fixture.scenario_request.leaks,decision_gate:gate};
  if(!load('src/app/api/analyze/decision/decision.ts').isDecisionRequest(decisionRequest))throw Error('Demo fixture violates production Decision request contract');
  return {simulationRequest,simulation,gateRequest,gate,decisionRequest,scenarioResponse:{scenarios,input_facts}};
}
