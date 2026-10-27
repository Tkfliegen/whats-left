import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import * as jsx from 'react/jsx-runtime';
// Emulate Next's static-image import metadata without invoking a provider or
// editing the PNGs. Dimensions come directly from each original PNG header.
export function imageModules(){
 const cache=new Map();
 function load(file){
  if(cache.has(file))return cache.get(file);const exports={};cache.set(file,exports);
  const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  vm.runInNewContext(code,{exports,require:s=>{
   if(s==='react/jsx-runtime')return jsx;
   if(s==='next/image')return {default:({src,sizes,...props})=>React.createElement('img',{...props,src:src.src,sizes})};
   if(s.endsWith('.png')){const filename=path.resolve(path.dirname(file),s),png=fs.readFileSync(filename);return {default:{src:s,width:png.readUInt32BE(16),height:png.readUInt32BE(20)}};}
   return load(s.startsWith('@/')?'src/'+s.slice(2)+'.ts':path.resolve(path.dirname(file),s+'.tsx'));
  }});return exports;
 }
 return load;
}

export function loadLeakIcons(){
 const load=imageModules();
 return {mapping:load('src/lib/leak-category-icons.ts'),component:load('src/components/leak-category-icon.tsx')};
}
