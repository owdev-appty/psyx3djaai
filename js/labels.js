// 画面の表記（承認済みの表記一覧より）

export const KINDS = ['flight', 'train', 'bus', 'ferry', 'car', 'stay', 'food', 'bar', 'sight', 'activity', 'shop', 'todo', 'other'];
export const KIND_LABELS = {
  flight: 'Flight', train: 'Train', bus: 'Bus', ferry: 'Ferry', car: 'Car', stay: 'Stay', food: 'Food',
  bar: 'Bar', sight: 'Sight', activity: 'Activity', shop: 'Shop', todo: 'To do', other: 'Other',
};

// 予定の状態
export const ITEM_STATUSES = ['booked', 'considering', 'todo', 'done', 'skipped'];
export const ITEM_STATUS_LABELS = { booked: '予約済み', considering: '検討中', todo: 'To do', done: 'Done', skipped: 'Skipped' };

// 旅の状態
export const TRIP_STATUSES = ['idea', 'planning', 'booked', 'done', 'cancelled'];
export const TRIP_STATUS_LABELS = { idea: 'Idea', planning: 'Planning', booked: 'Booked', done: 'Done', cancelled: 'Cancelled' };
