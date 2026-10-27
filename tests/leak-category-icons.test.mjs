import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {loadLeakIcons} from './helpers/leak-category-icons.mjs';
import {productionModules} from './helpers/provenance.mjs';
const {mapping,component}=loadLeakIcons();
const expected={labor:'what is left icon-01.png',ingredients:'what is left icon-02.png',delivery:'what is left-03.png',waste:'what is left-04.png',operations:'what is left-05.png',pricing:'what is left-06.png',other:'what is left-07.png'};
for(const [category,file] of Object.entries(expected))test(`${category} renders its finalized decorative icon`,()=>{
 const asset=mapping.leakCategoryIcon(category);assert.equal(asset.src,'../../pic/'+file);
 assert.ok(asset.width>0&&asset.height>0);
 const html=renderToStaticMarkup(React.createElement(component.LeakCategoryIcon,{category}));
 assert.ok(html.includes(file));assert.match(html,/alt=""/);assert.match(html,/aria-hidden="true"/);
 assert.match(html,/object-contain/);assert.match(html,/h-9 w-9.*sm:h-10 sm:w-10/);
 assert.doesNotMatch(html,/object-cover|shadow|rounded|border|bg-/);
});
test('frontend mapping covers the production category enum exactly',()=>{
 const schema=productionModules()('src/app/api/analyze/leaks/leaks.ts').leakSchema;
 assert.deepEqual(Object.keys(mapping.leakCategoryIcons).sort(),Array.from(schema.properties.leaks.items.properties.category.enum).sort());
});
test('unknown display values use other, including inherited object property names',()=>{
 for(const category of ['unknown','constructor','__proto__','toString','',null,undefined,{},4])assert.equal(mapping.leakCategoryIcon(category),mapping.leakCategoryIcons.other);
});
