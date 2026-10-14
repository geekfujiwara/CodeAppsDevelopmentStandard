---
name: Create Company Standard Repository
description: "公開元から自社標準用の internal/private GitHub リポジトリを REST API で作成する"
argument-hint: "Organization 名と作成するリポジトリ名（例: contoso CompanyDevelopmentStandard）"
agent: agent
tools: [execute, read, search]
---

`https://github.com/geekfujiwara/CodeAppsDevelopmentStandard` を基に、自社標準用の独立した GitHub リポジトリを作成してください。

## 必須要件

1. Organization 名と新しいリポジトリ名が入力にない場合は、作業前に一つずつ確認する。
2. リポジトリは GitHub REST API の `POST /orgs/{org}/repos` で作成する。Web UI や `gh repo create` は使わない。`gh api`、安全に取得した GitHub credential、または利用可能な GitHub API ツールは使用してよい。
3. 対象が GitHub Enterprise Cloud 配下の Organization で `internal` を利用できる場合は、`visibility: internal` を推奨する。
4. `internal` が利用できない、または API が拒否した場合は、理由と API エラーを示してユーザーへ確認する。確認なしに `private` へ切り替えない。
5. 公開リポジトリの fork は public のままで `internal`/`private` に変更できないため、GitHub の fork API は使わない。公開元のファイルだけをコピーし、`.git` を含めず、新しい `main` 履歴を開始する。
6. `origin` は新しい自社標準リポジトリ、`upstream` は `https://github.com/geekfujiwara/CodeAppsDevelopmentStandard.git` にする。
7. トークン、パスワード、Git credential、環境変数の機密値をチャット、コマンド出力、ファイルへ表示しない。
8. 同名リポジトリが存在する場合は上書き、削除、可視性変更をせず、既存リポジトリの URL と状態を報告して停止する。

## 実行手順

1. Organization の存在、認証ユーザー、リポジトリ作成権限を API で確認する。
2. 作業先に同名ディレクトリがないことを確認する。
3. `npx degit geekfujiwara/CodeAppsDevelopmentStandard <repository>`、または一時 clone から `.git` を除去する安全な同等手順でファイルをコピーする。
4. `git init -b main`、`git add --all`、初回 commit を実行する。
5. `visibility: internal` を指定して API で Organization repository を作成する。
6. `origin` と `upstream` を登録し、`main` を `origin` へ push する。
7. GitHub API で `owner.login`、`visibility`、`default_branch` を読み戻す。
8. `git ls-remote origin refs/heads/main` とローカル HEAD が一致すること、作業ツリーが clean であることを検証する。

独立した履歴なので `upstream` を自動 merge しないでください。更新は README の「上流の開発標準更新を取り込む」に従って標準ファイルを同期し、自社変更との差分をレビューします。

完了時は、リポジトリ URL、visibility、default branch、初回 commit hash、`origin`/`upstream` の URL、検証結果を簡潔に報告してください。
