# TripNote 作業計画

2026-10-11 作成・承認済み。個人データ（旅の中身・金額・店など）はこのファイルに書かない。

---

## 1. ファイル構成

ビルドは不要です。すべて ES Modules で書き、`index.html` の1ページで動かします。

```
index.html               … 1ページ。<meta>（viewport-fit=cover, apple-mobile-web-app-*）、フォント読み込み（M PLUS Rounded 1c だけ）
manifest.webmanifest
sw.js                    … Service Worker（キャッシュ名に版を付ける。例：tripnote-v0.3.0）
.nojekyll  .gitignore  README.md（アプリの説明と使い方だけ。個人データは書かない）
icons/   icon.svg（いただいた にこにこ飛行機 のSVGをそのまま）  apple-touch-icon.png(180)  icon-192.png  icon-512.png
css/     app.css         … 色・文字の決まりは :root の変数にまとめる（常にダーク）
vendor/  Sortable.min.js … SortableJS 1.15.6（MIT）。People で同梱しているものと同じファイル
js/
  app.js                 … 起動・ハッシュルーター・下のタブ
  version.js             … アプリの版（sw.js と揃える）
  store.js               … 【データはここだけ】読み込み・形式チェック・初期値の補完・移行・保存・容量確認・書き出し・復元
  logic/                 … 【画面と分けた純粋な関数。すべて node --test でテストする】
    dates.js             … 日付の表示（12/4 金）、泊数、あと◯日、日付の範囲
    plan.js              … 時間帯の判定、予定の並べ方、出発リミット
    money.js             … 合計、外貨の換算、1泊あたり、分類ごとの合計、家計簿の未転記数
    packing.js           … オンのタグから持ち物リストを作る、忘れると困る、宿にある、準備数
    trips.js             … 次の旅、いまやること、計画中、過去の旅（年ごと）、ふりかえりが必要な旅
    places.js            … 行った回数・最後の年・その場所の過去の旅
    redact.js            … AIに送る前の個人情報の伏せ字
    validate.js          … バックアップの形式チェックと中身の要約
  ui/                    … 共通の部品：icons.js（線のSVG）, sheet.js（下から出るシート）, modal.js（確認）, toast.js, chips.js, sortable.js
  views/                 … 画面ごとに1ファイル
    home.js  tripNew.js  trip.js（上部とタブ）  tripPlan.js  tripBookings.js  tripMoney.js
    tripPacking.js  tripNotes.js  packingMaster.js  tags.js  places.js  place.js
    lookback.js  settings.js  moneyAll.js  aiScreenshot.js  aiMemo.js  aiReview.js（AIの結果の確認画面・共通）
  ai/
    client.js            … Workerの呼び出し（合言葉ヘッダー、タイムアウト、エラーの日本語化）
    image.js             … スクショの縮小（長い辺1600px・JPEG 0.8）
test/                    … *.test.js（node --test。追加のライブラリなし）
  fixtures/sample.json   … 架空のデータだけ
tools/make-icons.sh      … icons/icon.svg から PNG を作る（macOS）
docs/    tripnote-plan.md（この計画）  icon.svg（いただいたアイコンの元のSVG）
```

`.gitignore` には、指定の `tripnote-*.json`, `*backup*.json`, `private/`, `.env*`, `.dev.vars` に加えて、`.wrangler/` と `node_modules/` も入れます。

### Worker のコード（TripNote の公開リポジトリには入れない）

owdev-appty の **非公開リポジトリ**（名前はランダムな英小文字＋数字10文字）で管理します。2026-10-11 に作成し、変更前のコードと回数制限入りのコードをコミット済み。KV の id などの設定はそのリポジトリの README に書きます（この公開リポジトリには書かない）。

```
src/index.js             … Reflect（今のまま）＋ /tripnote/ の処理
src/tripnote/*.js        … task ごとの指示文・JSONスキーマ・出力チェック
backup/worker-before-tripnote.js … 回数制限を入れる前のコード（そのまま保存）
wrangler.toml            … name = "damp-field-a347"（既存のWorker）、KV の紐付け RATE_KV → reflect-rate（id は非公開リポジトリの README に記載）
test/*.test.js           … 偽のKV・偽のAnthropicで動きを確かめる
```

- 最初のコミットは「変更前のコード」→ 2つ目は「今日デプロイした回数制限入り（Reflect 1日10回）」にして、画面で作った版からの流れを残します。
- `.gitignore` に `.dev.vars`, `.env*`, `.wrangler/`, `node_modules/` を入れます。シークレットの値はどこにも書きません。

---

## 1-2. アプリアイコン（2026-10-11 変更）

- 依頼文3章のスーツケースではなく、いただいた **にこにこ飛行機のSVG** を使います。形と色は変えません。
- 背景は四角いまま塗りつぶします（角の丸みは iPhone が付けます）。余白も足しません。
- PNG は macOS の `sips` で SVG から作ります。作ったあと、透明な部分を持たない画像にそろえます（iPhone は透明な部分を黒く塗るため。このSVGは全面が塗られているので見た目は変わりません）。
  - `apple-touch-icon.png`（180×180）
  - `icon-192.png`・`icon-512.png`（manifest 用。`purpose: "any"`）
- manifest の `theme_color`・`background_color` は `#121214` のままです。
- アプリの中で小さく使う場所（提案）：Settings のいちばん下に、アイコン（32px）＋「TripNote」＋版の番号。データが空のときの Trips の画面にも、アイコンを中くらい（64px）で出します。どちらも同じSVGを使います。
- マイルストーン2（最小のPWA）の時点から、このアイコンを入れます。

---

## 2. データの扱い

| 項目 | 内容 |
|---|---|
| 保存場所 | localStorage の `tripnote.v1` に、バックアップと同じ形の JSON を丸ごと1つ保存 |
| 合言葉 | `tripnote.secret`（別のキー）。バックアップには含めない。画面では伏せ字 |
| 画面の状態 | `tripnote.ui`（最後に開いたタブなど）。消えても困らないものだけ（承認済み） |
| バックアップに含めないもの | `tripnote.secret`・`tripnote.ui`・`tripnote.v1.prev` の3つ。書き出すのは `tripnote.v1` の中身だけ。テストでも確かめる |
| 読み込み | ① JSONとして読む ② 足りない項目や `null` を初期値で補う ③ `schemaVersion` を見て移行する。知らない項目は消さずに残す |
| 読めなかったとき | 上書きしません。「データを読めませんでした」の画面を出し、中身をそのまま書き出せるようにします |
| 保存 | 変更してから約0.3秒後にまとめて保存。保存のたびに大きさを測り、80%で注意、95%で強い警告。容量オーバーで保存できなかったときは、画面のデータは残したまま、バックアップを促します（目安の上限は5MBとして計算） |
| 追加する項目の初期値 | `trips[].packing` がなければ `{tagIds:[], checked:{}, skipped:{}, feedback:{}}`。`leaveBufferMin` がなければ10。`sinceYear` はなくてよい |
| id | 作るときに `crypto.getRandomValues` で12文字のランダムな英数字。あとから変えない |
| 書き出し | `tripnote-backup-YYYY-MM-DD.json`。Web Share API でファイルを共有し、使えない環境ではダウンロード。**共有が最後まで終わったときだけ** `lastBackupAt` を更新（途中でキャンセルしたら更新しない） |
| 復元 | 形式チェック（`app === "TripNote"`、`schemaVersion` が 1 以下の数字、`trips`・`places`・`packingItems` が配列）→ 要約（旅◯件・場所◯件・持ち物◯件）→ `Replace all data?` → 置き換え。置き換える直前のデータを `tripnote.v1.prev` に1つだけ残し、Settings に **Undo restore** を置く（承認済み） |
| 初期データ | `~/Downloads/tripnote-initial-data.json`。リポジトリにコピーしない・コミットしない・中身をログやコミットメッセージに書かない。確認に使うときは、組み込みのブラウザで開いたアプリの「Restore from backup」から読み込む。テスト用にコピーを作った場合は、終わったら消して、消したことを報告する |
| 日付 | `YYYY-MM-DD` の文字列のまま扱う。「今日」は端末の日付 |
| 予約番号 | 画面では `••••`、タップで表示。AIに送るデータを作る関数が `referenceNo` を取り除き、それをテストで確かめる |

---

## 3. 画面の補足と提案

- **下のタブの Packing と Money（承認済み）**
  - **Packing** → 持ち物マスターの画面（6-5）。タグの管理はそこから開く
  - **Money** → すべての旅のお金のまとめ。年ごとの合計、家計簿に未転記の支出の一覧（旅をまたいで）、場所ごとの1泊あたりの比較
- **エリアメモの置き場所**：「店」タブのいちばん上に「エリア」として並べます。店は `area` で、そのエリアの下にまとめて表示します（竹富島の店は竹富島のエリアメモの下）。
- **同じ場所への新しい旅**：旅の Plan タブの上に、たたんだ状態で「Notes to self」と「Want to go / Next time!」の店を出します。
- **ふりかえりの案内**：最終日の翌日から、`done` にするまで表示します。
- **並べ替え**：SortableJS で、つまみ（≡アイコン）を持ってドラッグする形にします（スクロールとの取り違えを防ぐため）。
- **Packing と Money の画面の確認**：Playwright はこのMacに入っていません。代わりに、Claude アプリに組み込まれたブラウザを 390×844 の大きさにして確認します（追加のインストールは不要）。

---

## 4. AI（モデルの提案と Worker の設計）

### モデル（docs で確認した 2026-10 時点の最新）

| 用途 | 提案するモデル | 料金（100万トークンあたり、入力/出力） | 理由 |
|---|---|---|---|
| A スクショ取り込み、B メモ振り分け、D ふりかえり整理、E 場所ノートの整理 | **Claude Sonnet 5.5**（`claude-sonnet-5-5`） | $2 / $10 | 画像の読み取りと、日本語の長いメモの振り分けに強い |
| F 持ち物の提案 | **Claude Haiku 5.5**（`claude-haiku-5-5`） | $0.10 / $0.50 | 軽い処理なので十分 |

- 依頼文にあった `claude-haiku-4-5-20251001` は1世代前のモデルです。Haiku 5.5 のほうが新しく、料金も約1/10です。
- Workerの環境変数は `TRIPNOTE_MODEL`（初期値 `claude-sonnet-5-5`）と、**追加で** `TRIPNOTE_MODEL_LIGHT`（初期値 `claude-haiku-5-5`）を提案します。どちらも設定しなければ初期値を使います。
- JSONの出力は、Anthropic の構造化出力（`output_config.format` に JSONスキーマを指定）を使います。どちらのモデルも対応しています。指示に合わない場合も考えて、Worker側でもう一度形式をチェックします。
- 考える量は `effort: "low"` を基本にし、必要なら task ごとに上げます。
- 画像は base64 の JPEG で送ります（最大3枚。端末側で長い辺1600pxに縮小）。
- **安全のための拒否への対策**：Sonnet 5.5 には「安全のために断られたとき、Anthropic側で自動的に別のモデルでやり直す」設定（`fallbacks: "default"`）があります。入れておくことを提案します。断られて結果が出なかった場合は「読み取れませんでした」と表示します。
- **費用の目安**（1ドル150円で計算したざっくりの値）：スクショ3枚の取り込み1回で約5〜10円、メモの振り分け1回で約2〜15円、持ち物の提案（Haiku）は1円未満です。**1日の上限は20回**（承認済み）なので、すべて使われても1日約200〜300円です。

### `/tripnote/ai` の守り（7-3 のとおり）

| 項目 | 内容 |
|---|---|
| パスの分け方 | `/tripnote/` で始まるものだけを新しい処理に回します。それ以外は**今の Reflect の処理を1文字も変えずに**通します |
| 合言葉 | `X-TripNote-Token` が `TRIPNOTE_APP_TOKEN` と一致しなければ 401。比較は、文字列の長さや中身で時間差が出ない方法で行います |
| Origin | `https://owdev-appty.github.io` だけ。CORS で許可するヘッダーに `X-TripNote-Token` を足すのは `/tripnote/` のときだけ |
| 回数制限 | Reflect と同じ KV に `tripnote:YYYY-MM-DD` で数えます。**1日20回まで**（`TRIPNOTE_DAILY_LIMIT` で変更可）。KV の無料枠は書き込み1日1,000回なので足ります |
| 大きさの上限 | 本文は全体で6MBまで。画像は3枚まで・1枚2MBまで。メモの貼り付けは2万文字まで |
| max_tokens（task ごと） | screenshot 4000 / memo 8000 / lookback 3000 / tidy 4000 / packing 2000 |
| 送れるもの | `task` と `input` だけ。指示文・モデル名・max_tokens はアプリからは変えられません。input も task ごとに決めた項目以外は捨てます |
| ログ | task 名・結果の状態・かかった時間だけ。メモや画像の中身は出しません |
| 出力 | task ごとの JSONスキーマで受け取り、Worker側でも形式をチェックします。合わなければ 502 と短いエラーを返します |
| デプロイ | マイルストーン8から `wrangler deploy`（承認済み）。守ること：① 既存の `damp-field-a347` にデプロイし、新しいWorkerは作らない ② KV の紐付け（RATE_KV → reflect-rate。id は非公開リポジトリの README に記載）を `wrangler.toml` に書いて消えないようにする。シークレットには触れない（`wrangler deploy` はシークレットを消さない。画面で設定した「変数」があれば `keep_vars = true` で残す）③ デプロイの前に、コードと設定の差分を見せて承認をもらう ④ デプロイの後、`wrangler secret list` で `ANTHROPIC_API_KEY` が残っていることを（値は見ずに名前だけ）確認する。`wrangler login` はあなたにお願いします。wrangler は `npx` で使います（その時にダウンロードの許可をいただきます） |

---

## 5. マイルストーン

それぞれ動く状態でコミット・プッシュし、短く報告します。純粋な関数のテストは毎回全部通します。

| # | 内容 | 終わったときに確認すること |
|---|---|---|
| 2 | リポジトリ作成（ランダム10文字・公開・オーナーを明示）、remote・作者の確認、Pages の有効化、最小のPWA（空の画面、manifest、SW、にこにこ飛行機のアイコン） | Pages のURLが開き、ホーム画面に追加できる |
| 3 | store.js、形式チェック、書き出し、**復元**、Settings の Backup と Data | **あなたが初期データを読み込めるようになる**。私も手元で初期データを使って確認します（ファイルをリポジトリの外に置いて） |
| 4 | Trips（ホーム）、旅の追加、旅の画面の上部とタブ、Plan（時間帯・時刻は任意・Day notes・並べ替え・別の日への移動・出発リミット） | 時間帯の並べ方と出発リミットのテスト |
| 5 | Bookings（予約番号の伏せ字、候補）、Money（合計・換算・グラフ・家計簿済・比較）、下のタブの Money | 合計・換算・1泊あたりのテスト |
| 6 | 旅の Packing、持ち物マスター、タグの管理（並べ替え・削除の確認）、下のタブの Packing | 持ち物リストのテスト |
| 7 | Places・場所の画面（5つのタブ・Add to plan）、ふりかえり（ボタンだけで完結）、Notes | 店の状態の更新・Notes to self の追加 |
| 8 | Worker 用の非公開リポジトリ作成、Worker の変更（7-2 の手順：変更前のコードを保存 → `/tripnote/` を追加 → 差分を見せて承認 → デプロイ → Reflect の確認）、AI A・B、確認画面、伏せ字 | 伏せ字のテスト、Worker のテスト（偽のKV・偽のAnthropic） |
| 9 | AI D・E・F | 新しいタグを提案しないことを Worker 側でもチェック |
| 10 | アイコンの最終確認（ホーム画面での見え方）、オフライン起動、iPhone サイズでの表示確認、旅10件・場所7件・持ち物123件くらいの量での速さの確認、最後の報告 | 最後の報告とチェックリスト |

---

## 6. 画面の表記一覧（依頼文 4章の表にないもの）

**考え方（提案）**：見出し・ボタン・入力欄のラベルは英語にします。数字の入った短い状態表示（あと◯日・◯泊・◯件・◯回）、ヒント、エラー、確認の説明文は日本語にします。依頼文の中で日本語で書かれていた表示は、なるべくそのまま使います。

### 全体・共通
| 場所 | 表記 |
|---|---|
| 下のタブ | Trips / Places / ＋（aria-label: Add from screenshot）/ Packing / Money ※決まっているもの |
| 共通ボタン | Save / Cancel / Delete / Edit / Add ※決まっているもの。シートを閉じる：**Done**。戻る：アイコンのみ（aria-label: **Back**）。閉じる：アイコンのみ（aria-label: **Close**）。設定：歯車のみ（aria-label: **Settings**） |
| 削除の確認 | `Delete "<名前>"?` / `This can't be undone.` / Cancel・Delete ※決まっているもの |
| 日付 | `12/4 金`、範囲は `12/4 金 – 12/7 月`、年をまたぐときだけ `2025/12/30 火` |
| 金額 | `98,025円`、外貨は `300,000₫ ≈ 1,765円`、マイルは `15,000 mi` |
| 容量の警告 | 「保存容量が残り少なくなっています。バックアップを書き出してください」／「保存できませんでした（容量がいっぱいです）」 |
| 空のとき | 「まだ旅がありません」「まだ店がありません」などの短い日本語 |

### Trips（ホーム）
| 場所 | 表記 |
|---|---|
| 見出し | Trips ＋ 今日の日付（`10/11 日`） |
| 次の旅 | 見出し **Next trip**。`あと12日`・`3泊`。数字の欄は **Bookings 3/5**・**Packing 12/40**・**Spent 98,025円 + 15,000 mi** |
| これからの旅 | 見出し **Upcoming**（Next trip の下）。Next trip 以外の今日以降の旅を、状態を問わず日付順に。行に旅の状態を付ける |
| いまやること | 見出し **To do** |
| 計画中 | 見出し **Planning**。日程未定の旅 |
| 過去の旅 | 見出し **過去の旅**（場所のタブ名と揃える）。年ごとの見出し `2025`。行かなかった旅は薄く表示し、**Cancelled** と付ける |
| 旅の状態 | **Idea / Planning / Booked / Done / Cancelled** |
| 旅を追加 | ボタン **＋ New trip**。シートの見出し **New trip**。欄：**Title / Places / Start / End**、チェック **日程未定**。新しい場所を追加：**＋ New place** |
| ふりかえりの案内 | 「旅が終わりました。ふりかえりをしましょう」＋ボタン **ふりかえり** |

### 旅の画面（Plan）
| 場所 | 表記 |
|---|---|
| 日付のチップ | 上の段 `12/4 金`、下の段 `2日目`。日程が決まっていない旅は **日程未定** |
| 予定の状態 | 予約済み / 検討中 / To do ※決まっているもの。done → **Done**、skipped → **Skipped**（取り消し線） |
| 予定の種類 | **Flight / Train / Bus / Ferry / Car / Stay / Food / Bar / Sight / Activity / Shop / To do / Other** |
| 予定の追加 | 見出し **Add plan**。欄 **Title**、「**いつ？**」のチップ：**決めない / 朝 / 昼 / 夕方 / 夜 / 時刻を入れる**、**Kind / Status / Note / Link** |
| 予定の編集 | **Day / Time / End time** に加え、上と同じ欄。別の日へ移動：**Move to day** |
| 予約の欄 | **Booked via / From / To / No.（便名）/ Price / Miles / Cancellation / Payment / 予約番号 / Note** |
| 出発リミット | 見出し **出発リミット 14:24**。根拠「16:30発の飛行機に間に合う14:34のバスから逆算（余裕10分）」。余裕の編集：**余裕 10分** |
| 同じ場所の前回 | **Notes to self**、**Want to go / Next time!**（たたんだ状態で表示） |

### Bookings
| 場所 | 表記 |
|---|---|
| 件数 | `予約済み 3 · To do 1 · 検討中 2` |
| 予約番号 | `••••`（タップで表示。aria-label: **Show reference no.**） |
| 候補 | 見出し **候補** |
| 予約のカード（M5で追加） | 日付と時刻、区間 `A → B`、欄 **No. / Price / Cancellation / Payment / Booked via / Note**、**予約番号**（`••••`。aria-label は **予約番号を表示** / 表示中は **予約番号を隠す**）。状態の切り替え：予約済み / 検討中 / To do（もう一度押すと外れる）。空のとき「予約はまだありません。Plan で移動・宿の予定を足すと、ここに出ます」 |
| 予定の編集の予約欄（M5で追加） | 区切りの見出し **Booking**（移動・宿の種類か、予約の情報がある予定のときだけ表示）。Price は **Price（円）** |
| 候補の追加（M5で追加） | ボタン **＋ 候補を追加**、シートの見出し **候補を追加** / **Edit**、欄 **Title / Detail / Link** |
| 予約情報を外す（2026-10-11 追加） | Bookings から開いた編集シートのボタン **予約情報を外す**（予約情報があるときだけ）。確認モーダル「予約情報を外しますか？」「Plan の予定は残ります。」、ボタン **Cancel / 外す**。予定ごとの **Delete** は Plan の編集シートだけ |

### Money（旅の中と下のタブ）
| 場所 | 表記 |
|---|---|
| 合計 | **Total** / **Miles** / **Per night**。メモの合計：「メモの合計：98,025円」 |
| 分類 | **交通 / 宿泊 / 食事・飲み / 土産 / 体験 / その他**（依頼文の表記のまま） |
| 未転記 | 「家計簿 未転記 2件」 |
| 支出の追加 | 見出し **Add expense**。欄 **Title / Amount / Currency / Payment / Category / 家計簿済 / 概算 / Note**。レート：**Rate** `1円 = 170 VND` |
| 支出（M5で追加） | 見出し **Expenses**、ボタン **＋ Add expense**、欄に **Miles** を追加。通貨の円は「円」。レートの補足「≈ 1,667円。レートを変えると、この旅だけに使います」。通貨は「円」（初期値）と7つの外貨を「TWD（台湾ドル）」の形で選ぶ。行の補足 `交通 · マイル · 概算`、外貨は2行（`300,000₫` / `≈ 1,765円`）、マイルは `+ 15,000 mi`。行の右に **家計簿済**（切り替え）。1泊あたりが出せないときは `–`。空のとき「まだ支出がありません」 |
| 分類ごとの棒（M5で追加） | 見出しなし。各行に分類名と金額（1系列なので凡例なし） |
| 比較（M5で追加） | その旅の行に **（この旅）**。補足「同じ場所の終わった旅と比べています（日帰りと行かなかった旅は除く）」 |
| 下のタブの Money（M5で追加） | By year の行 `2025` ＋ `旅2件`。未転記の見出し `家計簿 未転記 2件`、行の補足は旅の名前、0件のとき「すべて家計簿に転記済みです」。By place の行 `2回 · 6泊 · 合計 120,000円` と `20,000円 / 泊`、補足「1泊あたり＝その場所の終わった旅の合計 ÷ 泊数の合計（日帰りと行かなかった旅は除く）」 |
| 比較 | 見出し **過去の旅**。列：泊数・合計・1泊あたり |
| 下のタブの Money | 見出し **Money**。**By year**、「家計簿 未転記」の一覧、**By place**（1泊あたり） |

### Packing・持ち物マスター・タグ
| 場所 | 表記 |
|---|---|
| 旅の持ち物 | 準備数 `12 / 40`。宿にある分の見出し **宿にある**（説明「宿にあるので持っていかない」）。この旅だけの物：**This trip only** ＋ **＋ Add** |
| 旅のあと | **使わなかった / 足りなかった** |
| AIの提案 | **Suggest** ※依頼文の表記 |
| マスター | 見出し **持ち物マスター**。絞り込み：**All** ＋ 各タグ ＋ **＋ タグ**（タグの管理を開く）。「忘れると困る」は ★ |
| 編集シート | **Name / タグ / Note / 忘れると困る / Delete**、**＋ 新しいタグ** |
| タグの管理 | 見出し **タグ**。**＋ Add**、名前の変更は **Edit**。削除の確認の説明に「持ち物からこのタグが外れます（持ち物は消えません）」を足す |

### Places・場所の画面
| 場所 | 表記 |
|---|---|
| 一覧 | 見出し **Places**、各行 `3回 · 2025年 · 店 12`、**＋ New place** |
| 場所の欄 | **Name / Region** |
| 場所の画面 | `3回`。タブ：Notes to self / 移動のコツ / 店 / 宿 / 過去の旅 ※決まっているもの |
| 店 | 絞り込み：Want to go / Go again / Next time! / Visited ※決まっているもの。エリアの見出し **エリア**。欄 **Name / Kind / Status / Area / Hours / Note / Link / Phone**。ボタン **Map**・**Call**・**Add to plan** ※Add to plan は依頼文の表記。「2022年から」 |
| 店の種類 | **Food / Bar / Sight / Activity / Shop / Souvenir / Cowork**（データの値は `work` のまま、表示だけ Cowork） |
| 移動のコツ・宿 | 欄 **Title / Text / Link**、**Name / Area / Note / Link / Phone** |
| 過去の旅 | 泊数・合計・1泊あたり |

### Notes・ふりかえり
| 場所 | 表記 |
|---|---|
| Notes タブ | **To do**（チェックリスト）、**Unsorted**（「分類できなかったメモ」）＋ボタン **Move**、**ふりかえり**、**候補** |
| ふりかえり画面 | 見出し **ふりかえり**。① 店：Visited / Go again / Next time! / **行かなかった** ② **Notes to self**（「次の自分へのメモ」）③ 感想（`lookBack`）④ 持ち物：使わなかった / 足りなかった ⑤ ボタン **Finish**（旅を Done にする）。AI：**Sort with AI** |

### Settings
| 場所 | 表記 |
|---|---|
| 見出し | **Settings** |
| Backup | **Backup**、`Last backup: never` / `Last backup: 12 days ago` ※決まっているもの、**Export backup**、**Restore from backup**、`Replace all data?` ※決まっているもの、要約「旅10件・場所7件・持ち物123件」、（提案）**Undo restore** |
| AI | **AI**、**Use AI**（オン・オフ）、**Access token**（ヒント「Workerの合言葉」）、説明「AIに送られる内容」 |
| 通貨レート | **Currency rates**。行は `VND（ベトナムドン）` と `1円 = 170 VND`、**＋ Add currency**（7つすべて追加済みなら出さない） |
| 通貨レートの編集（M5で追加） | 行の右に **Edit**。シートの見出し **Add currency** / `VND（ベトナムドン）`、欄 **Currency**（一覧から選ぶ）/ **Rate**、補足「1円あたりの外貨（例：1円 = 170 VND）」「旅の Money で、旅ごとにレートを変えることもできます」 |
| Data | **Data**、`旅10件・場所7件・持ち物123件`、**Storage** `210 KB / 5 MB` |

### AI の画面
| 場所 | 表記 |
|---|---|
| スクショ取り込み | 見出し **Add from screenshot**、**Choose screenshots**、読み取り中「読み取り中…」、追加先 **Trip / Day**、ボタン **Add as candidate** / **Add as booked**、比較 **Compare** |
| メモ貼り付け | 見出し **Paste notes**、**Sort**、各行のオン・オフと行き先 **Goes to**。どこにも入らない行：**Unsorted** |
| 確認画面（共通） | **Review**、**Save selected**（チェックした分だけ保存）、変更の前後 **Before / After**、1件ずつ **Accept / Skip** |
| エラー（日本語） | 「通信できませんでした」「合言葉が違います」「今日の上限に達しました」「読み取れませんでした」「時間がかかりすぎました」。入力した内容は残します |

---

## 7. 決まったこと（2026-10-11 の回答）

1. 下のタブ：Packing は持ち物マスター、Money はすべての旅のお金のまとめ。
2. 初期データ：`~/Downloads/tripnote-initial-data.json`。リポジトリにコピーしない・コミットしない・中身をログやコミットメッセージに書かない。テスト用のコピーは終わったら消す。
3. `tripnote.ui` と `tripnote.v1.prev` を追加。この2つと `tripnote.secret` はバックアップに含めない。
4. Sonnet 5.5 と Haiku 5.5、`TRIPNOTE_MODEL_LIGHT` の追加、`fallbacks: "default"`。TripNote の1日の上限は20回。
5. マイルストーン8から `wrangler deploy`。既存の damp-field-a347 に、KV の紐付けとシークレットを消さずに。Worker のコードは非公開リポジトリで管理。デプロイの前に差分を見せる。
6. 表記一覧：承認済み（店の種類の Work → Cowork に変更）。
7. アイコンを小さく使う場所：Settings のいちばん下と、データが空のときの Trips 画面。

### 追加で決まったこと（2026-10-11）

- Trips：Next trip の下に **Upcoming** を追加。Next trip 以外の今日以降の旅を、状態を問わず日付順に。日程未定の旅は（予約済みも含めて）Planning に出す。
- Money の決まり（M5）：外貨の支出で円が記録してあるもの（初期データの形）は、その円を使う。アプリで入れた外貨は、旅のレート（なければ Settings のレート）で換算する。旅だけのレートは `trips[].fxRates`（例 `{ VND: 180 }`。Settings と同じ値なら持たない）。同じ場所の比較と By place の1泊あたりは、終わった旅（Done か最終日を過ぎた旅）だけで計算し、日帰りと行かなかった旅は除く。
- フォント：アプリ全体を **M PLUS Rounded 1c**（Google Fonts）にする。本文・見出し・数字ともこの1つだけ。太さは 400 / 500 / 700（見出しは700）。時刻・金額・日付は `font-variant-numeric: tabular-nums`（このフォントは数字がもともと等幅で、桁がそろうことを確認済み）。入力欄は16px以上のまま。
- 支出の通貨（2026-10-11）：自由入力をやめ、一覧から選ぶ。円が初期値。外貨は VND（ベトナムドン）・TWD（台湾ドル）・USD（米ドル）・KRW（韓国ウォン）・THB（タイバーツ）・EUR（ユーロ）・SGD（シンガポールドル）の7つだけ。表示は「TWD（台湾ドル）」の形。一覧にない通貨の古いデータは、コードのまま表示して残す。
- Money（2026-10-11）：旅の Money の「家計簿 未転記 ◯件」の横に **すべて家計簿済にする**。確認モーダル「すべて家計簿済にしますか？」「この旅の未転記の支出◯件を、家計簿済にします。」、ボタン **Cancel / 家計簿済にする**。済にしたら「◯件を家計簿済にしました」。
- Bookings（2026-10-11）：Bookings からは予定を消せない。**予約情報を外す** で booking（便名・料金・予約番号など）だけを消し、予定は Plan に残す。移動・宿の種類の予定は、予約情報を外しても Bookings の一覧に残る（6-3 の「飛行機・電車・バス・フェリー・車・宿の予定を一覧」のとおり）。
- 下から出るシート（2026-10-11 改訂）：キーボードの高さは想定しない。シートの外枠を、実際に見えている範囲（`visualViewport` の height と offsetTop。resize と scroll のたびに読む）に合わせる。上端はステータスバー（safe-area-inset-top）より下。欄にフォーカスしたら、その欄をシートの見えている範囲の上から3分の1の位置へスクロールする。入力中は中身の下に見えている範囲の半分の余白を入れ、最後の欄もそこまで上げられるようにする。日本語の変換中はシートを動かさない。
- ページの欄（Day notes など）：入力中は下のタブを隠し、欄を見えている範囲の上から3分の1へ。
- 日本語入力（2026-10-11）：入力のたびに何かする欄は、変換中（composition）は何もせず、確定したときに処理する（`js/ui/ime.js`）。便名・予約番号・金額・レート・リンクの欄は、自動修正・自動大文字・スペルチェックを止める。
