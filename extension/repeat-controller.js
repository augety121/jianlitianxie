/* Local record expansion. Counts only enter this controller, never resume values.
 * Only explicit semantic sections and independent record containers are supported.
 * Ambiguous site structure is reported, never guessed from a company logo.
 */
(() => {
  const VERSION='0.13.0';
  if(globalThis.__resumeRepeatController?.version===VERSION)return;
  globalThis.__resumeRepeatController?.cancel();
  let busy=false,epoch=0;
  const selector='fieldset,[data-resume-record],.resume-record';
  const controls='input:not([type=hidden]):not([type=file]):not([type=button]):not([type=submit]),textarea,select,[role=combobox]';
  const domains={education:/^(教育背景|教育经历)$/,work:/^(实习经历|工作经历)$/,project:/^(项目经历|项目经验|科研与项目经历)$/};
  const text=e=>(e?.textContent||'').replace(/[\s*：:]+/g,'').trim();
  const visible=e=>e?.isConnected&&!!e.getClientRects().length&&!e.closest('[hidden],[inert],[aria-hidden=true]')&&
    getComputedStyle(e).visibility==='visible'&&getComputedStyle(e).opacity!=='0';
  const inRegion=(e,ref)=>ref.section.contains(e)&&!!(ref.heading.compareDocumentPosition(e)&Node.DOCUMENT_POSITION_FOLLOWING)&&
    (!ref.end||!!(e.compareDocumentPosition(ref.end)&Node.DOCUMENT_POSITION_FOLLOWING));
  const rows=ref=>(globalThis.__resumeFillEngine?.repeatMarkers?globalThis.__resumeFillEngine.repeatMarkers(ref.section,ref.domain):
    [...ref.section.querySelectorAll(selector)].filter(r=>visible(r)&&r.querySelector(controls)&&!r.parentElement?.closest(selector))).filter(e=>inRegion(e,ref));
  const inputs=ref=>[...ref.section.querySelectorAll(controls)].filter(e=>visible(e)&&inRegion(e,ref));
  function targetsValid(targets){
    if(!targets||typeof targets!=='object'||Object.keys(targets).some(k=>!Object.hasOwn(domains,k))||
      Object.values(targets).some(n=>!Number.isSafeInteger(n)||n<0||n>20))throw Error('经历新增数量无效');
  }
  function collect(targets){
    targetsValid(targets);const found=[],issues=[],inventory=[];
    const excluded='nav,aside,a,button,[role=navigation],#resume-local-assistant';
    const sectionNames=/^(个人信息|基本信息|个人基本信息|求职意向|教育背景|教育经历|实习经历|工作经历|项目经历|项目经验|科研与项目经历|语言能力|获奖经历|奖励荣誉|自我描述|自我评价|家庭情况|家庭成员|上传|上传简历|申请信息|其他|更新说明)$/;
    const headingName=h=>{const full=text(h),own=[...h.childNodes].filter(n=>n.nodeType===Node.TEXT_NODE).map(n=>n.textContent).join('').replace(/[\s*：:]/g,'');return sectionNames.test(full)?full:sectionNames.test(own)?own:'';};
    const headings=[...document.querySelectorAll('h1,h2,h3,h4,legend,[role=heading],div,span')]
      .filter(h=>visible(h)&&!h.closest(excluded)&&!h.querySelector(controls)&&!!headingName(h));
    const leaves=headings.filter(h=>!headings.some(x=>x!==h&&h.contains(x)));
    const addButtons=section=>{
      const possible=[...section.querySelectorAll('button,[role=button],a,span,div')].filter(b=>visible(b)&&
        !b.closest('nav,aside,[role=navigation],#resume-local-assistant')&&!b.disabled&&b.getAttribute('aria-disabled')!=='true'&&
        /^(?:\+|＋)?(?:添加|新增)(?:教育背景|教育经历|工作经历|实习经历|项目经历|项目经验)?$/.test(text(b))&&
        !b.querySelector(controls)&&(!b.matches('button')||b.type==='button')&&
        (!b.matches('a[href]')||b.getAttribute('href')==='#')&&
        (b.matches('button,[role=button],a')||b.tabIndex>=0||getComputedStyle(b).cursor==='pointer'));
      return possible.filter(b=>!possible.some(x=>x!==b&&b.contains(x)));
    };
    for(const domain of Object.keys(domains)){
      const hs=leaves.filter(h=>domains[domain].test(headingName(h))),target=targets[domain]||0;
      if(!hs.length){inventory.push({domain,present:hs.length>0,current:0,target,code:target?'section-not-found':'no-source-records'});continue;}
      const resolved=[];let competing=false;
      for(const heading of hs){
        const end=leaves.find(h=>h!==heading&&!!(heading.compareDocumentPosition(h)&Node.DOCUMENT_POSITION_FOLLOWING))||null;
        let selected=null;
        for(let p=heading.parentElement,depth=0;p&&p!==document.body&&p!==document.documentElement&&depth<9;p=p.parentElement,depth++){
          const ref={section:p,heading,end,domain},bs=addButtons(p).filter(b=>inRegion(b,ref));
          if(bs.length>1){competing=true;selected=null;break;}
          if(bs.length===1)selected={...ref,button:bs[0]};
          if(leaves.filter(h=>p.contains(h)).length>1||p.tagName==='FORM')break;
        }
        if(selected&&!resolved.some(r=>r.button===selected.button))resolved.push(selected);
      }
      // A plain div table of contents has the same titles but no bounded add action.
      // Two real sections or competing buttons remain ambiguous; never select the first.
      if(competing||resolved.length>1){const code='section-ambiguous';issues.push({domain,code});inventory.push({domain,present:true,current:0,target,code});continue;}
      const selected=resolved[0];
      if(!selected){const code='add-control-unrecognized';issues.push({domain,code});inventory.push({domain,present:true,current:0,target,code});continue;}
      const {heading}=selected;
      const {section,button}=selected,current=rows(selected).length;
      if(!current&&inputs(selected).length){const code='record-container-unrecognized';issues.push({domain,code});inventory.push({domain,present:hs.length>0,current:0,target,code});continue;}
      const code=!target?'no-source-records':current>=target?'satisfied':'needs-add';
      inventory.push({domain,present:hs.length>0,current,target,code});
      if(code==='needs-add')found.push({...selected,headingText:text(heading),current,target});
    }
    return {candidates:found,issues,inventory};
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
        const count=rows(ref).length;
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
            const beforeRows=rows(ref),before=beforeRows.length;
            if(before!==ref.current+step)throw Error('页面记录数已变化');
            const old=inputs(ref).map(el=>({el,value:el.value,checked:el.checked,text:el.matches('[role=combobox]')?el.textContent:null}));
            hit(ref.button);if(!alive())throw Error('新增已取消');
            attempted++;ref.button.click();
            try{await waitGrowth(ref,before,alive);}catch(error){added+=Math.max(0,rows(ref).length-before);throw error;}
            added++;
            if(rows(ref).filter(r=>!beforeRows.includes(r)).length!==1||old.some(x=>!x.el.isConnected||x.el.value!==x.value||x.el.checked!==x.checked||x.text!==null&&x.el.textContent!==x.text))throw Error('新增改变了已有记录，停止并核对');
          }
        }
      }
      const final=collect(request.targets);
      return {added,attempted,issues:[...issues,...final.issues],inventory:final.inventory,complete:alive()&&final.inventory.every(x=>!x.target||x.code==='satisfied'),uncertain:false};
    }catch(error){return {added,attempted,issues:[...issues,{code:alive()?'add-result-uncertain':'cancelled'}],complete:false,uncertain:attempted>0};}
    finally{busy=false;}
  }
  globalThis.__resumeRepeatController={version:VERSION,expand,cancel:()=>{epoch++;return {stopping:busy};},inspect:targets=>{
    const r=collect(targets);return {candidates:r.candidates.map(({domain,current,target})=>({domain,current,target})),issues:r.issues,inventory:r.inventory};
  }};
})();
