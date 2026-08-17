# セキュリティロール デプロイリファレンス

## ロールテンプレートパターン

### パターン A: フルアクセスロール（管理者用）

```python
ROLE_DEFINITIONS = [
    {
        "name": "アプリ名 管理者",
        "description": "全テーブルに対するフルアクセス権限",
        "table_privileges": {
            # テーブル SchemaName → (CRUD + Append/AppendTo/Assign/Share の Depth)
            "*": {  # ソリューション内全テーブル
                "Create": "Global",
                "Read": "Global",
                "Write": "Global",
                "Delete": "Global",
                "Append": "Global",
                "AppendTo": "Global",
                "Assign": "Global",
                "Share": "Global",
            },
        },
    },
]
```

### パターン B: 一般ユーザーロール

```python
{
    "name": "アプリ名 ユーザー",
    "description": "基本的な CRUD 権限（自分のレコード + BU 内読み取り）",
    "table_privileges": {
        "*": {  # ソリューション内全テーブル（デフォルト）
            "Create": "Local",
            "Read": "Local",
            "Write": "Basic",  # 自分のレコードのみ編集
            "Delete": "Basic",  # 自分のレコードのみ削除
            "Append": "Local",
            "AppendTo": "Local",
            "Assign": "Basic",
            "Share": "Basic",
        },
        # マスタテーブルは読み取り専用に上書き
        "geek_Category": {
            "Create": None,   # None = 権限なし
            "Read": "Global",
            "Write": None,
            "Delete": None,
            "Append": None,
            "AppendTo": "Global",
            "Assign": None,
            "Share": None,
        },
    },
}
```

### パターン C: 閲覧専用ロール

```python
{
    "name": "アプリ名 閲覧者",
    "description": "読み取りのみ。編集・削除不可",
    "table_privileges": {
        "*": {
            "Create": None,
            "Read": "Global",
            "Write": None,
            "Delete": None,
            "Append": None,
            "AppendTo": None,
            "Assign": None,
            "Share": None,
        },
    },
}
```

## デプロイスクリプト

### `./deploy_security_role.py`

ソリューション内のテーブルを自動検出し、以下のステップを実行:

1. **ルートビジネスユニット取得** — `businessunits` から `parentbusinessunitid eq null` で取得
2. **ソリューション内テーブル一覧取得** — `solutioncomponents` + `EntityDefinitions` で自動検出（SchemaName 取得必須）
3. **テーブル権限 ID 取得** — `privileges` テーブルから `prv{Verb}{SchemaName}` パターンで検索
4. **ロールのべき等作成** — 名前 + BU で検索 → 更新 or 新規作成
5. **対象機能のテーブル権限設定** — `ROLE_DEFINITIONS` に明示した権限だけを組み立て → 最初のバッチは `ReplacePrivilegesRole` で全置換、2 バッチ目以降は `AddPrivilegesRole` で追加
6. **ソリューション含有検証** — `AddSolutionComponent` (ComponentType=20)
7. **モデル駆動型アプリ関連付け**（オプション）— `appmoduleroles_association`

```bash
# 実行
python ./deploy_security_role.py
```

## ユーザー・チームへの割り当て

利用者または利用者チームへ次の2ロールを別々に割り当てる:

1. **Basic User** — Dataverse の標準機能に必要な権限
2. **カスタムロール** — 対象機能のテーブル CRUD と必要な Append / AppendTo / Assign / Share

この2ロールを割り当てる手順を配布手順書へ必ず記載する。カスタムロールだけでは標準機能が不足し、
Basic User だけでは対象機能のカスタムテーブルへアクセスできない。

### 既存ロールを移行する順序

旧方式で Basic User の権限をコピー済みのカスタムロールを更新する場合は、次の順序を守る:

1. 対象ユーザー/チームへ Basic User を先に割り当てる
2. `deploy_security_role.py` を実行し、カスタムロールを対象機能のテーブル権限だけで全置換する
3. 対象ユーザーで標準機能と対象機能の両方を確認する

手順1より先にスクリプトを実行すると、全置換の時点で Basic User 由来の権限が失われ、
利用中のユーザーが一時的に標準機能へアクセスできなくなる。
