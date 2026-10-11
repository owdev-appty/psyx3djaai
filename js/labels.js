// 画面の表記（承認済みの表記一覧より）

export const KINDS = ['flight', 'train', 'bus', 'ferry', 'car', 'stay', 'food', 'bar', 'sight', 'activity', 'shop', 'clothes', 'todo', 'other'];
export const KIND_LABELS = {
  flight: 'Flight', train: 'Train', bus: 'Bus', ferry: 'Ferry', car: 'Car', stay: 'Stay', food: 'Food',
  bar: 'Bar', sight: 'Sight', activity: 'Activity', shop: 'Shop', clothes: 'Clothes', todo: 'To do', other: 'Other',
};

// 予定のカードの色分け（Plan と Bookings で同じ）。ここにない種類は色なし
export const KIND_GROUP = {
  flight: 'transport', train: 'transport', bus: 'transport', ferry: 'transport', car: 'transport',
  stay: 'stay', food: 'food', bar: 'bar',
};
export const KIND_GROUP_LABELS = { transport: '交通', stay: '宿', food: '食事', bar: 'バー' };

// 持ち物の「忘れると困る」（mustHave）の表記
export const MUST_LABEL = 'MUST!';

// 予定の状態
export const ITEM_STATUSES = ['booked', 'considering', 'todo', 'done', 'skipped'];
export const ITEM_STATUS_LABELS = { booked: '予約済み', considering: '検討中', todo: 'To do', done: 'Done', skipped: 'Skipped' };

// 旅の状態
export const TRIP_STATUSES = ['idea', 'planning', 'booked', 'done', 'cancelled'];
export const TRIP_STATUS_LABELS = { idea: 'Idea', planning: 'Planning', booked: 'Booked', done: 'Done', cancelled: 'Cancelled' };

// 支出の分類（依頼文の表記のまま）
export const EXPENSE_CATEGORIES = ['transport', 'stay', 'food', 'souvenir', 'activity', 'other'];
export const EXPENSE_CATEGORY_LABELS = { transport: '交通', stay: '宿泊', food: '食事・飲み', souvenir: '土産', activity: '体験', other: 'その他' };

// 支払い（現金とカードは分けない）
export const PAYMENTS = ['cashcard', 'miles', 'subsidy'];
export const PAYMENT_LABELS = { cashcard: '現金・カード', miles: 'マイル', subsidy: '補助・クーポン' };

// 外貨（選べるのはこの7つだけ。円はレートなしで使う）
export const YEN = 'JPY';
export const CURRENCIES = ['VND', 'TWD', 'USD', 'KRW', 'THB', 'EUR', 'SGD'];
export const CURRENCY_NAMES = {
  JPY: '円', VND: 'ベトナムドン', TWD: '台湾ドル', USD: '米ドル', KRW: '韓国ウォン', THB: 'タイバーツ', EUR: 'ユーロ', SGD: 'シンガポールドル',
};
// "TWD（台湾ドル）"。円は「円」。一覧にない通貨（古いデータ）はコードだけ
export function currencyLabel(code) {
  if (code === YEN) return CURRENCY_NAMES.JPY;
  return CURRENCY_NAMES[code] ? `${code}（${CURRENCY_NAMES[code]}）` : String(code || '');
}
