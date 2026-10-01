/* Local record expansion. Counts only enter this controller, never resume values.
 * Only explicit semantic sections and independent record containers are supported.
 * Ambiguous site structure is reported, never guessed from a company logo.
 */
(() => {
  const VERSION='0.11.0';
  if(globalThis.__resumeRepeatController?.version===VERSION)return;
  globalThis.__resumeRepeatController?.cancel();
  let busy=false,epoch=0;
  const selector='fieldset,[data-resume-record],.resume-record';
  const controls='input:not([type=hidden]):not([type=file]):not([type=button]):not([type=submit]),textarea,select,[role=combobox]';
  const domains={education:/^(教育背景|教育经历)$/,work:/^(实习经历|工作经历)$/,project:/^(项目经历|项目经验|科研与项目经历)$/};
  const text=e=>(e?.textContent||'').replace(/[\s*：:]+/g,'').trim();
  const visible=e=>e?.isConnected&&!!e.getClientRects().length&&!e.closest('[hidden],[inert],[aria-hidden=true]')&&
    getComputedStyle(e).visibility==='visible'&&getComputedStyle(e).opacity!=='0';
  const rows=section=>[...section.querySelectorAll(selector)].filter(r=>visible(r)&&r.querySelector(controls)&&
    ![...section.querySelectorAll(selector)].some(p=>p!==r&&p.contains(r)));
  const inputs=section=>[...section.querySelectorAll(controls)].filter(visible);
  function targetsValid(targets){
    if(!targets||typeof targets!=='object'||Object.keys(targets).some(k=>!Object.hasOwn(domains,k))||
      Object.values(targets).some(n=>!Number.isSafeInteger(n)||n<0||n>20))throw Error('经历新增数量无效');
  }
  function collect(targets){
    targetsValid(targets);const found=[],issues=[];
    for(const section of document.querySelectorAll('section,[role=group],[data-resume-section],.resume-section')){
      if(!visible(section)||section.closest('#resume-local-assistant'))continue;
      const heading=section.querySelector('h1,h2,h3,h4,legend,[role=heading],.section-title');
      const domain=Object.keys(domains).find(k=>domains[k].test(text(heading)));
      if(!domain||!targets[domain])continue;
      if([...section.querySelectorAll('section,[role=group],[data-resume-section],.resume-section')].some(s=>domains[domain].test(text(s.querySelector('h1,h2,h3,h4,legend,[role=heading],.section-title')))))continue;
      const buttons=[...section.querySelectorAll('button[type=button],[role=button]')].filter(b=>visible(b)&&!b.disabled&&b.getAttribute('aria-disabled')!=='true'&&
        /^(?:\+|＋)?(?:添加|新增)(?:教育背景|教育经历|工作经历|实习经历|项目经历|项目经验)?$/.test(text(b))&&
        (!b.matches('a[href]')||b.getAttribute('href')==='#'));
      if(buttons.length!==1){issues.push({domain,code:'add-control-ambiguous'});continue;}
      const current=rows(section).length;
      if(!current&&inputs(section).length){issues.push({domain,code:'record-container-unrecognized'});continue;}
      if(current>=targets[domain])continue;
      found.push({domain,section,heading,headingText:text(heading),button:buttons[0],current,target:targets[domain]});
    }
    const candidates=found.filter(c=>found.filter(x=>x.domain===c.domain).length===1);
    for(const c of found)if(found.filter(x=>x.domain===c.domain).length>1)issues.push({domain:c.domain,code:'section-ambiguous'});
    return {candidates,issues};
  }
  function hit(button){
    if(!visible(button)||button.disabled||button.getAttribute('aria-disabled')==='true')throw Error('新增按钮不可操作');
    button.scrollIntoView({block:'center',behavior:'instant'});
    const r=button.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2,at=document.elementFromPoint(x,y);
    if(!at||!(button===at||button.contains(at)))throw Error('新增按钮被遮挡；未点击');
  }
  function waitGrowth(ref,before,alive){
    return new Promise((resolve,reject)=>{
      let timer,probe,observer,done=false;
      const finish=e=>{if(done)return;done=true;clearTimeout(timer);clearInterval(probe);observer?.disconnect();e?reject(e):resolve();};
      const check=()=>{
        if(!alive())return finish(Error('已停止新增；保留已新增的空记录'));
        if(!ref.section.isConnected)return finish(Error('经历区域已被替换'));
        const count=rows(ref.section).length;
        if(count===before+1)return finish();
        if(count>before+1)return finish(Error('一次出现多条记录，停止新增'));
      };
      observer=new MutationObserver(check);observer.observe(ref.section,{childList:true,subtree:true,attributes:true});
      timer=setTimeout(()=>finish(Error('未确认新增结果，不重复点击')),2500);probe=setInterval(check,80);check();
    });
  }
  async function expand(request){
    if(busy)throw Error('正在新增经历');
    if(request?.reviewed!==true||request.url!==location.href||!Number.isFinite(request.expiresAt)||Date.now()>=request.expiresAt||request.expiresAt-Date.now()>300000)throw Error('新增授权无效或已到期');
    targetsValid(request.targets);if(!globalThis.__resumeRepeatPlan)throw Error('新增计划校验器缺失');
    busy=true;const generation=++epoch;let added=0,attempted=0;const issues=[];
    const alive=()=>generation===epoch&&request.url===location.href&&Date.now()<request.expiresAt;
    try{
      // One bounded task can process several upstream-validated batches, <=20 additions.
      for(let batch=0;batch<4&&added<20;batch++){
        if(!alive())throw Error('新增已取消或页面已变化');
        const observed=collect(request.targets);issues.push(...observed.issues);
        let budget=5;
        const refs=observed.candidates.slice(0,4).map((ref,i)=>{
          const count=Math.min(ref.target-ref.current,budget);budget-=count;
          return {...ref,id:'add-'+batch+'-'+i,target:ref.current+count};
        }).filter(x=>x.target>x.current);
        if(!refs.length)break;
        const actions=globalThis.__resumeRepeatPlan.validatePlan(refs.map(r=>({id:r.id,count:r.target-r.current})),refs);
        for(const action of actions){
          const ref=refs.find(r=>r.id===action.id);
          for(let step=0;step<action.count;step++){
            if(!alive()||!ref.section.contains(ref.button)||text(ref.heading)!==ref.headingText)throw Error('新增目标已经变化');
            const beforeRows=rows(ref.section),before=beforeRows.length;
            if(before!==ref.current+step)throw Error('页面记录数已变化');
            const old=inputs(ref.section).map(el=>({el,value:el.value,checked:el.checked,text:el.matches('[role=combobox]')?el.textContent:null}));
            hit(ref.button);if(!alive())throw Error('新增已取消');
            attempted++;ref.button.click();
            try{await waitGrowth(ref,before,alive);}catch(error){added+=Math.max(0,rows(ref.section).length-before);throw error;}
            added++;
            if(rows(ref.section).filter(r=>!beforeRows.includes(r)).length!==1||old.some(x=>!x.el.isConnected||x.el.value!==x.value||x.el.checked!==x.checked||x.text!==null&&x.el.textContent!==x.text))throw Error('新增改变了已有记录，停止并核对');
          }
        }
      }
      return {added,attempted,issues,complete:alive()};
    }catch(error){return {added,attempted,issues:[...issues,{code:alive()?'add-result-uncertain':'cancelled'}],complete:false};}
    finally{busy=false;}
  }
  globalThis.__resumeRepeatController={version:VERSION,expand,cancel:()=>{epoch++;return {stopping:busy};},inspect:targets=>{
    const r=collect(targets);return {candidates:r.candidates.map(({domain,current,target})=>({domain,current,target})),issues:r.issues};
  }};
})();
