# セキュリティロール トラブルシューティング

## トラブルシューティング

### 権限名が見つからない

```
原因: TableSchemaName の大文字小文字が一致していない
対策: EntityDefinitions から SchemaName を取得して使う（LogicalName ではない）
     例: geek_Project（SchemaName）≠ geek_project（LogicalName）

教訓:
  実環境では SchemaName が全小文字（LogicalName と同じ）でマッチするケースが確認された。
  例: geek_itasset → prvReadgeek_itasset で 8/8 全権限検出成功
  → SchemaName で 0 件の場合は LogicalName で再検索するフォールバックが有効
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

### 別テナントへのソリューション import で権限深度エラー

```
症状: The privilege <name> with id = <id> can't have depth = Basic, RoleId = ...
原因: コピー元環境の Basic User 権限をカスタムロールへ取り込むと、配布先環境の
  canbebasic/canbelocal/canbedeep/canbeglobal と一致しないことがある
対策: カスタムロールには対象機能のテーブル権限だけを設定する
  利用者にはカスタムロールと Basic User を別々に割り当てる
恒久対策: deploy_security_role.py の validate_role_definitions() が extra_privileges を拒否し、
      Basic User の権限を取得・コピーしない
```

### ReplacePrivilegesRole が失敗する

```
原因: 環境やロール状態によって権限の全置換が拒否されている
対策: エラー内容と各 privilege の許容深度を確認してから再実行する
禁止: AddPrivilegesRole へのフォールバック
  既存ロールに Basic User 由来の権限が残り、対象機能だけに絞れなくなるため
```

### 100件を超える権限設定が途中で失敗する

```
症状: 最初の ReplacePrivilegesRole は成功したが、2バッチ目以降の AddPrivilegesRole が失敗する
影響: ロールは最初の100件までが設定された中間状態になる
対策: エラー原因を解消して同じスクリプトを再実行する
  最初に ReplacePrivilegesRole が再実行されるため、最終的に定義どおりの権限へ収束する
```
