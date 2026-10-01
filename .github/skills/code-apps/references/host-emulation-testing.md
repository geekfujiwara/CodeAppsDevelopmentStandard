# ホスト再現テスト（別オリジン iframe + CSP + 疑似マイク）

Power Apps のプレイヤーはサインインが必要で、自動テストから直接開けない。
そこで **ホストと同じ条件をローカルで再現**し、ビルド成果物をヘッドレス Edge と疑似マイクで動かして
Console ログで判定する。マイク・録音・WebSocket など、ホストの制約で壊れやすい機能の回帰確認に使う。

| 再現できる | 再現できない（実機で確認する） |
|---|---|
| 別オリジンの入れ子 iframe、`allow` 属性、Code Apps 既定 CSP、ユーザー操作の有無、疑似マイク音声 | 環境に実際に設定された CSP（→ `configure_code_app_csp.py --assert`）、コネクタの接続・同意、内側フレームの実際の Permissions-Policy |

## 手順

### Step 1: 試験用ビルドを別フォルダーに作る

自動開始が必要なら、**ビルド時の環境変数でだけ有効になる**コードにする（本番ビルドでは定数畳み込みで消える）。

```ts
useEffect(() => {
  if (import.meta.env.VITE_DEV_AUTOSTART !== "1") return
  const t = setTimeout(() => void start(), 1500)
  return () => clearTimeout(t)
}, [])
```

```powershell
$env:VITE_DEV_AUTOSTART = "1"
npx vite build --outDir dist-autotest
Remove-Item Env:VITE_DEV_AUTOSTART
```

> 試験用ビルドに一時トークンなどを埋め込んだ場合は、試験後に `dist-autotest` を削除し、`.gitignore` に入れておく。
> 本番の `dist` に試験用の値が無いことを文字列検索で確認してからデプロイする。

### Step 2: ホストを再現するサーバーを起動する

```powershell
node .github/skills/code-apps/scripts/serve_host_emulation.mjs --dist dist-autotest `
  --connect-src wss://<region>.stt.speech.microsoft.com --route "#/"
```

- アプリ（`localhost:4173`）は Code Apps 既定 CSP をヘッダーで付けて配信する。`--connect-src` は環境に追加した値と同じにする
- ホスト（`127.0.0.1:4174`）はプレイヤーと同じ `allow` 属性の about:blank フレーム内に、別オリジンのアプリを置く
- `--no-allow` を付けると、ホストが権限を委譲しない場合の挙動を確認できる

### Step 3: ヘッドレス Edge で疑似マイクを流して Console を抽出する

```powershell
# クリックがあった状態（正常系）
powershell -File .github/skills/code-apps/scripts/run_headless_media_test.ps1 -Wav <sample.wav> -SimulateGesture -LogPrefix "[APP"
# クリックが無い状態（AudioContext が開始しない異常系の再現）
powershell -File .github/skills/code-apps/scripts/run_headless_media_test.ps1 -Wav <sample.wav> -LogPrefix "[APP"
```

抽出したログで、**どの段階まで進んだか**を判定する（例: マイク取得 → AudioContext running →
WebSocket 接続確立 → 発話検知 → 途中結果 → 確定 → 記録保存）。ログの規約は [デバイス・メディア](device-media.md) §6。

スクリプトは、アプリのログ接頭辞に関係なく**ブラウザ自身が出す CSP 違反を数えて警告する**。
接頭辞やキーワードでログを絞ると、停止時に一度だけ出る違反（例: `data:` Worker）を見落とすため、
違反の件数は毎回 0 であることを確認する。

### Step 4: メインスレッドの停止に耐えるかを試す

短い正常系の試験では、送信の待ち合わせやバッファのあふれが起きず、問題が表に出ない。
試験用ビルドでだけ有効なフックで、送信開始後（5 秒以降）にメインスレッドを意図的に止め、
**停止後も確定文が出続けるか**と**停止中に話した文が崩れないか**を確認する。

```ts
// 試験用ビルドでだけ有効（VITE_DEV_JANK_AT_MS / VITE_DEV_JANK_MS）
const jankAt = Number(import.meta.env.VITE_DEV_JANK_AT_MS ?? 0)
if (jankAt > 0) setTimeout(() => { const until = performance.now() + Number(import.meta.env.VITE_DEV_JANK_MS ?? 800); while (performance.now() < until) {} }, jankAt)
```

複数の構成（ライブラリ設定・取り込み方式）を同じ停止条件で順に試し、表で比較する。結果の例は
[デバイス・メディア](device-media.md) §4。

### Step 5: 画面を撮って目で確かめる

ログだけでは、レイアウト崩れ・ハイライトの位置・カードの並びは分からない。試験用ビルドで自動開始したデモ
（台本再生など、タイマーで進むもの）を、ヘッドレス Edge の**仮想時間**で早送りして撮る。統合ブラウザが使えない環境でも撮れる。

```powershell
# 途中（9.5 秒時点）と最後を撮る。画像は .screens/（Git 除外）に出る
powershell -ExecutionPolicy Bypass -File .github/skills/code-apps/scripts/capture_host_screens.ps1 -Url "http://localhost:4173/#/<route>" -Name mid -Budgets 9500
powershell -ExecutionPolicy Bypass -File .github/skills/code-apps/scripts/capture_host_screens.ps1 -Url "http://localhost:4173/#/<route>" -Name final -Budgets 60000
```

- コネクタ呼び出しはホストが無いと応答しないため、試験用ビルドではテスト専用の環境変数で同梱データに切り替え、
  本番コードのコネクタ呼び出しにはタイムアウトを付けておく（[troubleshooting](troubleshooting.md) #58）
- マイクを使う経路は Step 3 のログで判定し、画面の確認はタイマー駆動のデモで行う（疑似マイクは仮想時間で早送りできない）
- `motion` の `AnimatePresence` の出入りのアニメーションは仮想時間では進まない。表示がアニメーションの完了に依存しない作りにする（[troubleshooting](troubleshooting.md) #59）
- 撮影の前にサーバーの起動を確認する（ビルドと同時に起動すると、出力が無くて終了する）

## 落とし穴（実測）

| 症状 | 原因 | 対処 |
|---|---|---|
| ログが 0 行 | `msedge.exe` は起動後に親から切り離され、標準出力・標準エラーのリダイレクトが空になる | `--enable-logging` でユーザー データ フォルダーの `chrome_debug.log` を読む（スクリプト対応済み） |
| 起動直後のログしか無い | `--dump-dom` はページ読み込み直後に終了する | 常駐させて一定秒数後に停止する（スクリプト対応済み） |
| 前回は正確だった認識結果が崩れる | 前回の試験の子プロセスが残り、CPU を使い続けて音声処理が乱れた | 同じユーザー データ フォルダーの全プロセスを止め、残存数を表示する（スクリプト対応済み） |
| 「マイク取得」の直後で止まる | クリックが無く `AudioContext.resume()` が保留のまま | 実機ではボタン操作で解消。試験では `-SimulateGesture`（`--autoplay-policy=no-user-gesture-required`） |
