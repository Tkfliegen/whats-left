import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {harness} from './helpers/analysis-harness.mjs';
const sandbox={exports:{}};
vm.runInNewContext(ts.transpileModule(readFileSync('src/lib/leak-display.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,sandbox);
const {usesReportedNumbers,unreportedNumberDiagnostic}=sandbox.exports;
const plain=x=>JSON.parse(JSON.stringify(x));
const notes='Tuesday evening sales $1,900. Staffing cost $2,500. Four staff members are reported as 4. Waste 9%, target 5%. Orders average $18.40.';
const valid=()=>({leaks:[{title:'Tuesday staffing mismatch',category:'labor',evidence:['Sales were $1,900 and staffing cost $2,500.'],evidence_refs:['fact_987654321_02'],interpretation:'Staffing cost was $2,500 during those hours.',confidence:'high'}],insufficient_evidence:[]});
const evidence={business_type:'bagel shop',period:'last month',currency:'USD',revenue:{total:100000,items:[]},costs:{total:95800,items:[]},facts:[],assumptions:[],missing_information:[],confidence:'high'};

test('only reported numbers pass, producing no violations',()=>{
  const result=valid();assert.equal(usesReportedNumbers(result,notes),true);
  assert.deepEqual(plain(unreportedNumberDiagnostic(result,notes)),{stage:'leaks',reason:'unreported_number',message:'Unreported numbers in leak response',violations:[]});
});
test('newly derived number still rejects and diagnostic identifies exact field and normalized number',()=>{
  const result=valid();result.leaks[0].interpretation='Staffing cost exceeded sales by $600.';
  assert.equal(usesReportedNumbers(result,notes),false);
  assert.deepEqual(plain(unreportedNumberDiagnostic(result,notes)),{stage:'leaks',reason:'unreported_number',message:'Unreported numbers in leak response',violations:[{field:'leaks[0].interpretation',numbers:['600']}]});
});
test('diagnostic covers citations and insufficient-evidence text without returning their prose',()=>{
  const result=valid();result.leaks[0].evidence.push('PRIVATE_BUSINESS_TEXT $4,200 and $4,200');result.insufficient_evidence=[{topic:'Review 80%',reason:'PRIVATE_REASON $600'}];
  const diagnostic=unreportedNumberDiagnostic(result,notes);
  assert.deepEqual(plain(diagnostic.violations),[{field:'leaks[0].evidence[1]',numbers:['4200']},{field:'insufficient_evidence[0].topic',numbers:['80']},{field:'insufficient_evidence[0].reason',numbers:['600']}]);
  assert.doesNotMatch(JSON.stringify(diagnostic),/PRIVATE_|Staffing|Sales|fact_|evidence_refs/);
});
test('provenance-ID digits remain excluded from acceptance and diagnosis',()=>{
  const result=valid();result.leaks[0].evidence_refs=['fact_987654321_7654321'];
  assert.equal(usesReportedNumbers(result,notes),true);assert.equal(unreportedNumberDiagnostic(result,notes).violations.length,0);
  result.leaks[0].interpretation='Savings of $987654321';assert.equal(usesReportedNumbers(result,notes),false);
  assert.deepEqual(plain(unreportedNumberDiagnostic(result,notes).violations),[{field:'leaks[0].interpretation',numbers:['987654321']}]);
});
for(const [text,accepted] of [['Revenue $1,900',true],['Revenue $1900',true],['Order revenue $18.4',true],['Order revenue $18.400',true],['Actual 9%, target 5%',true],['Waste is 80% above target',false],['Savings $600',false],['Use 3 staff',false],['New cost $1,875',false]])test(`diagnostic preserves acceptance and payload: ${text}`,()=>{
  const result=valid();result.leaks[0].interpretation=text;const before=JSON.stringify(result),initial=usesReportedNumbers(result,notes);
  assert.equal(initial,accepted);const diagnostic=unreportedNumberDiagnostic(result,notes);
  assert.equal(usesReportedNumbers(result,notes),initial);assert.equal(diagnostic.violations.length===0,accepted);assert.equal(JSON.stringify(result),before);
});
for(const nodeEnv of ['development','production'])test(`${nodeEnv}: numeric rejection stays generic and stops before Scenario, with diagnostics only in development`,async()=>{
  const result=valid();result.leaks[0].interpretation='PRIVATE_PROSE: staffing cost exceeded sales by $600.';
  const calls=[],h=harness(async url=>{calls.push(url);return Response.json(url.endsWith('/evidence')?{evidence}:{leaks:result});},{nodeEnv});
  h.render();const run=h.value.startAnalysis(notes,notes);await h.settle();h.tick();await h.settle();await run;h.render();
  assert.deepEqual(calls,['/api/analyze/evidence','/api/analyze/leaks']);assert.equal(h.value.analysisError,"Leak analysis couldn't be completed. Please try again.");
  assert.equal(h.value.leakResult,null);assert.equal(h.value.scenarioResult,null);assert.equal(h.value.isRunning,false);assert.equal(h.timers.size,0);
  assert.equal(h.warnings.length,nodeEnv==='development'?1:0);
  if(nodeEnv==='development'){
    assert.deepEqual(JSON.parse(h.warnings[0][1]),{stage:'leaks',reason:'unreported_number',message:'Unreported numbers in leak response',violations:[{field:'leaks[0].interpretation',numbers:['600']}]});
    assert.doesNotMatch(JSON.stringify(h.warnings),/PRIVATE_PROSE|100000|fact_|source_refs/);
  }h.unmount();
});
test('accepted Leak response emits no diagnostics and reaches the existing Scenario request',async()=>{
  const calls=[],h=harness(async url=>{calls.push(url);return url.endsWith('/evidence')?Response.json({evidence}):url.endsWith('/leaks')?Response.json({leaks:valid()}):Response.json({error:'fixture stops here'},{status:502});},{nodeEnv:'development'});
  h.render();const run=h.value.startAnalysis(notes,notes);await h.settle();h.tick();await h.settle();h.tick();await h.settle();await run;h.render();
  assert.deepEqual(calls,['/api/analyze/evidence','/api/analyze/leaks','/api/analyze/scenarios']);assert.equal(h.warnings.length,0);assert.ok(h.value.leakResult);h.unmount();
});
