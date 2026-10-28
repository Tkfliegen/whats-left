import {readFileSync} from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {productionModules} from './helpers/provenance.mjs';

// Exact reported demo input, distinct from the frozen complete F01 benchmark.
const input = readFileSync('tests/fixtures/golden-labor-no-scoped-sales.txt', 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
const evidence = {
  business_type: null, period: 'monthly', currency: 'USD',
  revenue: {total: 100000, items: []},
  costs: {total: 95800, items: [{name: 'Tuesday evening staffing', amount: 2500,
    reported_category: null, source_text: 'The total Tuesday evening staffing cost is USD 2,500.'}]},
  facts: ['Tuesday evening staffing has 4 workers.', 'This means the labor cost is USD 625 per worker.',
    'Management has approved testing a reduction of 1 worker on Tuesday evening.'],
  assumptions: [], missing_information: ['Tuesday-evening scoped sales for the affected reporting period',
    'Explicit rest-of-schedule-unchanged constraint'], confidence: 'high',
};

// These are explicit mock model completions, not a simulation of model inference.
// The tests verify the real outgoing instructions and deterministic handoff;
// live model compliance needs a separately authorized provider evaluation.
function harness(edit = () => {}) {
  let calls = 0, captured, emitted;
  const modules = productionModules(async (_url, options) => {
    calls++;
    captured = JSON.parse(options.body);
    assert.equal(captured.response_format.json_schema.name, 'evidence');
    const sources = JSON.parse(captured.messages[2].content).authorization_sources;
    assert.equal(sources.length, 7);
    const ref = index => sources[index].id;
    emitted = {...structuredClone(evidence), authorization_atoms: [
      {kind: 'scoped_staffing_cost', scope: 'tuesday_evening_6pm_10pm', period: 'month',
        amount: 2500, currency: 'USD', source_refs: [ref(3)]},
      {kind: 'headcount_reduction_permission', scope: 'tuesday_evening_6pm_10pm', operation: 'delta',
        value: -1, unit: 'persons', permission: 'explicit', source_refs: [ref(5)]},
    ], business_total_support: [
      {field: 'revenue.total', value: 100000, scope: 'whole_business', period: 'monthly', currency: 'USD', source_refs: [ref(0)]},
      {field: 'costs.total', value: 95800, scope: 'whole_business', period: 'monthly', currency: 'USD', source_refs: [ref(1)]},
    ], calculation_support: []};
    edit(emitted, sources);
    return Response.json({choices: [{finish_reason: 'stop', message: {content: JSON.stringify(emitted)}}]});
  });
  const invoke = async (stage, body) => {
    const response = await modules(`src/app/api/analyze/${stage}/route.ts`).POST(new Request('http://localhost', {
      method: 'POST', body: JSON.stringify(body),
    }));
    return {status: response.status, body: await response.json()};
  };
  return {modules, invoke, state: () => ({calls, captured, emitted})};
}

test('exact no-sales input: real producer request explicitly forbids monthly-revenue substitution and placeholders', async () => {
  const h = harness();
  assert.equal((await h.invoke('evidence', {input})).status, 200);
  const {captured, calls} = h.state();
  assert.equal(calls, 1);
  assert.equal(captured.messages[1].content, input);
  assert.equal(captured.model, 'nvidia/Nemotron-3-Ultra-550b-a55b');
  const prompt = captured.messages[0].content;
  assert.match(prompt, /whole-business monthly revenue or sales must NOT be interpreted as Tuesday-evening scoped sales/);
  assert.match(prompt, /Emit scoped_sales ONLY when an original supplied source reports actual sales\/revenue/);
  assert.match(prompt, /Otherwise omit the scoped_sales atom entirely/);
  assert.match(prompt, /do not emit placeholder scoped_sales atoms with empty or duplicate source_refs/);
  assert.match(prompt, /Preserve independently supported atoms/);
  assert.match(prompt, /do not invent a sales fact or an unchanged-schedule constraint/);
});

test('omitted sales and schedule atoms succeed, preserve independent facts and business totals, and assemble no Labor grant', async () => {
  const h = harness(), result = await h.invoke('evidence', {input});
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.guidance, {missing_requirements: ['tuesday_evening_sales', 'unchanged_schedule']});
  const actual = result.body.evidence;
  assert.equal(actual.revenue.total, 100000);
  assert.equal(actual.costs.total, 95800);
  assert.deepEqual(actual.facts, evidence.facts);
  assert.deepEqual(actual.costs.items, evidence.costs.items);
  assert.deepEqual(actual.provenance.authorization_records, []);
  assert.equal(actual.provenance.source_input, input);
  const {emitted} = h.state();
  assert.deepEqual(emitted.authorization_atoms.map(a => a.kind), ['scoped_staffing_cost', 'headcount_reduction_permission']);
  const atoms = h.modules('src/app/api/analyze/evidence/authorization-atoms.ts');
  assert.equal(atoms.validateAuthorizationAtoms(emitted.authorization_atoms, actual.provenance.items, 'USD'), true);
  assert.deepEqual(plain(atoms.assembleAuthorizationRecords(emitted.authorization_atoms, actual.provenance.items, 'USD')), []);
  assert.equal(h.modules('src/app/api/analyze/evidence/provenance.ts').isEvidence(actual, true), true);
});

test('no complete Labor grant means no staffing scenario, no calculator savings, and a non-actionable Gate', async () => {
  const h = harness(), {body: {evidence: actual}} = await h.invoke('evidence', {input});
  const scenarioModule = h.modules('src/app/api/analyze/scenarios/scenarios.ts');
  const request = {evidence: actual, leaks: {leaks: [], insufficient_evidence: [{topic: 'Tuesday evening staffing',
    reason: 'Scoped sales and an unchanged-schedule constraint were not supplied.'}]},
    operational_context: input.split('\n\n')};
  assert.equal(scenarioModule.isScenarioRequest(request), true);
  const built = scenarioModule.buildScenarioInput(request);
  assert.deepEqual(plain(built.authorized_changes), []);
  const unauthorized = h.modules('src/app/api/analyze/scenarios/authorization.ts').validateScenarioSupport({
    scenarios: [{target_leak: 'Tuesday evening staffing', controlled_changes: [{variable: 'Tuesday evening headcount',
      change_type: 'delta', from: null, value: -1, unit: 'persons'}], available_input_refs: []}], not_simulation_ready: [],
  }, built.authorized_changes);
  assert.deepEqual(plain(unauthorized), {ok: false, reason: 'no_authorized_change'});
  const scenarios = {scenarios: [], not_simulation_ready: []};
  assert.equal(scenarioModule.validateScenarioResult(scenarios, built.input_facts, built.confirmed_leaks), true);
  const simulation = await h.invoke('simulate', {evidence: actual, scenarios, input_facts: built.input_facts});
  assert.equal(simulation.status, 200);
  assert.deepEqual(simulation.body.results, []);
  const gate = await h.invoke('decision-gate', {evidence: actual, scenarios, simulation: simulation.body});
  assert.equal(gate.status, 200);
  assert.equal(gate.body.decision_gate, 'no_actionable_scenario');
  assert.deepEqual(gate.body.candidates, []);
  assert.equal(h.state().calls, 1, 'No downstream provider or fallback call');
});

for (const mode of ['empty', 'duplicate']) test(`malformed emitted scoped_sales with ${mode} refs still fails closed instead of being dropped`, async () => {
  const h = harness((output, sources) => {
    output.authorization_atoms.unshift({kind: 'scoped_sales', scope: 'tuesday_evening_6pm_10pm', period: 'month',
      amount: 100000, currency: 'USD', source_refs: mode === 'empty' ? [] : [sources[0].id, sources[0].id]});
  });
  const result = await h.invoke('evidence', {input});
  assert.equal(result.status, 502);
  assert.deepEqual(result.body, {error: 'Evidence authorization atoms have invalid source support.'});
  const {emitted, captured, calls} = h.state();
  const checker = h.modules('src/app/api/analyze/evidence/evidence.ts');
  assert.equal(checker.matchesSchema(emitted, captured.response_format.json_schema.schema), true);
  const rejections = [], before = JSON.stringify(emitted.authorization_atoms);
  const accepted = h.modules('src/app/api/analyze/evidence/authorization-atoms.ts').validateAuthorizationAtoms(
    emitted.authorization_atoms, JSON.parse(captured.messages[2].content).authorization_sources.map((s, i) => ({...s, source: `source_input[${i}]`})),
    'USD', diagnostic => rejections.push(plain(diagnostic)));
  assert.equal(accepted, false);
  assert.deepEqual(rejections, [{reason: 'invalid_source_refs', atom_index: 0, failing_field: 'source_refs'}]);
  assert.equal(JSON.stringify(emitted.authorization_atoms), before);
  assert.equal(calls, 1);
});
