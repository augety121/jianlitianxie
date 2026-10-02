"""Fictional record data and independently authored Moka-shaped DOM."""
HTML='''<meta charset="utf-8"><style>body{font:16px sans-serif}main{width:800px}section{margin:20px}article{border:1px solid #aaa;padding:12px;margin:10px}label,input,textarea{display:block}.sd-Dropdown-container-x{display:inline-block;width:150px;padding:5px}.sd-Select-container-x{border:1px solid #aaa;cursor:pointer;padding:8px;min-height:20px}.sd-Select-container-x input{width:1px;height:1px;border:0;padding:0}.sd-Dropdown-dropdown-x{position:fixed;z-index:10;background:white;border:1px solid #aaa}.sd-Menu-content-item-x{padding:12px;cursor:pointer}</style><main><div>个人信息</div><label>邮箱<input id="email" value="keep@example.invalid"></label></main><aside>教育背景 实习经历 项目经验 语言能力 获奖经历</aside>
<script>
const domains={education:['教育背景','学校名称'],work:['实习经历','公司名称'],project:['项目经验','项目名称'],language:['语言能力','语言类型'],award:['获奖经历','奖项名称']};
window.added={};window.chosen=0;window.submissions=0;
const field=(label,control)=>'<div class="field"><div>'+label+'</div><div>'+control+'</div></div>';
const select=()=>'<div class="item-x"><div class="sd-Tooltip-container-x"><div class="sd-Dropdown-container-x"><label class="sd-Input-container-x sd-Select-container-x"><span class="sd-Input-display-value-x"></span><input><span class="sd-Input-addon-x">⌄</span></label></div></div></div>';
for(const [domain,[title,identity]] of Object.entries(domains)){
 added[domain]=0;const section=document.createElement('section');section.dataset.domain=domain;
 section.innerHTML='<div><span>'+title+'</span><button type="button">\\uE71F添加</button></div>';document.querySelector('main').append(section);
 section.querySelector('button').onclick=()=>{added[domain]++;const card=document.createElement('article');
  card.innerHTML=field(identity,'<label class="sd-Input-container-x"><input class="identity"></label>')+
  (domain==='language'?field('掌握程度',select()):field(domain==='award'?'获奖时间':'开始时间','<div><span>'+select()+select()+'</span></div>'))+
  (domain==='project'?field('职责','<input>')+field('项目描述','<textarea></textarea>')+field('项目中职责','<textarea></textarea>'):'');section.append(card);};
}
document.addEventListener('click',e=>{const trigger=e.target.closest('.sd-Select-container-x');if(!trigger)return;
 document.querySelectorAll('.sd-Dropdown-dropdown-x').forEach(n=>n.remove());
 const menu=document.createElement('div');menu.className='sd-Dropdown-dropdown-x';const r=trigger.getBoundingClientRect();menu.style.top=Math.min(r.bottom,innerHeight-180)+'px';menu.style.left=r.left+'px';
 for(const value of ['2024','5','良好']){const option=document.createElement('div');option.className='sd-Menu-content-item-x';option.textContent=value;option.onclick=()=>{chosen++;trigger.querySelector('.sd-Input-display-value-x').textContent=value;trigger.querySelector('input').value='';menu.remove();};menu.append(option);}document.body.append(menu);
});
</script>'''
counts={'education':2,'work':1,'project':4,'language':1,'award':10}
facts=[]
names={'education':('教育背景','学校名称'),'work':('实习经历','公司名称'),'project':('项目经验','项目名称'),'language':('语言能力','语言类型'),'award':('获奖经历','奖项名称')}
for domain,count in counts.items():
 section,label=names[domain]
 for i in range(count):
  entity=domain+str(i);rows=[(label,'虚构'+entity)]
  rows+= [('掌握程度','良好')] if domain=='language' else [('获奖时间' if domain=='award' else '开始时间','2024-05')]
  if domain=='project':rows+=[('项目角色','开发者'+str(i)),('项目描述','虚构项目正文'+str(i)),('项目职责','虚构职责正文'+str(i))]
  for key,value in rows:facts.append(dict(id=entity+key,label=key,value=value,entity=entity,section=section,confirmed=True))
