import test from 'node:test';
import assert from 'node:assert/strict';

import { productionModules } from './helpers/provenance.mjs';
const {evidenceWaterfall,costLabel}=productionModules()('src/lib/evidence-waterfall.ts');
const fixture=()=>({business_type:'bagel shop',period:'last month',currency:'$',
 revenue:{total:100000,items:[]},costs:{total:95800,items:[
  {name:'labor',amount:34000},{name:'ingredients',amount:18000},
  {name:'rent_and_utilities',amount:12500},{name:'delivery_platform_fees',amount:9300},
  {name:'packaging',amount:null},{name:'waste',amount:null},{name:'software',amount:null},{name:'other',amount:null},
 ]},facts:[],assumptions:[],missing_information:['Exact breakdown'],confidence:'high'});
const plain=value=>JSON.parse(JSON.stringify(value));

test('real Evidence bridge uses whole-business totals, never component sums or invented costs',()=>{
 const chart=evidenceWaterfall(fixture());
 assert.deepEqual(plain(chart.bars.map(b=>[b.label,b.value])),[
  ['Revenue',100000],['Operating Costs',95800],['What’s Left',4200],
 ]);
 assert.equal(chart.bars[1].bottom,4200);
 assert.equal(chart.bars.some(b=>b.value===22000),false);
 const e=fixture();e.costs.items=[{name:'overlapping scope',amount:999999}];
 assert.deepEqual(plain(evidenceWaterfall(e)),plain(chart));
});
test('missing totals omit calculated result and do not fall back to sample values',()=>{
 const e=fixture();e.revenue.total=null;
 const chart=evidenceWaterfall(e);
 assert.deepEqual(plain(chart.bars.map(b=>[b.label,b.value])),[['Revenue',null],['Operating Costs',95800]]);
 assert.equal(chart.bars.every(b=>b.bottom===0),true);
 e.costs.total=null;e.costs.items=[];
 assert.deepEqual(plain(evidenceWaterfall(e).bars.map(b=>b.value)),[null,null]);
 e.revenue.total=100000;
 assert.equal(evidenceWaterfall(e).bars.some(b=>b.label==='What’s Left'),false);
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
