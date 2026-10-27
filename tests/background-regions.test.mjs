import test from 'node:test';
import assert from 'node:assert/strict';
import {productionModules} from './helpers/provenance.mjs';
const {backgroundRegions}=productionModules()('src/lib/background-regions.ts');
for(const width of [390,768,1440,1920])for(const height of [1400,2400,6000,30000])test(`background covers ${width}×${height} with overlapping B and final C`,()=>{
 const g=backgroundRegions(width,height,650,500),image=width*941/1672;
 assert.ok(g.count>=1);assert.ok(g.opening+g.feather<image);
 for(let i=1;i<g.count;i++)assert.ok(g.opening+i*g.step+g.feather<g.opening+(i-1)*g.step+g.middleHeight);
 assert.ok(g.opening+(g.count-1)*g.step+g.middleHeight>=g.closing+g.feather);
 assert.ok(g.closing<height);assert.ok(g.closing+image>=height);
});
test('B count grows and shrinks with real height instead of a fixed total',()=>{
 const counts=[1400,2400,6000,30000].map(h=>backgroundRegions(1440,h,650,500).count);
 assert.ok(counts[0]<counts[2]);assert.ok(counts[2]<counts[3]);
});
