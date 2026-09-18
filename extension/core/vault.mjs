/** Web Crypto only. Persistent storage receives authenticated ciphertext, never keys. */
import {normalizeProfile, MAX_PROFILE_BYTES} from './profile.mjs';
export const VAULT_KIND = 'jianlitianxie-encrypted-vault';
export const ITERATIONS = 600000;
export const MAX_BACKUP_BYTES = 3 * 1024 * 1024;
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', {fatal: true});
const aad = encoder.encode(`${VAULT_KIND}|1|PBKDF2|SHA-256|${ITERATIONS}|AES-GCM|256`);
function base64(bytes) {
  let result = '';
  for (let i = 0; i < bytes.length; i += 8192) result += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(result);
}
function unbase64(value, max) {
  if (typeof value !== 'string' || value.length > Math.ceil(max / 3) * 4 ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) throw Error('加密备份编码无效');
  const bytes = Uint8Array.from(atob(value), c => c.charCodeAt(0));
  if (bytes.length > max) throw Error('加密备份过大');
  return bytes;
}
function passwordBytes(password) {
  if (typeof password !== 'string' || [...password].length < 12 || encoder.encode(password).length > 1024) {
    throw Error('解锁口令至少12个字符，最多1024字节；建议使用独立的长口令');
  }
  return encoder.encode(password);
}
export function validateEnvelope(value) {
  if (!value || value.kind !== VAULT_KIND || value.version !== 1 ||
      value.kdf?.name !== 'PBKDF2' || value.kdf?.hash !== 'SHA-256' ||
      value.kdf?.iterations !== ITERATIONS || value.cipher?.name !== 'AES-GCM') throw Error('不支持的加密备份版本或算法');
  const salt = unbase64(value.kdf.salt, 16);
  const iv = unbase64(value.cipher.iv, 12);
  const ciphertext = unbase64(value.ciphertext, MAX_PROFILE_BYTES + 16);
  if (salt.length !== 16 || iv.length !== 12 || ciphertext.length < 16) throw Error('加密备份长度无效');
  // Canonicalize: ignored metadata cannot be smuggled into persistent storage.
  return {kind: VAULT_KIND, version: 1,
    kdf: {name: 'PBKDF2', hash: 'SHA-256', iterations: ITERATIONS, salt: base64(salt)},
    cipher: {name: 'AES-GCM', iv: base64(iv)}, ciphertext: base64(ciphertext)};
}
async function derive(password, salt) {
  const bytes = passwordBytes(password);
  try {
    const material = await crypto.subtle.importKey('raw', bytes, 'PBKDF2', false, ['deriveKey']);
    return await crypto.subtle.deriveKey({name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITERATIONS},
      material, {name: 'AES-GCM', length: 256}, false, ['encrypt', 'decrypt']);
  } finally { bytes.fill(0); }
}
export async function sealProfile(profile, key, salt) {
  const data = normalizeProfile(profile);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const bytes = encoder.encode(JSON.stringify(data));
  let encrypted;
  try {
    encrypted = await crypto.subtle.encrypt({name: 'AES-GCM', iv, additionalData: aad, tagLength: 128}, key, bytes);
  } finally { bytes.fill(0); }
  return {kind: VAULT_KIND, version: 1,
    kdf: {name: 'PBKDF2', hash: 'SHA-256', iterations: ITERATIONS, salt},
    cipher: {name: 'AES-GCM', iv: base64(iv)}, ciphertext: base64(new Uint8Array(encrypted))};
}
export async function createVault(password, profile = {facts: []}) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await derive(password, salt);
  return {key, profile: normalizeProfile(profile), envelope: await sealProfile(profile, key, base64(salt))};
}
export async function openVault(input, password) {
  const envelope = validateEnvelope(input);
  const key = await derive(password, unbase64(envelope.kdf.salt, 16));
  let plain;
  try {
    plain = new Uint8Array(await crypto.subtle.decrypt({name: 'AES-GCM',
      iv: unbase64(envelope.cipher.iv, 12), additionalData: aad, tagLength: 128},
      key, unbase64(envelope.ciphertext, MAX_PROFILE_BYTES + 16)));
    return {key, envelope, profile: normalizeProfile(JSON.parse(decoder.decode(plain)))};
  } catch { throw Error('口令错误或备份损坏，原资料未修改'); }
  finally { plain?.fill(0); }
}
