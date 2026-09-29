import {normalizeFact,normalizeProfile} from './profile.mjs';
import {semanticLabel,scope} from './semantics.mjs';
const sections=[['教育背景',/^(教育背景|教育经历|education)$/i],['项目经历',/^(项目经历|项目经验|科研项目|projects?)$/i],['实习经历',/^(实习经历|工作经历|工作经验|internships?|workexperience)$/i],['专业技能',/^(专业技能|个人优势&?专业技能|个人优势与专业技能|技能|skills?)$/i],['自我评价',/^(自我评价|自我描述|个人优势|个人简介|summary)$/i],['获奖经历',/^(荣誉与证书|荣誉与奖励|获奖经历|奖项|荣誉|awards?)$/i],['论文',/^(论文|科研成果|论文与科研成果|论文与知识产权|论文与专利|发表论文|publications?)$/i]];
const dateRE=/(20\d{2})[.\-/年](\d{1,2})(?:[.\-/月](\d{1,2})日?)?/g;
const heading=s=>s.replace(/[\s#·•：:]/g,'');
const titleName=s=>s.replace(/^[➢▶◆●•\-*\d、.\s]+/,'').trim();
/** Local draft extraction, never a claim that facts are verified. Every source remains reviewable. */
export function parseResumeText(input,{sourceName='上传简历'}={}){
 if(typeof input!=='string'||new TextEncoder().encode(input).length>2*1024*1024)throw Error('简历文本须小于2MB');
 const lines=input.replace(/\r/g,'').split('\n').map(s=>s.trim()).filter(Boolean);
 if(lines.length>5000)throw Error('简历过长，请使用较短版本');
 const facts=[],unclassified=[],warnings=['自动解析为待核对草稿；姓名、经历边界、专业和日期请对照原文。不会推断简历未写的成绩、英语通过情况或薪资。'];
 const add=(label,value,section='基本信息',entity='',line=0)=>{
  value=String(value||'').trim();if(!value)return;
  if(value.length>10000){warnings.push('有正文超过10000字，已保留在未归类内容中');unclassified.push({line,text:value});return;}
  if(facts.some(f=>f.label===label&&f.section===section&&f.entity===entity&&f.value===value))return;
  facts.push(normalizeFact({id:crypto.randomUUID(),label,value,section,entity,source:`${sourceName.slice(0,120)} · 第${line+1}行，自动提取待确认`,confirmed:false}));
 };
 const dates=line=>[...line.matchAll(dateRE)].map(m=>`${m[1]}-${m[2].padStart(2,'0')}`+(m[3]?'-'+m[3].padStart(2,'0'):''));
 let section='基本信息',record=null;
 const flush=()=>{if(!record)return;const kind=scope(record.section),label=kind==='project'?'项目描述':kind==='work'?'岗位职责':'教育经历描述';add(label,record.body.join('\n'),record.section,record.entity,record.line);
  if(kind==='project'){
   // Copy complete source paragraphs, never invent a role or fabricate a shorter result.
   const paragraphs=[];for(const line of record.body){if(/^[\u4e00-\u9fa5]{2,12}[：:]/.test(line)||!paragraphs.length)paragraphs.push(line);else paragraphs[paragraphs.length-1]+='\n'+line;}
   for(const [field,pattern] of [['项目职责',/^(?:个人职责|项目职责|负责内容|问题与方法|方法与实现|技术实现|设计与实现)[：:]/],['项目成果',/^(?:结果与指标|结果与验证|成果与指标|项目成果|成果|结果|验证结果)[：:]/]]){
    if(!facts.some(f=>f.entity===record.entity&&f.label===field))add(field,paragraphs.filter(p=>pattern.test(p)).join('\n'),record.section,record.entity,record.line);
   }
  }
  record=null;
 };
 const pairLabels=new Set(['姓名','手机号码','手机号','电话','邮箱','电子邮箱','性别','年龄','政治面貌','籍贯','现居住地','专业','学历','学位','学校','公司名称','项目名称','项目描述','项目职责','项目成果','职位名称','岗位职责','毕业时间','入学时间','绩点','GPA','平均分','专业排名','英语四级成绩','主修课程','学习形式','自我评价','自我描述','项目角色']);
 for(let i=0;i<lines.length;i++){
  const line=lines[i],h=sections.find(([,r])=>r.test(heading(line)));
  if(h){flush();section=h[0];continue;}
  if(/^第?\s*\d+\s*[/／]\s*\d+\s*页?$/.test(line))continue;
  let used=false;
  if(section==='基本信息'){
   const emails=line.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/ig)||[];for(const x of emails){add('邮箱',x,section,'',i);used=true;}
   const phones=line.match(/(?<!\d)(?:\+?86[- ]?)?1[3-9]\d[ -]?\d{4}[ -]?\d{4}(?!\d)/g)||[];for(const x of phones){add('手机号码',x.replace(/^(?:\+?86[- ]?)/,'').replace(/[ -]/g,''),section,'',i);used=true;}
   if(i<4&&/^[\u4e00-\u9fa5]{2,4}$/.test(line.replace(/\s/g,''))&&!/简历|求职|个人/.test(line)){add('姓名',line.replace(/\s/g,''),section,'',i);used=true;}
   const age=line.match(/(?:^|[\s|｜])([1-9]\d)岁(?:$|[\s|｜])/);if(age){add('年龄',age[1],section,'',i);used=true;}
   const politics=line.match(/中共(?:预备)?党员|共青团员|群众/);if(politics){add('政治面貌',politics[0],section,'',i);used=true;}
  }
  const sk=scope(section),ds=dates(line),dateTitle=ds.length&&line.replace(dateRE,'').replace(/至今|至|迄今|[\s~—–\-./()（）|｜]+/g,'').length>2;
  const school=sk==='education'&&/大学|学院|University|College/i.test(line)&&ds.length>=1;
  const projectOrWork=['project','work'].includes(sk)&&dateTitle&&line.length<260&&(sk!=='work'||/公司|研究院|研究所|中心|实习生|工程师|开发者/.test(line))&&!/^(针对|负责|采用|实现|结果|成果|能力|方法|背景)[：:]/.test(line);
  if(school||projectOrWork){
   let previousTitle='';const previous=lines[i-1]||'';
   if(sk==='project'&&/^20\d{2}[.\-/年]/.test(line)&&previous.length<150&&!dates(previous).length&&!/[：:。；;]/.test(previous)&&!sections.some(([,r])=>r.test(heading(previous)))){
    previousTitle=titleName(previous);if(record?.body.at(-1)===previous)record.body.pop();const pending=unclassified.findIndex(x=>x.line===i);if(pending>=0)unclassified.splice(pending,1);
   }
   flush();const metadata=titleName(line.replace(dateRE,'').replace(/至今|迄今/g,'').replace(/\s*[~—–]+\s*/g,' ').replace(/(?:\s|\|)+$/,''));
   const title=previousTitle||metadata;
   const parts=title.split(/\t+|\s{2,}|\s*[|｜]\s*/).map(x=>x.trim()).filter(Boolean);
   const entity=`${title.slice(0,140)} | ${ds[0]}`;record={section,entity,body:[],line:i};
   const name=parts[0]||title,schoolName=school?(title.match(/^(.+?(?:大学|学院))/)?.[1]||name):'',companyName=sk==='work'?(title.match(/^(.+?(?:有限公司|分公司|研究院|研究所|公司))/)?.[1]||name):'';
   add(school?'学校':sk==='project'?'项目名称':'公司名称',school?schoolName:sk==='work'?companyName:name,section,entity,i);
   add(school?'入学时间':'开始时间',ds[0],section,entity,i);if(ds[1])add(school?'毕业时间':'结束时间',ds[1],section,entity,i);
   if(/至今|迄今/.test(line))add('是否至今','是',section,entity,i);
   if(school){const degree=title.match(/博士|硕士|本科|学士|大专/);if(degree)add('学历',degree[0]==='学士'?'本科':degree[0],section,entity,i);const major=title.replace(schoolName,'').replace(/[（(]?(博士|硕士|本科|学士|大专)[）)]?/g,'').replace(/^[\s|｜-]+|[\s|｜-]+$/g,'');if(major)add('专业',major,section,entity,i);}
   else if(previousTitle){const role=metadata.replace(/^[|｜\s]+/,'').split(/在线作品|https?:|[|｜]/)[0].trim();if(role)add('项目角色',role,section,entity,i);}
   else if(sk==='work'&&title!==companyName)add('职位名称',title.replace(companyName,'').trim(),section,entity,i);
   else if(parts.length>1)add('项目角色',parts.slice(1).join(' '),section,entity,i);
   if(sk==='project'){const url=line.match(/https?:\/\/[^\s|｜）)]+/);if(url)add('作品链接',url[0],section,entity,i);}
   continue;
  }
  // Explicit pairs can occur together in the header, separated by fullwidth bars/semicolons.
  for(const segment of line.split(/[|｜；;]\s*|\s+(?=(?:姓名|电话|邮箱|年龄|性别|政治面貌)[：:])/)){
   const m=segment.match(/^\s*([^：:]{1,18})[：:]\s*(.+)$/);if(m&&pairLabels.has(m[1].trim())){const phone=section==='基本信息'&&/^(电话|手机号|手机号码)$/.test(m[1].trim());add(phone?'手机号码':m[1].trim(),phone?m[2].replace(/^(?:\+?86[- ]?)/,'').replace(/[ -]/g,''):m[2],section,record?.entity||'',i);used=true;}
  }
  if(record){record.body.push(line);continue;}
  if(section==='自我评价'){add('自我评价',line,section,'',i);continue;}
  if(section==='专业技能'){add('技能描述',line,section,`技能段落${i+1}`,i);continue;}
  if(!used)unclassified.push({line:i+1,text:line});
 }
 flush();
 // Consecutive summary lines belong to one paragraph, not contradictory facts.
 const summaries=facts.filter(f=>f.label==='自我评价');if(summaries.length>1){const first=summaries[0];first.value=summaries.map(f=>f.value).join('\n');for(const f of summaries.slice(1))facts.splice(facts.indexOf(f),1);}
 if(!facts.length)throw Error('未识别到可用简历文字；请使用可复制文字的PDF或DOCX，图片扫描件需先转为文字');
 return {facts:normalizeProfile({facts}).facts,skipped:unclassified,warnings};
}
