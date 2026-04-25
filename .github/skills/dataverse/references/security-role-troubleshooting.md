# セキュリティロール トラブルシューティング

## トラブルシューティング

### 権限名が見つからない

```
原因: TableSchemaName の大文字小文字が一致していない
対策: EntityDefinitions から SchemaName を取得して使う（LogicalName ではない）
     例: geek_Incident（SchemaName）≠ geek_incident（LogicalName）

教訓:
  実環境では SchemaName が全小文字（LogicalName と同じ）でマッチするケースが確認された。
  例: geek_itasset → prvReadgeek_itasset で 8/8 全権限検出成功
  → SchemaName で 0 件の場合は LogicalName で再検索するフォールバックが有効
```

### RetrieveRolePrivilegesRole の戻り値フォーマット

```
戻り値の RolePrivileges 配列の各要素:
  {
    "PrivilegeId": "xxxxxxxx-xxxx-...",   # 大文字始まりキー
    "Depth": "Local",                      # 文字列（Basic/Local/Deep/Global）
    "BusinessUnitId": "...",
    "PrivilegeName": "prvRead..."
  }

→ dict に変換する際は PrivilegeId キー（大文字 P）で統一する
```

### ロール作成時に 403 Forbidden

```
原因: 実行ユーザーに System Administrator ロールがない
対策: セキュリティロール作成には System Administrator 権限が必要
```

### AddPrivilegesRole で権限が反映されない

```
原因: PrivilegeId が無効、または Depth がテーブルでサポートされていない
対策: 権限テーブルの canbebasic/canbelocal/canbedeep/canbeglobal を確認
     組織所有テーブルは Basic/Local/Deep は不可（Global のみ）
```

### ロールがソリューションに含まれない

```
原因: MSCRM.SolutionName ヘッダーの付け忘れ、または AddSolutionComponent 未実行
対策: ロール作成時にヘッダーを設定し、さらに AddSolutionComponent で検証・補完
```

### 子ビジネスユニットにロールが伝播しない

```
原因: Dataverse はルート BU にロールを作成すると子 BU に自動コピーする
      API で直接子 BU のロールを更新しても親には反映されない
対策: 常にルート BU のロールを更新する。子 BU への伝播は自動。
      ただし権限変更の反映にはタイムラグがある（最大数分）
```

### マスタテーブルの読み取り専用ロールでも AppendTo が必要

```
原因: Lookup 先テーブルに AppendTo 権限がないと、関連レコードの作成時に
      「このレコードへの追加先権限がありません」エラーになる
      例: インシデント作成時にカテゴリ Lookup を設定 → カテゴリテーブルに AppendTo が必要
対策: マスタテーブル（読み取り専用）にも AppendTo: "Global" を設定する

  例:
    geek_Category: { Read: "Global", AppendTo: "Global", 他は全て None }
    geek_Priority: { Read: "Global", AppendTo: "Global", 他は全て None }
```

### ReplacePrivilegesRole が失敗する場合のフォールバック

```
原因: 環境やロール状態によって ReplacePrivilegesRole がエラーになるケースがある
対策: ReplacePrivilegesRole 失敗時は AddPrivilegesRole にフォールバック
      スクリプトで try/except で切り替え処理を実装済み
```
