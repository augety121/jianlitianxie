import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs/promises';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function factory(){const ctx=vm.createContext({setTimeout,clearTimeout});vm.runInContext(await fs.readFile('extension/poll-loop.js','utf8'),ctx);return ctx.__resumePollLoop;}
test('poll loop wakes on revision, starts only once and handles each command once',async()=>{
 const create=await factory();let polls=0,handled=0,wake,active=0,max=0;
 const loop=create({poll:async()=>({revision:++polls,commands:polls===2?[{type:'fill'}]:[]}),
  wait:()=>new Promise(r=>{active++;max=Math.max(max,active);wake=()=>{active--;r();};}),
  stopWait:()=>wake?.(),handle:async response=>handled+=response.commands.length,onError:e=>{throw e;}});
 loop.start();loop.start();await delay(10);assert.equal(polls,1);wake();await delay(10);
 assert.equal(polls,2);assert.equal(handled,1);loop.stop();await delay(10);assert.equal(active,0);assert.equal(max,1);
});
test('a delayed poll response after stop never launches a fill command',async()=>{
 const create=await factory();let finish,handled=0;
 const loop=create({poll:()=>new Promise(r=>finish=r),wait:async()=>{},handle:async()=>handled++,onError:()=>{}});
 loop.start();loop.stop();finish({revision:1,commands:[{type:'fill'}]});await delay(5);assert.equal(handled,0);
});
test('stop/start across a pending wait keeps only one notification consumer',async()=>{
 const create=await factory();let release,active=0,max=0,polls=0;
 const loop=create({poll:async()=>({revision:++polls,commands:[]}),wait:()=>new Promise(r=>{active++;max=Math.max(active,max);release=()=>{active--;r();};}),stopWait:()=>release?.(),handle:async()=>{},onError:()=>{}});
 loop.start();await delay(5);loop.stop();loop.start();await delay(5);assert.equal(max,1);assert.equal(polls,2);loop.stop();await delay(5);assert.equal(active,0);
});
test('errors back off instead of hot polling and stopping clears retry delay',async()=>{
 const create=await factory();let calls=0,delayMs=0;
 const loop=create({poll:async()=>{calls++;throw Error('synthetic disconnect');},wait:async()=>{},handle:async()=>{},onError:(e,ms)=>delayMs=ms});
 loop.start();await delay(30);assert.equal(calls,1);assert.equal(delayMs,1000);
 loop.stop();loop.start();await delay(20);assert.equal(calls,2);loop.stop();await delay(5);
});
