import {semanticLabel, scope} from './semantics.mjs';
/** Header-driven Markdown tables. Values never decide what a column means. */
const fieldHeaders=/^(字段|属性|项目|名称|信息项|field|key)$/i;
const valueHeaders=/^(内容|值|信息|填写内容|个人信息|个人资料|value)$/i;
const sectionHeaders=/^(分区|分类|类别|所属模块|模块|section)$/i;
const entityHeaders=/^(经历|经历名称|经历标识|记录|记录名称|entity)$/i;
const knownFields=new Set(['姓名','姓氏','名字','手机号码','手机号','联系电话','电话','邮箱','电子邮箱','性别','出生日期','出生年月','年龄','学校','学校名称','院校名称','毕业院校','学院','专业','专业名称','所学专业','学历','学位','学习形式','入学时间','入学日期','毕业时间','毕业日期','开始时间','结束时间','起止时间','就读时间','在校时间','公司名称','企业名称','单位名称','实习单位','职位名称','岗位名称','担任职务','部门','所在部门','部门名称','工作描述','工作内容','岗位职责','项目名称','项目描述','项目介绍','项目职责','项目成果','项目角色','证书名称','获得时间','获证日期','获奖名称','奖项名称','获奖时间','获奖级别','语言类型','语言水平','自我评价','自我描述','现居住地','所在地','期望城市','期望薪资','当前薪资','最高学历','主修课程','主要课程','绩点','平均分','专业排名','作品链接','技能','特长','兴趣爱好','政治面貌','民族'].map(x=>semanticLabel(x)));
const unformat=s=>String(s??'').trim().replace(/^(\*\*|__|`)([\s\S]+)\1$/,'$2').replace(/[:：]$/,'').trim();
export function tableSchema(raw,section){
 const headers=raw.map(unformat);
 if(headers.length<2||headers.length>12)return null;
 const exactly=re=>headers.map((v,i)=>re.test(v)?i:-1).filter(i=>i>=0);
 const labels=exactly(fieldHeaders),values=exactly(valueHeaders);
 if(labels.length===1&&values.length===1&&labels[0]!==values[0])return {kind:'vertical',headers,label:labels[0],value:values[0],section:exactly(sectionHeaders)[0],entity:exactly(entityHeaders)[0]};
 if(labels.length||values.length)return null;
 const keys=headers.map(h=>semanticLabel(h,section));
 const known=keys.map((key,i)=>knownFields.has(key)?i:-1).filter(i=>i>=0);
 const sc=scope(section),identity={education:'学校',work:'公司名称',project:'项目名称',certificate:'证书名称',award:'获奖名称'}[sc];
 const id=identity?keys.indexOf(semanticLabel(identity)):-1;
 if(known.length<2||new Set(keys.filter((k,i)=>known.includes(i))).size!==known.length)return null;
 // Repeated records must have a user-supplied identity column, not an inferred school/company.
 if(identity&&id<0)return null;
 if(!identity&&sc!=='personal')return null;
 return {kind:'horizontal',headers,known,identity:id,section:exactly(sectionHeaders)[0],entity:exactly(entityHeaders)[0]};
}
export function tableFacts(schema,row,section,entity,line){
 if(row.length!==schema.headers.length)return null;
 const sc=schema.section!==undefined?unformat(row[schema.section])||section:section;
 let record=schema.entity!==undefined?unformat(row[schema.entity])||entity:entity;
 if(schema.kind==='vertical'){
  const label=unformat(row[schema.label]),value=unformat(row[schema.value]);
  if(!label||!value)return [];
  return [{label,value,section:sc,entity:record}];
 }
 if(schema.identity>=0){
  const identity=unformat(row[schema.identity]);if(!identity)return null;
  if(!record)record=`${identity.slice(0,140)} · 表格第${line}行`;
 }
 return schema.known.filter(i=>unformat(row[i])).map(i=>({label:unformat(schema.headers[i]),value:unformat(row[i]),section:sc,entity:record}));
}
