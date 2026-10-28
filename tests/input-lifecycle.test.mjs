import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';
import {productionModules} from './helpers/provenance.mjs';
import {harness as analysisHarness} from './helpers/analysis-harness.mjs';
const load=productionModules(),{snapshotSource,sourceSummary}=load('src/lib/analysis-source.ts');
function harness(){
 let i=0,props,tree,submission;const slots=[],navigations=[];
 const hooks={useState(initial){const index=i++;if(!(index in slots))slots[index]=initial;return [slots[index],v=>slots[index]=typeof v==='function'?v(slots[index]):v];},useRef(initial){const index=i++;return slots[index]??=( {current:initial});}};
 const controls={businessName:{value:'Shop'},businessType:{value:'Tea Shop'},notes:{value:''}};
 const picker={value:''},form={elements:{namedItem:name=>controls[name]}};
 const exports={};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/components/business-input-panel.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,require:s=>s==='react'?hooks:s==='react/jsx-runtime'?jsx:load('src/lib/analysis-source.ts'),FormData:class{get(name){return controls[name]?.value;}}});
 const all=node=>!node||typeof node!=='object'?[]:[node,...[node.props?.children].flat(Infinity).flatMap(all)];
 const find=(type,predicate=()=>true)=>all(tree).find(n=>n.type===type&&predicate(n));
 const submit=()=>{
  let prevented=false;
  submission=find('form').props.onSubmit({preventDefault(){prevented=true;},currentTarget:form});
  if(!prevented)navigations.push({method:'GET',url:'/?'+new URLSearchParams(Object.entries(controls).map(([k,v])=>[k,v.value]))});
  return submission;
 };
 form.requestSubmit=submit;
 return {controls,picker,navigations,render(p){props=p??props;i=0;tree=exports.BusinessInputPanel(props);find('input',n=>n.props.type==='file').props.ref.current=picker;return tree;},find,
 select(files){picker.value='C:\\fakepath\\report.pdf';find('input',n=>n.props.type==='file').props.onChange({target:{files}});},
 submit,
 clickAnalyze(){const button=find('button',n=>n.props.className?.includes('analyze-button'));button.props.onClick?.({currentTarget:{form}});if(button.props.type==='submit')submit();return submission;}};
}
test('Analyze click uses the existing pipeline once, cancels native GET and retains inputs on failure',async()=>{
 const requests=[],analysis=analysisHarness(async(url,options)=>{requests.push({url,...options});return Response.json({error:'Test-only failure'},{status:502});});
 analysis.render();const h=harness();let calls=0;
 h.render({complete:false,isRunning:false,analysisError:'',onSource(){},onAnalyze:(...args)=>{calls++;return analysis.value.startAnalysis(...args);}});
 h.controls.businessName.value='Regression Shop';h.controls.notes.value='Original business notes';
 h.select([new File(['local selection'],'report.pdf')]);h.render();
 const button=h.find('button',n=>n.props.className?.includes('analyze-button'));
 assert.equal(button.props.type,'button'); // Inert before hydration: no native form submission.
 const run=h.clickAnalyze();await h.clickAnalyze();await run;h.render();analysis.render();
 assert.equal(calls,1);assert.equal(requests.length,1);
 assert.equal(requests[0].url,'/api/analyze/evidence');assert.equal(requests[0].method,'POST');
 assert.match(JSON.parse(requests[0].body).input,/Regression Shop/);
 assert.equal(h.navigations.length,0);assert.match(analysis.value.analysisError,/Evidence/);
 assert.equal(h.controls.businessName.value,'Regression Shop');assert.equal(h.controls.businessType.value,'Tea Shop');
 assert.equal(h.controls.notes.value,'Original business notes');assert.equal(h.find('ul').props.children.length,1);
 assert.equal(h.picker.value,'C:\\fakepath\\report.pdf');analysis.unmount();
});
for(const mode of ['note','file','both'])for(const success of [true,false])test(`${mode}: ${success?'success clears':'failure retains'} Note/File and native picker`,async()=>{
 const h=harness(),calls=[],summaries=[];let resolve;const wait=new Promise(r=>resolve=r);
 const props={complete:false,isRunning:false,analysisError:'',onSource:s=>summaries.push(s),onAnalyze:(...args)=>{calls.push(args);return wait;}};
 h.render(props);h.controls.notes.value=mode==='file'?'':'Original note';
 if(mode!=='note')h.select([new File(['private content'],'report.pdf')]);h.render();
 const run=h.submit();h.render();assert.equal(h.find('fieldset').props.disabled,true);
 await h.submit();assert.equal(calls.length,1);
 // File drops during the active request cannot mutate its submitted snapshot.
 h.find('label',n=>n.props.className==='upload-zone').props.onDrop({preventDefault(){},dataTransfer:{files:[new File(['new'],'other.pdf')]}});
 resolve(success);await run;h.render({...props,complete:success,analysisError:success?'':'Evidence failed'});
 assert.equal(h.controls.notes.value,success?'':mode==='file'?'':'Original note');
 assert.equal(h.picker.value,success?'':mode==='note'?'':'C:\\fakepath\\report.pdf');
 assert.equal(h.find('ul').props.children.length,success||mode==='note'?0:1);
 assert.equal(h.controls.businessName.value,'Shop');assert.equal(h.controls.businessType.value,'Tea Shop');
 assert.equal(summaries.length,1);assert.doesNotMatch(summaries[0],/private content/);
 if(mode!=='note')assert.match(summaries[0],/report.pdf.*not analyzed/);
 if(!success){
  h.controls.notes.value='Edited draft';h.render({...props,analysisError:'Evidence failed',onAnalyze:async(...args)=>{calls.push(args);return false;}});
  await h.submit();assert.deepEqual(calls[1],calls[0]);assert.equal(h.controls.notes.value,mode==='file'?'':'Original note');
 }else{
  h.render({...props,complete:true,onAnalyze:async(...args)=>{calls.push(args);return true;}});await h.submit();
  assert.doesNotMatch(summaries[1],/report.pdf/);assert.equal(calls[1][1],'');
  assert.ok(summaries[0]); // Completed summary is an independent string, not erased with inputs.
 }
});
test('source snapshot freezes the copied file list and input text',()=>{
 const files=[new File(['x'],'one.pdf')],draft={businessName:'Shop',businessType:'Café',notes:'First',files};
 const source=snapshotSource(draft);draft.notes='Second';files.push(new File(['y'],'two.pdf'));
 assert.equal(source.notes,'First');assert.equal(source.files.length,1);assert.ok(Object.isFrozen(source));assert.ok(Object.isFrozen(source.files));assert.match(sourceSummary(source),/Note \+ one.pdf/);
});

test('verification guidance submits corrected inputs instead of forcing the failed snapshot',async()=>{
 const h=harness(),calls=[];
 const props={complete:false,isRunning:false,analysisError:'',retryable:false,onSource(){},onAnalyze:async(...args)=>{calls.push(args);return false;}};
 h.render(props);h.controls.notes.value='Original details';await h.submit();
 h.controls.notes.value='Original details plus clarified Tuesday sales and schedule';
 h.render({...props,analysisError:'Evidence failed',failureHeading:'Some information could not be verified'});
 assert.match(h.find('button',n=>n.props.className?.includes('analyze-button')).props.children.join(''),/Update details and analyze/);
 await h.submit();assert.equal(calls.length,2);assert.equal(calls[1][1],'Original details plus clarified Tuesday sales and schedule');
 assert.equal(h.controls.notes.value,'Original details plus clarified Tuesday sales and schedule');assert.equal(h.navigations.length,0);
});
