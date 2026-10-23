import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {productionModules} from './helpers/provenance.mjs';
const {createTolokaService,normalizeReviewPayload}=productionModules()('src/lib/review/toloka.ts');
const fixture=JSON.parse(fs.readFileSync('tests/fixtures/decision.json')).cornhead;
const input=()=>({analysisId:' analysis-001 ',businessType:' bakery ',sourceSummary:' Note ',evidence:structuredClone(fixture.evidence),acceptedLeaks:structuredClone(fixture.leaks),scenarioStatus:'not_calculable_yet',decisionStatus:'needs_more_data',reviewReason:'evaluation',raw_provider:'PRIVATE_UPSTREAM',headers:{Authorization:'PRIVATE_KEY'}});
for(const env of [{},{TOLOKA_ENABLED:'false',TOLOKA_API_KEY:'key'},{TOLOKA_ENABLED:'true'}])test(`Toloka disabled/missing key performs no network ${JSON.stringify(env)}`,async()=>{
 let calls=0;const service=createTolokaService(env,async()=>{calls++;throw Error('unexpected');});
 assert.equal((await service.getStatus()).status,env.TOLOKA_ENABLED==='true'?'not_configured':'disabled');assert.equal(service.prepareReview(input()).submitted,false);assert.equal(calls,0);
});
test('explicit connectivity check is read-only and returns no account identifiers or secrets',async()=>{
 const calls=[],service=createTolokaService({TOLOKA_ENABLED:'true',TOLOKA_API_KEY:'PRIVATE_KEY'},async(url,options)=>{calls.push({url,options});return Response.json({id:'PRIVATE_USER',email:'PRIVATE_EMAIL',teams:[{id:'PRIVATE_TEAM'}]});});
 assert.deepEqual(JSON.parse(JSON.stringify(await service.getStatus())),{status:'available',teamCount:1});assert.equal(calls.length,1);assert.equal(calls[0].url,'https://platform.toloka.ai/api/v2-beta/me');assert.equal(calls[0].options.method,'GET');assert.equal(calls[0].options.headers.Authorization,'ApiKey PRIVATE_KEY');assert.equal(calls[0].options.redirect,'error');
});
for(const failure of ['HTTP','network','malformed','invalid'])test(`Toloka ${failure} fails safely without retry`,async()=>{
 let calls=0;const service=createTolokaService({TOLOKA_ENABLED:'true',TOLOKA_API_KEY:'key'},async()=>{calls++;if(failure==='network')throw Error('PRIVATE_RESPONSE');return failure==='HTTP'?Response.json({secret:'PRIVATE_RESPONSE'},{status:429}):failure==='malformed'?new Response('{'):Response.json({});});
 const status=await service.getStatus();assert.equal(calls,1);assert.notEqual(status.status,'available');assert.doesNotMatch(JSON.stringify(status),/PRIVATE/);
});
test('payload normalization projects accepted structured data and detaches every retained array',()=>{
 const original=input();original.evidence.provenance.source_input='PRIVATE_RAW_SOURCE';original.evidence.extra='PRIVATE_EXTRA';
 const payload=normalizeReviewPayload(original,new Date('2026-10-23T00:00:00Z'));
 assert.equal(payload.analysisId,'analysis-001');assert.equal(payload.businessType,'bakery');assert.equal(payload.sourceSummary,'Note');assert.equal(payload.createdAt,'2026-10-23T00:00:00.000Z');
 assert.equal(payload.evidence.revenue.total,original.evidence.revenue.total);assert.equal(payload.acceptedLeaks.leaks.length,original.acceptedLeaks.leaks.length);
 assert.doesNotMatch(JSON.stringify(payload),/PRIVATE|raw_provider|Authorization|source_input|provenance/);
 payload.evidence.facts.push('changed');payload.acceptedLeaks.leaks[0].evidence.push('changed');assert.ok(!original.evidence.facts.includes('changed'));assert.ok(!original.acceptedLeaks.leaks[0].evidence.includes('changed'));
});
test('preparing a review is local only, does not mutate production outputs and exposes no submission API',()=>{
 let calls=0;const service=createTolokaService({TOLOKA_ENABLED:'true',TOLOKA_API_KEY:'key',TOLOKA_PROJECT_ID:'project',TOLOKA_DATASET_ID:'dataset'},async()=>{calls++;throw Error('unexpected');});
 const original=input(),before=JSON.stringify(original),prepared=service.prepareReview(original);
 assert.equal(prepared.status,'prepared');assert.equal(prepared.submitted,false);assert.equal(calls,0);assert.equal(JSON.stringify(original),before);assert.equal('submit' in service,false);
});
test('invalid metadata is rejected locally; normal analysis never imports the review service',()=>{
 assert.throws(()=>normalizeReviewPayload({...input(),analysisId:''}));assert.throws(()=>normalizeReviewPayload({...input(),reviewReason:'arbitrary'}));
 for(const file of ['src/components/use-demo-analysis.ts',...fs.readdirSync('src/app/api/analyze').map(stage=>`src/app/api/analyze/${stage}/route.ts`)])assert.doesNotMatch(fs.readFileSync(file,'utf8'),/toloka|prepareReview|prepareTolokaReview/i);
});
