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

### `scripts/deploy_security_role.py`

ソリューション内のテーブルを自動検出し、以下のステップを実行:

1. **ルートビジネスユニット取得** — `businessunits` から `parentbusinessunitid eq null` で取得
2. **ソリューション内テーブル一覧取得** — `solutioncomponents` + `EntityDefinitions` で自動検出（SchemaName 取得必須）
3. **テーブル権限 ID 取得** — `privileges` テーブルから `prv{Verb}{SchemaName}` パターンで検索
3.5. **Basic User ロールの全権限取得** — `RetrieveRolePrivilegesRole(RoleId={id})` で約 480 権限を取得（カスタムロールの土台）
4. **ロールのべき等作成** — 名前 + BU で検索 → 更新 or 新規作成
5. **権限設定（Basic User + カスタム）** — Basic User 権限を dict にコピー → カスタムテーブル権限で上書き/追加 → 最初のバッチは `ReplacePrivilegesRole` で全置換、2 バッチ目以降は `AddPrivilegesRole` で追加
6. **ソリューション含有検証** — `AddSolutionComponent` (ComponentType=20)
7. **モデル駆動型アプリ関連付け**（オプション）— `appmoduleroles_association`

```bash
# 実行
python scripts/deploy_security_role.py
```
