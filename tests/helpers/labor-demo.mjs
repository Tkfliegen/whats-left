import fs from 'node:fs';
import {completeLabor} from './complete-labor.mjs';

export function laborDemo() {
 const f=completeLabor(),old=f.evidence.provenance;
 f.note=fs.readFileSync('tests/fixtures/complete-labor-demo.txt','utf8').trimEnd();f.evidence.period='month';
 const p=f.load('src/app/api/analyze/evidence/provenance.ts');f.evidence.provenance=p.createEvidenceProvenance(f.evidence,f.note,[]);
 const sources=f.evidence.provenance.items;
 const source=prefix=>sources.find(s=>/^source_input\[\d+\]$/.test(s.source)&&s.text.startsWith(prefix));
 const remap=id=>source(old.items.find(s=>s.id===id).text.replace('1 worker','1 staff member')).id;
 for(const fact of f.record.supporting_facts)fact.source_refs=fact.source_refs.map(remap);
 f.record.permission_source_refs=f.record.permission_source_refs.map(remap);f.record.constraint_source_refs=f.record.constraint_source_refs.map(remap);
 f.evidence.provenance.authorization_records=[f.record];
 f.head=source('The current baseline');f.worker=source('The Tuesday evening labor cost');f.actual=source('Tuesday evening labor cost is explicitly');f.target=source("Management's Tuesday");
 const anchor=(s,quote)=>({source_ref:s.id,quote});
 f.supports=[{concept:'baseline_headcount',scope:'tuesday_evening',period:'month',support:{value:anchor(f.head,'4'),unit:anchor(f.head,'4 staff members'),scope:anchor(f.head,f.head.text),period:anchor(f.head,'affected monthly reporting period'),currency:null}},
 {concept:'labor_cost_per_worker',scope:'tuesday_evening',period:'month',support:{value:anchor(f.worker,'625'),unit:anchor(f.worker,'USD 625 per staff member monthly'),scope:anchor(f.worker,f.worker.text),period:anchor(f.worker,'monthly'),currency:anchor(f.worker,'USD')}}];
 const facts=f.load('src/app/api/analyze/evidence/calculation-facts.ts').groundCalculationFacts(f.supports,sources,f.evidence);
 f.evidence.provenance={...p.createEvidenceProvenance(f.evidence,f.note,facts),authorization_records:[f.record]};
 const ids=[...f.record.supporting_facts.flatMap(fact=>fact.source_refs),...f.record.permission_source_refs,...f.record.constraint_source_refs,f.actual.id,f.target.id,f.head.id];
 f.finding={title:'Tuesday evening labor cost share exceeds management target',category:'labor',evidence_refs:ids.map(id=>f.evidence.provenance.citable_facts.find(fact=>fact.source_refs.length===1&&fact.source_refs[0]===id).id),evidence:[f.actual.text,f.target.text],interpretation:'The reported Tuesday evening labor cost share of 31.25% exceeds the management target of 25%.',confidence:'high'};
 return f;
}
