// SortableJS（vendor/ に同梱）の共通設定。People アプリで iPhone での動作を確かめた設定と同じ
export function makeSortable(list, { handle = '.drag', draggable = '[data-id]', onEnd } = {}) {
  if (!window.Sortable || !list) return null;
  return window.Sortable.create(list, {
    handle,
    draggable,
    animation: 160,
    forceFallback: true,      // iPhone でも PC でも同じ動き（ブラウザ標準のドラッグを使わない）
    fallbackOnBody: true,
    fallbackTolerance: 2,
    scroll: true,
    bubbleScroll: true,
    onStart: () => document.body.classList.add('dragging'),
    onEnd: (evt) => {
      document.body.classList.remove('dragging');
      if (evt.oldIndex !== evt.newIndex) onEnd?.(evt);
    },
  });
}
