# 初回から明るく、対象へスクロールするチュートリアル

チュートリアルを追加するときは、この構成から始める。閲覧専用ツアーは自動クリック・保存・送信を行わない。
業務コンポーネントに安定した `data-tour` を付け、ルーター内で対象画面へ遷移してから計測する。

## Step 1: 暗幕と入力制御を分ける

- `DialogPrimitive.Root` のモーダルと Content でキーボードフォーカストラップを維持する。
- `DialogPrimitive.Overlay` / 共通の `DialogOverlay` は使わない。全面を暗くし、ページのスクロールもロックするため。
- Portal 内で下記の透明な入力ブロッカー、枠、操作カードを順に重ねる。対象自体に opacity を設定しない。
- 対象があるときの暗幕は枠外の巨大な `box-shadow` **だけ**。枠線は `outline` とし、
  同じ box-shadow を使う Tailwind `ring` と競合させない。
- 対象を計測できないときだけ全面暗幕にし、読み込み・対象なし・権限エラーを明示する。0高の枠で成功表示しない。

```tsx
<div aria-hidden="true" className="pointer-events-auto fixed inset-0 z-[300]"
  style={{ backgroundColor: rect ? "transparent" : "rgba(2, 6, 23, 0.62)" }} />
{rect && <div aria-hidden="true" data-tutorial-spotlight
  className="pointer-events-none fixed z-[350] rounded-lg outline-2 outline-primary"
  style={{ ...rect, boxShadow: "0 0 0 9999px rgba(2, 6, 23, 0.62)" }} />}
```

Content は z-[400] 等で前面へ置き、対象と重ならない上下位置・最大高さ・内部スクロールを設定する。
外側クリックでは閉じない。終了ボタン・Escape・戻る・次へを用意し、終了後は元画面と起動ボタンに戻す。

## Step 2: フォーカス後にスクロールする

1. Content の `onOpenAutoFocus` で `event.preventDefault()` を呼び、
   `contentRef.current?.focus({ preventScroll: true })` とする。
2. 導入ダイアログからツアーへ移るときだけ、導入側 `onCloseAutoFocus` の復元を抑止する。
   通常終了時のフォーカス復元は残す。
3. 画面遷移・最初のレイアウト・フォーカス処理を待ち、`requestAnimationFrame` 内で対象を取得する。
4. 固定ヘッダー下端 + 余白を `scrollMarginTop` に一時設定して、
   `scrollIntoView({ block: "start", inline: "nearest", behavior: "instant" })` を呼ぶ。
   元の inline style は `finally` で復元する。レイアウトを変える margin は使わない。
5. 同じDOMノードでもステップ変更時はスクロールし直す。ヘッダー内の起動ボタンには本文用の上端除外を適用しない。

## Step 3: 描画後も枠を追従させる

- `getBoundingClientRect()` の上下左右を viewport と固定ヘッダーでクリップする。余白は約6px。
  `right <= left` / `bottom <= top` なら `null` にする。
- `scroll`（capture=true、入れ子コンテナーも対象）・`resize` と、非同期データ用の短い間隔の再計測で更新する。
  対象ノードが差し替わった場合も取り直す。ステップ・画面変更とunmount時にRAF・timer・listenerを解除する。
- 読み込み後に対象が画面外へ移動した場合だけ再スクロールする。補正は最大3回等で打ち切り、
  ユーザーのスクロールと競合する永久ループを作らない。
- 矢羽・進捗バーは**全体のコンテナー**を対象にし、個別ラベル・非表示の複製を選択しない。
  データなし・取得失敗・未発見時の説明と「次へ」を用意する。

## Step 4: 通常の検証・配信フローに含める

`data-tutorial-spotlight` を付けたコンポーネントは `npm run predeploy` の
`detect-tutorial-hazards.mjs` が毎回検査する。対象なしの通常ダイアログは検査対象外。
これは既知の静的な組合せだけを検出するガードであり、描画・スクロール成功を保証しない。

- 単体試験: viewport外はnull、固定ヘッダー除外、ヘッダーボタン例外、全矢羽の枠、スクロール時のstyle復元。
- 回帰試験: 全ステップのルートと対象が存在すること、閲覧中に業務書き込みしないこと、イベント解除。
- 統合ブラウザー: 初回・再起動、次へ/戻る、スクロールの必要な矢羽、非同期読み込み、
  狭い画面・入れ子スクロール、Escapeとフォーカス復元を確認する。
- 実プレイヤーで、ハイライト内に暗幕が掛からないこと、枠が対象へ一致すること、
  操作カードに隠れないことを確認する。build成功・DOM文字列試験だけで「解消」としない。
- 統合ブラウザーが提供されない場合は標準のツール確認手順へ戻り、視覚検証を未検証と明記する。
  外部Playwrightを起動して代替しない。
