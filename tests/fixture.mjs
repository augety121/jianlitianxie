import {makePlan} from '../bridge/planner.mjs?v=0.3.0';
let submits=0,inputs=0;document.querySelector('form').onsubmit=e=>{e.preventDefault();submits++;};document.addEventListener('input',()=>inputs++);
document.querySelector('#run').onclick=async()=>{try{
 const profile={facts:[['性别','男'],['入学月份','2024-09'],['姓名','测试同学'],['学历','硕士研究生'],['自我评价','隔离测试文字'],['出生日期','2001-07'],['验证码','不应填写']].map(([label,value],i)=>({id:'t'+i,label,value,confirmed:true}))};
 const s=await globalThis.__resumeFillEngine.scan();const p=makePlan(s,profile);const r=await globalThis.__resumeFillEngine.apply(p);
 const checks={nativeText:document.querySelector('#name').value==='测试同学',preserve:document.querySelector('#mail').value==='keep@example.test',select:document.querySelector('#degree').value==='master',textarea:document.querySelector('#intro').value==='隔离测试文字',datePrecision:document.querySelector('#birth').value==='',captcha:document.querySelector('#captcha').value==='',consent:!document.querySelector('#consent').checked,noSubmit:submits===0,events:inputs>=5,verified:r.results.filter(x=>x.status==='verified').length===5};
 checks.radio=document.querySelector('input[value=m]').checked;checks.month=document.querySelector('#month').value==='2024-09';
 const file=s.fields.find(f=>f.type==='file');checks.hiddenFile=!!file&&file.accept==='image/png';
 try{await globalThis.__resumeFillEngine.upload({snapshotId:s.id,url:location.href,fieldId:file.id,file:{name:'bad.txt',type:'text/plain',base64:btoa('test')}});checks.rejectFileType=false;}catch{checks.rejectFileType=true;}
 const attached=await globalThis.__resumeFillEngine.upload({snapshotId:s.id,url:location.href,fieldId:file.id,file:{name:'fixture.png',type:'image/png',base64:'iVBORw0KGgo='}});checks.fileAttached=attached.status==='attached';
 document.querySelector('#name').value='';const s2=await globalThis.__resumeFillEngine.scan();const p2=makePlan(s2,profile);document.querySelector('#name').value='本人修改';const r2=await globalThis.__resumeFillEngine.apply(p2);checks.staleProtection=r2.results.some(x=>x.status==='stale')&&document.querySelector('#name').value==='本人修改';
 document.querySelector('#report').textContent=JSON.stringify({passed:Object.values(checks).every(Boolean),checks,plan:p,report:r},null,2);
 }catch(e){document.querySelector('#report').textContent='ERROR '+e.stack;}};
