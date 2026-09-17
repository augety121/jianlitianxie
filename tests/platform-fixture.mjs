import {makePlan} from '../bridge/planner.mjs?v=0.3.0';
const $=s=>document.querySelector(s);
$('#party').onclick=()=>$('#party-options').hidden=false;
for(const el of document.querySelectorAll('#party-options [role=option]'))el.onclick=()=>{$('.ant-select-selection-item').textContent=el.textContent;$('#party-options').hidden=true;};
$('#run').onclick=async()=>{try{
 const fact=(id,label,value,section='',entity='')=>({id,label,value,section,entity,confirmed:true});
 const facts=[fact('email','默认邮箱','example@example.test','基本信息'),fact('weight','体重公斤','70kg','基本信息'),fact('party','政治面貌','中共党员','基本信息'),fact('major-a','专业','专业甲','教育经历','甲大学'),fact('major-b','专业','专业乙','教育经历','乙大学'),fact('date','开始月份','2024.09','教育经历','乙大学'),fact('height','身高厘米','180cm','基本信息'),fact('birth','出生日期','2000/1/2','基本信息'),fact('contact','紧急联系人姓名','示例联系人','紧急联系人'),fact('phone','紧急联系人电话','example-contact','紧急联系人'),fact('rename','原始字段','不应写入')];
 const scan=await globalThis.__resumeFillEngine.scan();const plan=makePlan(scan,{facts});$('#changing').firstChild.textContent='另一个字段';
 const report=await globalThis.__resumeFillEngine.apply(plan);
 const checks={phoenixLabel:$('#email').value==='example@example.test',elementNumeric:$('#weight').value==='70',required:scan.fields.find(x=>x.label==='体重(kg)').required,customSelect:$('.ant-select-selection-item').textContent==='中共党员',orderedEntities:$('#major-a').value==='专业甲'&&$('#major-b').value==='专业乙',monthPicker:$('#start-b').value==='2024-09',tableCells:$('#height').value==='180'&&$('#birth').value==='2000-01-02',contactScope:$('#contact').value==='示例联系人'&&$('#contact-phone').value==='example-contact',multiSelectManual:!$('#cities').selectedOptions.length,hiddenAttachment:scan.coverage.attachments===1,collapsedReported:scan.coverage.collapsed===1&&!scan.fields.some(f=>f.label==='学校'),relabeledFieldBlocked:$('#rename').value===''&&report.results.some(x=>x.status==='stale'),tableRowAnchors:$('#table-major-a').value==='专业甲'&&$('#table-major-b').value==='专业乙',allOthersVerified:report.results.filter(x=>x.status==='verified').length===12};
 $('#report').textContent=JSON.stringify({passed:Object.values(checks).every(Boolean),checks,report,fields:scan.fields,plan},null,2);
}catch(e){$('#report').textContent=e.stack;}};
