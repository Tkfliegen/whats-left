import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {imageModules} from './helpers/leak-category-icons.mjs';
const load=imageModules(),{SectionIcon}=load('src/components/section-icon.tsx');
for(const section of ['scenario','decision'])test(`${section} section uses its exact decorative asset and restrained contain-fit sizing`,()=>{
 const html=renderToStaticMarkup(React.createElement(SectionIcon,{section}));
 assert.ok(html.includes(`what is left-section-${section}.png`));assert.match(html,/alt=""/);assert.match(html,/aria-hidden="true"/);
 assert.match(html,/h-10 w-10.*object-contain.*sm:h-12 sm:w-12/);
 assert.doesNotMatch(html,/object-cover|shadow|border|rounded|bg-/);
});
