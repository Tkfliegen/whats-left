import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
export function harness(fetcher, { nodeEnv = "test" } = {}) {
  let cursor=0, nextTimer=0, value;
  const slots=[], timers=new Map(), pending=[], warnings=[];
  const react={
    useState(initial) {const i=cursor++;if(!(i in slots))slots[i]=initial;return [slots[i],update=>{slots[i]=typeof update==='function'?update(slots[i]):update;}];},
    useRef(initial) {const i=cursor++;if(!(i in slots))slots[i]={current:initial};return slots[i];},
    useEffect(effect,deps) {const i=cursor++,previous=slots[i];if(!previous||deps.some((v,n)=>v!==previous.deps[n])){slots[i]={deps,cleanup:previous?.cleanup};pending.push(()=>{slots[i].cleanup?.();slots[i].cleanup=effect();});}},
  };
  const compile=filename=>ts.transpileModule(readFileSync(new URL('../'+filename,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const display={exports:{}};vm.runInNewContext(compile('../src/lib/leak-display.ts'),display);
  const scenarioDisplay={exports:{}};vm.runInNewContext(compile('../src/lib/scenario-display.ts'),scenarioDisplay);
  const decisionDisplay={exports:{}};vm.runInNewContext(compile('../src/lib/decision-display.ts'),decisionDisplay);
  const sandbox={exports:{},require:specifier=>specifier==='react'?react:specifier==='@/lib/scenario-display'?scenarioDisplay.exports:specifier==='@/lib/decision-display'?decisionDisplay.exports:display.exports,fetch:fetcher,AbortController,AbortSignal,
    process:{env:{NODE_ENV:nodeEnv}},console:{warn:(...args)=>warnings.push(args)},
    window:{setTimeout(fn,delay){const id=++nextTimer;timers.set(id,{fn,delay});return id;},clearTimeout(id){timers.delete(id);}}};
  vm.runInNewContext(compile('../src/components/use-demo-analysis.ts'),sandbox);
  const render=()=>{cursor=0;value=sandbox.exports.useDemoAnalysis();while(pending.length)pending.shift()();return value;};
  return {render,get value(){return value;},timers,warnings,
    async settle(){await new Promise(setImmediate);return render();},
    tick(){assert.equal(timers.size,1);const [id,timer]=[...timers][0];timers.delete(id);timer.fn();render();return timer.delay;},
    unmount(){for(const slot of slots)slot?.cleanup?.();},
  };
}
