import fs from 'node:fs';
import {productionModules} from '../../../tests/helpers/provenance.mjs';
const {createEvidenceProvenance,sourceStatements}=productionModules()('src/app/api/analyze/evidence/provenance.ts');
export const unknownEvidence={business_type:null,period:null,currency:null,revenue:{total:null,items:[]},costs:{total:null,items:[]},facts:[],assumptions:[],missing_information:[],confidence:'low'};
const fields={
 scoped_sales:{scope:'tuesday_evening_6pm_10pm',period:'month',amount:1900,currency:'USD'},
 scoped_staffing_cost:{scope:'tuesday_evening_6pm_10pm',period:'month',amount:2500,currency:'USD'},
 headcount_reduction_permission:{scope:'tuesday_evening_6pm_10pm',operation:'delta',value:-1,unit:'persons',permission:'explicit'},
 schedule_constraint:{intervention:'headcount_reduction',scope:'tuesday_evening_6pm_10pm',constraint:'rest_schedule_unchanged'},
 current_waste_rate:{scope:'ingredient_waste',value:9,unit:'percent'},
 waste_target_rate:{scope:'ingredient_waste',value:5,unit:'percent'},
 waste_reduction_permission:{scope:'ingredient_waste',from:9,value:5,unit:'percent',permission:'explicit'},
};
const laborKinds=['scoped_sales','scoped_staffing_cost','headcount_reduction_permission','schedule_constraint'];
const wasteKinds=['current_waste_rate','waste_target_rate','waste_reduction_permission'];
function finish(id,input,description,indices,overrides={}){
 const sources=createEvidenceProvenance(unknownEvidence,input).items;
 const byIndex=n=>sources.find(s=>s.source===`source_input[${n-1}]`).id;
 const expected=Object.entries(indices).map(([kind,ordinals])=>({kind,...fields[kind],...overrides[kind],source_refs:ordinals.map(byIndex)}));
 const groupRefs=kinds=>[...new Set(expected.filter(a=>kinds.includes(a.kind)).flatMap(a=>a.source_refs))];
 const expected_atoms=expected.map(a=>({...a,allowed_source_refs:groupRefs(laborKinds.includes(a.kind)?laborKinds:wasteKinds)}));
 const expected_authorizations=[];
 if(laborKinds.every(kind=>indices[kind]))expected_authorizations.push('tuesday_evening_headcount_reduction');
 if(wasteKinds.every(kind=>indices[kind]))expected_authorizations.push('ingredient_waste_rate_target');
 return {id,description,input,expected_atoms,expected_authorizations,sources};
}
function note(id,description,lines,overrides={}){
 const input=['Business name: Cornhead Bagel','Selected business type: Café','Business description / notes: Currency: USD.','Period: last month.',...lines.map(l=>l[0])].join('\n');
 if(sourceStatements(input).length!==4+lines.length)throw Error('Evaluation annotation segmentation mismatch');
 const indices={};lines.forEach(([,kinds=[]],index)=>kinds.forEach(kind=>(indices[kind]??=[]).push(index+5)));
 return finish(id,input,description,indices,overrides);
}
const caseA=JSON.parse(fs.readFileSync(new URL('../../../tests/fixtures/authorization-current-note.json',import.meta.url)));
export const cases=[
 finish('case_a',caseA.input,'Exact current Case A, unchanged',{scoped_sales:[12],scoped_staffing_cost:[14],headcount_reduction_permission:[16],schedule_constraint:[16],current_waste_rate:[17],waste_target_rate:[18]}),
 note('paraphrased','Same facts and differently phrased explicit owner permission',[
  ['Monthly takings on Tuesdays between 6 PM and 10 PM were USD 1,900.',['scoped_sales']],
  ['Staff wages for that same Tuesday evening monthly window totaled USD 2,500.',['scoped_staffing_cost']],
  ['For Tuesday evenings, the owner approves a trial reduction of 1 staff member while every other shift remains unchanged.',['headcount_reduction_permission','schedule_constraint']],
  ['Measured ingredient waste is 9%.',['current_waste_rate']],['The internal waste goal is 5%, with no waste trial approved.',['waste_target_rate']],
 ]),
 note('different_numbers','Different reported amounts; no per-worker calculation input',[
  ['Tuesday evenings from 6 PM to 10 PM generated USD 1,640 in sales for the month.',['scoped_sales']],
  ['Staffing cost for those Tuesday evening hours was USD 2,860 for the same month.',['scoped_staffing_cost']],
  ['The owner authorizes testing a reduction of 1 person on Tuesday evenings while keeping the rest of the schedule unchanged.',['headcount_reduction_permission','schedule_constraint']],
  ['The business reports no baseline Tuesday headcount or cost per worker.'],
 ],{scoped_sales:{amount:1640},scoped_staffing_cost:{amount:2860}}),
 note('split_constraint','Permission and unchanged-schedule constraint in separate source sentences',[
  ['Tuesday evenings from 6 PM to 10 PM generated USD 1,900 in monthly sales.',['scoped_sales']],
  ['Those Tuesday evening shifts incurred USD 2,500 in monthly staffing cost.',['scoped_staffing_cost']],
  ['The owner is willing to test reducing Tuesday evening headcount by 1 person.',['headcount_reduction_permission']],
  ['During that Tuesday staffing trial, the rest of the schedule must remain unchanged.',['schedule_constraint']],
  ['Current ingredient waste is 9%.',['current_waste_rate']],['The internal waste target is 5%.',['waste_target_rate']],
 ]),
 note('target_without_permission','Negative control: Waste target exists, no approved test or Labor candidate',[
  ['Ingredient waste currently measures 9%.',['current_waste_rate']],['The internal ingredient waste target is 5%.',['waste_target_rate']],
  ['The owner has not approved any test to change ingredient waste.'],
  ['Average delivery revenue per order was USD 18.40.'],['Some delivery orders had combined costs above revenue; no delivery intervention is approved.'],
 ]),
 note('permissions_missing_calculation','Both explicit grants, but no baseline headcount, worker cost or purchase basis',[
  ['Tuesday evenings from 6 PM to 10 PM generated USD 1,900 in monthly sales.',['scoped_sales']],
  ['Tuesday evening staffing cost for that same monthly period was USD 2,500.',['scoped_staffing_cost']],
  ['The owner approves testing a reduction of 1 person on Tuesday evenings, with the rest of the schedule unchanged.',['headcount_reduction_permission','schedule_constraint']],
  ['Current ingredient waste is 9%.',['current_waste_rate']],['The internal ingredient waste target is 5%.',['waste_target_rate']],
  ['The owner explicitly approves a test to reduce ingredient waste from 9% toward the 5% target.',['waste_reduction_permission']],
  ['No baseline headcount, labor cost per worker or waste-category purchases have been reported.'],
 ]),
 note('irrelevant_sources','Valid facts mixed with Friday numbers, delivery data and unrelated statements',[
  ['Friday evening sales were USD 6,200 and staffing was 4 people.'],
  ['The owner bought a new sign for USD 40.'],
  ['Tuesday evenings from 6 PM to 10 PM generated USD 1,900 in sales for the month.',['scoped_sales']],
  ['The monthly staffing cost for those Tuesday evening shifts was USD 2,500.',['scoped_staffing_cost']],
  ['The owner permits testing a reduction of 1 person in Tuesday evening staffing while all other shifts stay unchanged.',['headcount_reduction_permission','schedule_constraint']],
  ['Waste is currently 9%.',['current_waste_rate']],['The stated internal waste target is 5%, and there is no explicit permission for a waste trial.',['waste_target_rate']],
  ['Delivery revenue averages USD 18.40 per order and no delivery pricing change has been approved.'],
  ['The shop has 12 tables and the owner likes blue packaging.'],
 ]),
 note('ambiguous_no_grant','Ambiguous hypothetical staffing idea; must fail closed without permission/constraint',[
  ['Tuesday evenings from 6 PM to 10 PM generated USD 1,900 in monthly sales.',['scoped_sales']],
  ['Tuesday staffing cost for those hours was USD 2,500 for that same month.',['scoped_staffing_cost']],
  ['The owner might consider a reduction of 1 person on Tuesday or Friday evenings, but has not decided whether to approve any trial.'],
  ['It is undecided whether other shifts would change; no schedule-preservation constraint has been agreed.'],
  ['Ingredient waste is 9%.',['current_waste_rate']],['The internal waste target is 5%, but no waste test has been approved.',['waste_target_rate']],
 ]),
];
