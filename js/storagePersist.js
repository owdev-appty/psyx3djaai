// 容量が足りなくなったときに、ブラウザにデータを消されにくくする（navigator.storage.persist）。
// 起動のときに1回お願いする。結果は Settings に出す
let state = null;

export async function requestPersist() {
  const s = navigator.storage;
  if (!s || typeof s.persist !== 'function') { state = 'unsupported'; return state; }
  try {
    const already = typeof s.persisted === 'function' ? await s.persisted() : false;
    state = already || (await s.persist()) ? 'granted' : 'denied';
  } catch {
    state = 'denied';
  }
  return state;
}

// Settings 用：まだ確かめていなければ確かめる
export async function persistState() {
  if (state) return state;
  return requestPersist();
}
