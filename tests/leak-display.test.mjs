import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import {renderToStaticMarkup} from 'react-dom/server';

const compile=source=>ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const display={exports:{}};vm.runInNewContext(compile(readFileSync(new URL('../src/lib/leak-display.ts',import.meta.url),'utf8')),display);
const {operationalContext,leakSummary,usesReportedNumbers}=display.exports;
const dashboard={exports:{},require:specifier=>{
  if(specifier==='react')return React;
  if(specifier==='react/jsx-runtime')return jsxRuntime;
  if(specifier==='framer-motion')return {useReducedMotion:()=>false,motion:{article:({className,children})=>React.createElement('article',{className},children)}};
  if(specifier==='@/lib/leak-display')return display.exports;
  return {};
}};
const source=readFileSync(new URL('../src/components/dashboard.tsx',import.meta.url),'utf8').replace('function ProfitLeaks(', 'export function ProfitLeaks(');
vm.runInNewContext(compile(source),dashboard);
const {ProfitLeaks}=dashboard.exports;
const finding={title:'A real supported issue',category:'delivery',evidence:['User-supplied fact'],interpretation:'Combined costs exceed revenue.',confidence:'medium'};

test('operational context contains only trimmed user statements, with decimals preserved',()=>{
  const notes='\n- Orders average $18.40. Combined costs exceed revenue.\n• Waste is 9%. Target is 5%.\n1. Rent context is unknown.\n\n';
  assert.deepEqual(JSON.parse(JSON.stringify(operationalContext(notes))),['Orders average $18.40.','Combined costs exceed revenue.','Waste is 9%.','Target is 5%.','Rent context is unknown.']);
  assert.deepEqual(JSON.parse(JSON.stringify(operationalContext(' \n '))),[]);
});
test('real cards display actual count, interpretation/category/confidence, without demo impact values',()=>{
  const html=renderToStaticMarkup(React.createElement(ProfitLeaks,{visible:true,result:{leaks:[finding],insufficient_evidence:[]}}));
  assert.match(html,/1 profit leak found/);assert.match(html,/A real supported issue/);assert.match(html,/Combined costs exceed revenue/);
  assert.match(html,/medium confidence/);assert.match(html,/DELIVERY/);
  assert.equal((html.match(/<article/g)||[]).length,1);
  assert.doesNotMatch(html,/1,180|0\.37|1,460|Tuesday evening labor|Food waste|3 profit leaks/);
});
test('zero leaks render a quiet empty state and expandable insufficient-evidence topics',()=>{
  const result={leaks:[],insufficient_evidence:[{topic:'Rent market comparison',reason:'No comparison was supplied.'}]};
  const html=renderToStaticMarkup(React.createElement(ProfitLeaks,{visible:true,result}));
  assert.match(html,/No confirmed profit leaks/);assert.match(html,/<details/);assert.doesNotMatch(html,/<details[^>]* open/);
  assert.match(html,/Needs more data \(1\)/);assert.match(html,/Rent market comparison/);assert.match(html,/No comparison was supplied/);
  assert.doesNotMatch(html,/<article|NEEDS ATTENTION|\$/);
});
test('four returned findings render four cards rather than forcing the former sample count',()=>{
  const result={leaks:Array.from({length:4},(_,i)=>({...finding,title:`Issue ${i}`})),insufficient_evidence:[]};
  const html=renderToStaticMarkup(React.createElement(ProfitLeaks,{visible:true,result}));
  assert.match(html,/4 profit leaks found/);assert.equal((html.match(/<article/g)||[]).length,4);
  assert.equal(leakSummary(result),'4 profit leaks found');
});

test('unprovided derived metrics and monetary figures are rejected rather than rendered',()=>{
  const result={leaks:[{...finding,interpretation:'Actual waste is 9%, above the stated 5% target.'}],insufficient_evidence:[]};
  const input='Revenue $100,000, costs $95,800, waste 9%, target 5%.';
  assert.equal(usesReportedNumbers(result,input),true);
  assert.equal(usesReportedNumbers({leaks:[{...finding,interpretation:'Revenue is $18.4 per order.'}],insufficient_evidence:[]},'Orders average $18.40.'),true);
  for(const interpretation of ['Waste is 80% above target.','Waste is 4 percentage points above target.','There is a $4,200 surplus.','The impact is $1,180.']) {
    assert.equal(usesReportedNumbers({...result,leaks:[{...finding,interpretation}]},input),false);
  }
});
