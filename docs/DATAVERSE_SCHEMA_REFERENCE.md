# Dataverseスキーマリファレンス

実際のDataverse環境から取得したテーブル定義とChoice値の完全なリファレンスです。

**情報源:** 
- Power Platform Maker Portal
- Dataverse Solution Export (customizations.xml)
- 最終確認日: 2025年10月17日

## 関連ドキュメント

- **[HOW_TO_GET_DATAVERSE_SCHEMA.md](./HOW_TO_GET_DATAVERSE_SCHEMA.md)** - スキーマ取得方法の完全ガイド
- **[EXTRACT_DATAVERSE_SCHEMA_FROM_XML.md](./EXTRACT_DATAVERSE_SCHEMA_FROM_XML.md)** - XMLからの自動抽出方法
- **[DATAVERSE_CHOICE_FIELD_FIX.md](./DATAVERSE_CHOICE_FIELD_FIX.md)** - Choice値マッピングの実装例

---

## プロジェクト（geek_projecrt）

### テーブル情報
- **論理名**: `geek_projecrt`
- **主キー**: `geek_projecrtid`
- **リレーション**: 1対多でプロジェクトタスクと関連

### フィールド定義

| 論理名 | 型 | 説明 |
|--------|-----|------|
| `geek_projecrtid` | primarykey | エンティティの一意識別子 |
| `geek_name` | nvarchar | プロジェクトの名称 |
| `geek_id` | nvarchar | プロジェクトの識別子 |
| `geek_description` | nvarchar | プロジェクトの詳細説明 |
| `geek_start` | datetime | プロジェクトの開始日 |
| `geek_end` | datetime | プロジェクトの終了予定日 |
| `geek_manager` | nvarchar | プロジェクト責任者の名前 |
| `geek_status` | picklist | プロジェクトの進行状況 |
| `createdon` | datetime | レコードを作成した日時 |
| `createdby` | lookup | レコードを作成したユーザー |
| `modifiedon` | datetime | レコードを変更した日時 |
| `modifiedby` | lookup | レコードを修正したユーザー |
| `ownerid` | owner | 所有者 ID |
| `statecode` | state | プロジェクトの状態 |
| `statuscode` | status | プロジェクトの状態の理由 |

### Choice値（選択肢列）

#### geek_status（進行状況）
| 値 | 表示名 | 備考 |
|----|--------|------|
| `0` | InProgress | |
| `1` | Planning | |

#### statecode（状態）
| 値 | 表示名 | 備考 |
|----|--------|------|
| `0` | アクティブ | defaultstatus=1 |
| `1` | 非アクティブ | defaultstatus=2 |

#### statuscode（状態の理由）
| 値 | 表示名 | 備考 |
|----|--------|------|
| `1` | アクティブ | state=0 |
| `2` | 非アクティブ | state=1 |

---

## プロジェクトタスク（geek_project_task）

### テーブル情報
- **論理名**: `geek_project_task`
- **主キー**: `geek_project_taskid`
- **リレーション**: 多対1でプロジェクトに関連（`geek_projectid`）

### フィールド定義

| 論理名 | 型 | 説明 |
|--------|-----|------|
| `geek_project_taskid` | primarykey | エンティティの一意識別子 |
| `geek_name` | nvarchar | タスクの名称 |
| `geek_id` | nvarchar | タスクの一意識別子 |
| `geek_description` | nvarchar | タスクの詳細説明 |
| `geek_start` | datetime | タスクの開始日 |
| `geek_end` | datetime | タスクの終了日 |
| `geek_duration` | int | タスクの期間（日数） |
| `geek_progress` | int | タスクの進捗率（％） |
| `geek_assignee` | nvarchar | タスクの担当者（⚠️非推奨：geek_lookup_assigneeを使用） |
| `geek_lookup_assignee` | lookup | タスクの担当者（SystemUserへの検索列） |
| `geek_priority` | picklist | タスクの優先度 |
| `geek_category` | picklist | タスクのカテゴリ |
| `geek_status` | picklist | タスクの状態 |
| `geek_projectid` | lookup | 紐づくプロジェクト |
| `createdon` | datetime | レコードを作成した日時 |
| `createdby` | lookup | レコードを作成したユーザー |
| `modifiedon` | datetime | レコードを変更した日時 |
| `modifiedby` | lookup | レコードを修正したユーザー |
| `ownerid` | owner | 所有者 ID |
| `statecode` | state | タスクの状態 |
| `statuscode` | status | タスクの状態の理由 |

### Choice値（選択肢列）

#### geek_priority（優先度）
| 値 | 表示名 | 備考 |
|----|--------|------|
| `0` | Critical | Dataverseで定義済み（重要） |
| `1` | High | Dataverseで定義済み（高） |

**⚠️ 注意**: 
- このスキーマは2025年10月17日時点の実際のDataverse環境の値です
- 以前のバージョンでは`Low`, `Medium`, `High`, `Critical`が`0-3`でしたが、現在は`Critical(0)`, `High(1)`のみです
- アプリケーション側で`Medium`や`Low`を使用する場合は`High (1)`にマッピングしてください
- 詳細は [DATAVERSE_CHOICE_FIELD_FIX.md](./DATAVERSE_CHOICE_FIELD_FIX.md) を参照

#### geek_category（カテゴリ）
| 値 | 表示名 | 備考 |
|----|--------|------|
| `0` | Planning | 計画 |

⚠️ **注意**: 他のカテゴリ（`Setup`, `Migration`, `Training`等）は定義されていません

#### geek_status（状態）
| 値 | 表示名 | 備考 |
|----|--------|------|
| `0` | Completed | 完了 |
| `1` | InProgress | 進行中 |
| `2` | NotStarted | 未開始 |

⚠️ **注意**: `OnHold`（保留）と`Cancelled`（キャンセル）は定義されていません

#### statecode（状態）
| 値 | 表示名 | 備考 |
|----|--------|------|
| `0` | アクティブ | defaultstatus=1 |
| `1` | 非アクティブ | defaultstatus=2 |

#### statuscode（状態の理由）
| 値 | 表示名 | 備考 |
|----|--------|------|
| `1` | アクティブ | state=0 |
| `2` | 非アクティブ | state=1 |

---

## リレーション

### プロジェクト 1 : N プロジェクトタスク

```
geek_project_task.geek_projectid → geek_projecrt.geek_projecrtid
```

- **リレーション名**: `geek_project_task_projectid_geek_projecrt`
- **物理名**: `geek_projectid` (参照属性)
- **カーディナリティ**: 1対多 (OneToMany)
- **参照整合性** (Cascade動作):
  - **CascadeDelete**: `RemoveLink` (プロジェクト削除時、タスクのリンクを削除)
  - **CascadeArchive**: `RemoveLink` (プロジェクトアーカイブ時、タスクのリンクを削除)
  - **CascadeAssign**: `NoCascade` (所有者変更時、カスケードしない)
  - **CascadeShare**: `NoCascade` (共有時、カスケードしない)
  - **CascadeUnshare**: `NoCascade` (共有解除時、カスケードしない)
- **Advanced Find有効**: Yes (`IsValidForAdvancedFind="1"`)
- **ナビゲーションプロパティ**:
  - 参照側 (Tasks): `geek_projectid`
  - 被参照側 (Projects): `geek_project_task_projectid_geek_projecrt`

---

## システムフィールド

以下のフィールドは**Dataverseが自動管理**するため、Create/Update操作では送信しません:

- `ownerid`: 所有者（自動設定）
- `statecode`: 状態（自動設定）
- `statuscode`: 状態の理由（自動設定）
- `createdon`: 作成日時（自動設定）
- `createdby`: 作成者（自動設定）
- `modifiedon`: 更新日時（自動設定）
- `modifiedby`: 更新者（自動設定）
- `*name`: 仮想フィールド（Choice/Lookupの表示名、読み取り専用）

---

## 実装上の注意

### 1. Choice値の未定義項目

UIで使用する選択肢の中には、Dataverseに定義されていないものがあります。
これらは最も近い意味の値にマップしています:

**Priority:**
- `Medium` → `High(1)` にマップ
- `Low` → `High(1)` にマップ

**Category:**
- `Setup`, `Migration`, `Training`, `Testing`, `GoLive` → `Planning(0)` にマップ

**Task Status:**
- `OnHold` → `InProgress(1)` にマップ
- `Cancelled` → `Completed(0)` にマップ

### 2. Lookupフィールドの送信方法

Lookupフィールド（`geek_projectid`）は`@odata.bind`構文で送信:

```typescript
{
  'geek_projectid@odata.bind': `/geek_projecrts(${projectId})`
}
```

### 3. Lookupフィールドのフィルター構文

Lookupフィールドでフィルタリングする際は `_<fieldname>_value` 構文を使用:

```typescript
const filter = `_geek_projectid_value eq '${projectId}'`;
```

### 4. 仮想フィールド（*name）

Choice/Lookupフィールドには対応する仮想フィールドが自動生成されます:

- `geek_priority` → `geek_priorityname` (表示名)
- `geek_category` → `geek_categoryname` (表示名)
- `geek_status` → `geek_statusname` (表示名)
- `geek_projectid` → `geek_projectidname` (プロジェクト名)

これらは**読み取り専用**で、Create/Update時には送信しません。

---

## 更新履歴

- **2025/10/17**: 実際のDataverse環境から取得したスキーマ情報に基づいて作成
