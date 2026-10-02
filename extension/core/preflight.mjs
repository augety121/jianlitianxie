export const preflightCodes=new Set(['profile-not-initialized','profile-not-confirmed','target-not-bound','permission-missing','version-mismatch','host-ui-denied','ui-open-unconfirmed']);
export function preflightError(code,message){const error=new Error(message);error.code=preflightCodes.has(code)?code:'check-input';return error;}
export function requireProfile(profile,accepted){
 if(!accepted||!profile.facts.length)throw preflightError('profile-not-initialized','尚无已保存资料。请导入，或从本页已填内容建立资料。');
 if(!profile.facts.some(f=>f.confirmed&&!f.conflict))throw preflightError('profile-not-confirmed','资料已读取但尚未核对，请先确认本次要使用的资料。');
}
