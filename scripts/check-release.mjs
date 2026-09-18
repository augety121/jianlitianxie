import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=fileURLToPath(new URL('..',import.meta.url)),files=[];
const ignored=new Set(['.git','legacy','node_modules','dist','test-results','__pycache__']);
const privateNames=/^(?:profile(?:\.previous)?\.json(?:\.tmp)?|bridge-token\.txt|evidence\.json|experience\.json(?:\.tmp)?|audit\.jsonl|\.env(?:\..*)?)$/i;
async function walk(dir){
 for(const e of await fs.readdir(dir,{withFileTypes:true})){
  if(ignored.has(e.name))continue;
  const p=path.join(dir,e.name);
  if(e.isSymbolicLink())throw Error('Symlinks are not release sources: '+p);
  if(e.isDirectory()){await walk(p);continue;}
  if(privateNames.test(e.name)||/\.(pdf|docx|zip|pyc)$/i.test(p))throw Error('Private/document artifact in source: '+p);
  files.push(p);
  if(/\.(png|jpg|jpeg|webp|woff2?)$/i.test(p))continue;
  const text=await fs.readFile(p,'utf8');
  if(/\b1[3-9]\d{9}\b|[0-9]+@nwnu\.edu\.cn/.test(text))throw Error('Known private-data pattern in '+p);
 }
}
await walk(root);
const scripts=files.filter(p=>/\.m?js$/.test(p));
for(const p of scripts){
 const checked=spawnSync(process.execPath,['--check',p],{encoding:'utf8'});
 if(checked.status!==0)throw Error('Syntax check failed: '+p+'\n'+checked.stderr);
 const source=await fs.readFile(p,'utf8');
 for(const match of source.matchAll(/^\s*(?:import|export)\s+(?:[^;\n]*?\bfrom\s*)?['"]([^'"]+)['"]/gm)){
  if(!match[1].startsWith('.'))continue;
  const target=path.resolve(path.dirname(p),match[1].split(/[?#]/)[0]);
  if(!target.startsWith(root))throw Error('Import escapes release root: '+p);
  await fs.access(target);
 }
}
const manifest=JSON.parse(await fs.readFile(path.join(root,'extension/manifest.json'),'utf8'));
const pkg=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8'));
if(manifest.version!==pkg.version||manifest.manifest_version!==3)throw Error('Release version mismatch');
if([...manifest.permissions].sort().join(',')!=='activeTab,scripting,storage')throw Error('Unexpected permission expansion');
if(manifest.host_permissions.join(',')!=='http://127.0.0.1:19327/*')throw Error('Unexpected mandatory host access');
if(/unsafe-eval|unsafe-inline/.test(manifest.content_security_policy.extension_pages))throw Error('Unsafe extension CSP');
for(const file of [manifest.background.service_worker,...Object.values(manifest.icons)])await fs.access(path.join(root,'extension',file));
for(const p of files.filter(p=>p.includes(path.sep+'extension'+path.sep)&&p.endsWith('.html'))){
 const html=await fs.readFile(p,'utf8');
 for(const match of html.matchAll(/(?:src|href)=["']([^"']+)["']/g)){
  if(/^(?:#|https?:|data:)/.test(match[1]))continue;
  await fs.access(path.resolve(path.dirname(p),match[1].split(/[?#]/)[0]));
 }
}
console.log(`Release checks passed: ${files.length} files, ${scripts.length} JavaScript syntax checks; version ${pkg.version}`);
console.log('Known-pattern privacy checks are not a complete privacy/security audit; legacy is excluded.');
