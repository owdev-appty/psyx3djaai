// 場所の画面：Notes to self / 移動のコツ / 店 / 宿 / 過去の旅
import { icon } from '../ui/icons.js';
import { esc } from '../ui/dom.js';
import { store } from '../appStore.js';
import { newId } from '../store.js';
import { openFormSheet } from '../ui/formSheet.js';
import { makeSortable } from '../ui/sortable.js';
import { getUi, setUi } from '../uiState.js';
import { kindClass, kindIcon, kindLabel, SPOT_STATUS_CHIP } from '../ui/kind.js';
import { toISODate } from '../logic/dates.js';
import { nights } from '../logic/trips.js';
import { tripTotals, formatYen } from '../logic/money.js';
import {
  placeStats, filterSpots, groupSpotsByArea, renameArea, removeArea, removeSpot, mapUrl, telHref,
  pastTripsForPlace, reorderList,
} from '../logic/places.js';
import { SPOT_KINDS, SPOT_KIND_LABELS, SPOT_STATUSES, SPOT_STATUS_LABELS } from '../labels.js';
import { dateRange } from './home.js';
import { hostOf } from './tripPlan.js';
import { openPlaceForm } from './places.js';
import { openAddToPlan } from './addToPlan.js';

const TABS = [['notes', 'Notes to self'], ['tips', '移動のコツ'], ['spots', '店'], ['stays', '宿'], ['trips', '過去の旅']];

// 場所を書き換える
function updatePlace(placeId, fn) {
  store.update((d) => {
    const p = d.places.find((x) => x.id === placeId);
    if (p) fn(p, d);
  });
}

const linkHtml = (url) => (url ? `<a class="item-link" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${icon('link')}<span>${esc(hostOf(url))}</span></a>` : '');
const empty = '<p class="empty-line">まだありません</p>';
const addBtn = (act, label = '＋ Add') => `<button type="button" class="btn btn-secondary btn-block add-under" data-act="${act}">${label}</button>`;

// ---------- Notes to self と Links ----------
function notesTab(place) {
  const tripTitle = (id) => store.data.trips.find((t) => t.id === id)?.title;
  return `
    ${(place.notesToSelf || []).length ? `
      <ul class="cards sortable" data-list="notesToSelf">
        ${place.notesToSelf.map((n) => `
          <li class="note-card" data-id="${esc(n.id)}">
            <span class="drag" aria-label="並べ替え" role="img">${icon('grip')}</span>
            <button type="button" class="note-main" data-act="edit-note">
              <span class="note-text">${esc(n.text || '')}</span>
              ${n.fromTripId && tripTitle(n.fromTripId) ? `<span class="note-from">${esc(tripTitle(n.fromTripId))}から</span>` : ''}
            </button>
          </li>`).join('')}
      </ul>` : empty}
    ${addBtn('add-note')}
    <section class="section" aria-labelledby="sec-links">
      <h2 class="section-title" id="sec-links">Links</h2>
      ${(place.links || []).length ? `
        <ul class="list card">
          ${place.links.map((l, i) => `
            <li class="link-row" data-index="${i}">
              <button type="button" class="row-link row-btn" data-act="edit-link">
                <span class="row-main"><span class="row-title">${esc(l.title || hostOf(l.url) || '（名前なし）')}</span><span class="row-sub">${esc(hostOf(l.url || ''))}</span></span>
              </button>
              ${l.url ? `<a class="icon-btn" href="${esc(l.url)}" target="_blank" rel="noopener noreferrer" aria-label="${esc(l.title || 'Link')}">${icon('link')}</a>` : ''}
            </li>`).join('')}
        </ul>` : ''}
      ${addBtn('add-link')}
    </section>`;
}

// ---------- 移動のコツ ----------
function tipsTab(place) {
  return `
    ${(place.transportTips || []).length ? `
      <ul class="cards sortable" data-list="transportTips">
        ${place.transportTips.map((t) => `
          <li class="pcard" data-id="${esc(t.id)}">
            <span class="drag" aria-label="並べ替え" role="img">${icon('grip')}</span>
            <div class="pcard-body">
              <button type="button" class="pcard-main" data-act="edit-tip">
                ${t.title ? `<span class="pcard-title">${esc(t.title)}</span>` : ''}
                ${t.text ? `<span class="pcard-text">${esc(t.text)}</span>` : ''}
              </button>
              ${linkHtml(t.url)}
            </div>
          </li>`).join('')}
      </ul>` : empty}
    ${addBtn('add-tip')}`;
}

// ---------- 店 ----------
function spotCard(s, place) {
  const status = SPOT_STATUS_LABELS[s.status] ? `<span class="status-chip ${SPOT_STATUS_CHIP[s.status]}">${SPOT_STATUS_LABELS[s.status]}</span>` : '';
  const since = s.status === 'nextTime' && s.sinceYear ? `<span class="row-sub">${esc(s.sinceYear)}年から</span>` : '';
  const tel = telHref(s.phone);
  return `
    <li class="pcard spot ${kindClass(s.kind)}" data-id="${esc(s.id)}">
      <div class="pcard-body">
        <button type="button" class="pcard-main" data-act="edit-spot">
          <span class="item-head">${kindIcon(s.kind)}${kindLabel(s.kind)}<span class="item-title">${esc(s.name || '（名前なし）')}</span>${status}</span>
          ${since}
          ${s.hours ? `<span class="pcard-sub mono">${esc(s.hours)}</span>` : ''}
          ${s.note ? `<span class="pcard-text">${esc(s.note)}</span>` : ''}
        </button>
        <div class="spot-actions">
          <a class="btn btn-small btn-secondary" href="${esc(mapUrl(s, place))}" target="_blank" rel="noopener noreferrer">${icon('map')}Map</a>
          ${tel ? `<a class="btn btn-small btn-secondary" href="${esc(tel)}">${icon('phone')}Call</a>` : ''}
          <button type="button" class="btn btn-small btn-secondary" data-act="add-to-plan">${icon('plusCircle')}Add to plan</button>
        </div>
      </div>
    </li>`;
}

function spotsTab(place) {
  const filter = getUi(`spotFilter:${place.id}`);
  const spots = filterSpots(place.spots || [], SPOT_STATUSES.includes(filter) ? filter : null);
  const groups = groupSpotsByArea(place, spots);
  const hasAreas = (place.areas || []).length > 0;
  return `
    <div class="chips chips-scroll" role="group" aria-label="Status">
      <button type="button" class="chip" data-spot-filter="" aria-pressed="${!SPOT_STATUSES.includes(filter)}">All</button>
      ${SPOT_STATUSES.map((s) => `<button type="button" class="chip" data-spot-filter="${s}" aria-pressed="${filter === s}">${SPOT_STATUS_LABELS[s]}</button>`).join('')}
    </div>
    ${groups.map((g) => `
      ${hasAreas ? `
        <section class="area" ${g.area ? `data-area="${esc(g.area.id)}"` : ''}>
          <div class="area-head">
            <h2 class="section-title">${g.area ? esc(g.area.name) : 'エリアなし'}</h2>
            ${g.area ? '<button type="button" class="btn btn-small btn-secondary" data-act="edit-area">Edit</button>' : ''}
          </div>
          ${g.area?.text ? `<button type="button" class="area-text" data-act="toggle-area" aria-expanded="false"><span class="area-text-inner">${esc(g.area.text)}</span></button>` : ''}
          ${g.spots.length ? `<ul class="cards">${g.spots.map((s) => spotCard(s, place)).join('')}</ul>` : ''}
        </section>` : g.spots.length ? `<ul class="cards">${g.spots.map((s) => spotCard(s, place)).join('')}</ul>` : ''}`).join('')}
    ${!spots.length && !hasAreas ? empty : ''}
    <div class="two-buttons">
      ${addBtn('add-spot')}
      ${addBtn('add-area', '＋ エリア')}
    </div>`;
}

// ---------- 宿 ----------
function staysTab(place) {
  return `
    ${(place.stays || []).length ? `
      <ul class="cards">
        ${place.stays.map((s) => `
          <li class="pcard kind-stay" data-id="${esc(s.id)}">
            <div class="pcard-body">
              <button type="button" class="pcard-main" data-act="edit-stay">
                <span class="item-head">${kindIcon('stay')}${kindLabel('stay')}<span class="item-title">${esc(s.name || '（名前なし）')}</span></span>
                ${s.area ? `<span class="pcard-sub">${esc(s.area)}</span>` : ''}
                ${s.note ? `<span class="pcard-text">${esc(s.note)}</span>` : ''}
              </button>
              <div class="spot-actions">
                ${s.url ? `<a class="btn btn-small btn-secondary" href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${icon('link')}${esc(hostOf(s.url))}</a>` : ''}
                ${telHref(s.phone) ? `<a class="btn btn-small btn-secondary" href="${esc(telHref(s.phone))}">${icon('phone')}Call</a>` : ''}
              </div>
            </div>
          </li>`).join('')}
      </ul>` : empty}
    ${addBtn('add-stay')}`;
}

// ---------- 過去の旅 ----------
function tripsTab(place) {
  const today = toISODate(new Date());
  const list = pastTripsForPlace(store.data.trips, place.id, today);
  if (!list.length) return empty;
  const settings = store.data.settings;
  return `
    <div class="card compare">
      <table>
        <thead><tr><th scope="col"></th><th scope="col">泊数</th><th scope="col">合計</th><th scope="col">1泊あたり</th></tr></thead>
        <tbody>
          ${list.map((t) => {
            const n = nights(t);
            const { yen } = tripTotals(t, settings);
            return `
              <tr class="${t.status === 'cancelled' ? 'is-cancelled' : ''}" data-trip="${esc(t.id)}">
                <th scope="row"><a class="compare-title" href="#/trip/${esc(t.id)}/plan">${esc(t.title || '（名前なし）')}</a><span class="compare-date mono">${esc(dateRange(t, { yearIfNotThisYear: true }))}</span></th>
                <td class="num">${n ?? '–'}</td>
                <td class="num">${formatYen(yen)}</td>
                <td class="num">${n ? formatYen(Math.round(yen / n)) : '–'}</td>
              </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;
}

// ---------- シート ----------
function areaOptions(place, current) {
  const names = (place.areas || []).map((a) => a.name);
  const opts = [['', 'エリアなし'], ...names.map((n) => [n, n])];
  if (current && !names.includes(current)) opts.push([current, current]);
  return opts;
}

function openSpotForm(place, spot, done) {
  const isNew = !spot;
  const s = spot || { name: '', kind: 'food', status: 'want', area: '', hours: '', note: '', url: '', phone: '' };
  openFormSheet({
    title: isNew ? 'Add' : 'Edit',
    fields: [
      { name: 'name', label: 'Name', value: s.name, required: true },
      { name: 'kind', label: 'Kind', type: 'choice', value: s.kind, required: true, options: SPOT_KINDS.map((k) => [k, SPOT_KIND_LABELS[k]]) },
      { name: 'status', label: 'Status', type: 'choice', value: s.status, required: true, options: SPOT_STATUSES.map((k) => [k, SPOT_STATUS_LABELS[k]]) },
      { name: 'sinceYear', label: 'Since', type: 'number', value: s.sinceYear ?? '', hint: '「Next time!」になった年（例：2022）', showIf: { name: 'status', values: ['nextTime'] } },
      { name: 'area', label: 'Area', type: 'select', value: s.area || '', options: areaOptions(place, s.area) },
      { name: 'hours', label: 'Hours', value: s.hours },
      { name: 'note', label: 'Note', type: 'textarea', value: s.note },
      { name: 'url', label: 'Link', type: 'url', value: s.url },
      { name: 'phone', label: 'Phone', type: 'tel', value: s.phone },
    ],
    onSave(v) {
      const year = v.sinceYear ? Number(v.sinceYear) : null;
      if (v.status === 'nextTime' && v.sinceYear && !(year >= 1900 && year <= 2200)) return 'Since は西暦4桁で入れてください';
      const fields = { name: v.name, kind: v.kind, status: v.status, area: v.area, hours: v.hours, note: v.note, url: v.url, phone: v.phone, sinceYear: v.status === 'nextTime' ? year : (s.sinceYear ?? null) };
      updatePlace(place.id, (p) => {
        p.spots ||= [];
        if (isNew) p.spots.push({ id: newId(), ...fields });
        else { const i = p.spots.findIndex((x) => x.id === s.id); if (i >= 0) p.spots[i] = { ...p.spots[i], ...fields }; }
      });
      done();
    },
    onDelete: isNew ? null : () => { store.update((d) => removeSpot(d, place.id, s.id)); done(); },
    deleteName: s.name,
  });
}

function openSimpleForm(place, key, item, fields, title, done, deleteName) {
  const isNew = !item;
  openFormSheet({
    title: title || (isNew ? 'Add' : 'Edit'),
    fields,
    onSave(v) {
      updatePlace(place.id, (p) => {
        p[key] ||= [];
        if (isNew) p[key].push({ id: newId(), ...v });
        else { const i = p[key].findIndex((x) => x.id === item.id); if (i >= 0) p[key][i] = { ...p[key][i], ...v }; }
      });
      done();
    },
    onDelete: isNew ? null : () => { updatePlace(place.id, (p) => { p[key] = p[key].filter((x) => x.id !== item.id); }); done(); },
    deleteName,
  });
}

// ---------- 画面 ----------
export function render(el, [placeId, tab = 'notes']) {
  const place = store.data.places.find((p) => p.id === placeId);
  if (!place) {
    el.innerHTML = `
      <header class="topbar topbar-back"><a class="icon-btn icon-btn-lead" href="#/places" aria-label="Back">${icon('back')}</a></header>
      <section class="empty"><p>場所が見つかりません</p></section>`;
    return;
  }
  const current = TABS.some(([k]) => k === tab) ? tab : 'notes';
  const st = placeStats(place, store.data.trips, toISODate(new Date()));
  const sub = [place.region, st.visits ? `${st.visits}回` : ''].filter(Boolean).join(' · ');
  const body = { notes: notesTab, tips: tipsTab, spots: spotsTab, stays: staysTab, trips: tripsTab }[current](place);

  el.innerHTML = `
    <header class="trip-head">
      <div class="topbar">
        <a class="icon-btn icon-btn-lead" href="#/places" aria-label="Back">${icon('back')}</a>
        <button type="button" class="btn btn-small btn-secondary" data-act="edit-place">Edit</button>
      </div>
      <h1 class="display-title trip-title">${esc(place.name || '（名前なし）')}</h1>
      ${sub ? `<p class="page-sub">${esc(sub)}</p>` : ''}
    </header>
    <nav class="segmented segmented-place" aria-label="Place">
      ${TABS.map(([k, label]) => `<a href="#/place/${esc(place.id)}/${k}" class="seg" ${k === current ? 'aria-current="page"' : ''}>${label}</a>`).join('')}
    </nav>
    <div class="tab-body">${body}</div>`;

  const rerender = () => render(el, [placeId, current]);
  const p = () => store.data.places.find((x) => x.id === placeId);
  const idOf = (t) => t.closest('[data-id]')?.dataset.id;

  el.onclick = (e) => {
    const f = e.target.closest('[data-spot-filter]');
    if (f) { setUi(`spotFilter:${placeId}`, f.dataset.spotFilter || null); return rerender(); }
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const pl = p();
    switch (btn.dataset.act) {
      case 'edit-place':
        return openPlaceForm(pl, () => { if (store.data.places.some((x) => x.id === placeId)) rerender(); else location.hash = '#/places'; });
      case 'add-note':
      case 'edit-note': {
        const n = (pl.notesToSelf || []).find((x) => x.id === idOf(btn));
        return openSimpleForm(pl, 'notesToSelf', n, [{ name: 'text', label: 'Text', type: 'textarea', rows: 4, value: n?.text || '', required: true }], null, rerender, (n?.text || '').slice(0, 20));
      }
      case 'add-link':
      case 'edit-link': {
        const i = Number(btn.closest('[data-index]')?.dataset.index);
        const l = Number.isInteger(i) ? (pl.links || [])[i] : null;
        // links には id がないので、番号で扱う
        return openFormSheet({
          title: l ? 'Edit' : 'Add',
          fields: [{ name: 'title', label: 'Title', value: l?.title || '' }, { name: 'url', label: 'Link', type: 'url', value: l?.url || '', required: true }],
          onSave(v) { updatePlace(placeId, (pp) => { pp.links ||= []; if (l) pp.links[i] = { ...pp.links[i], ...v }; else pp.links.push(v); }); rerender(); },
          onDelete: l ? () => { updatePlace(placeId, (pp) => { pp.links.splice(i, 1); }); rerender(); } : null,
          deleteName: l?.title || l?.url,
        });
      }
      case 'add-tip':
      case 'edit-tip': {
        const t = (pl.transportTips || []).find((x) => x.id === idOf(btn));
        return openSimpleForm(pl, 'transportTips', t, [
          { name: 'title', label: 'Title', value: t?.title || '', required: true },
          { name: 'text', label: 'Text', type: 'textarea', rows: 4, value: t?.text || '' },
          { name: 'url', label: 'Link', type: 'url', value: t?.url || '' },
        ], null, rerender, t?.title);
      }
      case 'add-spot': return openSpotForm(pl, null, rerender);
      case 'edit-spot': return openSpotForm(pl, (pl.spots || []).find((x) => x.id === idOf(btn)), rerender);
      case 'add-to-plan': {
        const s = (pl.spots || []).find((x) => x.id === idOf(btn));
        return s && openAddToPlan(s, pl);
      }
      case 'toggle-area': {
        const open = btn.getAttribute('aria-expanded') === 'true';
        btn.setAttribute('aria-expanded', String(!open));
        return undefined;
      }
      case 'add-area':
      case 'edit-area': {
        const areaId = btn.closest('[data-area]')?.dataset.area;
        const a = (pl.areas || []).find((x) => x.id === areaId);
        return openFormSheet({
          title: a ? 'Edit' : 'Add',
          fields: [{ name: 'name', label: 'Name', value: a?.name || '', required: true }, { name: 'text', label: 'Text', type: 'textarea', rows: 4, value: a?.text || '' }],
          onSave(v) {
            if ((pl.areas || []).some((x) => x.name === v.name && x.id !== areaId)) return '同じ名前のエリアがあります';
            updatePlace(placeId, (pp) => {
              pp.areas ||= [];
              if (a) { if (a.name !== v.name) renameArea(pp, a.name, v.name); const x = pp.areas.find((y) => y.id === areaId); if (x) x.text = v.text; }
              else pp.areas.push({ id: newId(), name: v.name, text: v.text });
            });
            rerender();
            return undefined;
          },
          onDelete: a ? () => { updatePlace(placeId, (pp) => removeArea(pp, areaId)); rerender(); } : null,
          deleteName: a?.name,
        });
      }
      case 'add-stay':
      case 'edit-stay': {
        const s = (pl.stays || []).find((x) => x.id === idOf(btn));
        return openSimpleForm(pl, 'stays', s, [
          { name: 'name', label: 'Name', value: s?.name || '', required: true },
          { name: 'area', label: 'Area', type: 'select', value: s?.area || '', options: areaOptions(pl, s?.area) },
          { name: 'note', label: 'Note', type: 'textarea', value: s?.note || '' },
          { name: 'url', label: 'Link', type: 'url', value: s?.url || '' },
          { name: 'phone', label: 'Phone', type: 'tel', value: s?.phone || '' },
        ], null, rerender, s?.name);
      }
      default:
    }
    return undefined;
  };

  // 並べ替え（Notes to self・移動のコツ）
  el.querySelectorAll('.sortable[data-list]').forEach((ul) => {
    if (ul.children.length < 2) return;
    makeSortable(ul, {
      onEnd: () => {
        const ids = [...ul.querySelectorAll('[data-id]')].map((li) => li.dataset.id);
        updatePlace(placeId, (pp) => { pp[ul.dataset.list] = reorderList(pp[ul.dataset.list], ids); });
      },
    });
  });
}
