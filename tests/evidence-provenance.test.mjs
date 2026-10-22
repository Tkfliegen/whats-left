import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {provenance,productionModules,rawEvidence} from './helpers/provenance.mjs';
const fixture=JSON.parse(readFileSync('tests/fixtures/scenarios-bagel.json','utf8'));
const load=productionModules(),{buildScenarioInput,isScenarioRequest}=load('src/app/api/analyze/scenarios/scenarios.ts');
const {isLeakResult,createLeakSchema}=load('src/app/api/analyze/leaks/leaks.ts');
const auth=body=>buildScenarioInput(body).authorized_changes;
const plain=value=>JSON.parse(JSON.stringify(value));
const labor=body=>auth(body).find(a=>a.variable_id==='tuesday_evening_headcount');
const waste=body=>auth(body).find(a=>a.variable_id==='ingredient_waste_rate');
const request=body=>new Request('http://localhost',{method:'POST',body:JSON.stringify(body)});
const input=fixture.evidence.provenance.source_input;

test('code-generated Evidence IDs are deterministic, unique, and ordered across facts/items/original sources',()=>{
  const evidence=rawEvidence(fixture.evidence);evidence.facts=['A reported fact.','A reported fact.'];
  const first=provenance.createEvidenceProvenance(evidence,input),second=provenance.createEvidenceProvenance(structuredClone(evidence),input);
  assert.deepEqual(plain(first),plain(second));assert.equal(new Set(first.items.map(i=>i.id)).size,first.items.length);
  assert.deepEqual(Array.from(first.items.slice(9,11),i=>i.source),['evidence.facts[0]','evidence.facts[1]']);
  first.citable_facts.forEach((item,i)=>assert.ok(item.id.endsWith('_'+String(i+1).padStart(2,'0'))));
  assert.equal(provenance.isEvidence({...evidence,provenance:first},true),true);
  const different=provenance.createEvidenceProvenance(evidence,input+'\nA new source.');
  assert.notEqual(first.items[0].id,different.items[0].id);
});
test('model extraction schema has no provenance or ID fields; route adds manifest only after validation',async()=>{
  const base=rawEvidence(fixture.evidence);let calls=0;
  const modules=productionModules(async(_url,options)=>{calls++;const schema=JSON.parse(options.body).response_format.json_schema.schema;
    assert.equal('provenance' in schema.properties,false);
    return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({...base,authorization_atoms:[]})}}]});});
  const response=await modules('src/app/api/analyze/evidence/route.ts').POST(request({input}));
  assert.equal(response.status,200);assert.equal(calls,1);
  assert.deepEqual((await response.json()).evidence.provenance,plain({...provenance.createEvidenceProvenance({...base,revenue:{...base.revenue,total:null},costs:{...base.costs,total:null}},input),authorization_records:[]}));
  const invalid=productionModules(async()=>Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(fixture.evidence)}}]}));
  assert.equal((await invalid('src/app/api/analyze/evidence/route.ts').POST(request({input}))).status,502);
});
test('Leak schema enumerates only supplied IDs; correct references survive arbitrary explanatory paraphrase',()=>{
  assert.deepEqual(plain(createLeakSchema(fixture.evidence).properties.leaks.items.properties.evidence_refs.items.enum),fixture.evidence.provenance.citable_facts.map(i=>i.id));
  const body=structuredClone(fixture);body.leaks.leaks.forEach(l=>{l.evidence=['Presentation wording can change completely.'];l.interpretation='A paraphrase.';});
  assert.equal(isLeakResult(body.leaks,body.evidence),true);assert.deepEqual(plain(auth(body)),plain(auth(fixture)));
});
for(const [name,mutate] of [
  ['unknown ID',b=>b.leaks.leaks[0].evidence_refs.push('ev_unknown_01')],
  ['forged same-prefix ID',b=>b.leaks.leaks[0].evidence_refs.push(b.leaks.leaks[0].evidence_refs[0].replace(/_\d+$/,'_999'))],
  ['missing refs',b=>delete b.leaks.leaks[0].evidence_refs],
  ['empty refs',b=>b.leaks.leaks[0].evidence_refs=[]],
  ['duplicate refs',b=>b.leaks.leaks[0].evidence_refs.push(b.leaks.leaks[0].evidence_refs[0])],
  ['altered source text',b=>b.evidence.provenance.items.at(-1).text='Invented permission.'],
  ['forged source path',b=>b.evidence.provenance.items[0].source='source_input[0]'],
  ['forged manifest ID',b=>b.evidence.provenance.items[0].id='ev_forged_01'],
  ['reordered manifest',b=>b.evidence.provenance.items.reverse()],
  ['missing manifest',b=>delete b.evidence.provenance],
  ['stale IDs from different analysis',b=>b.evidence.provenance=provenance.createEvidenceProvenance(b.evidence,input+'\nOther notes.')],
])test(`${name} fails closed without citation-text fallback`,()=>{
  const body=structuredClone(fixture);mutate(body);const before=JSON.stringify(body);
  assert.equal(isScenarioRequest(body),false);assert.equal(auth(body).length,0);assert.equal(JSON.stringify(body),before);
});
for(const name of ['current waste rate','target waste rate','explicit Waste permission'])test(`Waste refuses authorization without ${name} ID`,()=>{
  const body=structuredClone(fixture);const words={'current waste rate':'Ingredient waste last month','target waste rate':"The business's stated internal target",'explicit Waste permission':'Waste rate may be tested'};
  const item=body.evidence.provenance.citable_facts.find(i=>i.source_refs.length===1&&i.text.startsWith(words[name]));
  body.leaks.leaks[2].evidence_refs=body.leaks.leaks[2].evidence_refs.filter(ref=>ref!==item.id);
  assert.equal(isScenarioRequest(body),true);assert.equal(waste(body),undefined);
});
test('Waste accepts the exact recorded paraphrase with both rate IDs and explicit permission',()=>{
  const body=structuredClone(fixture);body.leaks.leaks[2].evidence=["Ingredient waste last month was 9% of ingredient purchases.","The business's stated internal target is 5% waste rate."];
  assert.ok(body.evidence.provenance.items.some(i=>i.text==="The business's stated internal target is 5%."));
  const allowed=waste(body);assert.ok(allowed);assert.equal(allowed.from,9);assert.equal(allowed.value,5);assert.equal(allowed.source_refs.length,3);
});
for(const title of ['Tuesday evening staffing cost exceeds sales revenue','A harmless new title'])test(`Labor authorizes through refs with title/category variant: ${title}`,()=>{
  const body=structuredClone(fixture);body.leaks.leaks[0].title=title;body.leaks.leaks[0].category='operations';body.leaks.leaks[0].evidence=['Different wording.'];
  assert.equal(labor(body).target_leak,title);assert.equal(labor(body).value,-1);assert.equal(labor(body).from,null);
});
for(const index of [0,1])test(`Labor requires both problem and explicit permission reference (${index})`,()=>{
  const body=structuredClone(fixture);const permission=body.evidence.provenance.citable_facts.find(i=>i.source_refs.length===1&&i.text.startsWith('Tuesday evening 6 PM'));
  const problem=body.evidence.provenance.citable_facts.find(i=>i.source_refs.length===1&&i.text.startsWith('Tuesday evenings from'));
  body.leaks.leaks[0].evidence_refs=[index===0?permission.id:problem.id];assert.equal(labor(body),undefined);
});
test('unrelated valid refs cannot borrow Labor permission; Delivery remains unauthorized',()=>{
  const body=structuredClone(fixture);body.leaks.leaks[0].evidence_refs=[body.evidence.provenance.citable_facts[0].id];
  assert.equal(labor(body),undefined);assert.equal(auth(body).some(a=>a.target_leak===body.leaks.leaks[1].title),false);
});
test('ambiguous competing findings and cross-domain claims refuse authorization',()=>{
  const duplicate=structuredClone(fixture);duplicate.leaks.leaks.push({...duplicate.leaks.leaks[0],title:'Another finding'});assert.equal(labor(duplicate),undefined);
  const mixed=structuredClone(fixture);mixed.leaks.leaks[0].evidence_refs.push(...mixed.leaks.leaks[2].evidence_refs);assert.equal(labor(mixed),undefined);
});
test('Scenario source records must preserve exact manifest ID/path/text; forged records cannot authorize',()=>{
  const body=structuredClone(fixture),built=buildScenarioInput(body),facts=plain(built.input_facts);
  const problem=facts.find(f=>f.id===built.authorized_changes[0].source_refs[0]);problem.source='operational_context[0]';
  assert.equal(load('src/app/api/analyze/scenarios/authorization.ts').buildScenarioAuthorizations(body,facts).some(a=>a.variable_id==='tuesday_evening_headcount'),false);
});
test('model facts and operational_context additions cannot invent permission absent from original source',()=>{
  const body=structuredClone(fixture);const source=body.evidence.provenance.source_input.replace('Tuesday evening 6 PM to 10 PM headcount may be tested by reducing headcount by 1 person.','No permission supplied.');
  body.evidence.provenance=provenance.createEvidenceProvenance(body.evidence,source);
  // Explicit fixture references to valid supplied source records, without permission.
  body.leaks.leaks.forEach(l=>l.evidence_refs=body.evidence.provenance.citable_facts.map(i=>i.id));
  assert.equal(labor(body),undefined);
});
test('Leak production route rejects invented/missing refs with one call and no repair',async()=>{
  for(const refs of [undefined,[],['ev_invented_01']]){
    let calls=0;const result=structuredClone(fixture.leaks);if(refs===undefined)delete result.leaks[0].evidence_refs;else result.leaks[0].evidence_refs=refs;
    const modules=productionModules(async()=>{calls++;return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(result)}}]});});
    const response=await modules('src/app/api/analyze/leaks/route.ts').POST(request({evidence:fixture.evidence,operational_context:fixture.operational_context}));
    assert.equal(response.status,502);assert.equal(calls,1);assert.deepEqual(Object.keys(await response.json()),['error']);
  }
});
test('authorization never reads Leak explanatory evidence or fuzzy/semantic matchers',()=>{
  const code=readFileSync('src/app/api/analyze/scenarios/authorization.ts','utf8');
  assert.doesNotMatch(code,/leak\.evidence\b|leak\.category\b|\bfetch\s*\(|embedding|cosine|levenshtein|similarity/i);
  assert.match(code,/resolveEvidenceRefs\(input\.evidence, leak\.evidence_refs\)/);
});
function changeSource(body,transform) {
  const old=body.evidence.provenance.citable_facts;
  body.evidence.provenance=provenance.createEvidenceProvenance(body.evidence,transform(body.evidence.provenance.source_input));
  body.leaks.leaks.forEach(leak=>{leak.evidence_refs=leak.evidence_refs.map(id=>{
    const index=old.findIndex(item=>item.id===id);return body.evidence.provenance.citable_facts[index].id;
  });});
}
for(const transform of [s=>'Do not '+s,s=>s+' This is prohibited.',s=>s.replace('1 person','2 persons'),s=>s.replace('may be tested','cannot be tested')])test('negated/altered original headcount permission cannot authorize even with correct source ID',()=>{
  const body=structuredClone(fixture),permission='Tuesday evening 6 PM to 10 PM headcount may be tested by reducing headcount by 1 person.';
  changeSource(body,s=>s.replace(permission,transform(permission)));assert.equal(labor(body),undefined);
});
for(const original of ['Ingredient waste last month was 9% of ingredient purchases.',"The business's stated internal target is 5%.",'Waste rate may be tested from the current 9% toward the stated 5% target.'])test(`unrecognized original Waste source cannot authorize: ${original}`,()=>{
  const body=structuredClone(fixture);changeSource(body,s=>s.replace(original,'No supplied authority.'));assert.equal(waste(body),undefined);
});
test('duplicate original authority statements are ambiguous and fail closed',()=>{
  const body=structuredClone(fixture);changeSource(body,s=>s+'\nWaste rate may be tested from the current 9% toward the stated 5% target.');assert.equal(waste(body),undefined);
});
test('internal ID digits are excluded from financial prose checks, while invented numeric claims still reject',()=>{
  const {usesReportedNumbers}=load('src/lib/leak-display.ts');
  const result={leaks:[{title:'Observed issue',category:'other',evidence:['Reported context'],evidence_refs:['ev_a1234_987'],interpretation:'Observed mismatch',confidence:'high'}],insufficient_evidence:[]};
  assert.equal(usesReportedNumbers(result,'Reported context'),true);
  result.leaks[0].interpretation='Invented savings of $999';assert.equal(usesReportedNumbers(result,'Reported context'),false);
});
