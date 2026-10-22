import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const exports = {};
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/lib/evidence-waterfall.ts', import.meta.url),'utf8'), {
  compilerOptions: {module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
}).outputText,{exports});
const {evidenceWaterfall,costLabel}=exports;
const fixture=()=>({business_type:'bagel shop',period:'last month',currency:'$',
 revenue:{total:100000,items:[]},costs:{total:95800,items:[
  {name:'labor',amount:34000},{name:'ingredients',amount:18000},
  {name:'rent_and_utilities',amount:12500},{name:'delivery_platform_fees',amount:9300},
  {name:'packaging',amount:null},{name:'waste',amount:null},{name:'software',amount:null},{name:'other',amount:null},
 ]},facts:[],assumptions:[],missing_information:['Exact breakdown'],confidence:'high'});
const plain=value=>JSON.parse(JSON.stringify(value));

test('real bagel data replaces all sample costs and does not balance unitemized expenses',()=>{
 const chart=evidenceWaterfall(fixture());
 assert.deepEqual(plain(chart.bars.map(b=>[b.label,b.value])),[
  ['Revenue',100000],['Labor',34000],['Ingredients',18000],['Rent & utilities',12500],['Delivery fees',9300],
 ]);
 assert.equal(chart.unitemized,true);
 assert.equal(chart.bars.some(b=>b.value===22000||b.value===4200),false);
 assert.equal(chart.bars.some(b=>['Other','Waste','Maintenance','Utilities','Left'].includes(b.label)),false);
 assert.equal(chart.bars[4].bottom,26200); // Known deductions stop here, with no invented balancing bar.
});
test('incomplete itemization is noted even without explicit null-cost items',()=>{
 const e=fixture();e.costs.items=e.costs.items.filter(i=>i.amount!==null);
 assert.equal(evidenceWaterfall(e).unitemized,true);
 e.costs.total=73800;assert.equal(evidenceWaterfall(e).unitemized,false);
});
test('missing revenue and empty Evidence do not fall back to sample values',()=>{
 const e=fixture();e.revenue.total=null;
 const chart=evidenceWaterfall(e);assert.equal(chart.bars[0].value,null);
 assert.ok(chart.bars.every(b=>b.bottom===0));
 e.costs.total=null;e.costs.items=[];
 assert.deepEqual(plain(evidenceWaterfall(e).bars),[{label:'Revenue',value:null,bottom:0,total:true}]);
});
test('initial no-Evidence fallback preserves the original sample chart',()=>{
 const chart=evidenceWaterfall(null);
 assert.deepEqual(plain(chart.bars.map(b=>[b.label,b.value])),[
  ['Revenue',100000],['Payroll',31200],['Rent',18000],['Ingredients',21400],['Delivery fees',8900],
  ['Waste',5100],['Utilities',4600],['Maintenance',3800],['Other',2800],['Left',4200],
 ]);
 assert.equal(chart.range,100000);assert.equal(chart.min,0);
});
test('labels normalize aliases and preserve the meaning of future names',()=>{
 assert.equal(costLabel('Rent and utilities'),'Rent & utilities');
 assert.equal(costLabel('Delivery platform fees'),'Delivery fees');
 assert.equal(costLabel('merchant_processing_fees'),'Merchant Processing Fees');
 assert.equal(costLabel('POS_subscription'),'POS Subscription');
 assert.equal(costLabel('constructor'),'Constructor');
});
test('zero, large and negative reported amounts stay finite and in the chart domain',()=>{
 const e=fixture();e.revenue.total=5000;e.costs.items=[{name:'rent',amount:8000},{name:'refund',amount:-500},{name:'zero',amount:0}];
 const chart=evidenceWaterfall(e);
 for(const bar of chart.bars){
  assert.ok(Number.isFinite(bar.bottom));
  assert.ok(bar.bottom>=chart.min);
  assert.ok(bar.bottom+Math.abs(bar.value??0)<=chart.min+chart.range);
 }
 e.revenue.total=0;e.costs.items=[];assert.ok(evidenceWaterfall(e).range>0);
});
