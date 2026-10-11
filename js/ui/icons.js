// 線のアイコン（24×24、色は文字色に従う）。絵文字は使わない
const paths = {
  trips: '<rect x="3.5" y="7.5" width="17" height="12" rx="3"/><path d="M9 7.5V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1.5"/><path d="M3.5 13h17"/>',
  places: '<path d="M12 21s-6.5-5.6-6.5-11A6.5 6.5 0 0 1 18.5 10c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  packing: '<rect x="5" y="3.5" width="14" height="17" rx="2.5"/><path d="M8.5 9l1.5 1.5L13 7.5"/><path d="M8.5 15l1.5 1.5L13 13.5"/><path d="M15 9.5h1M15 15.5h1"/>',
  money: '<rect x="3.5" y="6" width="17" height="13" rx="2.5"/><path d="M3.5 10h17"/><path d="M15 14.5h2"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  chevron: '<path d="M9 5l7 7-7 7"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  image: '<rect x="3.5" y="5" width="17" height="14" rx="2.5"/><circle cx="9" cy="10" r="1.6"/><path d="M20.5 16l-5-5-8 8"/>',
  grip: '<path d="M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01" stroke-width="3"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1"/><path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1"/>',
  // 予定の種類
  flight: '<path d="M10.5 13.5L4 11l1.2-1.2 7.3.8 4-4a1.8 1.8 0 0 1 2.5 2.5l-4 4 .8 7.3L14.6 21l-2.5-6.5"/>',
  train: '<rect x="6" y="3.5" width="12" height="14" rx="3"/><path d="M6 11h12"/><path d="M9.5 14.5h.01M14.5 14.5h.01" stroke-width="2.4"/><path d="M8.5 17.5L7 20.5M15.5 17.5l1.5 3"/>',
  bus: '<rect x="4.5" y="4" width="15" height="14" rx="2.5"/><path d="M4.5 11h15M4.5 7.5h15"/><path d="M8 15h.01M16 15h.01" stroke-width="2.4"/><path d="M7 18v2M17 18v2"/>',
  ferry: '<path d="M3 17c1.5 1.3 3 1.3 4.5 0s3-1.3 4.5 0 3 1.3 4.5 0 3-1.3 4.5 0"/><path d="M5 14l1.5-5h11L19 14"/><path d="M9 9V6h6v3"/>',
  car: '<path d="M5 16V12l2-5h10l2 5v4"/><path d="M3.5 12h17v4.5h-17z"/><path d="M7.5 19v-2.5M16.5 19v-2.5"/><path d="M7 14h.01M17 14h.01" stroke-width="2.4"/>',
  stay: '<path d="M3.5 19V7"/><path d="M3.5 14h17v5"/><path d="M3.5 11h7a3 3 0 0 1 3 3"/><circle cx="7" cy="9.5" r="1.5"/>',
  food: '<path d="M7 3.5v8M4.5 3.5v5a2.5 2.5 0 0 0 5 0v-5"/><path d="M7 11.5v9"/><path d="M17 20.5V3.5c-2 1-3 3.5-3 6.5v3h3"/>',
  bar: '<path d="M5 4h14l-7 8z"/><path d="M12 12v7.5M8.5 20h7"/>',
  sight: '<path d="M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  activity: '<path d="M4 19l5-9 3.5 5 2.5-3.5L20 19z"/><circle cx="16.5" cy="6.5" r="2"/>',
  shop: '<path d="M5 8h14l-1 12H6z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/>',
  todo: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8.5 12.5l2.5 2.5 4.5-5"/>',
  other: '<circle cx="12" cy="12" r="8"/><path d="M8.5 12h.01M12 12h.01M15.5 12h.01" stroke-width="2.4"/>',
};

export function icon(name) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || ''}</svg>`;
}

// data-icon="name" の要素にアイコンを入れる
export function fillIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach((el) => {
    if (!el.firstChild) el.innerHTML = icon(el.dataset.icon);
  });
}
