import test from 'node:test';
import {imageModules} from './helpers/leak-category-icons.mjs';
const sectionIcon=imageModules()('src/components/section-icon.tsx');
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import {renderToStaticMarkup} from 'react-dom/server';
const compile=source=>ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const helper={exports:{}};vm.runInNewContext(compile(readFileSync(new URL('../src/lib/scenario-display.ts',import.meta.url),'utf8')),helper);
const {controlledChangeLabel,isScenarioResponse,isSimulationResponse,simulationFor}=helper.exports;
const component={exports:{},require:s=>s==='react/jsx-runtime'?jsxRuntime:s==='./section-icon'?sectionIcon:helper.exports};
const source=readFileSync(new URL('../src/components/scenario-panel.tsx',import.meta.url),'utf8');vm.runInNewContext(compile(source),component);
const fixture=JSON.parse(readFileSync(new URL('./fixtures/simulation-cornhead.json',import.meta.url),'utf8'));
const scenario=fixture.scenarios;
const simulation={results:scenario.scenarios.map((s,i)=>({scenario_title:s.title,target_leak:s.target_leak,controlled_changes:s.controlled_changes,status:'not_calculable_yet',calculation:null,missing_inputs:i===0?['Baseline Tuesday evening headcount','Labor cost per worker for Tuesday evenings']:['Authoritative ingredient purchases for the affected period'],notes:[]}))};
const render=(result=scenario,sim=simulation,failed=false)=>renderToStaticMarkup(React.createElement(component.exports.ScenarioPanel,{result,simulation:sim,failed}));
test('Cornhead real cards show delta and absolute target, missing data and separate delivery disclosure, without fake savings',()=>{
  const html=render();assert.equal((html.match(/<article/g)||[]).length,2);assert.match(html,/−1 person/);assert.match(html,/9% → 5%/);
  assert.equal((html.match(/Impact needs more data/g)||[]).length,2);assert.match(html,/Baseline Tuesday evening headcount/);assert.match(html,/Authoritative ingredient purchases/);
  assert.match(html,/high confidence/);assert.match(html,/<details/);assert.match(html,/Needs a controllable decision input \(1\)/);assert.match(html,/Delivery unit economics/);
  assert.doesNotMatch(html,/\$|9,100|4,900|Increase delivery menu prices|N\/A/);
  assert.doesNotMatch(html.split('<details')[0],/Delivery unit economics/);
});
test('dynamic counts including zero and more than two; no forced sample cards',()=>{
  for(const n of [0,1,4]){
    const result={scenarios:Array.from({length:n},(_,i)=>({...scenario.scenarios[0],title:`Scenario ${i}`,target_leak:`Leak ${i}`})),not_simulation_ready:[]};
    const html=render(result,null);assert.equal((html.match(/<article/g)||[]).length,n);
    if(n===0)assert.match(html,/No supported testable changes/);assert.doesNotMatch(html,/\$/);
  }
});
test('calculable cards render only calculator money including decimals, baseline and projected cost',()=>{
  const s=scenario.scenarios[1];const result={scenarios:[s],not_simulation_ready:[]};
  const sim={results:[{...simulation.results[1],status:'calculable',missing_inputs:[],calculation:{formula_id:'INGREDIENT_WASTE_RATE_TARGET',inputs:[],baseline_value:1800,projected_value:1000,impact_value:800.13,currency:'USD',period:'last_month'}}]};
  const html=render(result,sim);assert.match(html,/\$800\.13/);assert.match(html,/\$1,800\.00/);assert.match(html,/\$1,000\.00/);
  assert.match(html,/Cost reduction/);assert.match(html,/Deterministic calculation/);assert.doesNotMatch(html,/Impact needs more data|9,100|4,900/);
});
test('missing, unknown or duplicate matches show no invented fallback amounts',()=>{
  for(const sim of [{results:[]},{results:[{...simulation.results[0],target_leak:'Unknown'}]},{results:[simulation.results[0],simulation.results[0]]}]){
    const html=render(scenario,sim);assert.match(html,/Calculation result unavailable/);assert.doesNotMatch(html,/\$|N\/A/);
  }
  assert.match(render(scenario,null),/Calculating impact/);assert.match(render(scenario,null,true),/Calculation result unavailable/);
});
test('join requires exact title and target; result ordering does not matter',()=>{
  const reversed={results:[...simulation.results].reverse()};assert.equal(isSimulationResponse(reversed,scenario),true);
  assert.equal(simulationFor(scenario.scenarios[0],reversed).target_leak,scenario.scenarios[0].target_leak);
  for(const edit of [r=>r.results.pop(),r=>r.results[0].scenario_title+=' ',r=>r.results[0].controlled_changes[0].value=-2,r=>r.results[0].status='unknown']){
    const r=structuredClone(simulation);edit(r);assert.equal(isSimulationResponse(r,scenario),false);
  }
});
test('response guards reject malformed Scenario and simulation envelopes and nonfinite financial values',()=>{
  assert.equal(isScenarioResponse({scenarios:scenario,input_facts:fixture.input_facts}),true);
  for(const value of [null,{}, {scenarios:{scenarios:[],not_simulation_ready:null},input_facts:[]}, {scenarios:{...scenario,scenarios:[{...scenario.scenarios[0],controlled_changes:[]}]},input_facts:[]}])assert.equal(isScenarioResponse(value),false);
  const r=structuredClone(simulation);r.results[0].status='calculable';r.results[0].calculation={formula_id:'x',inputs:[],baseline_value:Infinity,projected_value:1,impact_value:1,currency:'USD',period:'last_month'};assert.equal(isSimulationResponse(r,scenario),false);
});
test('controlled change formatting preserves supplied values, signs and units',()=>{
  assert.equal(controlledChangeLabel({variable:'x',change_type:'delta',from:null,value:2,unit:'persons'}),'+2 persons');
  assert.equal(controlledChangeLabel({variable:'x',change_type:'absolute_target',from:9,value:5,unit:'percent'}),'9% → 5%');
});
test('Scenario presentation has no financial formulas, aggregate savings or demo dollars',()=>{
  assert.doesNotMatch(source,/\$[0-9]|Math\.|reduce\s*\(|\*\s*\d|\/\s*100|9,100|4,900/);
  assert.match(source,/calculation\.impact_value/);assert.match(source,/calculation\.baseline_value/);assert.match(source,/calculation\.projected_value/);
});
