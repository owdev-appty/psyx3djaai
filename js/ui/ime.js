// 日本語入力（変換中）への配慮。
// 変換中（composition）に入力欄の値を書き換えたり、欄を動かしたりすると、
// iPhone で文字が二重に入ることがある（例：「TW」→「TTW」）。
// 入力のたびに何かするときは、この関数を使う：変換中は呼ばず、確定したとき（compositionend）に呼ぶ
export function onTextInput(el, handler) {
  if (!el) return;
  el.addEventListener('input', (e) => {
    if (e.isComposing) return;
    handler(e);
  });
  el.addEventListener('compositionend', (e) => handler(e));
}

// Enter で追加する欄：日本語の変換を確定する Enter では追加しない。
// iPhone では確定の Enter が isComposing=false・keyCode 229 で来ることがあるので、両方を見る
export function isSubmitEnter(e) {
  return e.key === 'Enter' && !e.isComposing && e.keyCode !== 229;
}

// コードや数字の欄で、自動修正・自動大文字・スペルチェックを止める属性
export const NO_AUTOCORRECT = 'autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"';
