---
name: code-apps-dev
description: "Power Apps Code Apps（コードファースト）の初期化・Dataverse 接続・開発・デプロイ。Use when: Code Apps, power-apps init, power-apps push, add-data-source, DataverseService, Tailwind, shadcn, React, TypeScript, Vite, Code Apps デプロイ, nameUtils パッチ, 日本語サニタイズ"
---

# Code Apps 開発スキル

Power Apps Code Apps（コードファースト）を **TypeScript + React + Tailwind CSS + shadcn/ui** で開発する。

> **UI 設計・コンポーネント選定** は `code-apps-design` スキルを参照。
> このスキルは初期化・Dataverse 接続・デプロイに特化。

## 大前提: 一つのソリューション内に開発

Dataverse テーブル・Code Apps・Power Automate フロー・Copilot Studio エージェントは **すべて同一のソリューション内** に含める。

```
SOLUTION_NAME=IncidentManagement  ← .env で定義。全フェーズで同じ値を使用
PUBLISHER_PREFIX=geek              ← ソリューション発行者の prefix
```

- Code Apps は `npx power-apps push` でソリューション内にデプロイされる（環境 ID で紐づけ）
- Dataverse データソース追加時はソリューション内のテーブルを参照
- 開発・テスト・本番の環境間移行はソリューションのエクスポート/インポートで行う

## 絶対遵守ルール（検証済み教訓）

### 先にデプロイ、後から開発（最重要）

```bash
# ✅ 正しい順序
npx power-apps init --display-name "アプリ名" --environment-id {ENV_ID} --non-interactive
npm install
npm run build
npx power-apps push --non-interactive    # ← まずデプロイ！
# この時点で Power Platform にアプリが登録され Dataverse 接続が確立
npx power-apps add-data-source ...       # ← その後にデータソース追加

# ❌ 間違い: ローカルで全部作ってから最後にデプロイ
#    → Dataverse 接続が確立されず add-data-source が失敗する
```

### npx power-apps を使う（pac code ではない）

```
❌ pac code add-data-source -a dataverse -t {table}
   → SDK v1.0.x でスクリプトパスが変更され "Could not find the PowerApps CLI script" エラー

✅ npx power-apps add-data-source --api-id dataverse \
     --resource-name {table_logical_name} \
     --org-url {DATAVERSE_URL} --non-interactive
```

### 日本語 DisplayName サニタイズエラーの回避

```
問題: テーブルの日本語表示名で "Failed to sanitize string インシデント" エラー
原因: nameUtils.js が ASCII 文字のみ許容
```

**修正対象**: `node_modules/@microsoft/power-apps-actions/dist/CodeGen/shared/nameUtils.js`

```javascript
// ❌ 元のコード
name = name.replace(/[^a-zA-Z0-9_$]/g, "_");

// ✅ 修正後（CJK・Unicode 文字を許容）
name = name.replace(
  /[^a-zA-Z0-9_$\u00C0-\u024F\u0370-\u03FF\u0400-\u04FF\u3000-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF]/g,
  "_",
);
```

> `npm install` で node_modules が再生成されるとパッチが消える。データソース追加のたびに確認が必要。

### スキーマ名は英語のみ

```
✅ テーブル: geek_incident  列: geek_description
❌ テーブル: geek_インシデント  列: geek_説明
→ 日本語スキーマ名は pac code add-data-source で失敗する
```

## 構築手順

### Step 1: プロジェクト初期化

```bash
npx power-apps init --display-name "アプリ名" \
  --environment-id {ENVIRONMENT_ID} --non-interactive
npm install
```

### Step 2: 先にビルド＆デプロイ

```bash
npm run build
npx power-apps push --non-interactive
```

### Step 3: Dataverse データソース追加

```bash
# テーブルごとに実行
npx power-apps add-data-source --api-id dataverse \
  --resource-name geek_incident \
  --org-url https://xxx.crm7.dynamics.com --non-interactive

# 日本語エラーが出たら nameUtils.js をパッチしてリトライ
```

### Step 4: 技術スタック導入

```bash
# Tailwind CSS
npm install -D tailwindcss @tailwindcss/vite

# shadcn/ui
npx shadcn@latest init
npx shadcn@latest add button card dialog table tabs badge input select textarea

# TanStack React Query
npm install @tanstack/react-query

# React Router
npm install react-router
```

### Step 5: DataverseService パターンで CRUD 実装

```typescript
import { DataverseService } from "../services/DataverseService";

// 一覧取得
const incidents = await DataverseService.GetItems(
  "geek_incidents",
  "$select=geek_name,geek_status,geek_priority" +
  "&$expand=geek_incidentcategoryid($select=geek_name)" +
  "&$expand=createdby($select=fullname)" +
  "&$orderby=createdon desc"
);

// レコード作成（Lookup は @odata.bind で設定）
await DataverseService.PostItem("geek_incidents", {
  geek_name: "ネットワーク障害",
  geek_description: "本社3Fで接続不可",
  geek_priority: 100000000,  // 緊急
  geek_status: 100000000,    // 新規
  "geek_incidentcategoryid@odata.bind": `/geek_incidentcategories(${categoryId})`,
  "geek_assignedtoid@odata.bind": `/systemusers(${userId})`,
});

// レコード更新
await DataverseService.PatchItem("geek_incidents", incidentId, {
  geek_status: 100000001,  // 対応中
});

// レコード削除
await DataverseService.DeleteItem("geek_incidents", incidentId);
```

### Step 6: 型定義

```typescript
// Choice 値は 100000000 始まり
export enum IncidentStatus {
  NEW = 100000000,
  IN_PROGRESS = 100000001,
  ON_HOLD = 100000002,
  RESOLVED = 100000003,
  CLOSED = 100000004,
}

export const statusLabels: Record<IncidentStatus, string> = {
  [IncidentStatus.NEW]: "新規",
  [IncidentStatus.IN_PROGRESS]: "対応中",
  [IncidentStatus.ON_HOLD]: "保留",
  [IncidentStatus.RESOLVED]: "解決済",
  [IncidentStatus.CLOSED]: "クローズ",
};

// Tailwind クラスも型安全に
export const statusColors: Record<IncidentStatus, string> = {
  [IncidentStatus.NEW]: "bg-blue-100 text-blue-800",
  [IncidentStatus.IN_PROGRESS]: "bg-yellow-100 text-yellow-800",
  [IncidentStatus.ON_HOLD]: "bg-gray-100 text-gray-800",
  [IncidentStatus.RESOLVED]: "bg-green-100 text-green-800",
  [IncidentStatus.CLOSED]: "bg-red-100 text-red-800",
};
```

### Step 7: ビルド＆再デプロイ

```bash
npm run build
npx power-apps push --non-interactive
```

## 技術スタック

| レイヤー       | 技術                                   |
|---------------|---------------------------------------|
| UI            | React 18 + TypeScript                  |
| スタイリング    | Tailwind CSS + shadcn/ui              |
| データフェッチ  | TanStack React Query                  |
| ルーティング    | React Router                          |
| ビルド         | Vite                                  |
| 状態管理       | React Query キャッシュ + React Context |
| Dataverse 通信 | DataverseService パターン              |

## TanStack React Query パターン

```typescript
// hooks/useIncidents.ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export function useIncidents() {
  return useQuery({
    queryKey: ["incidents"],
    queryFn: () => DataverseService.GetItems("geek_incidents",
      "$select=geek_name,geek_status&$orderby=createdon desc"),
  });
}

export function useCreateIncident() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateIncidentInput) =>
      DataverseService.PostItem("geek_incidents", data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["incidents"] }),
  });
}
```

## .env 必須項目

```env
DATAVERSE_URL=https://xxx.crm7.dynamics.com
ENVIRONMENT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
SOLUTION_NAME=SolutionName
PUBLISHER_PREFIX=prefix
```
