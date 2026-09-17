"""Local-only importer. Never write its output inside the Git repository."""
import argparse,json,re
from pathlib import Path
from html.parser import HTMLParser
class Text(HTMLParser):
    def __init__(self): super().__init__();self.parts=[];self.skip=0
    def handle_starttag(self,t,a):
        if t in ('style','script'):self.skip+=1
        if t in ('p','li','div','h2','h3'):self.parts.append('\n')
    def handle_endtag(self,t):
        if t in ('style','script'):self.skip=max(0,self.skip-1)
    def handle_data(self,d):
        if not self.skip:self.parts.append(d)
def build(md, resume):
    facts=[];section='基本信息';entity='';seen={}
    for line in md.splitlines():
        if line.startswith('## '):section=line[3:].strip();entity=''
        if section not in ['基本信息','教育经历','实习经历','证书','资格证书','荣誉与奖励','语言能力']:continue
        if line.startswith('### '):entity=line[4:].strip()
        m=re.match(r'\*\*(.+?)[：:]?\*\*\s*[：:]?\s*(.+)',line)
        if not m:continue
        label=m[1].rstrip('：:');value=m[2].strip()
        if any(x in label for x in ['注意','说明','状态','链接','来源','范围','依据','用途','规则','私密','历史','冲突','版本','填法','精度']) or any(x in section for x in ['投递','规则','历史','档案说明']):continue
        if '未核' in value or '需确认' in value or '未填写' in value:continue
        if label=='学校':entity=value
        key=(section,entity,label)
        if key in seen:continue
        seen[key]=True
        facts.append({'id':'md-'+str(len(facts)+1),'section':section,'entity':entity,'label':label,'value':value,'aliases':[],'source':'个人主档（补充资料）','confirmed':True,'precision':'month' if re.fullmatch(r'\d{4}-\d{2}',value) else 'text'})
    parser=Text();parser.feed(resume);current=''.join(parser.parts)
    # Keep latest resume paragraphs as a separate source, never silently replace with old project text.
    for name in ['HashMM','HashLens']:
        start=current.find(name+' ·')
        if start<0:continue
        stop=current.find('HashLens ·',start+1) if name=='HashMM' else current.find('基于频域',start+1)
        value=current[start:stop if stop>start else start+3000].strip()
        facts=[f for f in facts if name.lower() not in (f['entity']+' '+f['value']).lower()]
        facts.append({'id':'resume-'+name,'label':'项目描述','entity':name,'section':'项目经历','value':value,'aliases':['项目介绍','主要工作','项目成果'],'source':'当前岗位简历','confirmed':True})
    return {'schemaVersion':1,'facts':facts,'notes':['日期精度不补造；同名字段需实体锚点或人工映射','最新简历的项目文字优先于旧主档；未知保留空白']}
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--md',required=True);p.add_argument('--html',required=True);p.add_argument('--out',required=True);a=p.parse_args()
    out=Path(a.out).resolve();repo=Path(__file__).resolve().parents[1]
    if out.is_relative_to(repo):raise SystemExit('个人资料必须输出到源码目录之外')
    result=build(Path(a.md).read_text(encoding='utf-8-sig'),Path(a.html).read_text(encoding='utf-8-sig'))
    out.parent.mkdir(parents=True,exist_ok=True);out.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    print('Imported facts:',len(result['facts']))
