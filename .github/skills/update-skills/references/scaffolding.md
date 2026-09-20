# テンプレート同梱とスキャフォールド

「サンプルを読んで真似してもらう」ではなく、**テンプレートから作業ツリーを生成して始められる**
状態でスキルを配るための標準。`scripts/scaffold_from_template.py` がこの規約を実装している。

スキル固有のスキャフォールダーを毎回書かないこと。書くのは `templates/` とマニフェストだけで、
生成ロジック（置換・ブロック・未解決検出）は共通実装に任せる。

## 1. 置き場所

```
<skill-name>/
├── SKILL.md
├── references/
│   └── .env.example          # テンプレートが使う変数はここに定義する
├── scripts/
└── templates/
    └── <template-name>/
        ├── scaffold.json     # このテンプレートの宣言（推奨）
        ├── README.md
        └── __PKG__/
            └── main.py
```

テンプレート名は用途で分ける（例: `foundry-autopilot`、`code-app-basic`）。
1 スキルに複数のテンプレートを置いてよい。

## 2. 変数（`${VAR}` と `__VAR__`）

| 記法 | 使う場所 | 例 |
|---|---|---|
| `${VAR}` | ファイルの**中身** | `AGENT_NAME = "${AGENT_DISPLAY_NAME}"` |
| `__VAR__` | ファイル名・**フォルダ名** | `__PKG__/main.py` → `auri_agent/main.py` |

置換対象は **UPPER_SNAKE_CASE のみ**。TypeScript のテンプレートリテラル `` `${count}` `` や
シェルの `${1}` を変数と誤認しないための線引きで、テンプレートに JS/TS/シェルを混ぜても壊れない。

値の解決順は `.env` → `--var KEY=VALUE`（後勝ち）。プロセスの環境変数は
**マニフェストで宣言された名前だけ**参照する。`os.environ` を丸ごと流し込むと、
`${PATH}` のような偶然の一致で開発マシンの値が黙って埋め込まれる。

## 3. `scaffold.json`（マニフェスト）

すべて任意キーだが、**置くこと自体が「共通スキャフォールダーで配る」宣言**になる。

```json
{
  "description": "Foundry Autopilot で動く AI チームメイトのオーバーレイ",
  "variables": ["AGENT_DISPLAY_NAME", "AGENT_ROLE"],
  "optionalVariables": ["IMAGE_MODEL_DEPLOYMENT"],
  "derivedVariables": ["PKG"],
  "blockFiles": { "B17": ["image_tools.py"] },
  "nextSteps": ["python scripts/provision_image_model.py --execute"]
}
```

| キー | 意味 |
|---|---|
| `variables` | `.env` から取る必須の値。`references/.env.example` にも定義する |
| `optionalVariables` | 無くても生成できる値（機能ブロックの有効化など） |
| `derivedVariables` | 呼び出し側が組み立てて `--var` で渡す値（パッケージ名など）。`.env` には現れない |
| `blockFiles` | ファイル名 → 機能ブロック。選ばれていないブロックのファイルは生成しない |
| `nextSteps` | 生成直後に人が実行する手順。**生成物の外にある依存**をここに書く（→ 6 節） |

## 4. 機能ブロック（部分的な生成）

ファイル単位は `blockFiles`、ファイル内の一部は行マーカーで切り替える。

```python
# SCAFFOLD:BLOCK:B17:START
from .image_tools import build_image_tool
# SCAFFOLD:BLOCK:B17:END
```

`--blocks B17` で選ばれたブロックは**マーカー行だけ消して中身を残す**。
選ばれなければ中身ごと落ちる。マーカーが無いファイルは素通しする。

## 5. 未解決の変数は必ず失敗させる

置換されずに残った `${UPPER_SNAKE}` があると、スキャフォールダーは**1 ファイルも書かずに終了する**
（終了コード 3、残った変数名を全部並べる）。

未解決のまま書き出すと、生成物は「そのまま動かないコード」になり、原因がテンプレート由来だと
分からなくなる。壊れた成果物を渡すより、生成前に止める方が安い。

## 6. 生成ツリーの外にある依存を明示する

テンプレートが揃っていても、**Azure リソースやモデル デプロイのように生成ツリーの外にある依存**が
足りなければ動かない。ここが最も見落とされる。

- `nextSteps` に「先に実行すべきコマンド」を書き、生成直後に表示させる。
- それだけで終わらせず、**デプロイ/発行スクリプト側に実在確認のプリフライトを足す**
  （原則 6・再発防止）。次の手順を読み飛ばしても、発行時に落ちる。

実例: 画像生成の `IMAGE_MODEL_DEPLOYMENT` は、スキャフォールド直後の状態では Azure 側に
デプロイが存在せず、発行しても環境変数が渡らないためツールが登録されない。
どこにもエラーが出ないまま「機能だけ無い」エージェントが出来上がっていた。
対策は `nextSteps` での明示と、発行スクリプトでの `assert_image_deployment_exists()` の二段構え。

## 7. 検証

`validate_skill.py` は `scaffold.json` を持つテンプレートだけを検査する。

- テンプレートで使っている `${VAR}` / `__VAR__` が**マニフェストで宣言されているか**（error）
- 宣言したのに使われていない変数（warning）
- `variables` / `optionalVariables` が `references/.env.example` にあるか（warning）

マニフェストを置いていないテンプレートは対象外。すべてのテンプレートを無条件に走査すると、
JS/TS のテンプレートリテラルを未宣言変数として拾い、誤検出だらけになって誰も見なくなる。

生成せずに変数だけ確認したいときは:

```powershell
python .github/skills/update-skills/scripts/scaffold_from_template.py `
  --template .github/skills/<skill-name>/templates/<template-name> --list-variables
```

## 8. スキル側に書くこと

`SKILL.md` には「テンプレートがある」ことと**生成コマンド 1 行**を書く。
テンプレートの中身の説明は書かない（生成すれば読める）。

```powershell
python .github/skills/update-skills/scripts/scaffold_from_template.py `
  --template .github/skills/<skill-name>/templates/<template-name> `
  --target <出力先> --var PKG=<package_name> --dry-run
```

`--dry-run` で生成計画を確認 → 問題なければ外して実行、を既定の流れにする。
