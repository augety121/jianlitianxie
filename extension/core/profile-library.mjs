import {normalizeProfile} from './profile.mjs';
import {secret} from './workspace-policy.mjs';

export const PROFILE_LIBRARY_KEY = 'resumeLocalLibraryV1';
export const LEGACY_PROFILE_KEY = 'resumePlainLocalV1';
export const LEGACY_BACKUP_KEY = 'resumePlainBeforeLibraryV1';
const MAX_VERSIONS = 12, MAX_BYTES = 3 * 1024 * 1024;
const copy = value => structuredClone(value);
const versionId = () => 'resume-' + crypto.randomUUID();
const nameOf = name => {
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 60 || /[\u0000-\u001f\u007f]/.test(name)) {
    throw Error('简历名称须为1至60个可见字符');
  }
  return name.trim();
};
function profileOf(value) {
  const profile = normalizeProfile(value);
  if (profile.facts.some(f => secret(f.label))) throw Error('本地简历不能保存密码、验证码或密钥');
  return profile;
}
function checked(value) {
  if (!value || value.schemaVersion !== 1 || !Number.isSafeInteger(value.revision) || value.revision < 0 ||
      !Array.isArray(value.resumes) || !value.resumes.length || value.resumes.length > MAX_VERSIONS) {
    throw Error('简历版本库格式异常；保留原数据，不回退到旧缓存');
  }
  const ids = new Set(), names = new Set();
  const resumes = value.resumes.map(entry => {
    if (typeof entry?.id !== 'string' || !/^resume-[\w-]{1,100}$/.test(entry.id) || ids.has(entry.id)) throw Error('简历版本标识无效或重复');
    const name = nameOf(entry.name), key = name.toLocaleLowerCase();
    if (names.has(key)) throw Error('简历名称重复');
    ids.add(entry.id); names.add(key);
    return {id:entry.id, name, profile:profileOf(entry.profile)};
  });
  if (!ids.has(value.activeId)) throw Error('当前简历版本缺失');
  const book = {schemaVersion:1, revision:value.revision, activeId:value.activeId, resumes};
  if (new TextEncoder().encode(JSON.stringify(book)).length > MAX_BYTES) throw Error('简历版本库超过3MB，请先备份再减少不需要的版本');
  return book;
}
/** One authoritative snapshot; legacy data is retained and mirrored only for safe upgrades.
 * The worker is the sole writer. Caller holds the workflow-wide operation lock.
 */
export class ProfileLibrary {
  constructor(storage) { this.storage = storage; this.book = null; this.legacy = null; this.persisted = false; }
  async load() {
    const raw = (await this.storage.get(PROFILE_LIBRARY_KEY))[PROFILE_LIBRARY_KEY];
    if (raw != null) {
      this.book = checked(raw); this.persisted = true;
      return this.current();
    }
    const legacy = (await this.storage.get(LEGACY_PROFILE_KEY))[LEGACY_PROFILE_KEY];
    if (legacy != null && (legacy.version !== 1 || legacy.storage !== 'plain-local' || legacy.accepted !== true)) {
      throw Error('本地资料格式异常，请保留备份，不会使用旧缓存');
    }
    const p = legacy ? profileOf(legacy.profile) : profileOf({facts:[], revision:0});
    // Reads must not silently create a plaintext library or change encrypted data.
    this.legacy = copy(legacy ?? null); this.persisted = false;
    this.book = {schemaVersion:1, revision:p.revision, activeId:'resume-legacy', resumes:[{id:'resume-legacy',name:'我的简历',profile:p}]};
    return this.current();
  }
  get accepted() { return this.persisted || this.legacy?.accepted === true; }
  current() {
    if (!this.book) throw Error('请先读取本地资料');
    const active = this.book.resumes.find(x => x.id === this.book.activeId);
    return {...copy(active.profile), revision:this.book.revision};
  }
  describe() {
    if (!this.book) throw Error('资料尚未初始化');
    return {revision:this.book.revision, activeId:this.book.activeId, accepted:this.accepted,
      resumes:this.book.resumes.map(x=>({id:x.id,name:x.name,count:x.profile.facts.length}))};
  }
  async commit(next, expected) {
    if (expected !== this.book.revision) throw Error('资料已改变，请重新读取当前简历');
    const stored = (await this.storage.get(PROFILE_LIBRARY_KEY))[PROFILE_LIBRARY_KEY];
    if (stored != null) {
      const latest = checked(stored);
      if (latest.revision !== expected || latest.activeId !== this.book.activeId) throw Error('另一窗口已改变资料，请重新读取');
    } else if (this.persisted) throw Error('资料库已被移除，请重新读取');
    else {
      const legacy = (await this.storage.get(LEGACY_PROFILE_KEY))[LEGACY_PROFILE_KEY];
      if (JSON.stringify(legacy ?? null) !== JSON.stringify(this.legacy)) throw Error('原资料已改变，请重新读取');
    }
    const candidate = checked({...next, revision:expected + 1});
    const active = candidate.resumes.find(x=>x.id===candidate.activeId);
    const projection = {version:1, storage:'plain-local', accepted:true, profile:{...copy(active.profile),revision:candidate.revision}};
    const update = {[PROFILE_LIBRARY_KEY]:candidate, [LEGACY_PROFILE_KEY]:projection};
    if (!this.persisted && this.legacy && !(await this.storage.get(LEGACY_BACKUP_KEY))[LEGACY_BACKUP_KEY]) update[LEGACY_BACKUP_KEY] = copy(this.legacy);
    // All public state changes only after storage success. The library key, not the
    // compatibility projection, is authoritative if a process dies during delivery.
    await this.storage.set(update);
    this.book = candidate; this.persisted = true;
    return this.current();
  }
  async save(facts, revision, consent) {
    if (!this.accepted && consent !== true) throw Error('请确认免口令资料将在本浏览器未加密保存');
    const p = profileOf({facts, revision:revision+1});
    const next = copy(this.book);
    next.resumes.find(x=>x.id===next.activeId).profile=p;
    return this.commit(next, revision);
  }
  async create(name, duplicate, revision, consent) {
    if (!this.accepted && consent !== true) throw Error('请确认新简历将在本浏览器未加密保存');
    if (this.book.resumes.length >= MAX_VERSIONS) throw Error('最多12个独立简历版本，请先导出备份再整理');
    const next=copy(this.book), id=versionId();
    const p=duplicate ? this.current() : profileOf({facts:[],revision:0});
    next.resumes.push({id,name:nameOf(name),profile:p}); next.activeId=id;
    return this.commit(next,revision);
  }
  async select(id, revision) {
    if (!this.book.resumes.some(x=>x.id===id)) throw Error('简历版本已不存在');
    return this.commit({...copy(this.book),activeId:id},revision);
  }
  async rename(name, revision) {
    const next=copy(this.book);next.resumes.find(x=>x.id===next.activeId).name=nameOf(name);
    return this.commit(next,revision);
  }
  backup() { return {kind:'jianlitianxie-local-library',version:1,storage:'plaintext',library:copy(this.book)}; }
  async restore(envelope, revision, consent) {
    if (consent !== true || envelope?.kind !== 'jianlitianxie-local-library' || envelope.version !== 1 || envelope.storage !== 'plaintext') {
      throw Error('请确认替换免口令版本库；只接受本产品的完整备份');
    }
    const next=checked(envelope.library);
    return this.commit(next,revision);
  }
}
