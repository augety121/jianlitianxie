// Test-only: expose the widget shadow to the browser accessibility harness.
const originalAttach=Element.prototype.attachShadow;Element.prototype.attachShadow=function(options){return originalAttach.call(this,{...options,mode:"open"});};
const fixturePlan={id:'fixture',url:location.href,entries:[{fieldId:'f1',label:'姓名',section:'基本信息',status:'ready',value:'测试同学'},{fieldId:'f2',label:'出生日期',section:'基本信息',status:'missing',reason:'日期未确认'},{fieldId:'f3',label:'学校',section:'教育经历',status:'preserve',reason:'保留已有值'}]};
const commands=[];const commandButton=document.createElement('button');commandButton.textContent='模拟已授权的Codex批量填写';commandButton.onclick=()=>commands.push({type:'fill',planId:'fixture',fieldIds:['f1']});document.body.append(commandButton);
window.chrome={runtime:{sendMessage:async m=>({data:m.type==='resume-scan'?fixturePlan:m.type==='resume-poll'?{commands:commands.splice(0)}:m.type==='resume-fill'?{results:m.fieldIds.map(fieldId=>({fieldId,status:'verified'}))}:{ok:true}})}};

