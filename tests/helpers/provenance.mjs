import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
const nativeRequire=createRequire(import.meta.url);
export function productionModules(fetcher=()=>{throw Error('Unexpected provider call');}) {
  const cache=new Map();
  function load(filename) {
    filename=path.resolve(filename);if(cache.has(filename))return cache.get(filename);
    const exports={};cache.set(filename,exports);
    const code=ts.transpileModule(readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
    vm.runInNewContext(code,{exports,structuredClone,Response,AbortSignal,process:{env:{NEBIUS_API_KEY:'test-key'}},fetch:fetcher,
      require:s=>s.startsWith('node:')?nativeRequire(s):load(s.startsWith('@/')?path.resolve('src',s.slice(2)+'.ts'):path.resolve(path.dirname(filename),s+'.ts'))});
    return exports;
  }return load;
}
export const provenance=productionModules()('src/app/api/analyze/evidence/provenance.ts');
export function rawEvidence(evidence) {const {provenance:ignored,...base}=evidence;void ignored;return base;}

// Explicit extraction fixtures: source positions and values are declared by each
// test, never inferred from prose. Production records come from Evidence output.
export function authorizationRecords(evidence, {sales=0,cost=sales,costValue=3080,laborPermission=10,current=5,target=6,wastePermission=11}={}) {
  const id=index=>evidence.provenance.items.find(item=>item.source===`source_input[${index}]`).id;
  return [
    {intervention:'headcount_reduction',scope:'tuesday_evening_6pm_10pm',operation:'delta',from:null,value:-1,unit:'persons',permission:'explicit',permission_source_refs:[id(laborPermission)],constraint:'affected_scope_only',constraint_source_refs:[id(laborPermission)],supporting_facts:[{role:'sales',value:1900,unit:'currency',period:'month',currency:evidence.currency??'USD',source_refs:[id(sales)]},{role:'staffing_cost',value:costValue,unit:'currency',period:'month',currency:evidence.currency??'USD',source_refs:[id(cost)]}]},
    {intervention:'waste_rate_target',scope:'ingredient_waste',operation:'absolute_target',from:9,value:5,unit:'percent',permission:'explicit',permission_source_refs:[id(wastePermission)],constraint:'none',constraint_source_refs:[],supporting_facts:[{role:'current_waste_rate',value:9,unit:'percent',period:'month',currency:null,source_refs:[id(current)]},{role:'target_waste_rate',value:5,unit:'percent',period:'month',currency:null,source_refs:[id(target)]}]},
  ];
}
