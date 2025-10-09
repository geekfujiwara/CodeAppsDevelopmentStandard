# Power Apps Code Apps 開発標準

## 目的
- 品質を向上させ、一定の出力結果を期待するために、**Power Apps Code Apps** の開発標準を定義します。さらに、AI活用、美しいデザイン、公開手順を組み込みます。
- [Code Apps](https://aka.ms/CodeApps) を開発するに当たっての開発標準。
## リファレンス
- https://learn.microsoft.com/en-us/power-apps/developer/code-apps/
---

## 章一覧
1. 開発環境の準備  
2. プロジェクト構成と命名規則  
3. コード品質とレビュー（AI支援）  
4. UI/UX 標準（デザインガイドライン）  
5. セキュリティと認証  
6. パフォーマンス最適化  
7. テストとデバッグ（AI活用）  
8. バージョン管理とリリース  
9. AI活用ガイドライン（AI First）  
10. Code Apps 公開手順（pac CLI + config）  

---

## 1. 開発環境の準備
- **必須ツール**: Visual Studio Code, Node.js (LTS), Power Platform CLI (pac)  
- **拡張機能**: Power Platform Tools, ESLint, Prettier  
- **初期設定**:  
  - `npm install` により依存関係を管理  
  - `.editorconfig` をリポジトリに配置  

---

## 2. プロジェクト構成と命名規則
- **標準ディレクトリ構成**:

`/src`

`/components`

`/services`

`/models`

`/tests`

`/config`

- コンポーネント名: PascalCase  
- 変数名: camelCase  
- ファイル拡張子: `.tsx` (React), `.ts` (TypeScript)  


- **命名規則**:  
  - コンポーネント名: PascalCase  
  - 変数名: camelCase  
  - ファイル拡張子: `.tsx` (React), `.ts` (TypeScript)  

---
## 3. コード品質とレビュー（AI支援）
- ESLint + Prettier 導入  
- Pull Request レビュー必須  
- AIによるコード生成・レビュー補助（セキュリティ・パフォーマンス）  

---

## 4. UI/UX 標準（デザインガイドライン）
- **レスポンシブ対応**: Flexbox / Grid を活用  
- **美しさの基本**:  
  - margin: 24px  
  - padding: 16px  
  - border-radius: 8px  
  - box-shadow: `0 4px 8px rgba(0,0,0,0.1)`  
- **色とフォント**:  
  - 背景: `#FAFAFA`  
  - テキスト: `#333333`  
  - アクセントカラー: `#3EA8FF`  
  - フォント: `'Noto Sans JP', sans-serif`  
- **アクセシビリティ**: WCAG 準拠  

---

## 5. セキュリティと認証
- `.env` 管理、`.gitignore` に追加  
- HTTPS 必須  
- Microsoft Entra ID 認証 + RBAC  
- AI生成コードは必ずセキュリティレビュー  

---

## 6. パフォーマンス最適化
- データ委任、キャッシュ活用  
- 画像圧縮、Lazy Loading  
- AIによる改善提案を活用  

---

## 7. テストとデバッグ（AI活用）
- Jest 単体テスト、Playwright UIテスト  
- カバレッジ目標: 80%以上  
- AIによるテストケース生成  

---

## 8. バージョン管理とリリース
- GitHub フロー (main, develop, feature/*)  
- CI/CD 自動化  
- リリースノート自動生成（AI補助）  

---

## 9. AI活用ガイドライン（AI First）
- AI生成コードは必ず人間レビュー  
- 機密情報をAIに入力しない  
- 利用範囲: コード生成、ドキュメント、テスト補助  

---

## 10. Code Apps 公開手順（pac CLI + config）
プロジェクトの作成からアプリの初期化、公開の手順は以下を参考にする。
[Microsoft Learn: How to: Create a code app from scratch](https://learn.microsoft.com/en-us/power-apps/developer/code-apps/how-to/create-an-app-from-scratch)

### ロゴ
- アプリのイメージに合ったロゴをsvgで出力する。

### トラブルシューティング

- 「fetching your app」や「App timed out」エラー
    - npm run build 実行確認
    - PowerProvider.tsx の問題確認
