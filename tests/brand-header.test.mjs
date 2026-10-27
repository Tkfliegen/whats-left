import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import * as jsx from 'react/jsx-runtime';
import {renderToStaticMarkup} from 'react-dom/server';
const source=fs.readFileSync('src/components/dashboard.tsx','utf8');
const header=source.slice(source.indexOf('function Header()'),source.indexOf('function SummaryMetrics('));
const imports=source.split('\n').filter(line=>/^import (Link|Image|brandLockup) /.test(line)).join('\n');
const exports={};
vm.runInNewContext(ts.transpileModule(imports+'\n'+header.replace('function Header()','export function Header()'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,require:s=>{
 if(s==='react/jsx-runtime')return jsx;
 if(s==='next/link')return {default:({children,...props})=>React.createElement('a',props,children)};
 if(s==='next/image')return {default:({src,...props})=>React.createElement('img',{...props,src:src.src})};
 assert.equal(s,'../../pic/what is left-hero.png');const png=fs.readFileSync('pic/what is left-hero.png');return {default:{src:s,width:png.readUInt32BE(16),height:png.readUInt32BE(20)}};
}});
const html=()=>renderToStaticMarkup(React.createElement(exports.Header));
test('header uses only the finalized brand lockup with an accessible linked identity',()=>{
 const rendered=html();assert.equal((rendered.match(/<img/g)||[]).length,1);
 assert.match(rendered,/what is left-hero.png/);assert.match(rendered,/alt="What’s Left\?"/);assert.match(rendered,/href="\/"/);
 assert.doesNotMatch(rendered,/See what your business really keeps|◔|<p>What’s Left/);
});
test('header preserves responsive aspect ratio, right-side content and undecorated branding',()=>{
 const rendered=html();assert.match(rendered,/w-\[210px\].*sm:w-\[320px\]/);assert.match(rendered,/h-auto w-full object-contain/);
 assert.match(rendered,/Your profitability workspace/);assert.match(rendered,/EARLY PREVIEW/);
 assert.doesNotMatch(header,/shadow|glow|bg-|gradient|rounded/);
 assert.ok(source.includes('A clearer picture of what’s left.'));
});
