import {semanticLabel,scope} from './semantics.mjs';
// Only known semantic vocabulary is exported. Unknown labels may contain PII.
const names=['姓名','手机号码','邮箱','性别','出生日期','政治面貌','学校','学院','专业','学历','学位','学习形式','开始月份','结束月份','预计毕业月份','公司名称','职位名称','部门名称','岗位职责','项目名称','项目角色','项目描述','项目职责','项目成果','作品链接','自我评价','证书名称','获奖名称','获奖时间','获得日期','绩点','平均分','专业排名','英语四级成绩','主修课程','教育经历描述','语言类型','掌握程度','听说能力','读写能力','最高学历','所在地','现居住地','期望城市','当前薪资','期望薪资','最近公司','推荐码','获奖级别'];
const known=new Map(names.map(n=>[semanticLabel(n),n]));
export const diagnosticCodes={
 'field-unrecognized':['recognition','没有识别出稳定的字段含义','这是页面识别问题；检查控件标签、分区和版本，不要反复导入资料'],
 'scope-mismatch':['matching','同名资料不属于目标分区','核对来源分区；不能把本人姓名、电话用于家庭成员'],
 'no-label-match':['matching','没有同字段且同分区的已确认资料','查看规范字段和分区；在导入页补齐或修正字段名称'],
 'record-unbound':['record','尚未唯一对应具体经历','在核对页选择这张卡片对应的学校、公司或项目'],
 'ambiguous-source':['matching','同一字段仍有多个候选','检查重复资料或同名经历，指定唯一来源'],
 'date-precision':['validation','日期精度不足','补充真实日期；不会自行推断日期'],
 'option-unavailable':['options','当前候选中没有唯一匹配','先选上级选项再扫描；检查下拉框适配'],
 'text-too-long':['validation','已确认正文均超过字数限制','补充已核实短版正文'],
 'number-required':['validation','目标仅接受数字','无法填写面议等文字时由本人填写'],
 'existing-difference':['review','现有内容与资料不同','在核对页查看旧值、新值后确认修正'],
 'existing-consistent':['review','现有内容与资料一致','保留，无需处理'],
 'existing-unverified':['review','保留现有内容，但未能核实是否正确','按证据代码检查资料，不能将保留当作核验通过'],
 'restricted-control':['policy','附件或声明需要人工操作','在申请页选择附件或确认声明'],
 'not-attempted':['execution','本项尚未执行，不能算写入失败','前一项异常、取消或授权到期后停止；核对后重新扫描'],
 'matched':['matching','字段与具体经历已对应','等待执行或查看填写回读'],
 'readback-failed':['readback','写入后的值或有效性未通过检查','查看网页实际内容；不要盲目重试'],
 'target-changed':['execution','执行时页面或字段发生变化','重新扫描，保留本人已修改内容'],
 'verified':['readback','本页回读通过','仍需本人检查；不代表网站已保存或提交'],
 'unclassified':['unknown','本阶段证据不足','查看操作阶段和状态，提供最小复现']
};
export function fieldDiagnostic(e,facts=[],bindingMethod='none'){
 const key=semanticLabel(e.dateLabel||e.label,e.section),kind=scope(e.section);
 const same=facts.filter(f=>[f.label,...f.aliases||[]].some(l=>semanticLabel(l,f.section)===key));
 const scoped=same.filter(f=>(kind==='family'||kind==='contact')?scope(f.section)===kind:!kind||!scope(f.section)||scope(f.section)===kind);
 const code=e.reasonCode==='no-label-match'&&!known.has(key)&&!['label','nearby','placeholder','autocomplete','date-group'].includes(e.recognition?.labelSource)?'field-unrecognized':e.reasonCode||({'not-attempted':'not-attempted',ready:'matched',verified:'verified',invalid:'readback-failed',stale:'target-changed','needs-user':'readback-failed'}[e.status])||'unclassified';
 return {code:code==='no-label-match'&&same.length&&!scoped.length?'scope-mismatch':code,semantic:known.get(key)||'unknown',section:kind||'unknown',binding:bindingMethod,kind:e.kind,optionCount:e.optionCount,required:e.required,
  sourceCount:same.length,scopedCount:scoped.length,confirmedCount:scoped.filter(f=>f.confirmed===true&&!f.conflict).length,
  candidateCount:e.candidateIds?.length??(e.factId?1:0),hasExisting:e.oldValue!==''&&e.oldValue!=null&&e.oldValue!==false,
  evidenceCode:e.evidenceCode,recognition:e.recognition};
}
export function profileDiagnostic(facts=[]){
 const inventory=new Map();
 for(const fact of facts){const semantic=known.get(semanticLabel(fact.label,fact.section))||'unknown',section=scope(fact.section)||'unknown',key=semantic+'|'+section;
  const row=inventory.get(key)||{semantic,section,count:0,confirmed:0};row.count++;if(fact.confirmed&&!fact.conflict)row.confirmed++;inventory.set(key,row);
 }
 return {total:facts.length,inventory:[...inventory.values()]};
}
export function cleanProfileDiagnostic(value){
 if(!value||!Array.isArray(value.inventory))return undefined;
 const n=v=>Number.isSafeInteger(v)&&v>=0?Math.min(v,20000):0;
 return {total:n(value.total),inventory:value.inventory.slice(0,200).map(row=>{const d=cleanDiagnostic(row);return {semantic:d.semantic,section:d.section,count:n(row.count),confirmed:n(row.confirmed)};})};
}
export function cleanDiagnostic(d){
 const n=v=>Number.isSafeInteger(v)&&v>=0?Math.min(v,20000):0;
 return {semantic:[...known.values()].includes(d.semantic)?d.semantic:'unknown',section:['personal','education','work','project','certificate','award','family','language','contact'].includes(d.section)?d.section:'unknown',binding:['anchor','exact-content','source-order','unique-remaining','manual'].includes(d.binding)?d.binding:'none',kind:['text','textarea','email','tel','date','month','number','select','select-one','custom-select','custom-radio','radio-group','file','checkbox','repeat-group','contenteditable'].includes(d.kind)?d.kind:'unknown',optionCount:n(d.optionCount),required:d.required===true,
  sourceCount:n(d.sourceCount),scopedCount:n(d.scopedCount),confirmedCount:n(d.confirmedCount),candidateCount:n(d.candidateCount),hasExisting:d.hasExisting===true,
  ...(Object.hasOwn(diagnosticCodes,d.evidenceCode)?{evidenceCode:d.evidenceCode}:{}),
  recognition:{labelSource:['label','nearby','placeholder','autocomplete','date-group','attribute'].includes(d.recognition?.labelSource)?d.recognition.labelSource:'unknown',controlFamily:['native','native-select','ant','react-select','marked-select'].includes(d.recognition?.controlFamily)?d.recognition.controlFamily:'unknown',selectedDisplay:d.recognition?.selectedDisplay===true,searchEmpty:d.recognition?.searchEmpty===true,datePart:['year','month','day'].includes(d.recognition?.datePart)?d.recognition.datePart:'none'}};
}
export function explainDiagnostic(f){
 const [stage,reason,action]=diagnosticCodes[f.code]||diagnosticCodes.unclassified;
 const structure=f.recognition?`\n  读取结构：${f.recognition.controlFamily}；标签来源 ${f.recognition.labelSource||'unknown'}；选中显示节点 ${f.recognition.selectedDisplay?'有':'无'}；搜索框为空 ${f.recognition.searchEmpty?'是':'否'}；日期分量 ${f.recognition.datePart}`:'';
 return `#${f.index} ${f.semantic||'unknown'} / ${f.section||'unknown'} · ${f.status}\n  控件：${f.kind||'unknown'}；候选选项 ${f.optionCount||0}；${f.required?'必填':'未标记必填'}；${f.hasExisting?'已读到现有值':'未读到现有值'}${structure}\n  阶段：${stage}；原因：${reason}\n  资料：同字段 ${f.sourceCount||0} → 同分区 ${f.scopedCount||0} → 已确认 ${f.confirmedCount||0} → 最终候选 ${f.candidateCount||0}；经历对应：${f.binding||'none'}${f.evidenceCode?'；底层原因：'+f.evidenceCode:''}\n  处理：${action}`;
}
