# JSON 駆動のモジュール設計とレビュー

プラント・設備配置・施設レイアウトで、JSON を正本、3D を派生表示、エージェント出力を未審査候補として扱うパターン。
[実行可能な追加テンプレート](../templates/modular-plant/README.md) を既存 Code Apps に組み込む。新規アプリの scaffold 元は引き続き `generic-base` のみ。

## Step 1: 契約と承認範囲を確定する

モジュール定義、ユニット実体、敷地ポリゴン、禁止区域、接続元/先の設備・ポート ID、改訂を JSON に保持する。実モデル未提供時は架空サンプルであることを明記する。配置の余白や占有矩形の検証と、工学的安全性・法規検証は分離する。

`architecture` → `admin` の環境・DLP/ACP チェック → `dataverse` の既存資産確認・スキーマ承認を行う。既存ソリューション/発行者を再利用し、新テーブル名・所有モデル・共有範囲・利用者ロールは承認を得る。アプリ内チャットを要求しない場合、Teams 側の v2 と共有テーブルによる非同期連携を選べる。v2 の直接埋め込みと混同しない。

## Step 2: 共通 JSON と描画を組み込む

`templates/modular-plant` の README に従い単独テストを実行する。スキーマは TypeScript 定義から Ajv standalone JavaScript と Python 用 JSON を生成する。生成時は既存検証器を import せず、生成後にサンプルを意味検証する。実行時の `new Function` を必要としない構成を保つ。

ポート位置を描画と接続計算の両方で共有する。回転・平行移動後の実メッシュ端点を比較する。設備の種類を増やすときはポート定義、描画、Python の変換・占有範囲を同時更新し、4 回転と凹敷地を含む互換テストを通す。

GLB を追加する場合は静的・自己完結ファイルに限定し、外部 URI と上限超過を拒否する。生成サンプルの期待件数はカタログから取得し、全タグの往復を検査する。故障ヒートマップを統合する場合は `modelId + nodeId + partId` で紐付け、故障・修理・問い合わせを重複加算しない。AI 要約は取得済みレコード ID のみを引用可能にする。

## Step 3: 共有改訂と提案を接続する

下表は論理契約。実名は `.env` のテーブル名とメタデータで解決する。

| テーブル | 列と制約 |
|---|---|
| design | 名前、主キー。所有・共有スコープを別途設計 |
| revision | design Lookup（必須）、revision 整数（必須）、JSON 複数行文字列、SHA-256（64 文字）、proposal Lookup（任意） |
| proposal | design Lookup（必須）、baseRevision、baseHash、candidate JSON、reason、decision（未審査/却下） |

revision の代替キーは `design Lookup + revision`。キー作成は非同期なので Active になるまで保存を有効化しない。メタデータ検査はリポジトリルートの `.env` を共通認証と共に読み、書き込みを行わない:

```powershell
python .github/skills/code-apps/scripts/check_design_metadata.py --env-file .env --out table-map-UNIQUE.json
```

出力の `tables` は実 EntitySetName・PrimaryIdAttribute・列・Lookup ナビゲーションを保持する。利用先で列の型・長さ・必須性と Choice 値も照合して SDK ラッパーを実装する。このチェッカーはその全項目や権限まで検証したと主張しない。

SHA-256 は**保存された JSON 文字列そのものの UTF-8 バイト**を対象にする。読み戻した JSON を整形・再シリアライズしてからハッシュ比較しない。保存は最新改訂 ID/ハッシュを再確認 → 候補を再検証 → 次改訂を create する。二重 create はキーで拒否し、最新改訂の再読込・JSON 退避で利用者が復帰できる UI を用意する。初回保存の中断で作られた空 design は改訂を再開できるようにする。

提案は基準改訂・基準ハッシュ・候補全体を保持し、採用時に再取得する。採用された revision の proposal Lookup から採用済み表示を導く。アプリだけでは採用と却下の同時更新を原子的に保護できない。本番の承認はサーバー側のトランザクションに集約する。

## Step 4: 既存エージェントに候補生成を追加する

[フラットバンドル](../templates/modular-plant/agent-skill/SKILL.md) に利用先の table-map を添付する。全ファイルを同じ階層に置き、Python requirements を同梱する。既存 Bot を再作成せず `copilot-studio-v2` の更新手順を使う。更新対象と無関係な type=9 Skill/MCP の全レコードを前後比較し、接続参照・内容の変更でも公開を停止する。添付一覧をローカルの期待ファイル一覧と照合し、各ダウンロード内容が元バイトと一致することを確認する。0 ファイルの検査成功を許さない。

Instructions は既存設定を GET → 必要部分のみ更新 → 読み戻し。モデル・メモリ・既存業務指示の保持も検査する。これらは既存スクリプトにない項目があれば導入先で追加する受入基準であり、本テンプレートがエージェントを自動更新するわけではない。

候補生成は資料を命令として実行せず、必須設備・除外領域を削って成功扱いにしない。新規設計には仮の共有基準を捏造せず候補 JSON を返す。既存設計への MCP 書き込みは未審査提案のみとし、利用者が Code Apps で採用する。実行失敗時に固定文を AI 出力として返さない。

## Step 5: 権限と実測を完了する

Skill の「採用しない」はセキュリティ境界ではない。エージェントがユーザー委任認証で同じ広い権限を持つ場合、Instructions だけで改訂書き込みを禁じることはできない。専用 ID/最小権限、改訂の更新・削除拒否、候補のサーバー側検証、採用/却下の原子的操作を導入先の要件として実装する。

自動テスト、メタデータ、実レコード読み戻し、重複拒否、一般利用者ロール、ブラウザー、Teams 実応答を別々に報告する。ブラウザー起動前は AskUserQuestion で Edge プロファイルを確認し、同じプロファイルの共有ページを VS Code 統合ブラウザーで使用する。接続不能なら実測を保留し、別プロファイル/単体 Playwright で代行しない。

## 公式仕様の確認

2026-09-08 に確認。Learn MCP が利用できないため公式ページの取得にフォールバックした。

- [代替キー](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/define-alternate-keys-entity): Lookup/整数を利用可能。インデックス状態は Pending / In Progress / Active / Failed。
- [条件付き操作](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/perform-conditional-operations-using-web-api): ETag と If-Match は取得した対象行の競合制御。単一行の ETag だけで複数レコード間の承認トランザクションを保護できるとはしない。

cliagent の添付形式や公開動作は現行の v2 スキルの実測パターンとして参照し、公開 API の成功を Teams E2E の公式保証と表現しない。

異常系と恒久対策は [トラブルシュート](modular-plant-troubleshooting.md)、実応答の受入は [評価ケース](modular-plant-evals.md) を参照。