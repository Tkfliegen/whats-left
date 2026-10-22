import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import ts from 'typescript';
import {productionModules} from './helpers/provenance.mjs';
import {atomsFromRecords} from './helpers/authorization-atoms.mjs';
const evidence=JSON.parse(fs.readFileSync('tests/fixtures/leak-case-a-failed.json')).evidence;
const {assembleAuthorizationRecords:assemble}=productionModules()('src/app/api/analyze/evidence/authorization-atoms.ts');
const plain=x=>JSON.parse(JSON.stringify(x));
const kinds=['scoped_sales','scoped_staffing_cost','headcount_reduction_permission','schedule_constraint'];
const atoms=()=>atomsFromRecords(evidence.provenance.authorization_records);
function diagnose(value){const rejected=[],incomplete=[],before=JSON.stringify(value);const records=assemble(value,evidence.provenance.items,'USD',d=>rejected.push(plain(d)),d=>incomplete.push(plain(d)));assert.equal(JSON.stringify(value),before);assert.deepEqual(plain(records),plain(assemble(value,evidence.provenance.items,'USD')));return {records,rejected,incomplete};}
function expected(missing){return {reason:'authorization_atom_assembly_incomplete',intervention:'headcount_reduction',returned_atom_kinds:kinds.filter(k=>k!==missing),atom_counts:Object.fromEntries(kinds.map(k=>[k,k===missing?0:1])),missing_required_atom_kinds:[missing],ambiguous_atom_kinds:[],conflicting_atom_kinds:[]};}
for(const missing of ['schedule_constraint','headcount_reduction_permission'])test(`missing ${missing} is reported exactly from actual selections`,()=>{
 const result=diagnose(atoms().filter(a=>a.kind!==missing));assert.deepEqual(plain(result.records),[]);assert.deepEqual(result.rejected,[]);assert.deepEqual(result.incomplete,[expected(missing)]);
});
test('duplicate candidates report ambiguity with exact count, without selecting or repairing',()=>{
 const value=atoms();value.push(plain(value[0]));const result=diagnose(value);assert.deepEqual(plain(result.records),[]);assert.equal(result.incomplete.length,1);const d=result.incomplete[0];assert.equal(d.atom_counts.scoped_sales,2);assert.deepEqual(d.ambiguous_atom_kinds,['scoped_sales']);assert.deepEqual(d.missing_required_atom_kinds,[]);assert.deepEqual(d.conflicting_atom_kinds,[]);
});
test('conflicting Labor scope remains a schema rejection before assembly; rules are not widened for diagnostics',()=>{
 const value=atoms();value[1].scope='ingredient_waste';const result=diagnose(value);assert.equal(result.records,null);assert.deepEqual(result.rejected,[{reason:'atom_schema_invalid',failing_field:'authorization_atoms'}]);assert.deepEqual(result.incomplete,[]);
});
test('complete valid Labor assembles with no failure diagnostic',()=>{
 const result=diagnose(atoms());assert.equal(result.records.length,1);assert.equal(result.records[0].constraint,'rest_schedule_unchanged');assert.deepEqual(result.rejected,[]);assert.deepEqual(result.incomplete,[]);
});
const source=n=>evidence.provenance.items.find(s=>s.source===`source_input[${n-1}]`).id;
const waste=()=>[{kind:'current_waste_rate',scope:'ingredient_waste',value:9,unit:'percent',source_refs:[source(17)]},{kind:'waste_target_rate',scope:'ingredient_waste',value:5,unit:'percent',source_refs:[source(18)]}];
test('Waste baseline + target without permission is expected no-grant behavior and emits no failure diagnostic',()=>{
 const result=diagnose(waste());assert.deepEqual(plain(result.records),[]);assert.deepEqual(result.rejected,[]);assert.deepEqual(result.incomplete,[]);
 const mixed=diagnose([...atoms(),...waste()]);assert.equal(mixed.records.length,1);assert.deepEqual(mixed.incomplete,[]);
});
test('validated conflicting Waste values are reported by the actual comparison that refused assembly',()=>{
 // Existing source _24 is a synthetic test source supplying literal 9 and 5;
 // assembly accepts EvidenceSource catalogs, not provenance construction.
 const id='src_'+'0'.repeat(32)+'_24';const sources=[...evidence.provenance.items,{id,source:'source_input[23]',text:'Explicit permission to test waste from 9% toward 5%.'}];
 const value=waste();value[0].value=5;value[0].source_refs=[source(18)];value.push({kind:'waste_reduction_permission',scope:'ingredient_waste',from:9,value:5,unit:'percent',permission:'explicit',source_refs:[id]});
 const logs=[];const result=assemble(value,sources,'USD',undefined,d=>logs.push(plain(d)));assert.deepEqual(plain(result),[]);assert.equal(logs.length,1);assert.equal(logs[0].intervention,'waste_rate_target');assert.deepEqual(logs[0].missing_required_atom_kinds,[]);assert.deepEqual(logs[0].ambiguous_atom_kinds,[]);assert.deepEqual(logs[0].conflicting_atom_kinds,['current_waste_rate','waste_reduction_permission']);assert.deepEqual(plain(result),plain(assemble(value,sources,'USD')));
});
test('no atoms supplies no structured candidate identity and produces no invented candidate or error',()=>{
 const result=diagnose([]);assert.deepEqual(plain(result.records),[]);assert.deepEqual(result.incomplete,[]);
});
async function run(value,env){
 const logs=[],dependencies=productionModules(),exports={};let calls=0;
 const {provenance:ignored,...base}=plain(evidence);void ignored;const output={...base,authorization_atoms:value};
 const code=ts.transpileModule(fs.readFileSync('src/app/api/analyze/evidence/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext(code,{exports,Response,AbortSignal,process:{env:{NODE_ENV:env,NEBIUS_API_KEY:'SECRET_API_KEY'}},console:{warn:(...args)=>logs.push(args)},require:s=>dependencies(path.resolve('src/app/api/analyze/evidence',s+'.ts')),fetch:async()=>{calls++;return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(output)}}]});}});
 const response=await exports.POST(new Request('http://localhost',{method:'POST',body:JSON.stringify({input:evidence.provenance.source_input})}));assert.equal(calls,1);return {status:response.status,body:await response.json(),logs};
}
test('development logs assembly detail without changing successful HTTP response or returning diagnostics to client',async()=>{
 const value=atoms().filter(a=>a.kind!=='schedule_constraint');const result=await run(value,'development');assert.equal(result.status,200);assert.deepEqual(result.body.evidence.provenance.authorization_records,[]);assert.equal(result.logs.length,1);assert.equal(result.logs[0][0],"[What's Left?] Evidence authorization assembly");assert.deepEqual(JSON.parse(result.logs[0][1]),expected('schedule_constraint'));assert.doesNotMatch(JSON.stringify(result.body),/authorization_atom_assembly_incomplete|atom_counts|missing_required_atom_kinds/);
});
test('production and unset environments remain silent with identical returned state',async()=>{
 const value=atoms().filter(a=>a.kind!=='schedule_constraint'),dev=await run(value,'development');for(const env of ['production',undefined]){const result=await run(value,env);assert.equal(result.status,dev.status);assert.deepEqual(result.body,dev.body);assert.deepEqual(result.logs,[]);}
});
test('privacy: diagnostic contains only controlled kinds, intervention, and counts',async()=>{
 const result=await run(atoms().filter(a=>a.kind!=='schedule_constraint'),'development');const text=JSON.stringify(result.logs),d=JSON.parse(result.logs[0][1]);assert.deepEqual(Object.keys(d).sort(),['reason','intervention','returned_atom_kinds','atom_counts','missing_required_atom_kinds','ambiguous_atom_kinds','conflicting_atom_kinds'].sort());assert.doesNotMatch(text,/SECRET|Cornhead|Tuesday|source_refs|source_input|content|choices|prompt|1,900|2500|text/);
});
test('valid complete support and target-only Waste emit no route assembly diagnostic',async()=>{
 for(const value of [atoms(),waste()]){const result=await run(value,'development');assert.equal(result.status,200);assert.deepEqual(result.logs,[]);}
});
