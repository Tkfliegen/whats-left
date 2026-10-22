import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { productionModules } from './helpers/provenance.mjs';
const load=productionModules();
const {baselineBusinessSummary:summary}=load('src/lib/baseline-business-summary.ts');
const evidence=(revenue=100000,costs=95800)=>({currency:'USD',revenue:{total:revenue,items:[]},costs:{total:costs,items:[{amount:999999}]}});
test('baseline arithmetic uses only accepted totals, including losses, decimals and zero costs',()=>{
 assert.equal(summary(evidence()).whatsLeft,4200);
 assert.equal(summary(evidence()).margin,4.2);
 assert.equal(summary(evidence(100,150)).whatsLeft,-50);
 assert.equal(summary(evidence(100,150)).margin,-50);
 assert.equal(summary(evidence(100,0)).margin,100);
 assert.ok(Math.abs(summary(evidence(10.5,8.4)).whatsLeft-2.1)<1e-12);
});
test('missing totals and no Evidence never infer values from items',()=>{
 for(const e of [null,evidence(null,null),evidence(null,95800),evidence(100000,null)]){
  assert.equal(summary(e).whatsLeft,null);assert.equal(summary(e).margin,null);
  assert.match(summary(e).missing,/Needs reported/);
 }
 assert.equal(summary(evidence(null,1)).missing,'Needs reported revenue');
 assert.equal(summary(evidence(1,null)).missing,'Needs reported operating costs');
});
test('zero revenue permits baseline loss but explicitly leaves margin undefined',()=>{
 assert.equal(summary(evidence(0,10)).whatsLeft,-10);
 assert.equal(summary(evidence(0,10)).margin,null);
 assert.equal(summary(evidence(0,0)).whatsLeft,0);
 assert.equal(summary(evidence(0,0)).marginUnavailable,'Undefined when revenue is zero');
});
// Render the actual private dashboard components without adding a production export.
const nativeRequire=createRequire(import.meta.url);
const exports={};
const source=readFileSync('src/components/dashboard.tsx','utf8');
const motionDiv=({children,...props})=>{
 for(const key of ['initial','animate','transition','inert'])delete props[key];
 return React.createElement('div',props,children);
};
vm.runInNewContext(ts.transpileModule(source+'\nexport { SummaryMetrics, ProfitWaterfall };',{
 compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX},
}).outputText,{exports,require:s=>{
 if(s==='react'||s==='react/jsx-runtime')return nativeRequire(s);
 if(s==='framer-motion')return {motion:{div:motionDiv},useReducedMotion:()=>true};
 if(s.startsWith('@/lib/'))return load('src/'+s.slice(2)+'.ts');
 return {};
}});
const render=(component,e)=>renderToStaticMarkup(React.createElement(component,{evidence:e}));
test('frontend metrics render baseline immediately with Evidence, without Scenario or Decision state',()=>{
 const html=render(exports.SummaryMetrics,evidence());
 assert.match(html,/USD 4,200/);assert.match(html,/4.2%/);
 assert.match(html,/Reported whole-business total/);assert.match(html,/Deterministic baseline/);
 assert.doesNotMatch(html,/visibility:hidden|Not calculated in this analysis/);
});
test('frontend missing and zero revenue states are explicit and never display NaN/Infinity',()=>{
 for(const e of [evidence(null,95800),evidence(100000,null),evidence(0,10)]){
  const html=render(exports.SummaryMetrics,e);
  assert.doesNotMatch(html,/NaN|Infinity/);
  assert.match(html,/Needs reported|Undefined when revenue is zero/);
 }
 const empty=render(exports.SummaryMetrics,null);
 assert.doesNotMatch(empty,/USD 4,200|4.2%/);
});
test('frontend waterfall labels derived result as baseline separate from Scenario impact',()=>{
 const html=render(exports.ProfitWaterfall,evidence());
 assert.match(html,/What’s Left/);assert.match(html,/USD 4,200/);
 assert.match(html,/deterministic baseline, not Scenario impact/);
 assert.doesNotMatch(html,/999,999/);
});
