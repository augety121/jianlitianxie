import fs from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
let n=0;async function walk(dir){for(const e of await fs.readdir(dir,{withFileTypes:true})){if(['.git','legacy','node_modules','dist','test-results'].includes(e.name))continue;const p=path.join(dir,e.name);if(e.isDirectory()){await walk(p);continue;}if(/\.(pdf|docx|zip)$/i.test(p))throw Error('Personal/binary document in source: '+p);const t=await fs.readFile(p,'utf8');if(/\b1[3-9]\d{9}\b|[0-9]+@nwnu\.edu\.cn/.test(t))throw Error('Private data in '+p);n++;}}
await walk(root);console.log('Source privacy check passed:',n,'files');
