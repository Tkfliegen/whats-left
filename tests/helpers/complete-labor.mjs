import {productionModules} from './provenance.mjs';

export const input = `Monthly revenue is USD 100,000.

Total monthly operating costs are USD 95,800.

Tuesday evening sales are USD 8,000 per month.

Tuesday evening staffing has 4 workers.

The total Tuesday evening staffing cost is USD 2,500 per month.

This means the labor cost is USD 625 per worker per month.

Management has approved testing a reduction of 1 worker on Tuesday evening.

All other staffing schedules and operating hours will remain unchanged during the test.

Please analyze where margin may be leaking and what actionable change can be tested.`;

export function completeLabor({sales=8000,cost=2500}={}) {
 const load=productionModules(),p=load('src/app/api/analyze/evidence/provenance.ts');
 const salesText=`Tuesday evening sales are USD ${sales.toLocaleString('en-US')} per month.`;
 const costText=`The total Tuesday evening staffing cost is USD ${cost.toLocaleString('en-US')} per month.`;
 const note=input.replace('Tuesday evening sales are USD 8,000 per month.',salesText).replace('The total Tuesday evening staffing cost is USD 2,500 per month.',costText);
 const evidence={business_type:null,period:'monthly',currency:'USD',revenue:{total:100000,items:[{name:'Tuesday evening sales',amount:sales,source_text:salesText}]},costs:{total:95800,items:[{name:'Tuesday evening staffing cost',amount:cost,reported_category:null,source_text:costText}]},facts:[],assumptions:[],missing_information:[],confidence:'high'};
 evidence.provenance=p.createEvidenceProvenance(evidence,note,[]);
 const source=text=>evidence.provenance.items.find(s=>/^source_input\[\d+\]$/.test(s.source)&&s.text===text).id;
 const permission=source('Management has approved testing a reduction of 1 worker on Tuesday evening.');
 const constraint=source('All other staffing schedules and operating hours will remain unchanged during the test.');
 evidence.provenance.authorization_records=[{intervention:'headcount_reduction',scope:'tuesday_evening_6pm_10pm',operation:'delta',from:null,value:-1,unit:'persons',permission:'explicit',permission_source_refs:[permission],constraint:'rest_schedule_unchanged',constraint_source_refs:[constraint],supporting_facts:[{role:'sales',value:sales,unit:'currency',period:'month',currency:'USD',source_refs:[source(salesText)]},{role:'staffing_cost',value:cost,unit:'currency',period:'month',currency:'USD',source_refs:[source(costText)]}]}];
 const ids=[source(salesText),source(costText),permission,constraint];
 const refs=ids.map(id=>evidence.provenance.citable_facts.find(f=>f.source_refs.length===1&&f.source_refs[0]===id).id);
 const finding={title:'Approved Tuesday evening staffing test',category:'labor',evidence_refs:refs,evidence:[salesText,costText],interpretation:'Management permits a staffing test while other schedules remain unchanged.',confidence:'high'};
 return {evidence,finding,note,record:evidence.provenance.authorization_records[0],load};
}
