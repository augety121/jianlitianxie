import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {engineBundle,checkEngine} from '../scripts/build-engine.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
test('installed engine is reproducibly built from the reviewed module sources',async()=>{
 await checkEngine(root);
 const expected=await engineBundle(root);
 assert.match(expected,/source-sha256: [a-f0-9]{64}/);
 assert(!expected.includes('/* @component-catalog */'));
 assert(!expected.includes('/* @select-driver */'));
});
test('release build check rejects a stale or independently edited bundle',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'resume-build-check-'));
 try{
  await fs.mkdir(path.join(dir,'src/autofill'),{recursive:true});await fs.mkdir(path.join(dir,'extension'));
  for(const name of ['engine-entry.js','component-catalog.mjs','select-driver.mjs'])await fs.copyFile(path.join(root,'src/autofill',name),path.join(dir,'src/autofill',name));
  await fs.writeFile(path.join(dir,'extension/engine.js'),(await engineBundle(dir))+'\n// stale edit\n');
  await assert.rejects(checkEngine(dir),/differs from reviewed sources/);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
