// Offline verification of saved browser evidence. Does not call providers,
// rewrite output, or participate in production validation.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {prepareDemoFixture} from './demo-fixture.mjs';
const plain=value=>JSON.parse(JSON.stringify(value));
export function checkDemoReport(report){
  const {calls,outcome,layouts}=report;
  assert.ok(outcome.complete,JSON.stringify(outcome));assert.equal(calls.length,6);assert.ok(calls.every(c=>c.status===200));
  assert.equal(calls[0].response.evidence.currency,'USD');assert.deepEqual(calls[5].body.decision_gate,calls[4].response);
  const gate=calls[4].response,decision=calls[5].response.decision,findings=[];
  assert.ok(layouts.every(l=>l.documentWidth<=l.viewport&&l.overflow.length===0&&!l.footerOverlaps&&l.officeFits));
  assert.equal(report.exceptions.length,0);
  assert.doesNotMatch(JSON.stringify(gate.missing_decision_inputs)+JSON.stringify(decision.priority_inputs),/Explicit currency code/);
  if(report.mode==='--cornhead'){
    assert.equal(gate.decision_gate,'needs_more_data');assert.equal(gate.comparison_gap_status,'not_applicable');assert.equal(gate.top_candidate_id,null);
    assert.equal(decision.decision_status,'needs_more_data');assert.equal(decision.recommendation.type,'collect_data');assert.equal(decision.recommendation.candidate_id,null);assert.equal(decision.comparison.length,3);
    assert.ok(calls[3].response.results.every(r=>r.status==='not_calculable_yet'&&r.calculation===null));
    const changes=calls[2].response.scenarios.scenarios.flatMap(s=>s.controlled_changes);
    if(!changes.some(c=>c.change_type==='delta'&&c.value===-1))findings.push('Expected Labor delta -1 was not authorized: live leak category/title fell outside the existing exact binding. Labor stayed not_simulation_ready.');
    assert.ok(changes.some(c=>c.from===9&&c.value===5));
    if(calls[3].response.results.length!==2)findings.push('Only Waste was simulated; the requested two defined scenarios were not both present.');
  }else{
    const fixture=JSON.parse(fs.readFileSync('tests/fixtures/complete-clear-winner.json','utf8')),prepared=prepareDemoFixture(fixture);
    assert.deepEqual(calls[3].response,plain(prepared.simulation));assert.deepEqual(gate,plain(prepared.gate));assert.equal(gate.decision_gate,'action_allowed');
    assert.equal(decision.decision_status,'actionable');assert.equal(decision.recommendation.type,'business_action');assert.equal(decision.recommendation.candidate_id,gate.top_candidate_id);
  }
  const prose=[decision.recommendation.title,decision.recommendation.rationale,...decision.comparison.map(c=>c.assessment),...decision.priority_inputs.map(p=>p.why_it_matters)].join('\n');
  if(gate.top_candidate_id===null && /\btop candidate\b/i.test(prose))findings.push('Decision prose mentions a top candidate although the authoritative Gate top_candidate_id is null.');
  if(/\b(?:needs_more_data|not_calculable_yet|not_simulation_ready)\b/.test(prose))findings.push('Returned model prose contains a raw internal status enum; the frontend preserves it verbatim rather than rewriting output.');
  if(/\b(?:top )?candidate (?:meets?|passes?|exceeds?|crosses?) (?:the )?(?:(?:action|decision) )?threshold\b/i.test(prose))findings.push('Real Decision wording attaches the threshold to a candidate instead of explicitly to the comparison gap; the current production guard accepted it.');
  return {transport_and_rendering:'passed',ready_for_unqualified_demo:findings.length===0,findings};
}
