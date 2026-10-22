// Test-only migration of recorded downstream records into explicit mock provider
// atoms. Production never accepts records from the provider. Scope-only legacy
// constraints do NOT become unchanged-schedule atoms.
export function atomsFromRecords(records) {
 return records.flatMap(record=>[
  ...record.supporting_facts.map(f=>f.role==='sales'||f.role==='staffing_cost'
   ?{kind:f.role==='sales'?'scoped_sales':'scoped_staffing_cost',scope:record.scope,period:f.period,amount:f.value,currency:f.currency,source_refs:f.source_refs}
   :{kind:f.role==='current_waste_rate'?'current_waste_rate':f.role==='target_waste_rate'?'waste_target_rate':f.role,scope:'ingredient_waste',value:f.value,unit:f.unit,source_refs:f.source_refs}),
  ...(record.permission==='explicit'?[record.intervention==='headcount_reduction'
   ?{kind:'headcount_reduction_permission',scope:record.scope,operation:record.operation,value:record.value,unit:record.unit,permission:'explicit',source_refs:record.permission_source_refs}
   :{kind:'waste_reduction_permission',scope:record.scope,from:record.from,value:record.value,unit:record.unit,permission:'explicit',source_refs:record.permission_source_refs}]:[]),
  ...(record.constraint==='rest_schedule_unchanged'?[{kind:'schedule_constraint',intervention:record.intervention,scope:record.scope,constraint:record.constraint,source_refs:record.constraint_source_refs}]:[]),
 ]);
}
