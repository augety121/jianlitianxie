"""Public synthetic data only. No real resume is included in these tests."""
RECORDS = [
 ('基本信息','',[('姓名','SYNTHETIC PERSON'),('默认邮箱','empty@example.invalid')]),
 ('教育经历','硕士记录',[('学校','测试大学甲'),('专业','电子工程'),('入学时间','2024-09'),('毕业时间','2027-07')]),
 ('教育经历','本科记录',[('学校','测试大学乙'),('专业','软件工程'),('入学时间','2020-09'),('毕业时间','2024-07')]),
 ('实习经历','实习记录',[('公司名称','测试公司'),('部门名称','测试部门'),('职位名称','开发实习生')]),
]
RECORDS += [('项目经历','项目'+str(i),[('项目名称','虚构项目'+str(i)),('项目描述',f'项目背景：这是第{i}段虚构内容。\n设计方案：不得与其他记录混淆。')]) for i in range(5)]
RECORDS += [('自我描述','',[('自我评价','仅用于本机合成测试。')])]
SOURCE = '\n\n'.join('## '+section+('\n### '+entity if entity else '')+'\n\n'+'\n\n'.join('**'+key+'**\n\n'+value for key,value in values) for section,entity,values in RECORDS)
CHOICES = ['本科记录','硕士记录'] + ['项目'+str(i) for i in range(4,-1,-1)]
EXPECTED = {'person':'SYNTHETIC PERSON','email':'empty@example.invalid','summary':'仅用于本机合成测试。',
 'work0name':'测试公司','work0department':'测试部门','work0role':'开发实习生'}
for i,school,major,start,end in [(0,'测试大学乙','软件工程','2020-09','2024-07'),(1,'测试大学甲','电子工程','2024-09','2027-07')]:
 for key,value in [('name',school),('major',major),('start',start),('end',end)]:
  EXPECTED[f'education{i}'+key]=value
for index,source in enumerate(range(4,-1,-1)):
 EXPECTED[f'project{index}name']='虚构项目'+str(source)
 EXPECTED[f'project{index}body']=f'项目背景：这是第{source}段虚构内容。\n设计方案：不得与其他记录混淆。'
