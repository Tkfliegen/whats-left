import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {prepareDemoFixture} from '../scripts/demo-fixture.mjs';
const fixture=name=>JSON.parse(readFileSync(new URL(`./fixtures/complete-${name}.json`,import.meta.url),'utf8'));
for(const name of ['close-call','clear-winner'])test(`${name} uses production authorization, formulas and Gate with complete canonical source inputs`,()=>{
  const f=fixture(name),before=JSON.stringify(f),r=prepareDemoFixture(f);
  assert.equal(JSON.stringify(f),before);assert.equal(r.simulation.results.length,2);
  for(const [index,key] of ['labor','waste'].entries()){
    const row=r.simulation.results[index],expected=f.expected[key];assert.equal(row.status,'calculable');assert.equal(row.missing_inputs.length,0);
    assert.equal(row.calculation.currency,'USD');assert.equal(row.calculation.period,'last_month');
    assert.equal(row.calculation.baseline_value,expected.baseline);assert.equal(row.calculation.projected_value,expected.projected);assert.equal(row.calculation.impact_value,expected.reduction);
    assert.ok(row.calculation.inputs.every(i=>r.simulationRequest.input_facts.some(f=>f.id===i.source_ref)||i.source_ref.startsWith('scenarios.scenarios[')));
  }
  assert.equal(r.simulation.results[0].calculation.formula_id,'LABOR_HEADCOUNT_DELTA');assert.equal(r.simulation.results[1].calculation.formula_id,'INGREDIENT_WASTE_RATE_TARGET');
  assert.equal(r.gate.decision_gate,f.expected.gate);assert.equal(r.gateRequest.evidence.currency,'USD');assert.equal(r.decisionRequest.evidence.currency,'USD');
  assert.equal(r.decisionRequest.decision_gate,r.gate);assert.doesNotMatch(JSON.stringify(r.simulationRequest),/"expected"|"impact_value"|"verified_impact"/);
});
test('complete close call requests exactly the existing two policy inputs and never authorizes action',()=>{
  const r=prepareDemoFixture(fixture('close-call'));assert.equal(r.gate.decision_gate,'needs_more_data');assert.equal(r.gate.comparison_gap_status,'below_threshold');
  assert.equal(r.gate.missing_decision_inputs.length,0);assert.deepEqual(JSON.parse(JSON.stringify(r.gate.policy_required_inputs.map(i=>i.category))),['implementation_cost','operational_constraints']);
});
test('clear winner selects the authoritative labor candidate; impacts are derived rather than supplied outputs',()=>{
  const r=prepareDemoFixture(fixture('clear-winner'));const top=r.gate.candidates.find(c=>c.candidate_id===r.gate.top_candidate_id);
  assert.equal(top.verified_impact,2500);assert.equal(top.target_leak,r.simulation.results[0].target_leak);assert.equal(r.gate.policy_required_inputs.length,0);
  assert.equal(r.gate.comparison_gap_status,'meets_or_exceeds_threshold');
});
test('removing structured inputs keeps the same authorized scenarios but fails closed to missing calculation data',()=>{
  const f=fixture('clear-winner');f.calculation_inputs=[];const r=prepareDemoFixture(f);
  assert.ok(r.simulation.results.every(r=>r.status==='not_calculable_yet'&&r.calculation===null));assert.equal(r.gate.decision_gate,'needs_more_data');assert.equal(r.gate.top_candidate_id,null);
});
test('demo fixture infrastructure is absent from production frontend and backend',()=>{
  const paths=['src/components/dashboard.tsx','src/components/use-demo-analysis.ts','src/components/decision-panel.tsx','src/app/api/analyze/decision/route.ts'];
  for(const p of paths)assert.doesNotMatch(readFileSync(p,'utf8'),/prepareDemoFixture|complete-clear-winner|complete-close-call|verify-demo-browser|fixtureResponses/);
});
