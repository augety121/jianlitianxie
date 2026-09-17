// Explicit synonyms only. Never store personal data in this module.
export const normalize=s=>String(s??'').normalize('NFKC').toLowerCase().replace(/[\s*：:（）()\-_]/g,'');
const groups=[
 ['姓名','真实姓名'],['手机号码','手机号','移动电话'],['邮箱','电子邮箱','电子邮件','联系邮箱','默认邮箱','email'],
 ['出生日期','出生年月日','生日'],['政治面貌','政治面目'],['生源地','生源所在地'],['户口所在地','现户口所在地','户籍所在地'],
 ['现居住地','现住址','当前所在地区'],['身高','身高厘米','身高(cm)','身高（厘米）'],['体重','体重公斤','体重(kg)','体重（公斤）'],
 ['证件号码','身份证号码','身份证号'],['学校','学校名称','毕业学校','毕业院校','院校名称'],['学院','学院名称','院系'],
 ['专业','所学专业','专业名称'],['学习形式','学习方式'],['导师','导师姓名','实验室/课题组导师'],
 ['开始月份','开始年月','开始时间','入学时间','入学日期','项目开始时间'],
 ['结束月份','预计结束月份','结束年月','结束时间','毕业时间','毕业日期','项目结束时间'],
 ['预计毕业月份','预计毕业日期','预计毕业时间'],['入党月份','入党时间','入党日期'],
 ['公司名称','单位名称','实习单位'],['职位名称','岗位名称','担任职务'],['部门名称','所在部门'],
 ['岗位职责','实习内容','工作内容','工作职责'],['项目描述','项目介绍','项目简介'],
 ['兴趣爱好','个人爱好','爱好'],['特长','技能特长'],['证书名称','资格证书名称'],
 ['获得日期','获得月份','获得时间','取得时间','获证日期'],['获奖名称','获奖项','奖项名称'],['获奖时间','获奖日期'],
 ['获奖级别','奖励级别'],['紧急联系人','紧急联系人姓名'],['紧急联系人电话','紧急联系电话'],
 ['英语四级成绩','四级成绩','CET4成绩'],['毕业届次','毕业届别']
];
const aliases=new Map(groups.flatMap(g=>g.map(x=>[normalize(x),normalize(g[0])])));
export function semanticLabel(label,section=''){
 let s=normalize(label).replace(/必填|选填/g,'');
 if(/紧急联系/.test(section)){
  if(['姓名','联系人','联系人姓名'].includes(s))s='紧急联系人姓名';
  if(['电话','联系电话','手机号','手机号码'].includes(s))s='紧急联系人电话';
 }
 if(/证书|资格/.test(section)){if(s==='名称')s='证书名称';if(s==='日期')s='获得日期';}
 if(/获奖|奖励/.test(section)&&['名称','奖项'].includes(s))s='获奖名称';
 if(s==='联系电话'&&/基本|个人/.test(section))s='手机号码';
 return aliases.get(s)||s;
}
export function scope(s=''){
 for(const [key,re] of [['contact',/紧急联系/],['family',/家庭|亲属|家属/],['education',/教育|学历|本科|硕士|研究生|博士/],['work',/实习|工作经历/],['project',/项目/],['certificate',/资格|证书/],['award',/获奖|奖励|奖惩/],['language',/语言|外语/],['personal',/基本|个人/]])if(re.test(s))return key;
 return '';
}
export function entityMatches(a,f){const context=normalize([f.entity,f.section,...f.anchors||[]].filter(Boolean).join(' '));return [a.entity,...a.entityAliases||[]].some(e=>e&&!/^\d+$/.test(e)&&context.includes(normalize(e)));}
export function candidatesFor(f,facts){
 const key=semanticLabel(f.label,f.section),fs=scope(f.section);
 return facts.filter(a=>a.confirmed!==false&&!a.conflict&&(!a.origin||a.origin===new URL(f.url||'https://unknown.invalid').origin))
 .filter(a=>[a.label,...a.aliases||[]].some(l=>semanticLabel(l,a.section)===key))
 .filter(a=>{const as=scope(a.section);return !fs||!as||fs===as||fs==='personal'&&as==='language';});
}
export function dateValue(value,precision){
 const m=String(value).trim().match(/^(\d{4})[-/.年](\d{1,2})(?:[-/.月](\d{1,2})日?)?月?$/);if(!m)return null;
 const y=+m[1],mo=+m[2],d=m[3]?+m[3]:null;if(mo<1||mo>12||d!==null&&(d<1||d>new Date(Date.UTC(y,mo,0)).getUTCDate()))return null;
 if(precision==='day'&&d===null)return null;
 return `${y}-${String(mo).padStart(2,'0')}`+(precision==='day'?`-${String(d).padStart(2,'0')}`:'');
}
export function optionKey(label,value){const k=semanticLabel(label),v=normalize(value);const sets=k===semanticLabel('学习形式')?[['全日制','全国普通高等院校全日制']]:k===semanticLabel('政治面貌')?[['中共党员','中国共产党党员']]:k===semanticLabel('民族')?[['汉','汉族']]:[];return sets.find(g=>g.map(normalize).includes(v))?.[0]||v;}
