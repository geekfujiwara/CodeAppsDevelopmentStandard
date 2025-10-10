# Power Apps Code Apps 開発標準

## 目的
- 品質を向上させ、一定の出力結果を期待するために、**Power Apps Code Apps** の開発標準を定義します。さらに、AI活用、美しいデザイン、公開手順を組み込みます。
- [Code Apps](https://aka.ms/CodeApps) を開発するに当たっての開発標準。
## リファレンス
- https://learn.microsoft.com/en-us/power-apps/developer/code-apps/
---

## 章一覧
1. プロジェクトの初期化
2. フォルダ構成と命名規則
3. 基本方針
4. UI/UX 標準（デザインガイドライン）
5. セキュリティと認証
6. パフォーマンス最適化
7. テストとデバッグ
8. バージョン管理とリリース
9. ドキュメント管理
10. ロゴ設計
11. トラブルシューティング
12. Code Apps 公開手順（pac CLI + config） 

---

## 1. プロジェクトの初期化
- [開発環境の準備](https://learn.microsoft.com/en-us/power-apps/developer/code-apps/how-to/create-an-app-from-scratch) を参考にする。

---

## 2. フォルダ構成と命名規則
- [フォルダ構成と命名規則](https://learn.microsoft.com/en-us/power-apps/developer/code-apps/how-to/create-an-app-from-scratch) を参考にする。

---
## 3. 基本方針
- すべてを実装せず、必要最低限のカスタマージャーニーのみ設計し、それを実装する。
- 実装したカスタマージャーニーと実装していない項目は、ドキュメント( `README.MD` と `ToDoList.MD` )に反映する。
- 操作を行うたびに、ドキュメントに反映する。

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
- APIアクセス情報等は変数管理し、 `.gitignore` に追加  
---

## 6. パフォーマンス最適化
- データ委任、キャッシュ活用  
- 画像圧縮、Lazy Loading  
- AIによる改善提案を活用  

---

## 7. テストとデバッグ
1. 基本テスト
  - エラーが発生しているすべてのファイルを一覧にする。各ファイルのエラーの修正順番をプランする
  - プランに基づき、すべてのエラーを修正する。
  - すべてのファイルのエラーが修正されるまで繰り返し実行する。
2. Power Apps Code Apps のベストプラクティスに基づいたテストプランを作成する
  - [ベストプラクティスはこちら](https://learn.microsoft.com/en-us/power-apps/developer/code-apps/how-to/create-an-app-from-scratch)を参考にする。
3. 応用テスト
- Jest単体テスト + Playwright UIテスト
  - カバレッジ目標: 80%以上
---

## 8. バージョン管理とリリース
- GitHub フロー (main, develop, feature/*)  
- CI/CD 自動化  
- リリースノート自動生成（AI補助）  

---

## 9. ドキュメント 
- `README.MD` : アプリケーションの利用方法、設計情報、Mermaid記法に則ったコンポーネント、業務プロセスの可視化
- `ActionList.MD` : 開発済み機能、未開発機能の一覧、その他の課題一覧

---

## 10. ロゴ
- アプリのイメージに合ったロゴをsvgで出力する。

## 11. トラブルシューティング

- 「fetching your app」や「App timed out」エラー
    - npm run build 実行確認
    - PowerProvider.tsx の問題確認
- AIの行っている処理がループしてしまう場合は、問題をリストアップして一つ一つ対処案を考え、対処行う。
- 

## 12. Code Apps 公開手順（pac CLI + config）
1. 公開の手順は以下を参考にする。
  [Microsoft Learn: How to: Create a code app from scratch](https://learn.microsoft.com/en-us/power-apps/developer/code-apps/how-to/create-an-app-from-scratch)
2. 最初にローカルで実行して動作を確認する
3. 次にPower Apps 環境上でローカル実行し、問題なく実行できることを確認する。
4. Power Apps 環境にPushして本番環境で実行する。

