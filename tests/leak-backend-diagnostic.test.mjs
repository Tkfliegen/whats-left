import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import ts from 'typescript';
import {productionModules} from './helpers/provenance.mjs';

const evidence=JSON.parse(fs.readFileSync('tests/fixtures/leak-case-a-failed.json')).evidence;
const fact=evidence.provenance.citable_facts.find(f=>f.text.includes('Ingredient waste is currently')).id;
const valid=()=>({leaks:[{title:'Ingredient waste',category:'waste',evidence_refs:[fact],evidence:['Reported waste is 9%.'],interpretation:'Reported waste needs investigation.',confidence:'high'}],insufficient_evidence:[]});
const validate=productionModules()('src/app/api/analyze/leaks/output.ts').validateLeakOutput;
async function run(result,env){
 const logs=[];let calls=0;
 const dependencies=productionModules();const exports={};
 const code=ts.transpileModule(fs.readFileSync('src/app/api/analyze/leaks/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext(code,{exports,Response,AbortSignal,process:{env:{NODE_ENV:env,NEBIUS_API_KEY:'SECRET_TEST_KEY'}},console:{warn:(...args)=>logs.push(args)},
  require:s=>dependencies(path.resolve('src/app/api/analyze/leaks',s+'.ts')),
  fetch:async()=>{calls++;return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(result)}}]});}});
 const before=JSON.stringify(result);
 const response=await exports.POST(new Request('http://localhost',{method:'POST',body:JSON.stringify({evidence,operational_context:[]})}));
 assert.equal(calls,1);assert.equal(JSON.stringify(result),before);
 return {status:response.status,body:await response.json(),logs};
}
const generic={error:'Leak analysis result rejected by output validation: unreported_number.'};
test('development records only exact first failing path and normalized numeric token, without prose or secrets',async()=>{
 const result=valid();result.leaks[0].evidence.push('PRIVATE business prose claims USD 1,234.500.');
 const response=await run(result,'development');assert.equal(response.status,502);assert.deepEqual(response.body,generic);
 assert.equal(response.logs.length,1);assert.equal(response.logs[0][0],"[What's Left?] Backend Leak rejection");
 assert.deepEqual(JSON.parse(response.logs[0][1]),{reason:'unreported_number',field_path:'leaks[0].evidence[1]',normalized_number:'1234.5',rejection_branch:'scalar_not_in_selected_support',number_in_global_support:false,number_in_selected_support:false,selected_citation_count:1,matching_support_count:0,global_matching_support_count:0,numeric_expression_type:'scalar',support_scope:'finding_citations'});
 assert.doesNotMatch(JSON.stringify(response.logs),/PRIVATE|business prose|SECRET_TEST_KEY|choices|evidence_refs/);
});
test('multiple claims preserve validator ordering: first field, then first numeric token',async()=>{
 const result=valid();result.leaks[0].title='PRIVATE 33.40 then 88.0';result.leaks[0].evidence=['Later 77.7'];result.leaks.push({...result.leaks[0],title:'Later 66.6'});
 const validation=validate(result,evidence);assert.equal(validation.field,'leaks[0].title');assert.deepEqual(Array.from(validation.numbers),['33.4','88']);
 const response=await run(result,'development');const diagnostic=JSON.parse(response.logs[0][1]);assert.equal(diagnostic.reason,'unreported_number');assert.equal(diagnostic.field_path,validation.field);assert.equal(diagnostic.normalized_number,validation.numbers[0]);assert.equal(diagnostic.rejection_branch,'scalar_not_in_selected_support');assert.equal(response.status,502);
});
test('production and unset environments keep existing generic response and emit no diagnostic',async()=>{
 const result=valid();result.leaks[0].interpretation='PRIVATE 33.4';
 for(const env of ['production',undefined]){const response=await run(result,env);assert.equal(response.status,502);assert.deepEqual(response.body,generic);assert.deepEqual(response.logs,[]);}
});
test('accepted responses remain identical across environments with no diagnostics',async()=>{
 const result=valid();assert.equal(validate(result,evidence).ok,true);
 for(const env of ['development','production']){const response=await run(result,env);assert.equal(response.status,200);assert.deepEqual(response.body,{leaks:{...result,leaks:result.leaks.map(f=>({...f,intervention_ref:null}))}});assert.deepEqual(response.logs,[]);}
});
test('other rejection categories remain unchanged and do not emit numeric diagnostics',async()=>{
 const result=valid();result.leaks[0].interpretation='The gap is 9 percentage points.';assert.equal(validate(result,evidence).reason,'unreported_numeric_unit');
 const response=await run(result,'development');assert.equal(response.status,502);assert.deepEqual(response.body,{error:'Leak analysis result rejected by output validation: unreported_numeric_unit.'});assert.deepEqual(response.logs,[]);
});
const headcountFact=evidence.provenance.citable_facts.find(f=>/4 staff members/.test(f.text)).id;
test('uncited literal 4 reports scalar branch and distinguishes global from selected support',async()=>{
 const result=valid();result.leaks[0].interpretation='PRIVATE interpretation mentions 4 staff.';
 const before=JSON.stringify(result),response=await run(result,'development'),d=JSON.parse(response.logs[0][1]);
 assert.equal(response.status,502);assert.deepEqual(response.body,generic);assert.equal(JSON.stringify(result),before);
 assert.equal(d.rejection_branch,'scalar_not_in_selected_support');assert.equal(d.normalized_number,'4');assert.equal(d.field_path,'leaks[0].interpretation');
 assert.equal(d.number_in_global_support,true);assert.equal(d.number_in_selected_support,false);assert.equal(d.selected_citation_count,1);assert.equal(d.matching_support_count,0);assert.ok(d.global_matching_support_count>0);assert.equal(d.numeric_expression_type,'scalar');
 assert.doesNotMatch(JSON.stringify(response.logs),/PRIVATE|SECRET|staff|source_ref|fact_|Authorization/);
});
test('cited literal 4 passes without a diagnostic in every environment',async()=>{
 const result=valid();result.leaks[0].evidence_refs.push(headcountFact);result.leaks[0].interpretation='Baseline staffing is 4 staff members.';
 for(const env of ['development','production']){const response=await run(result,env);assert.equal(response.status,200);assert.deepEqual(response.logs,[]);}
});
test('cited scalar 4 does not support a four-times ratio and reports the derived branch',async()=>{
 const result=valid();result.leaks[0].evidence_refs.push(headcountFact);result.leaks[0].interpretation='PRIVATE staffing is four times baseline.';
 const response=await run(result,'development'),d=JSON.parse(response.logs[0][1]);
 assert.equal(response.status,502);assert.deepEqual(response.body,generic);assert.equal(d.rejection_branch,'unsupported_derived_numeric_claim');
 assert.equal(d.number_in_global_support,true);assert.equal(d.number_in_selected_support,true);assert.equal(d.normalized_number,'4');assert.equal(d.selected_citation_count,2);assert.equal(d.matching_support_count,1);assert.equal(d.numeric_expression_type,'derived_ratio');
 assert.doesNotMatch(JSON.stringify(response.logs),/PRIVATE|SECRET|four times|fact_/);
 for(const env of ['production',undefined]){const prod=await run(result,env);assert.deepEqual(prod.body,response.body);assert.equal(prod.status,502);assert.deepEqual(prod.logs,[]);}
});
test('diagnostic callbacks do not alter validation, first-failure order, or fail-closed behavior when logging throws',()=>{
 const result=valid();result.leaks[0].interpretation='PRIVATE 4 followed by 33.4';
 const baseline=JSON.stringify(validate(result,evidence)),logs=[];
 assert.equal(JSON.stringify(validate(result,evidence,undefined,d=>logs.push(d))),baseline);
 assert.equal(logs.length,1);assert.equal(logs[0].normalized_number,'4');
 assert.equal(JSON.stringify(validate(result,evidence,undefined,()=>{throw Error('PRIVATE logging failure');})),baseline);
});
test('insufficient-evidence diagnostics explicitly distinguish catalog support from per-finding citations',async()=>{
 const result=valid();result.insufficient_evidence=[{topic:'PRIVATE 1234.5',reason:'No supporting information.'}];
 const response=await run(result,'development'),d=JSON.parse(response.logs[0][1]);
 assert.equal(d.support_scope,'global_catalog');assert.equal(d.number_in_selected_support,null);assert.equal(d.selected_citation_count,0);assert.equal(d.field_path,'insufficient_evidence[0].topic');assert.equal(d.normalized_number,'1234.5');
});
