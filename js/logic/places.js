// 場所ノートの決まり（画面と分けた純粋な関数）
import { parseISODate } from './dates.js';
import { isDated } from './trips.js';

export function sortPlaces(places) {
  return [...(places || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || String(a.name || '').localeCompare(String(b.name || ''), 'ja'));
}

// その場所を使っている旅
export function tripsUsingPlace(trips, placeId) {
  return (trips || []).filter((t) => (t.placeIds || []).includes(placeId));
}

// 一覧の行：行った回数（終わった旅。行かなかった旅は除く）・最後に行った年・店の数
export function placeStats(place, trips, today) {
  const went = tripsUsingPlace(trips, place.id)
    .filter((t) => t.status !== 'cancelled' && (t.status === 'done' || (isDated(t) && t.endDate < today)));
  const years = went.map((t) => parseISODate(t.startDate)?.y).filter(Boolean);
  return { visits: went.length, lastYear: years.length ? Math.max(...years) : null, spots: (place.spots || []).length };
}

// 場所を消す：その場所を使っている旅から外すだけ（旅は消さない）。外した旅の数を返す
export function removePlace(data, placeId) {
  let n = 0;
  for (const t of data.trips || []) {
    if ((t.placeIds || []).includes(placeId)) {
      t.placeIds = t.placeIds.filter((id) => id !== placeId);
      n += 1;
    }
  }
  data.places = (data.places || []).filter((p) => p.id !== placeId);
  return n;
}

// 同じ名前の場所（前後の空白・全角半角を無視）
export function findPlaceByName(places, name) {
  const key = (s) => String(s || '').normalize('NFKC').trim().toLowerCase();
  return (places || []).find((p) => key(p.name) === key(name)) || null;
}
