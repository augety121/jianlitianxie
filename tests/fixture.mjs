import {makePlan} from '../bridge/planner.mjs';
let submits=0,inputs=0;document.querySelector('form').onsubmit=e=>{e.preventDefault();submits++;};document.addEventListener('input',()=>inputs++);
document.querySelector('#run').onclick=async()=>{try{
 const profile={facts:[['姓名','测试同学'],['学历','硕士研究生'],['自我评价','隔离测试文字'],['出生日期','2001-07'],['验证码','不应填写']].map(([label,value],i)=>({id:'t'+i,label,value,confirmed:true}))};
 const s=globalThis.__resumeFillEngine.scan();const p=makePlan(s,profile);const r=await globalThis.__resumeFillEngine.apply(p);
 const checks={nativeText:document.querySelector('#name').value==='测试同学',preserve:document.querySelector('#mail').value==='keep@example.test',select:document.querySelector('#degree').value==='master',textarea:document.querySelector('#intro').value==='隔离测试文字',datePrecision:document.querySelector('#birth').value==='',captcha:document.querySelector('#captcha').value==='',consent:!document.querySelector('#consent').checked,noSubmit:submits===0,events:inputs===3,verified:r.results.filter(x=>x.status==='verified').length===3};
 document.querySelector('#name').value='';const s2=globalThis.__resumeFillEngine.scan();const p2=makePlan(s2,profile);document.querySelector('#name').value='本人修改';const r2=await globalThis.__resumeFillEngine.apply(p2);checks.staleProtection=r2.results.some(x=>x.status==='stale')&&document.querySelector('#name').value==='本人修改';
 document.querySelector('#report').textContent=JSON.stringify({passed:Object.values(checks).every(Boolean),checks,plan:p,report:r},null,2);
 }catch(e){document.querySelector('#report').textContent='ERROR '+e.stack;}};
