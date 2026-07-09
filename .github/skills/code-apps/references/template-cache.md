# テンプレート依存関係キャッシュ（npm install 高速化）

> Code Apps のテンプレート scaffold（`SKILL.md` Step 0）で毎回 `npm install` を素で実行すると、
> 社内プロキシ（`packagefeedproxy.microsoft.io` 等）の初回キャッシュミスにより数分〜十数分かかることがある。
> 本リファレンスは、**依存関係一式（`node_modules`）を1本の圧縮アーカイブとして GitHub Release に置き、
> scaffold のたびに1回のダウンロードで取得する**ことで、ネットワーク往復を ~400 パッケージ分の個別リクエストから
> 1回の一括取得に減らす仕組みを提供する。**ローカルには何も永続化しない**（マシン固有の状態を持たない）。

## 仕組み

```
[geekfujiwara/CodeAppsDevelopmentStandard リポジトリ]
  .github/skills/code-apps/references/template-snapshot/
    package.json        ← 依存関係の正本（バージョン固定）
    package-lock.json    ← 週次 GitHub Action が npm ci で検証・更新

  GitHub Release (tag: code-apps-template-cache-vite)
    node_modules-vite.tar.gz  ← 同 Action が作成・アップロード（"リモートのゴールデンフォルダ"）
    package.json / package-lock.json （アセットとして同梱）

        │  週次 or workflow_dispatch
        ▼
  scaffold_from_cache.ps1（開発者のローカルマシン、実行のたびに）
    1. Release アセットを一時ディレクトリへダウンロード
    2. tar でプロジェクトへ直接展開（node_modules）
    3. package-lock.json をプロジェクトへコピーし npm ci で整合を取る
    4. 一時ファイルを削除（ローカルに何も残さない）
```

- **`template-snapshot/`**（このリポジトリにコミット）: 依存関係のバージョンを固定した `package.json` + `package-lock.json`。
  中身は `@GeekPowerCode` が標準 scaffold で使う依存関係一式（Vite / React / Tailwind v4 / TanStack Query / dnd-kit / recharts 等）。
  **`shadcn`（CLI）は含めない** — 実際の scaffold では `npx shadcn@latest ...` を都度実行するため常駐インストールが不要で、
  含めると `ts-morph` / `@modelcontextprotocol/sdk` 等の重い依存関係チェーンが付随してパッケージ数が約1.7倍に膨らむ
  （検証: 含めた場合 577、除いた場合 338 パッケージ）。生成された Code Apps 実プロジェクトの `package.json`
  （`.github/skills/code-apps/samples/*/package.json`）にも `shadcn` は含まれない。
- **GitHub Release**（`code-apps-template-cache-vite` タグ）: `template-snapshot` を `npm ci` した実体（`node_modules`）を
  tar.gz 化してアップロードしたもの。**これが「リモートのゴールデンフォルダ」**であり、ローカルマシンには同等のものを持たない。
- **`scaffold_from_cache.ps1`**: 新規プロジェクト scaffold のたびに Release アセットをダウンロード → 展開 → `npm ci` で
  プロジェクト固有の差分を解消 → 一時ファイル削除、という使い捨てのフローを実行する。

## 使い方

### 新規プロジェクト scaffold 時（SKILL.md Step 0 の代替）

```powershell
pwsh .github/skills/code-apps/scripts/scaffold_from_cache.ps1 -ProjectDir .
```

- リモートの Release アセット（`node_modules-vite.tar.gz` + `package-lock.json`）を一時ディレクトリにダウンロードし、
  `tar` でプロジェクトへ直接展開する（ローカルに永続キャッシュは作らない）。
- 展開後、プロジェクトの `package.json` に対して `npm ci --no-audit --no-fund` で整合を取る（プロジェクトがスナップショットと
  同一なら瞬時に完了）。プロジェクト固有の依存追加でロックファイルと不一致の場合は `npm install --no-audit --no-fund` に自動フォールバックする。
- ダウンロード自体が失敗する環境（オフライン・リリース未作成等）では、通常の `npm install --no-audit --no-fund` に全面フォールバックする。

## GitHub Action による自動更新

`geekfujiwara/CodeAppsDevelopmentStandard` リポジトリのルートに配置する
[`.github/workflows/refresh-code-apps-template-cache.yml`](../../../workflows/refresh-code-apps-template-cache.yml) が
毎週月曜 3:00 UTC（`workflow_dispatch` で手動実行も可）に以下を実行する。

1. `template-snapshot/package.json` + `package-lock.json` で `npm ci --no-audit --no-fund` を実行し、インストール成功を検証する。
2. `node_modules` を `node_modules-vite.tar.gz` にアーカイブする。
3. GitHub Release（タグ `code-apps-template-cache-vite`）のアセットとして `node_modules-vite.tar.gz` / `package.json` / `package-lock.json` を
   `gh release upload --clobber` で更新する（＝リモートのゴールデンフォルダを最新化）。
4. `package-lock.json` に差分があれば `template-snapshot/` へのコミットを含む PR を自動作成する（`peter-evans/create-pull-request`）。

> **既知の制限**: この Action は `npm ci` の成功のみを検証し、`vite build` によるフルビルド検証は行わない
> （テンプレートは `src/` を含まない依存関係一覧のみのため）。破壊的変更を含むメジャーアップデートは
> PR レビュー時に目視確認すること。

### Action 有効化の前提条件

- リポジトリ設定 → Actions → General → "Allow GitHub Actions to create and approve pull requests" を有効化する
  （無効の場合 `create-pull-request` アクションが失敗する）。
- `GITHUB_TOKEN`（`github.token`）のデフォルト権限（`contents: write` / `pull-requests: write`）で
  Release 作成・アセットアップロード・PR 作成のすべてが完結し、追加の PAT は不要。
- 初回のみ、マージ後に手動で `workflow_dispatch` を1回実行し、Release とアセットを作成しておく
  （`scaffold_from_cache.ps1` はアセットが存在しない場合、通常の `npm install` にフォールバックする）。

## トレードオフ・運用上の注意

- **ローカルには何も永続化されない**ため、複数開発者・複数マシンで常に同じ効果が得られる（設定漂流が起きない）。
- 展開先の Windows 版 `tar`（bsdtar、Windows 10 1803+ 同梱）を利用する。存在しない古い環境では自動フォールバックする。
- プロジェクトが `template-snapshot` にない依存関係を追加した場合、`npm ci` は失敗して `npm install` にフォールバックするため、
  差分パッケージのみネットワーク取得される（ゼロにはならないが最小限で済む）。
- `template-snapshot` の内容が実際の `@GeekPowerCode` scaffold の依存関係セットと乖離した場合は、
  このリポジトリの `template-snapshot/package.json` を手動更新し、次の週次 Action 実行時に Release アセットが追随する。

