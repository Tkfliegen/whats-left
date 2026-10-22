import {atomsFromRecords} from './helpers/authorization-atoms.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import ts from 'typescript';
import {productionModules} from './helpers/provenance.mjs';
const load=productionModules();
const {validateAuthorizationRecords:validate,authorizationRecordsSchema}=load('src/app/api/analyze/evidence/authorization-records.ts');
const {matchesSchema}=load('src/app/api/analyze/evidence/evidence.ts');
const evidence=JSON.parse(fs.readFileSync('tests/fixtures/leak-case-a-failed.json')).evidence;
const sources=evidence.provenance.items,records=evidence.provenance.authorization_records;
const plain=x=>JSON.parse(JSON.stringify(x));
function diagnose(value){const diagnostics=[];const before=JSON.stringify(value);const accepted=validate(value,sources,'USD',d=>diagnostics.push(plain(d)));assert.equal(JSON.stringify(value),before);return {accepted,diagnostics};}
// Original boolean predicates: differential regression oracle, without diagnostics.
function legacy(value){
 if(!matchesSchema(value,authorizationRecordsSchema))return false;
 const catalog=new Map(sources.filter(s=>/^source_input\[\d+\]$/.test(s.source)).map(s=>[s.id,s.text]));
 const refs=(ids,required)=>(!required||ids.length>0)&&ids.length===new Set(ids).size&&ids.every(id=>catalog.has(id));
 const anchored=(n,ids)=>ids.some(id=>(catalog.get(id)?.match(/\d+(?:,\d{3})*(?:\.\d+)?/g)??[]).some(t=>Number(t.replace(/,/g,''))===n));
 return value.every(r=>{
  if(!refs(r.permission_source_refs,r.permission==='explicit')||!refs(r.constraint_source_refs,r.constraint!=='none')||(r.permission!=='explicit'&&r.permission_source_refs.length!==0)||(r.constraint==='none'&&r.constraint_source_refs.length!==0)||r.supporting_facts.length!==new Set(r.supporting_facts.map(f=>f.role)).size||!r.supporting_facts.every(f=>refs(f.source_refs,true)&&f.value>=0&&anchored(f.value,f.source_refs)))return false;
  if(r.intervention==='headcount_reduction')return r.scope==='tuesday_evening_6pm_10pm'&&r.operation==='delta'&&r.from===null&&r.value===-1&&r.unit==='persons'&&r.supporting_facts.every(f=>['sales','staffing_cost'].includes(f.role)&&f.unit==='currency'&&f.currency==='USD')&&(r.permission!=='explicit'||(r.constraint!=='none'&&anchored(1,r.permission_source_refs)));
  return r.scope==='ingredient_waste'&&r.operation==='absolute_target'&&r.unit==='percent'&&r.from===9&&r.value===5&&r.constraint==='none'&&r.supporting_facts.every(f=>['current_waste_rate','target_waste_rate'].includes(f.role)&&f.unit==='percent'&&f.currency===null)&&(r.permission!=='explicit'||(anchored(9,r.permission_source_refs)&&anchored(5,r.permission_source_refs)));
 });
}
test('identifies exact record, support field, and missing literal numeric anchor',()=>{
 const value=plain(records);value.push(plain(value[0]));value[1].supporting_facts[0].value=1901;
 assert.deepEqual(diagnose(value),{accepted:false,diagnostics:[{reason:'numeric_anchor_source_missing',authorization_record_index:1,intervention:'headcount_reduction',failing_field:'supporting_facts[0].source_refs'}]});
});
test('unknown and non-original source identities are identified; arbitrary prose is redacted',()=>{
 for(const [id,reason,logged] of [['src_'+'0'.repeat(32)+'_99','unknown_source_id',null],[sources.find(s=>s.source.startsWith('evidence.')).id,'source_type_mismatch',null],['PRIVATE raw source prose SECRET','unknown_source_id','[invalid_source_id]']]){
  const value=plain(records);value[0].permission_source_refs=[id];const d=diagnose(value).diagnostics[0];assert.equal(d.reason,reason);assert.equal(d.offending_source_id,logged??id);assert.doesNotMatch(JSON.stringify(d),/PRIVATE|SECRET|raw source/);
 }
});
for(const field of ['permission_source_refs','constraint_source_refs','supporting_facts[0].source_refs'])test(`missing required refs identify ${field}`,()=>{
 const value=plain(records);if(field.startsWith('support'))value[0].supporting_facts[0].source_refs=[];else value[0][field]=[];
 const d=diagnose(value).diagnostics[0];assert.equal(d.reason,'missing_required_source');assert.equal(d.failing_field,field);assert.equal(d.missing_required_support,field);
});
test('first failure order remains permission, constraint, then support and identity',()=>{
 const value=plain(records);value[0].permission_source_refs=[];value[0].constraint_source_refs=[];value[0].supporting_facts[0].value=999;value[0].scope='ingredient_waste';
 assert.equal(diagnose(value).diagnostics[0].failing_field,'permission_source_refs');value[0].permission_source_refs=records[0].permission_source_refs;
 assert.equal(diagnose(value).diagnostics[0].failing_field,'constraint_source_refs');value[0].constraint_source_refs=records[0].constraint_source_refs;
 assert.equal(diagnose(value).diagnostics[0].reason,'numeric_anchor_source_missing');value[0].supporting_facts[0].value=1900;
 assert.equal(diagnose(value).diagnostics[0].failing_field,'scope');
});
test('valid records and empty record lists emit no diagnostics; missing roles remain accepted here as before',()=>{
 for(const value of [records,[],[{...plain(records[0]),supporting_facts:[]}]])assert.deepEqual(diagnose(value),{accepted:true,diagnostics:[]});
});
test('acceptance matches original predicates over deterministic cross-field mutations',()=>{
 const candidates=[null,{},[],records];
 for(const intervention of ['headcount_reduction','waste_rate_target']){
  const base={...plain(records[0]),intervention};
  const mutations={scope:['ingredient_waste','tuesday_evening_6pm_10pm'],operation:['delta','absolute_target'],from:[null,9,5],value:[-1,5,0],unit:['persons','percent'],permission:['explicit','absent','denied'],constraint:['none','affected_scope_only','rest_schedule_unchanged'],permission_source_refs:[[],base.permission_source_refs,[...base.permission_source_refs,...base.permission_source_refs]],constraint_source_refs:[[],base.constraint_source_refs],supporting_facts:[[],base.supporting_facts,[base.supporting_facts[0],base.supporting_facts[0]]]};
  for(const [field,values] of Object.entries(mutations))for(const value of values)candidates.push([{...base,[field]:value}]);
  for(const field of ['role','value','unit','currency','source_refs'])for(const value of ({role:['sales','staffing_cost','current_waste_rate','target_waste_rate'],value:[-1,1900,2500,9,5],unit:['currency','percent'],currency:['USD','EUR',null],source_refs:[[],base.permission_source_refs]})[field]){const r=plain(base);r.supporting_facts[0][field]=value;candidates.push([r]);}
 }
 for(const value of candidates){const actual=diagnose(value);assert.equal(actual.accepted,legacy(value),JSON.stringify(value));assert.equal(actual.diagnostics.length,actual.accepted?0:1);assert.equal(validate(value,sources,'USD'),actual.accepted);}
});
async function route(env,invalid){
 const diagnostics=[],exports={};let calls=0;
 const {provenance:ignored,...output}=plain(evidence);void ignored;output.authorization_records=plain(records);if(typeof invalid==='function')invalid(output.authorization_records);else if(invalid)output.authorization_records[0].supporting_facts[0].value=1901;
 output.authorization_atoms=atomsFromRecords(output.authorization_records);delete output.authorization_records;
 const code=ts.transpileModule(fs.readFileSync('src/app/api/analyze/evidence/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext(code,{exports,Response,AbortSignal,process:{env:{NODE_ENV:env,NEBIUS_API_KEY:'SECRET_TEST_KEY'}},console:{warn:(...args)=>diagnostics.push(args)},require:s=>load(path.resolve('src/app/api/analyze/evidence',s+'.ts')),fetch:async()=>{calls++;return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(output)}}]});}});
 const response=await exports.POST(new Request('http://localhost',{method:'POST',body:JSON.stringify({input:evidence.provenance.source_input})}));assert.equal(calls,1);return {status:response.status,body:await response.json(),diagnostics};
}
test('route logs only allowlisted failure detail in development; HTTP body remains unchanged in every environment',async()=>{
 for(const env of ['development','production',undefined]){const result=await route(env,true);assert.equal(result.status,502);assert.deepEqual(result.body,{error:'Evidence authorization atoms have invalid source support.'});
  if(env==='development'){assert.equal(result.diagnostics.length,1);assert.equal(result.diagnostics[0][0],"[What's Left?] Evidence authorization atom rejection");assert.deepEqual(JSON.parse(result.diagnostics[0][1]),{reason:'numeric_anchor_source_missing',atom_index:0,failing_field:'amount'});assert.doesNotMatch(JSON.stringify(result.diagnostics),/1901|Cornhead|SECRET|choices|source_input/);}else assert.deepEqual(result.diagnostics,[]);
 }
});
test('valid route results emit no diagnostic in development or production',async()=>{
 for(const env of ['development','production']){const result=await route(env,false);assert.equal(result.status,200);assert.deepEqual(result.diagnostics,[]);assert.deepEqual(result.body.evidence.provenance.authorization_records,records);}
});

function addMismatchedRoles(value){
 const source=n=>sources.find(s=>s.id===`src_abbca75924f4c231a119ad1248d351f3_${n}`).id;
 value[0].supporting_facts.push(
  {role:'current_waste_rate',value:9,unit:'percent',period:'month',currency:null,source_refs:[source('17')]},
  {role:'target_waste_rate',value:5,unit:'percent',period:'month',currency:null,source_refs:[source('18')]});
}
const roleDiagnostic=index=>({reason:'support_role_mismatch',authorization_record_index:index,intervention:'headcount_reduction',failing_field:'supporting_facts[2].role',supporting_fact_index:2,returned_role:'current_waste_rate',allowed_roles:['sales','staffing_cost']});
test('Labor mismatch includes schema-controlled returned role, allowed roles, and exact first record/fact indices',()=>{
 const invalid=plain(records);addMismatchedRoles(invalid);const value=[...plain(records),...invalid];
 assert.deepEqual(diagnose(value),{accepted:false,diagnostics:[roleDiagnostic(1)]});assert.equal(validate(value,sources,'USD'),legacy(value));
});
test('role diagnostics follow existing order: prior anchors precede roles, then first role precedes later roles',()=>{
 const value=plain(records);addMismatchedRoles(value);value[0].supporting_facts[0].value=1901;
 assert.equal(diagnose(value).diagnostics[0].reason,'numeric_anchor_source_missing');value[0].supporting_facts[0].value=1900;
 assert.deepEqual(diagnose(value).diagnostics,[roleDiagnostic(0)]);value[0].supporting_facts.splice(2,1);
 const d=diagnose(value).diagnostics[0];assert.equal(d.supporting_fact_index,2);assert.equal(d.returned_role,'target_waste_rate');assert.equal(d.reason,'support_role_mismatch');
});
test('malformed free-form role fails schema before role diagnostics and arbitrary text is not retained',async()=>{
 const value=plain(records);value[0].supporting_facts[0].role='PRIVATE prose SECRET';
 assert.deepEqual(diagnose(value),{accepted:false,diagnostics:[{reason:'schema_mismatch',failing_field:'authorization_records'}]});
 const result=await route('development',value=>{value[0].supporting_facts[0].role='PRIVATE prose SECRET';});assert.equal(result.status,502);assert.deepEqual(result.diagnostics,[["[What's Left?] Evidence provider rejection",JSON.stringify({reason:'provider_schema_invalid'})]]);assert.doesNotMatch(JSON.stringify(result.diagnostics),/PRIVATE|SECRET/);assert.deepEqual(result.body,{error:'Evidence provider returned invalid evidence.'});
});
test('atomic producer cannot inject mixed support roles into Labor records; production remains silent',async()=>{
 for(const env of ['development','production',undefined]){
  const result=await route(env,addMismatchedRoles);assert.equal(result.status,200);assert.deepEqual(result.diagnostics,[]);
  assert.deepEqual(result.body.evidence.provenance.authorization_records[0].supporting_facts.map(f=>f.role),['sales','staffing_cost']);
 }
});
test('valid Labor roles remain accepted and never produce role diagnostics',async()=>{
 assert.deepEqual(diagnose(records),{accepted:true,diagnostics:[]});const result=await route('development',false);assert.equal(result.status,200);assert.deepEqual(result.diagnostics,[]);
});
