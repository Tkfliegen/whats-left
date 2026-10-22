import {productionModules} from '../../../tests/helpers/provenance.mjs';
import {analyzeResult,numericTokens} from '../leak-reliability/evaluate.mjs';
import {numericInventory} from '../leak-ab/evaluate.mjs';
const load=productionModules();
const plain=value=>JSON.parse(JSON.stringify(value));
const same=(a,b)=>JSON.stringify(plain(a))===JSON.stringify(plain(b));
export function auditCase(c,raw){
 const calls=raw.calls,call=name=>calls.find(x=>x.url==='/api/analyze/'+name);
 const evidence=call('evidence')?.response?.evidence,leaks=call('leaks')?.response?.leaks;
 const scenario=call('scenarios')?.status===200?call('scenarios').response:null;
 const simulation=call('simulate')?.status===200?call('simulate').response:null,gate=call('decision-gate')?.status===200?call('decision-gate').response:null,decision=call('decision')?.status===200?call('decision').response.decision:null;
 const stages=Object.fromEntries(['evidence','leaks','scenarios','simulate','decision-gate','decision'].map(name=>{const x=call(name);return [name,{reached:!!x,http:x?.status??null,latency_ms:x?.finished&&x?.started?x.finished-x.started:null,error:x?.response?.error??x?.error??null}];}));
 const violations=[],missed=[],checks={};
 const records=evidence?.provenance?.authorization_records??[];
 const unexpected=records.filter(r=>!c.expected[r.intervention==='headcount_reduction'?'labor_authorization':'waste_authorization']);
 if(unexpected.length)violations.push({stage:'Evidence',kind:'unsupported_authorization',records:unexpected});
 if(evidence){
  checks.evidence_valid=load('src/app/api/analyze/evidence/provenance.ts').isEvidence(evidence,true);
  if(!checks.evidence_valid)violations.push({stage:'Evidence',kind:'malformed_trusted_state'});
  for(const [key,intervention] of [['labor_authorization','headcount_reduction'],['waste_authorization','waste_rate_target']])if(c.expected[key]&&!records.some(r=>r.intervention===intervention))missed.push({stage:'Evidence',kind:'missing_expected_authorization',intervention});
  const source=call('evidence').body.input,allowed=new Set(numericTokens(source));
  const fields=[['revenue.total',evidence.revenue.total],['costs.total',evidence.costs.total],...evidence.revenue.items.flatMap((v,i)=>[[`revenue.items[${i}].amount`,v.amount],[`revenue.items[${i}].source_text`,v.source_text]]),...evidence.costs.items.flatMap((v,i)=>[[`costs.items[${i}].amount`,v.amount],[`costs.items[${i}].source_text`,v.source_text]]),...evidence.facts.map((v,i)=>[`facts[${i}]`,v]),...evidence.missing_information.map((v,i)=>[`missing_information[${i}]`,v])];
  checks.evidence_unsupported_numeric_tokens=fields.flatMap(([field,value])=>value===null?[]:numericTokens(String(value)).filter(n=>!allowed.has(n)).map(number=>({field,number,value})));
  // Diagnostic inventory: semantic/unit/scope review remains manual. It does not
  // replace production validation or permit a result the application rejects.
  if(checks.evidence_unsupported_numeric_tokens.length)violations.push({stage:'Evidence',kind:'unsupported_numeric_fact',details:checks.evidence_unsupported_numeric_tokens});
 }
 if(leaks){
  checks.leak=analyzeResult(leaks,evidence);
  const inventory=numericInventory(leaks);checks.leak_prose_ids=inventory.flatMap(f=>[...f.text.matchAll(/(?:fact_|src_)[A-Za-z0-9_]+|(?<!\w)_\d+\b/g)].map(m=>({field:f.field_path,identifier:m[0]})));
  if(!checks.leak.validation.ok)violations.push({stage:'Leak',kind:'numeric_citation_escape',diagnostic:checks.leak.validation});
  checks.resolved_binding_matches= same(load('src/app/api/analyze/leaks/binding.ts').resolveLeakInterventions(leaks.leaks,evidence),leaks.leaks.map(f=>f.intervention_ref));
  const cross=leaks.leaks.filter(f=>f.intervention_ref!=null&&({headcount_reduction:'labor',waste_rate_target:'waste'})[f.intervention_ref]!==f.category);
  checks.cross_category_bindings=cross;
  if(cross.length||!checks.resolved_binding_matches)violations.push({stage:'Leak',kind:'incorrect_binding',findings:cross});
  if(checks.leak_prose_ids.length)violations.push({stage:'Leak',kind:'identifiers_in_prose',details:checks.leak_prose_ids});
  const categories=leaks.leaks.map(f=>f.category);for(const category of c.expected.expected_findings)if(!categories.includes(category))missed.push({stage:'Leak',kind:'missing_supported_finding',category});
  const falseCategories=leaks.leaks.filter(f=>!c.expected.allowed_findings.includes(f.category));if(falseCategories.length)violations.push({stage:'Leak',kind:'false_positive_finding',findings:falseCategories});
 }
 if(scenario){
  const input=load('src/app/api/analyze/scenarios/scenarios.ts').buildScenarioInput(call('scenarios').body);checks.scenario_authorizations=plain(input.authorized_changes);checks.scenario_authorization_validation=plain(load('src/app/api/analyze/scenarios/authorization.ts').validateScenarioSupport(scenario.scenarios,input.authorized_changes));
  if(!checks.scenario_authorization_validation.ok)violations.push({stage:'Scenario',kind:'unauthorized_intervention',diagnostic:checks.scenario_authorization_validation});
 }
 if(simulation){checks.calculator_exact_recompute=same(load('src/lib/scenario-calculator.ts').calculateScenarios(call('simulate').body),simulation);if(!checks.calculator_exact_recompute)violations.push({stage:'Calculator',kind:'fabricated_calculation'});}
 if(gate){checks.gate_exact_recompute=same(load('src/lib/decision-gate.ts').evaluateDecisionGate(call('decision-gate').body),gate);if(!checks.gate_exact_recompute)violations.push({stage:'Gate',kind:'gate_inconsistent_with_simulation'});}
 if(decision){checks.decision_validation=plain(load('src/app/api/analyze/decision/decision.ts').validateDecisionResult(decision,call('decision').body));if(!checks.decision_validation.ok)violations.push({stage:'Decision',kind:'gate_violation',diagnostic:checks.decision_validation});}
 checks.frontend_complete_only_after_decision=!raw.complete||raw.timeline.filter(t=>t.complete).every(t=>t.calls.some(x=>x.url==='/api/analyze/decision'&&x.status===200));if(!checks.frontend_complete_only_after_decision)violations.push({stage:'Frontend',kind:'premature_complete'});
 const failed=calls.find(x=>x.status!==200||x.error),last=calls.at(-1);const diagnostics=raw.server_diagnostics??[];
 const boundary=diagnostics.find(d=>d.label==='Evidence provider rejection');
 const error=failed?.response?.error??raw.error??null;
 let failure_category=null;
 if(boundary)failure_category=boundary.diagnostic.reason;
 else if(failed&&/provider.*(request failed|unavailable)/i.test(error??''))failure_category='provider_boundary_failure_unclassified';
 else if(failed&&/provider.*(invalid|returned)/i.test(error??''))failure_category='schema_or_completion_failure';
 else if(failed&&/rejected/i.test(error??''))failure_category='output_validation_rejection';
 else if(!raw.complete)failure_category=error?'frontend_or_route_rejection':'incomplete_run';
 return {id:c.id,category:c.category,classification:violations.length||!raw.complete?'FAIL':missed.length?'PARTIAL':'PASS',semantic_review:'pending manual source-grounded review',stages,first_failing_stage:violations[0]?.stage??(failed?.url??(!raw.complete?last?.url??'before Evidence':null)),failure_category,exact_error:error,diagnostics,violations,missed,checks,evidence_records:records,leak_findings:leaks?.leaks??null,scenario:scenario?.scenarios??null,simulation:simulation??null,gate:gate??null,decision:decision??null,frontend:{complete:raw.complete,error:raw.error??null},total_latency_ms:raw.total_latency_ms,retries:false,repairs:false,fallbacks:false};
}
