/** Real local workflow/store/receipt code behind a test-only Chrome mock. */
import readline from 'node:readline';
import {localHarness} from './local-harness.mjs';
const h=localHarness();await h.attach();
for await(const line of readline.createInterface({input:process.stdin})){
 try{const m=JSON.parse(line);let data;
  if(m.type==='inspect')data={storage:h.local.data,calls:h.calls,values:h.values};
  else if(m.type==='restart'){h.restart();data={ok:true};}
  else if(m.type==='reset-page'){for(const k in h.values)delete h.values[k];data={ok:true};}
  else if(m.type==='scenario'){h.setScenario(m.scenario);data={ok:true};}
  else data=await h.api(m.type.replace(/^local-/,''),m);
  console.log(JSON.stringify({data}));
 }catch(e){console.log(JSON.stringify({error:e.message}));}
}
