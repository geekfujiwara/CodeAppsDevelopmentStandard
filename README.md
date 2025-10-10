# Power Apps Code Apps 開発標準

## 本開発標準の目的
- Power Apps の JavaScript ベースの開発手法である Code Apps のための品質を向上させる開発標準です。
- 本開発標準を参照することで、 Code Apps 開発における期待する結果を短時間で得ることを目的とします。

## 開発の流れ
### 前提条件
- Code Apps の開発の流れは以下のとおりです。必ず以下のStep にしたがって開発を進める。
- 各ステップ開始前には、実行状況を可視化するために `README.MD` 及び `ToDoList.MD` を更新し、プロジェクトの開始時には、最初に以下の手順を実行する。
- [Code Apps のスクラッチからの開発](https://learn.microsoft.com/en-us/power-apps/developer/code-apps/how-to/create-an-app-from-scratch) を参考にする。

### 開発手順
- Step1: Code Apps のスクラッチからの開発に基づき、最初は Code Apps のテンプレートをベースにした開発の手順を確認する。
- Step2: Code Apps のスクラッチからの開発に基づき、まずは読み込んだテンプレートを Power Apps への公開まで行う。
- Step3: テンプレートの Power Apps への公開が正しく完了したら、今回の要件と本開発標準のデザイン基準に基づき、必要な手順の設計を行う。この時、今回の要件について、ユーザーに確認すべき事項があれば提案して選択させる。
- Step4: 今回の要件に基づき、Power Apps の Code Apps への公開を前提としてテンプレートのコードを修正する。
- Step5: アプリのイメージに合ったロゴをsvgで出力する。
- Step6: 今回の要件に基づいたコードを出力したら、本開発標準のテスト基準に基づき、テスト計画を立案する。
- Step7: テスト計画を立案したら、そのテストを実行する。エラーが修正されるまで実行する。
- Step8: Code Apps を本開発書の手順に則り公開する。

## デザイン基準
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

## セキュリティ基準
- `.env` 管理、`.gitignore` に追加  
- APIアクセス情報等は変数管理し、 `.gitignore` に追加  

## パフォーマンス基準
- データ委任、キャッシュ活用  
- 画像圧縮、Lazy Loading  

## テスト基準
### 前提条件
  - AIの行っている処理がループしてしまう場合は、問題をリストアップして一つ一つ対処案を考え、対処行う。

### テスト内容
1. テスト計画
  - 基本計画
    - エラーが発生しているすべてのファイルを一覧にする。各ファイルのエラーの修正順番を計画する。
    - ロゴが正しく表示されるように参照を確認する。
    - フォルダ階層を参照している部分があれば、Code Apps として Power Apps に公開した際に問題が発生しないように修正する。
    - config.json の内容をレビューして修正点がないか確認する。

  - セキュリティ基準
    - `.env` 管理、`.gitignore` に追加  
    - APIアクセス情報等は変数管理し、 `.gitignore` に追加  

  - パフォーマンス基準
    - データ委任、キャッシュ活用  
    - 画像圧縮、Lazy Loading
  
  - Jest単体テスト + Playwright UIテストを実計画する。(カバレッジ目標: 80%以上)
  - `npm run build` を実行確認し、問題をリストアップする。
  - スクラッチからのアプリの開発を参考にし、PowerProvider.tsx の問題をリストアップする。


2. テスト実行
  - プランに基づき、すべてのエラーを修正する。
  - すべてのファイルのエラーが修正されるまで繰り返し実行する。

## 公開手順
1. 公開の手順は以下を参考にする。
  [Microsoft Learn: How to: Create a code app from scratch](https://learn.microsoft.com/en-us/power-apps/developer/code-apps/how-to/create-an-app-from-scratch)
2. 最初にローカルで実行して動作を確認する
3. 次にPower Apps 環境上でローカル実行し、問題なく実行できることを確認する。
4. Power Apps 環境にPushして本番環境で実行する。

## ドキュメント 
各Step実行する際に更新を行うドキュメントは以下の通り:

  - `README.MD` : アプリケーションの利用方法、設計情報、Mermaid記法に則ったコンポーネント、業務プロセスの可視化
  - `ActionList.MD` : 開発済み機能、未開発機能の一覧、その他の課題一覧

以上
