"""Synthetic component markup, not scraped from a recruiting website."""
import json
STYLE='''body{font:16px sans-serif;padding:30px}section{margin-bottom:20px}.card{padding:12px;border:1px solid #ccc;margin:10px}.formCell_ab{display:inline-block;vertical-align:top;margin:8px;width:240px}.fieldCaption_xy{margin-bottom:5px}.uiSelect_root_a{position:relative;border:1px solid #aaa;padding:10px;min-height:22px;width:200px;cursor:pointer}.uiSelect_value_a{display:block}.uiSelect_input_a{width:1px;position:absolute;left:10px;bottom:3px;border:0;padding:0;outline:none}.uiSelect_arrow_a{position:absolute;right:10px;top:10px}.uiSelect_placeholder_a{color:#888}.dates{display:flex;gap:8px}.dates .uiSelect_root_a{width:95px}[role=listbox]{background:white;border:1px solid #ccc;position:absolute;z-index:2000;min-width:180px}[role=option]{padding:8px}[hidden]{display:none!important}'''
def select(i,value='',placeholder='请选择',label='',opts=None):
    options=opts or ['示例学院甲','示例学院乙','电子工程','软件工程','本科','硕士','2020','2024','2026','2028','1','6','9','12']
    return f'''<div class="formCell_ab"><div class="fieldCaption_xy">{label}</div><div class="uiSelect_root_a" data-options='{json.dumps(options,ensure_ascii=False)}'><span class="uiSelect_{'value' if value else 'placeholder'}_a">{value or placeholder}</span><div class="uiSelect_inputbox_a"><input id="{i}" class="uiSelect_input_a" autocomplete="off"></div><span class="uiSelect_arrow_a" aria-hidden="true">⌄</span></div></div>'''
def edu(school='示例学院甲',major='',years=('2024','9','2028','6')):
    date=''.join(select('date'+str(i),v,'年' if i%2==0 else '月') for i,v in enumerate(years))
    return '<section data-section="教育经历"><h2>教育背景</h2><div class="card education-item"><div><div class="fieldCaption_xy">就读时间</div><div class="dates">'+date+'</div></div>'+select('school',school,label='学校名称')+select('major',major,label='专业名称')+select('degree','硕士',label='学历')+'</div></section>'
SCRIPT='''() => {
 for(const w of document.querySelectorAll('.uiSelect_root_a'))w.addEventListener('click',()=>{
  document.querySelectorAll('[role=listbox]').forEach(n=>n.remove());
  const menu=document.createElement('div');menu.role='listbox';menu.id=w.querySelector('input').id+'-list';w.querySelector('input').setAttribute('aria-controls',menu.id);
  const r=w.getBoundingClientRect();Object.assign(menu.style,{left:(r.left+scrollX)+'px',top:(r.bottom+scrollY)+'px'});
  for(const value of JSON.parse(w.dataset.options)){const opt=document.createElement('div');opt.role='option';opt.textContent=value;opt.onclick=e=>{
   e.stopPropagation();const s=w.querySelector('span');s.className='uiSelect_value_a';s.textContent=value;w.querySelector('input').value='';menu.remove();window.writes=(window.writes||0)+1;
  };menu.append(opt);}document.body.append(menu);
 });
 window.submissions=0;document.querySelectorAll('form').forEach(f=>f.onsubmit=e=>{e.preventDefault();submissions++});
}'''

def edu_plain(**kwargs):
    # No semantic section/data attributes or hard-coded recognized record class.
    return edu(**kwargs).replace('<section data-section="教育经历"><h2>教育背景</h2>', '<div class="resumeBlock_ab"><div class="sectionTitle_ab">教育背景</div>').replace('class="card education-item"', 'class="recordBlock_ab"').replace('</section>', '</div>')
