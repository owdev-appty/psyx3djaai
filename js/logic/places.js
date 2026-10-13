// 場所ノートの決まり（画面と分けた純粋な関数）
import { safeUrl } from './url.js';
import { normalizeForSearch } from './search.js';
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

// ---------- 店（spots） ----------

// 店の種類 → 予定の種類（Add to plan）。Souvenir は Shop、Cowork は Other
export function spotItemKind(kind) {
  if (['food', 'bar', 'sight', 'activity', 'shop'].includes(kind)) return kind;
  if (kind === 'souvenir') return 'shop';
  return 'other';
}

// 店をエリアごとにまとめる：エリアの順に [{ area, spots }]、最後にエリアのない店 { area: null }。
// エリアが1つもない場所は [{ area: null, spots: すべて }]。店のない エリアも出す（メモを読めるように）
export function groupSpotsByArea(place, spots) {
  const areas = place?.areas || [];
  if (!areas.length) return [{ area: null, spots: [...spots] }];
  const names = new Set(areas.map((a) => a.name));
  const groups = areas.map((area) => ({ area, spots: spots.filter((s) => s.area === area.name) }));
  const rest = spots.filter((s) => !s.area || !names.has(s.area));
  if (rest.length) groups.push({ area: null, spots: rest });
  return groups;
}

// エリアの名前を変えたら、そのエリアの店と宿の area も変える
export function renameArea(place, oldName, newName) {
  for (const s of place.spots || []) if (s.area === oldName) s.area = newName;
  for (const s of place.stays || []) if (s.area === oldName) s.area = newName;
  const a = (place.areas || []).find((x) => x.name === oldName);
  if (a) a.name = newName;
}

// エリアを消す：店と宿は消さず、エリアなしにする
export function removeArea(place, areaId) {
  const a = (place.areas || []).find((x) => x.id === areaId);
  if (!a) return;
  for (const s of [...(place.spots || []), ...(place.stays || [])]) if (s.area === a.name) s.area = '';
  place.areas = place.areas.filter((x) => x.id !== areaId);
}

// 店を消す：その店を指している予定は消さず、つながり（spotId）だけ外す
export function removeSpot(data, placeId, spotId) {
  const p = (data.places || []).find((x) => x.id === placeId);
  if (p) p.spots = (p.spots || []).filter((s) => s.id !== spotId);
  for (const t of data.trips || []) {
    for (const it of [...(t.days || []).flatMap((d) => d.items || []), ...(t.unscheduled || [])]) {
      if (it.spotId === spotId) it.spotId = null;
    }
  }
}

// Map ボタン：リンクがあればそれ、なければ Google マップで「店名 場所の名前」を検索
export function mapUrl(spot, place) {
  const own = safeUrl(spot?.url);
  if (own) return own;
  const q = [spot?.name, place?.name].filter(Boolean).join(' ');
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

// 電話番号 → tel: のリンク（数字と + だけ）
export function telHref(phone) {
  const n = String(phone || '').replace(/[^\d+]/g, '');
  return n ? `tel:${n}` : '';
}

// ---------- 旅とのつながり ----------
const ended = (t, today) => t.status === 'done' || (isDated(t) && t.endDate < today);

// 過去の旅（その場所に行った、終わった旅）。行かなかった旅も入れて、画面で薄くする。新しい順
export function pastTripsForPlace(trips, placeId, today) {
  return tripsUsingPlace(trips, placeId)
    .filter((t) => t.status === 'cancelled' || ended(t, today))
    .sort((a, b) => String(b.startDate || '').localeCompare(String(a.startDate || '')));
}

// Add to plan で選べる旅：終わっていない・行かなかったわけではない旅。その場所を含む旅を先に、日付順
export function tripsForAddToPlan(trips, placeId, today) {
  const open = (trips || []).filter((t) => t.status !== 'cancelled' && !ended(t, today));
  const has = (t) => (t.placeIds || []).includes(placeId);
  const byDate = (a, b) => String(a.startDate || '9999').localeCompare(String(b.startDate || '9999'));
  return [...open.filter(has).sort(byDate), ...open.filter((t) => !has(t)).sort(byDate)];
}

// 同じ場所への新しい旅：終わっていない旅の場所ごとに、
//   Notes to self、店（Want to go / Go again / Next time!）、移動のコツ、前回のふりかえり（その場所の、いちばん新しい終わった旅）
export const HINT_SPOT_STATUSES = ['want', 'again', 'nextTime'];
export function samePlaceHints(trip, places, today, trips = []) {
  if (!trip || trip.status === 'cancelled' || ended(trip, today)) return [];
  return (trip.placeIds || [])
    .map((id) => (places || []).find((p) => p.id === id))
    .filter(Boolean)
    .map((place) => {
      const last = pastTripsForPlace(trips, place.id, today)
        .find((t) => t.id !== trip.id && t.status !== 'cancelled' && String(t.lookBack || '').trim());
      return {
        place,
        notes: place.notesToSelf || [],
        spots: (place.spots || []).filter((s) => HINT_SPOT_STATUSES.includes(s.status)),
        tips: place.transportTips || [],
        lastLook: last ? { trip: last, lines: String(last.lookBack).split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 3) } : null,
      };
    })
    .filter((h) => h.notes.length || h.spots.length || h.tips.length || h.lastLook);
}

// ふりかえり：その旅の予定に入っていた店（spotId のある予定）と、ふりかえりで足した・答えた店（旅の場所の店）。同じ店は1回
export function lookbackSpots(trip, places) {
  const seen = new Set();
  const out = [];
  for (const it of [...(trip?.days || []).flatMap((d) => d.items || []), ...(trip?.unscheduled || [])]) {
    if (!it.spotId || seen.has(it.spotId)) continue;
    for (const place of places || []) {
      const spot = (place.spots || []).find((s) => s.id === it.spotId);
      if (spot) { seen.add(it.spotId); out.push({ place, spot }); break; }
    }
  }
  const answered = trip?.lookbackAnswers || {};
  for (const id of trip?.placeIds || []) {
    const place = (places || []).find((p) => p.id === id);
    for (const spot of place?.spots || []) {
      if (seen.has(spot.id) || !(spot.fromTripId === trip.id || answered[spot.id])) continue;
      seen.add(spot.id);
      out.push({ place, spot });
    }
  }
  return out;
}

// ふりかえりで「行った店を足す」：同じ名前の店があればその状態を変え、なければ新しく足す（fromTripId でこの旅から足したとわかる）。
// 答え（lookbackAnswers）にも入れる。status は visited / again / nextTime
export function addLookbackSpot(data, trip, { placeId, name, kind, status }, makeId, year) {
  const place = (data.places || []).find((p) => p.id === placeId);
  const n = String(name || '').trim();
  if (!place || !n) return null;
  let spot = findByName(place.spots, n);
  const created = !spot;
  if (!spot) {
    spot = { id: makeId(), name: n, kind: kind || 'food', status, note: '', hours: '', url: '', phone: '', area: '', fromTripId: trip.id };
    (place.spots ||= []).push(spot);
  } else {
    spot.status = status;
  }
  if (status === 'nextTime' && !spot.sinceYear && year) spot.sinceYear = year;
  trip.lookbackAnswers = { ...(trip.lookbackAnswers || {}), [spot.id]: status };
  return { spot, created };
}

// 配列を ids の順に並べ替えた新しい配列（ids にないものは後ろに残す）
export function reorderList(list, ids) {
  const byId = new Map((list || []).map((x) => [x.id, x]));
  const out = ids.map((id) => byId.get(id)).filter(Boolean);
  for (const x of list || []) if (!ids.includes(x.id)) out.push(x);
  return out;
}

// 文章の1行目をタイトルに、残りを本文に（Unsorted の Move で使う）
export function splitFirstLine(text) {
  const s = String(text || '').trim();
  const i = s.indexOf('\n');
  return i < 0 ? { title: s, rest: '' } : { title: s.slice(0, i).trim(), rest: s.slice(i + 1).trim() };
}

// 一部（同じエリアの店・絞り込み中の店など）だけを並べ替えたとき：
// その一部がいた位置はそのままに、中身を ids の順に入れ替えた新しい配列（ほかの物の位置は変えない）
export function reorderWithin(list, ids) {
  const set = new Set(ids);
  const byId = new Map((list || []).map((x) => [x.id, x]));
  const queue = ids.map((id) => byId.get(id)).filter(Boolean);
  return (list || []).map((x) => (set.has(x.id) ? queue.shift() : x));
}

// ---------- 予定（Add plan）から場所ノートへ ----------
// 店の種類の予定（Food / Bar / Sight / Activity / Shop）は「店」、Stay は「宿」にも入れられる
export const PLAN_TO_SPOT_KINDS = ['food', 'bar', 'sight', 'activity', 'shop'];
export function placeTargetOf(kind) {
  if (PLAN_TO_SPOT_KINDS.includes(kind)) return 'spot';
  return kind === 'stay' ? 'stay' : null;
}

// 名前が同じもの（ひらがな / カタカナ・全角 / 半角・大文字 / 小文字・前後の空白は区別しない）
export function findByName(list, name) {
  const n = normalizeForSearch(name).trim();
  if (!n) return null;
  return (list || []).find((x) => normalizeForSearch(x.name).trim() === n) || null;
}

// 予定を場所ノートに入れる。同じ名前があれば新しく作らず、店ならその店とつなぐ。
// 戻り値 { target: 'spot' | 'stay' | null, spotId, created }。新しい店は Want to go
export function addPlanToPlace(place, { title, kind, url = '' }, makeId) {
  const target = placeTargetOf(kind);
  const name = String(title || '').trim();
  if (!place || !target || !name) return { target: null, spotId: null, created: false };
  if (target === 'spot') {
    const hit = findByName(place.spots, name);
    if (hit) return { target, spotId: hit.id, created: false };
    const spot = { id: makeId(), name, kind, status: 'want', note: '', hours: '', url: url || '', phone: '', area: '' };
    (place.spots ||= []).push(spot);
    return { target, spotId: spot.id, created: true };
  }
  if (findByName(place.stays, name)) return { target, spotId: null, created: false };
  (place.stays ||= []).push({ id: makeId(), name, area: '', note: '', url: url || '', phone: '' });
  return { target, spotId: null, created: true };
}

