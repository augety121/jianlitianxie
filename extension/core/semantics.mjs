// Explicit synonyms only. Never store personal data in this module.
export const normalize=s=>String(s??'').normalize('NFKC').toLowerCase().replace(/[\s*：:（）()\-_]/g,'');
const groups=[
 ['姓名','真实姓名','full name','candidate name','your name'],['手机号码','手机号','移动电话','mobile','mobile phone','phone number','phone'],['邮箱','电子邮箱','电子邮件','联系邮箱','默认邮箱','email','email address','e-mail'],
 ['出生日期','出生日期（年龄）','出生年月日','生日','date of birth','birth date'],['政治面貌','政治面目'],['生源地','生源所在地'],['户口所在地','现户口所在地','户籍所在地'],
 ['现居住地','现住址','当前所在地区','所在地','当前所在地'],['身高','身高厘米','身高(cm)','身高（厘米）'],['体重','体重公斤','体重(kg)','体重（公斤）'],
 ['证件号码','身份证号码','身份证号'],['学校','学校名称','毕业学校','毕业院校','院校名称','university','school name','university name','institution name'],['学院','学院名称','院系'],
 ['专业','所学专业','专业名称','major','field of study'],['学习形式','学习方式'],['导师','导师姓名','实验室/课题组导师'],
 ['开始月份','开始年月','开始时间','入学时间','入学日期','项目开始时间','start date','start month','from date'],
 ['结束月份','预计结束月份','结束年月','结束时间','毕业时间','毕业日期','项目结束时间','end date','end month','to date'],
 ['预计毕业月份','预计毕业日期','预计毕业时间'],['入党月份','入党时间','入党日期'],
 ['公司名称','企业名称','单位名称','实习单位','company name','employer'],['职位名称','岗位名称','担任职务','job title','position title'],['部门名称','所在部门','部门'],
 ['岗位职责','实习内容','工作内容','工作描述','工作职责','responsibilities','job responsibilities'],['项目描述','项目介绍','项目简介','project description'],
 ['自我评价','自我描述','评价内容','个人评价','self evaluation','self assessment'],['兴趣爱好','个人爱好','爱好'],['特长','技能特长'],['证书名称','资格证书名称','certificate name','certification name'],
 ['获得日期','获得月份','获得时间','取得时间','获证日期'],['获奖名称','获奖项','奖项名称','award name'],['获奖时间','获奖日期'],
 ['获奖级别','奖励级别'],['紧急联系人','紧急联系人姓名'],['紧急联系人电话','紧急联系电话'],
 ['英语四级成绩','四级成绩','CET4成绩'],['毕业届次','毕业届别'],
 ['姓氏','family name','last name'],['名字','given name','first name'],['性别','gender'],
 ['学历','education level','highest education'],['学位','degree'],['项目名称','project name','project title'],
 ['项目职责','项目中职责','项目中的职责','承担职责','project responsibilities'],['项目成果','项目业绩','project achievements','project results'],
 ['作品链接','项目链接','项目网址','project url','portfolio url'],['主修课程','主要课程','courses','coursework'],
 ['绩点','平均学分绩点','GPA'],['平均分','平均成绩','average score'],['专业排名','成绩排名','class rank'],
 ['语言类型','语种','外语语种','语言名称','language'],['掌握程度','语言水平','熟练程度'],['听说能力','听说'],['读写能力','读写'],['教育经历描述','教育描述','education description']
];
const aliases=new Map(groups.flatMap(g=>g.map(x=>[normalize(x),normalize(g[0])])));
export function semanticLabel(label,section=''){
 label=String(label??'').replace(/[（(]\s*(?:限|最多|不超过)?\s*\d+\s*(?:个)?(?:字|字符)(?:以内|内)?\s*[)）]\s*$/,'');
 let s=normalize(label).replace(/必填|选填/g,'').replace(/(?:required|optional)$/,'').replace(/[?？]+$/,'');
 const fieldScope=scope(section);
 if(s==='name')s=({project:'项目名称',education:'学校',work:'公司名称',personal:'姓名',certificate:'证书名称',award:'获奖名称'})[fieldScope]||s;
 if(s==='description')s=({project:'项目描述',work:'岗位职责',education:'教育经历描述'})[fieldScope]||s;
 if(s==='company'&&fieldScope==='work')s='公司名称';
 if(['职责','项目中职责'].includes(s)&&fieldScope==='project')s='项目职责';
 if(s==='职位'&&fieldScope==='work')s='职位名称';
 if(fieldScope==='language'&&s==='类型')s='语言类型';
 if(/紧急联系|emergency contact/i.test(section)){
  if(['姓名','联系人','联系人姓名','name','fullname','contactname'].includes(s))s='紧急联系人姓名';
  if(['电话','联系电话','手机号','手机号码','phone','phonenumber','mobile','mobilephone'].includes(s))s='紧急联系人电话';
 }
 if(/证书|资格/.test(section)){if(s==='名称')s='证书名称';if(s==='日期')s='获得日期';}
 if(/获奖|奖励/.test(section)&&['名称','奖项'].includes(s))s='获奖名称';
 if(['电话','联系电话'].includes(s)&&/基本|个人/.test(section))s='手机号码';
 return aliases.get(s)||s;
}
export function scope(s=''){
 for(const [key,re] of [['contact',/紧急联系|emergency contact/i],['family',/家庭|亲属|家属|family members|relatives/i],['education',/教育|学历|本科|硕士|研究生|博士|education|academic/i],['work',/实习|工作经历|employment|work experience/i],['project',/项目|project/i],['certificate',/资格|证书|certificates|certifications/i],['award',/获奖|奖励|奖惩|荣誉|awards|honors/i],['language',/语言|外语|languages/i],['personal',/基本|个人|personal|basic information/i]])if(re.test(s))return key;
 return '';
}
export function entityMatches(a,f){const context=normalize([f.entity,f.section,...f.anchors||[]].filter(Boolean).join(' '));return [a.entity,...a.entityAliases||[]].some(e=>e&&!/^\d+$/.test(e)&&context.includes(normalize(e)));}
// Explicit record binding is stricter than generic matching: unknown/cross-section facts are excluded.
export function restrictedFactScope(fact, targetScope){return !targetScope || scope(fact.section)!==targetScope;}
export function candidatesFor(f,facts){
 const key=semanticLabel(f.label,f.section),fs=scope(f.section);
 return facts.filter(a=>a.confirmed!==false&&!a.conflict&&(!a.origin||a.origin===new URL(f.url||'https://unknown.invalid').origin))
 .filter(a=>[a.label,...a.aliases||[]].some(l=>semanticLabel(l,a.section)===key))
 .filter(a=>{const as=scope(a.section);return fs==='family'||fs==='contact'?fs===as:!fs||!as||fs===as||fs==='personal'&&as==='language';});
}
export function dateValue(value,precision){
 const m=String(value).trim().match(/^(\d{4})[-/.年](\d{1,2})(?:[-/.月](\d{1,2})日?)?月?$/);if(!m)return null;
 const y=+m[1],mo=+m[2],d=m[3]?+m[3]:null;if(y<1000||y>9999||mo<1||mo>12||d!==null&&(d<1||d>new Date(Date.UTC(y,mo,0)).getUTCDate()))return null;
 if(precision==='day'&&d===null)return null;
 return `${y}-${String(mo).padStart(2,'0')}`+(precision==='day'?`-${String(d).padStart(2,'0')}`:'');
}
export function optionKey(label,value){const k=semanticLabel(label),v=normalize(value);const sets=k===semanticLabel('学习形式')?[['全日制','全国普通高等院校全日制']]:k===semanticLabel('政治面貌')?[['中共党员','中国共产党党员']]:k===semanticLabel('民族')?[['汉','汉族']]:[];return sets.find(g=>g.map(normalize).includes(v))?.[0]||v;}

/** Build once per plan, never cache personal facts across revisions or scans. */
export function createCandidateIndex(facts, url, metrics = {}) {
 const origin = new URL(url || 'https://unknown.invalid').origin;
 const byLabel = new Map(), byId = new Map(), scopes = new WeakMap(), anchorsByScope = new Map();
 const anchorLabels=new Set(['学校','公司名称','项目名称','证书名称'].map(x=>semanticLabel(x)));
 metrics.indexEntries = 0; metrics.candidateChecks = 0;
 for (const a of facts) {
  if (a.confirmed === false || a.conflict || a.origin && a.origin !== origin) continue;
  if (!byId.has(a.id)) byId.set(a.id, []);
  byId.get(a.id).push(a); scopes.set(a, scope(a.section));
  const sk=scope(a.section);
  if(a.entity&&['education','work','project','certificate'].includes(sk)&&anchorLabels.has(semanticLabel(a.label,a.section))){
   const k=sk+'|'+normalize(a.value);if(!anchorsByScope.has(k))anchorsByScope.set(k,new Set());anchorsByScope.get(k).add(normalize(a.entity));
  }
  for (const key of new Set([a.label, ...a.aliases || []].map(l => semanticLabel(l, a.section)))) {
   if (!byLabel.has(key)) byLabel.set(key, []);
   byLabel.get(key).push(a); metrics.indexEntries++;
  }
 }
 return {
  byId: id => byId.get(id) || [],
  anchored(f, candidates) {
   const fs=scope(f.section);if(!fs)return [];
   const sets=(f.anchors||[]).map(v=>anchorsByScope.get(fs+'|'+normalize(v))).filter(Boolean);
   if(!sets.length)return [];
   const consistent=[...sets[0]].filter(entity=>sets.every(set=>set.has(entity)));
   // Shared school/employer across records is NOT enough to pick a record.
   return consistent.length===1?candidates.filter(a=>normalize(a.entity)===consistent[0]&&scopes.get(a)===fs):[];
  },
  candidates(f) {
   const key = semanticLabel(f.label, f.section), fs = scope(f.section);
   const candidates = byLabel.get(key) || []; metrics.candidateChecks += candidates.length;
   return candidates.filter(a => { const as = scopes.get(a); return fs==='family'||fs==='contact'?fs===as:!fs || !as || fs === as || fs === 'personal' && as === 'language'; });
  }
 };
}
