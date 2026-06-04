# power-pages スキル刷新ガイド（upstream 優先）

このリポジトリの `power-pages` スキルを、`microsoft/power-platform-skills` の運用モデルに合わせて再構成するための基準。

---

## 1. 優先する upstream スキル

| 領域 | upstream スキル | 目的 |
|---|---|---|
| 認証・認可 | `setup-auth` | IdP 設定、ログイン/ログアウト、ロールベース UI |
| Web ロール | `create-webroles` | Web ロール定義と一意制約 |
| Dataverse CRUD | `integrate-webapi` | `/_api` 連携、型/サービス/CRUD 実装 |
| 権限監査 | `audit-permissions` | テーブル権限の静的+動的監査 |
| デプロイ | `deploy-site` / `activate-site` | 初回公開・再デプロイ運用 |

---

## 2. ローカル skill の責務分離（推奨）

| レイヤー | このリポの配置 | 責務 |
|---|---|---|
| オーケストレーション | `SKILL.md` | どの順で何を実行するかを規定 |
| 認証詳細 | `references/authentication.md` | `setup-auth` 相当の実装詳細 |
| CRUD 詳細 | `references/dataverse-client.md` | `integrate-webapi` 相当の実装詳細 |
| 権限詳細 | `references/enhanced-data-model-permissions.md` | Web ロール + テーブル権限 |
| 運用詳細 | `references/operations-and-pitfalls.md` | デプロイ/再起動/障害対応 |
| 品質ゲート | `reviews/*` + `scripts/review_*.py` | 設計前/デプロイ前レビュー |

---

## 3. 標準フロー（upstream 準拠）

1. `deploy-site` 相当で `.powerpages-site` を作成
2. `create-webroles` 相当でロールを定義
3. `setup-auth` 相当で認証導線を構成
4. `integrate-webapi` 相当で CRUD 実装
5. `audit-permissions` 相当で権限監査
6. 再デプロイ + サイト再起動で反映確認

> 原則: 認証・ロール未整備のまま CRUD 実装だけ先行しない。

---

## 4. 実装/運用で固定する判断

| 項目 | 判断 |
|---|---|
| 認証判定 | `window.Microsoft.Dynamic365.Portal.User` を一次情報として扱う |
| API 認証 | `credentials: "same-origin"` を固定 |
| 書き込み保護 | POST/PATCH/DELETE は anti-forgery token 必須 |
| 認可 | Web ロール + テーブル権限をサーバー側の強制力とする |
| 検証 | 管理者・一般ユーザーの両方で確認する |

---

## 5. 既存資産を壊さない刷新方針

- `references/*` の詳細実装は維持し、`SKILL.md` を導線中心に再編する  
- 新規知見はまずこのファイルに集約し、重複記述を最小化する  
- 相互参照は「概要（SKILL.md）→詳細（references）」の一方向を基本にする  
