// Worker（damp-field-a347）の TripNote 用の呼び出し口を呼ぶ。
// 送るのは task と input だけ（指示文・モデル名は Worker 側で決まっている）。合言葉は tripnote.secret から
import { store, storage } from './appStore.js';
import { getSecret } from './store.js';
import { errorCodeOf } from './logic/ai.js';

export const WORKER_URL = 'https://damp-field-a347.r8q3n6xw2p.workers.dev';
const TIMEOUT_MS = 120000;

// 最後にわかった今日の回数 { limit, remaining }（Settings と取り込みの画面で使う。保存はしない）
let lastUsage = null;
export const knownUsage = () => lastUsage;

export class AiError extends Error {
  constructor(code, { status = 0, limit = 20 } = {}) {
    super(code);
    this.code = code;
    this.status = status;
    this.limit = limit;
  }
}

function ready() {
  if (store.data.settings.ai?.enabled === false) throw new AiError('disabled');
  const token = getSecret(storage);
  if (!token) throw new AiError('no_token');
  if (navigator.onLine === false) throw new AiError('offline');
  return token;
}

async function request(path, token, init = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetch(WORKER_URL + path, {
      ...init,
      headers: { ...(init.headers || {}), 'X-TripNote-Token': token },
      signal: ctrl.signal,
      cache: 'no-store',
    });
  } catch {
    if (ctrl.signal.aborted) throw new AiError('timeout');
    throw new AiError(navigator.onLine === false ? 'offline' : 'network');
  } finally {
    clearTimeout(timer);
  }
  let body = null;
  try { body = await res.json(); } catch { /* 下で扱う */ }
  if (body?.usage) lastUsage = body.usage;
  if (!res.ok) {
    const limit = body?.usage?.limit || lastUsage?.limit || 20;
    if (res.status === 429) lastUsage = { limit, remaining: 0 };
    throw new AiError(errorCodeOf(res.status, body?.error?.code), { status: res.status, limit });
  }
  return body;
}

// AI を1回使う（今日の回数を1つ使う）。結果は Worker で形を確かめたもの
export async function callAI(task, input) {
  const token = ready();
  const body = await request('/tripnote/ai', token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ task, input }),
  });
  if (!body || typeof body.result !== 'object') throw new AiError('bad_output');
  return body.result;
}

// 今日の回数（回数は使わない）
export async function fetchUsage() {
  const token = ready();
  const body = await request('/tripnote/usage', token, { method: 'GET' });
  lastUsage = { limit: body.limit, remaining: body.remaining };
  return lastUsage;
}
