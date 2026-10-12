// AI 取り込み（A スクショ・B メモ）の決まり（画面と分けた純粋な関数）
//
// 個人情報
//   ・送る前：メモの文の中のメールアドレス・電話番号・カード番号・予約番号などを伏せ字にする（maskForAI）
//   ・受け取った後：予約番号・パスポート・会員番号・カード番号・生年月日・メールアドレスは、
//     AI の結果に入っていても取り除く（stripPersonal）。入力欄にも入れず、保存もしない
//   ・booking.referenceNo は送らないし、AI の結果からも入れない（いつも空）
import { tripDates } from './trips.js';
import { foreignToYen, rateFor } from './money.js';
import { YEN, CURRENCIES } from '../labels.js';
import { safeUrl } from './url.js';

export const UNSCHEDULED = 'unscheduled';
export const MAX_SCREENSHOTS = 3;
export const MASK = '••••';

// ---------- 個人情報 ----------
const W = '0-9A-Za-z０-９Ａ-Ｚａ-ｚ';
// 番号のことば（この後ろの英数字を番号とみなす）
const KEYWORDS = [
  '予約番号', '予約No\\.?', '予約ナンバー', '予約コード', '予約ID', '予約記録番号', '確認番号', '確認コード', '照会番号', '申込番号', '受付番号', 'お問い合わせ番号', '購入番号', '注文番号',
  'booking\\s*(?:ref(?:erence)?|no\\.?|number|code|id)', 'confirmation\\s*(?:no\\.?|number|code|#)?', 'reservation\\s*(?:no\\.?|number|code|id|#)?',
  'reference\\s*(?:no\\.?|number|code)?', 'ref\\.?\\s*no\\.?', 'PNR', 'e-?ticket\\s*(?:no\\.?|number)?', '航空券番号', 'eチケット番号',
  '会員番号', '会員No\\.?', '会員ID', 'お客様番号', 'マイレージ(?:番号|No\\.?|ID)?', 'member(?:ship)?\\s*(?:no\\.?|number|id|#)', 'frequent\\s*flyer\\s*(?:no\\.?|number|#)?',
  'パスポート(?:番号|No\\.?)?', '旅券番号', 'passport\\s*(?:no\\.?|number|#)?',
  'カード番号', 'card\\s*(?:no\\.?|number|#)',
  '生年月日', 'date\\s*of\\s*birth', 'DOB', 'birth\\s*date',
];
// 英字は大文字・小文字のどちらでも（i フラグを使わないのは、下の「大文字だけの番号」を見分けるため）
const ci = (src) => src.replace(/(\\.)|([A-Za-z])/g, (m, esc, ch) => esc || `[${ch.toLowerCase()}${ch.toUpperCase()}]`);
// 番号：数字を含む英数字のかたまり、大文字・数字だけの5〜8文字（例 ABCDEF）、または伏せ字にした後の ••••
const TOKEN = `(?:(?=[${W}\\-‐/／.年月日]*[0-9０-９])[${W}][${W}\\-‐/／.年月日]{2,40}|[A-Z0-9]{5,8}(?![${W}])|••••)`;
const KEYWORD_VALUE = new RegExp(`(?<![A-Za-z])(${KEYWORDS.map(ci).join('|')})(\\s*[:：#＃]?\\s*)${TOKEN}`, 'g');
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const CARD = /(?<![0-9])(?:\d[ -]?){12,18}\d(?![0-9])/g;
const PASSPORT = /(?<![A-Za-z0-9])[A-Z]{2}\d{7}(?![A-Za-z0-9])/g;
const PHONE = /(?<![0-9])(?:\+\d{1,3}[ -]?)?\(?0?\d{1,4}\)?[ -]?\d{1,4}[ -]?\d{3,4}(?![0-9])/g;
const digits = (s) => (s.match(/\d/g) || []).length;

// 送る前：伏せ字にする（文の形は残す）
export function maskForAI(text) {
  if (typeof text !== 'string') return '';
  return text
    .replace(KEYWORD_VALUE, (m, kw, sep) => `${kw}${sep}${MASK}`)
    .replace(EMAIL, MASK)
    .replace(CARD, (m) => (digits(m) >= 13 ? MASK : m))
    .replace(PASSPORT, MASK)
    .replace(PHONE, (m) => (digits(m) >= 10 && digits(m) <= 13 ? MASK : m));
}

// 受け取った後：番号などを取り除く（ことばごと消す）。電話番号は宿などの番号のことがあるので残す
export function stripPersonal(text) {
  if (typeof text !== 'string') return '';
  return text
    .replace(KEYWORD_VALUE, '')
    .replace(EMAIL, '')
    .replace(CARD, (m) => (digits(m) >= 13 ? '' : m))
    .replace(PASSPORT, '')
    .replace(new RegExp(MASK, 'g'), '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/^[ \t]*[:：,、・]?[ \t]*$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// オブジェクトの文字の項目をすべて stripPersonal に通す
function stripAll(o) {
  const out = {};
  for (const [k, v] of Object.entries(o)) out[k] = typeof v === 'string' ? stripPersonal(v) : v;
  return out;
}

// ---------- 送るもの ----------
// 旅の情報（日付の年や、旅の中の日を決めるため）。予約番号や画像は入れない
export function aiContext(trip, places, today) {
  return {
    today,
    tripTitle: String(trip?.title || '').slice(0, 200),
    startDate: trip?.startDate || '',
    endDate: trip?.endDate || '',
    places: (trip?.placeIds || []).map((id) => places.find((p) => p.id === id)?.name).filter(Boolean).slice(0, 10),
  };
}

// ---------- A. スクショ取り込み ----------
const BOOKING_KINDS = ['flight', 'train', 'bus', 'ferry', 'car', 'stay', 'activity', 'other'];
export const SAVE_MODES = ['booked', 'considering', 'candidate'];
export const SAVE_MODE_LABELS = { booked: '予約済みで追加', considering: '検討中で追加', candidate: '候補に追加' };

// 旅の日に入っていれば、その日。なければ日程未定
export function dayFor(trip, date) {
  return date && tripDates(trip).includes(date) ? date : UNSCHEDULED;
}

const normCurrency = (c) => {
  const x = String(c || '').toUpperCase();
  if (!x || x === 'YEN' || x === '円' || x === '¥') return YEN;
  return /^[A-Z]{3}$/.test(x) ? x : YEN;
};

// AI の結果 → 確認画面で直せる下書き
export function screenshotDrafts(result, trip) {
  return (Array.isArray(result?.bookings) ? result.bookings : []).filter((x) => x && typeof x === 'object').map((raw) => {
    const b = stripAll(raw);
    const isStay = b.kind === 'stay';
    const extra = [
      b.fareNote,
      isStay && (b.endDate || b.endTime) ? `チェックアウト ${[b.endDate, b.endTime].filter(Boolean).join(' ')}` : '',
      !isStay && b.endDate && b.endDate !== b.date ? `到着 ${b.endDate}` : '',
      b.note,
    ].filter(Boolean).join('\n');
    return {
      include: true,
      mode: b.status === 'booked' ? 'booked' : 'considering',
      kind: BOOKING_KINDS.includes(b.kind) ? b.kind : 'other',
      title: b.title || [b.number, b.from && b.to ? `${b.from} → ${b.to}` : ''].filter(Boolean).join(' ') || '予約',
      day: dayFor(trip, b.date),
      date: b.date || '',
      time: b.time || '',
      endTime: isStay ? '' : (b.endTime || ''),
      from: b.from || '',
      to: b.to || '',
      number: b.number || '',
      provider: b.provider || '',
      price: Number.isFinite(b.price) ? b.price : null,
      currency: normCurrency(b.currency),
      miles: Number.isFinite(b.miles) && b.miles > 0 ? b.miles : null,
      cancelPolicy: b.cancelPolicy || '',
      payNote: b.payNote || '',
      note: extra,
      url: safeUrl(b.url),
    };
  });
}

// 金額 → 円。外貨はレートで換算（レートがなければ null）。もとの金額はメモに残す
export function priceToYen(draft, trip, settings) {
  if (!Number.isFinite(draft.price)) return { yen: null, memo: '' };
  if (draft.currency === YEN) return { yen: Math.round(draft.price), memo: '' };
  const rate = rateFor(draft.currency, trip, settings);
  const memo = `${draft.currency} ${draft.price.toLocaleString('en-US')}${rate ? '' : '（レート未設定のため円にしていません）'}`;
  return { yen: rate ? foreignToYen(draft.price, rate) : null, memo };
}

const join = (...xs) => xs.filter(Boolean).join('\n');

// 下書き → 予定（予約済み・検討中）。referenceNo はいつも空
export function draftToItem(draft, trip, settings, id) {
  const d = stripAll(draft);
  const { yen, memo } = priceToYen(draft, trip, settings);
  return {
    id,
    title: d.title || '予約',
    kind: d.kind,
    time: /^\d{2}:\d{2}$/.test(d.time) ? d.time : null,
    endTime: /^\d{2}:\d{2}$/.test(d.endTime) ? d.endTime : null,
    slot: null,
    status: d.mode === 'booked' ? 'booked' : 'considering',
    spotId: null,
    note: '',
    url: safeUrl(d.url),
    booking: {
      provider: d.provider,
      from: d.from,
      to: d.to,
      number: d.number,
      priceYen: yen,
      miles: Number.isFinite(draft.miles) ? draft.miles : null,
      cancelPolicy: d.cancelPolicy,
      payNote: d.payNote,
      referenceNo: '',
      note: join(memo, d.note),
    },
    attachments: [],
  };
}

// 下書き → 候補（candidates）
export function draftToCandidate(draft, trip, settings, id) {
  const d = stripAll(draft);
  const { yen, memo } = priceToYen(draft, trip, settings);
  const when = [d.date, d.time && `${d.time}${d.endTime ? `–${d.endTime}` : ''}`].filter(Boolean).join(' ');
  const detail = join(
    when,
    d.from || d.to ? `${d.from} → ${d.to}` : '',
    d.number,
    yen !== null ? `${yen.toLocaleString('ja-JP')}円` : '',
    memo,
    draft.miles ? `${draft.miles.toLocaleString('en-US')} mi` : '',
    d.cancelPolicy && `キャンセル：${d.cancelPolicy}`,
    d.provider,
    d.note,
  );
  return { id, title: d.title || '候補', detail, url: safeUrl(d.url) };
}

// 保存：include の物だけ。予定は日（または日程未定）に、候補は candidates に
export function applyScreenshotDrafts(trip, drafts, settings, makeId, itemsOf) {
  let added = 0;
  for (const dr of drafts) {
    if (!dr.include) continue;
    if (dr.mode === 'candidate') (trip.candidates ||= []).push(draftToCandidate(dr, trip, settings, makeId()));
    else itemsOf(trip, dr.day || UNSCHEDULED).push(draftToItem(dr, trip, settings, makeId()));
    added++;
  }
  return added;
}

// ---------- B. メモ貼り付け ----------
export const MEMO_DESTS = ['plan', 'booking', 'packing', 'todo', 'memo', 'unsorted'];
export const MEMO_DEST_LABELS = { plan: '予定', booking: '予約', packing: '持ち物', todo: 'To do', memo: 'Memo', unsorted: 'Unsorted' };
const ITEM_KINDS = ['flight', 'train', 'bus', 'ferry', 'car', 'stay', 'food', 'bar', 'sight', 'activity', 'shop', 'clothes', 'todo', 'other'];
const SLOTS = ['morning', 'afternoon', 'evening', 'night', 'anytime'];

export function memoDrafts(result, trip) {
  return (Array.isArray(result?.entries) ? result.entries : []).map((raw) => {
    // 形の違う結果が来ても落ちないように、文字の項目は文字にそろえる
    const e = stripAll(raw && typeof raw === 'object' ? raw : {});
    const text = typeof e.text === 'string' ? e.text : '';
    const title = typeof e.title === 'string' ? e.title : '';
    return {
      include: true,
      dest: MEMO_DESTS.includes(e.dest) ? e.dest : 'unsorted',
      title: title || text.split('\n')[0] || '',
      text: text || title,
      note: typeof e.note === 'string' ? e.note : '',
      day: dayFor(trip, e.date),
      time: /^\d{2}:\d{2}$/.test(e.time) ? e.time : '',
      slot: SLOTS.includes(e.slot) ? e.slot : '',
      kind: ITEM_KINDS.includes(e.kind) ? e.kind : '',
    };
  }).filter((d) => d.title || d.text);
}

// 予定・予約のメモ欄：補足、なければ（タイトルと違えば）もとの文
const itemNote = (d) => d.note || (d.text && d.text !== d.title ? d.text : '');

export function applyMemoDrafts(trip, drafts, makeId, itemsOf) {
  const counts = { plan: 0, booking: 0, packing: 0, todo: 0, memo: 0, unsorted: 0 };
  for (const raw of drafts) {
    if (!raw.include) continue;
    const d = stripAll(raw);
    const title = d.title || d.text.split('\n')[0];
    if (!title && !d.text) continue;
    const item = (status, kind, booking) => ({
      id: makeId(), title, kind, time: d.time || null, endTime: null, slot: d.time ? null : (d.slot || null),
      status, spotId: null, note: booking ? '' : itemNote(d), url: '', booking, attachments: [],
    });
    switch (d.dest) {
      case 'plan':
        itemsOf(trip, d.day || UNSCHEDULED).push(item(null, d.kind || 'other', null));
        break;
      case 'booking':
        itemsOf(trip, d.day || UNSCHEDULED).push(item('considering', d.kind || 'other', {
          provider: '', from: '', to: '', number: '', priceYen: null, miles: null, cancelPolicy: '', payNote: '', referenceNo: '', note: itemNote(d),
        }));
        break;
      case 'packing':
        (trip.packingExtras ||= []).push({ id: makeId(), name: title, checked: false });
        break;
      case 'todo':
        (trip.todos ||= []).push({ id: makeId(), text: title, done: false });
        break;
      case 'memo':
        (trip.memos ||= []).push({ id: makeId(), text: d.text || title, attachments: [] });
        break;
      default:
        (trip.unsortedNotes ||= []).push(d.text || title);
    }
    counts[MEMO_DESTS.includes(d.dest) ? d.dest : 'unsorted']++;
  }
  return counts;
}

// 「予定2・持ち物3を追加しました」
export function savedSummary(counts) {
  const parts = MEMO_DESTS.filter((k) => counts[k]).map((k) => `${MEMO_DEST_LABELS[k]}${counts[k]}`);
  return parts.length ? `${parts.join('・')}を追加しました` : '追加したものはありません';
}

// ---------- うまくいかなかったとき ----------
export function aiErrorMessage(code, { status = 0, limit = 20 } = {}) {
  switch (code) {
    case 'disabled': return 'AI がオフになっています。Settings > AI でオンにしてください';
    case 'no_token': return 'Settings > AI で合言葉を入れてください';
    case 'offline': return 'インターネットにつながっていません。つながってから、もう一度試してください';
    case 'timeout': return '時間がかかりすぎたので止めました。もう一度試してください';
    case 'unauthorized': return '合言葉が違います。Settings > AI の合言葉を確かめてください';
    case 'limit': return `今日の AI の回数（${limit}回）を使い切りました。明日（日本時間の0時すぎ）にまた使えます`;
    case 'too_large': return '画像（または文）が大きすぎます。枚数を減らすか、文を短くしてください';
    case 'refusal': return '読み取れませんでした（AI が答えられない内容でした）';
    case 'bad_output':
    case 'too_long': return 'AI の答えをうまく読めませんでした。もう一度試してください';
    case 'busy': return 'AI が混み合っています。少し待ってから、もう一度試してください';
    case 'forbidden': return 'この場所からは AI を使えません（ホーム画面の TripNote から使ってください）';
    case 'not_configured': return 'AI の準備ができていません（Worker の設定がまだです）';
    case 'too_many_images': return `画像は${MAX_SCREENSHOTS}枚まで選べます`;
    case 'image': return '画像を読み込めませんでした';
    default:
      if (status === 401) return aiErrorMessage('unauthorized');
      if (status === 429) return aiErrorMessage('limit', { limit });
      return 'AI につながりませんでした。少し待ってから、もう一度試してください';
  }
}

// 状態コードとエラーの code → 画面に出す code
export function errorCodeOf(status, code) {
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  if (status === 429) return 'limit';
  if (status === 413) return 'too_large';
  if (status === 422) return 'refusal';
  if (status === 503 && code === 'not_configured') return 'not_configured';
  if (status === 503) return 'busy';
  if (['bad_output', 'too_long'].includes(code)) return code;
  return 'upstream';
}

// 選べる通貨（円・7つ・AI が返した一覧にない通貨）
export function currencyOptions(current) {
  const list = [YEN, ...CURRENCIES];
  return current && !list.includes(current) ? [...list, current] : list;
}
