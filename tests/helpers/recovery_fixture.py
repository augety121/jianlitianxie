"""Synthetic source-shaped regression, not a copy of an authenticated ATS page."""
from pathlib import Path
import html,json
SOURCE=Path(__file__).with_name('recovery-source.txt').read_text(encoding='utf-8')
STYLE='''body{font:15px system-ui,sans-serif;color:#18364c;background:#f5f7fa;padding:24px 400px 40px 30px}form{max-width:790px;margin:auto}h1{font-size:22px}.resumeBlock_ab{background:white;padding:16px;margin:14px 0;border-radius:8px}.sectionTitle_ab{font-weight:bold;border-bottom:1px solid #d4dce5;margin-bottom:14px}.recordBlock_ab{border-bottom:1px solid #ddd;padding:12px}label,.formCell_ab{display:inline-block;vertical-align:top;width:45%;margin:8px 5px}input,select,textarea{display:block;width:98%;min-height:30px;padding:4px;border:1px solid #bdccd7;border-radius:4px}textarea{height:70px}.dateRow{margin:8px}.dateRow select{display:inline-block;width:20%;margin:4px}.uiSelect_root_a{border:1px solid #bdccd7;padding:8px;min-height:24px;position:relative}.uiSelect_input_a{width:1px;position:absolute;bottom:0;min-height:1px;padding:0;border:0}.uiSelect_placeholder_a{color:#8798a4}[role=listbox]{position:absolute;z-index:2000;background:white;border:1px solid #aaa;min-width:200px}[role=option]{padding:6px}'''
def input_(label,id_,type_='text',value=''):
 tag='textarea' if type_=='textarea' else 'input'
 body=f'<textarea id="{id_}">{html.escape(value)}</textarea>' if tag=='textarea' else f'<input type="{type_}" id="{id_}" value="{html.escape(value,quote=True)}">'
 return '<label>'+label+body+'</label>'
def native_select(id_,values,placeholder='请选择'):
 return f'<select id="{id_}"><option value="">{placeholder}</option>'+''.join(f'<option value="{html.escape(v,quote=True)}">{html.escape(v)}</option>' for v in values)+'</select>'
def section(title,body):return '<div class="resumeBlock_ab"><div class="sectionTitle_ab">'+title+'</div>'+body+'</div>'
def record(body):return '<div class="recordBlock_ab">'+body+'</div>'
def make_form():
 expected={'email':'recovery@example.invalid'};blocks=[section('个人信息',input_('邮箱','email','email'))]
 schools=[('示例学院甲','电子工程','2024','9','2028','6'),('示例学院乙','软件工程','2020','9','2024','6')]
 edus=[]
 for i,(name,major,sy,sm,ey,em) in enumerate(schools):
  g=f'edu{i}';expected.update({g+'name':name,g+'major':major,g+'sy':sy,g+'sm':sm,g+'ey':ey,g+'em':em})
  dates=''.join(native_select(g+k,[str(y) for y in range(2019,2030)] if k.endswith('y') else [str(m) for m in range(1,13)],'年' if k.endswith('y') else '月') for k in ['sy','sm','ey','em'])
  edus.append(record(input_('学校名称',g+'name')+input_('专业名称',g+'major')+'<div class="dateRow"><div>就读时间</div>'+dates+'</div>'))
 blocks.append(section('教育背景',''.join(edus)))
 projects=[
  ('Fictional study of structured retrieval（虚构研究 项目甲）','第一作者','项目背景：仅用于自动填写测试，所有身份与项目内容都是虚构数据。\n方案设计：将结构化字段逐项核对，不以扫描成功代替实际写入。\n结果与指标：完成实验甲的独立结果核对。','',''),
  ('虚构频域研究乙','负责人','低标注研究：这是项目乙，不可以和其他项目的内容混合。\n结果与指标：完成项目乙的独立验证。','2025-09','2026-09'),
  ('虚构服务项目丙','独立开发','研究到服务：这是项目丙，保留页面原有内容并核对候选。\n结果与能力：完成项目丙服务验证。','2026-04','2026-06'),
  ('虚构知识项目丁','主要开发者','大模型应用：这里只是一段虚构文字，不会调用任何模型或网络。\n结果与验证：完成项目丁回归测试。','2026-05',''),
  ('虚构导览项目戊','课题负责人','问题与方法：这是项目戊，负责数据接口与测试流程。\n结果与能力：完成项目戊的系统核对。','2023-09','2025-10')]
 ps=[]
 for i,(name,role,body,start,end) in enumerate(projects):
  g=f'project{i}';expected.update({g+'name':name,g+'role':role,g+'body':body})
  if start:expected[g+'start']=start
  if end:expected[g+'end']=end
  ps.append(record(input_('项目名称',g+'name')+input_('项目角色',g+'role')+input_('开始时间',g+'start','month')+input_('结束时间',g+'end','month')+input_('项目介绍',g+'body','textarea')))
 blocks.append(section('项目经历',''.join(ps)))
 expected.update({'employer':'虚构技术有限公司','job':'开发实习生','workbody':'使用测试数据检查输入和回读，不提交申请。'})
 blocks.append(section('实习经历',record(input_('企业名称','employer')+input_('职位名称','job')+input_('工作描述','workbody','textarea'))))
 expected.update({'awardname':'虚构学业奖励','awardyear':'2021'})
 blocks.append(section('获奖经历',record(input_('奖项名称','awardname')+'<div class="dateRow"><div>获奖时间*</div>'+native_select('awardyear',['2020','2021','2022'],'年')+native_select('awardmonth',['1','5','9'],'月')+'</div>')))
 blocks.append(section('语言能力',record(input_('语言类型','language',value='英语')+input_('掌握程度','level')+input_('听说','listening')+input_('读写','writing'))))
 blocks.append(section('家庭情况',record(input_('姓名','relative')+input_('工作单位','relativecompany')+input_('联系电话','relativephone'))))
 blocks.append(section('其他',input_('是否有重大疾病记录？','health')+input_('推荐码','referral')))
 body=''.join(blocks)+'<label>登录密码<input type="password" value="PRIVATE_SENTINEL"></label><label><input type="checkbox" id="consent">同意声明</label><button type="submit">提交申请</button>'
 return '<meta charset="utf-8"><title>虚构资料恢复与多记录填写验收</title><style>'+STYLE+'</style><h1>虚构简历填写回归</h1><form>'+body+'</form><script>window.submissions=0;document.querySelector("form").onsubmit=e=>{e.preventDefault();submissions++}</script>',expected
