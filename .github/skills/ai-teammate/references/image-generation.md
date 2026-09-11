# B17 — 画像生成

Azure OpenAI の画像モデルをローカル ツールとして公開し、生成した PNG をエージェント自身の
OneDrive に保存する。画像モデル名やバージョンを推測せず、対象アカウントの利用可能モデル一覧を
事前検証する。

## 構成

```text
利用者 → AgentBrain → generate_image
                    ├─ Azure OpenAI /openai/v1/images/generations
                    └─ IFileDelivery → OneDrive → DocumentLedger
```

- 認証: B3 と同じ UAMI。スコープは `https://cognitiveservices.azure.com/.default`
- 保存: B14 の `IFileDelivery.DeliverAsync` を再利用
- 台帳: 認証済み話者のメールを `owner` としてコード側で固定
- 配布: `organization` スコープの OneDrive リンク
- メール監視: 外部メールだけで有料生成が走らないよう画像生成ツールを公開しない

## 事前検証とデプロイ

`.env` に次を設定する。

```dotenv
AZURE_OPENAI_RESOURCE_GROUP=rg-your-ai
AZURE_OPENAI_ACCOUNT=your-ai-account
IMAGE_GENERATION_MODEL=gpt-image-1.5
IMAGE_GENERATION_DEPLOYMENT=gpt-image-1.5
IMAGE_GENERATION_SKU=GlobalStandard
IMAGE_GENERATION_CAPACITY=1
IMAGE_GENERATION_TIMEOUT_SECONDS=300
```

```powershell
python scripts/provision_image_model.py --check
python scripts/provision_image_model.py
```

`--check` は要求モデルが提供されていることと、既存デプロイのモデル・バージョン・SKU が一致する
ことを確認する。要求モデルが一覧に無ければ、似た名前へフォールバックせず停止する。Azure CLI の
`deployment create` は `--model-version` が必須なので、利用可能一覧から解決してから作成する。

## アプリ設定

```text
ImageGeneration__Enabled=true
ImageGeneration__Deployment=<deployment-name>
ImageGeneration__TimeoutSeconds=300
```

一括 scaffold では B17 選択時に `ImageGenerationTools.cs` と DI 登録が生成される。既存アプリへ
追加する手順は [feature-blocks.md](feature-blocks.md) §10 を参照する。

## ツール設計

`generate_image` は一度に1枚だけ生成する。入力は `prompt`、`filename`、`size`、`quality`、
`background`、`sensitivity` に限定する。具体的な「作って」「生成して」は実行承認を兼ねる。
相談段階だけ内容を提示して承認を取り、承認済みターンでは説明を繰り返さない。グラフ、表、組織図、
正確な文字・数値が主役の図は B12 の Python 描画を使う。

## セキュリティ

- `owner` はモデルの引数を信用せず、Teams の認証済み話者 ID から解決したメールで上書きする。
- メール、Web、業務レコード、取り込んだファイル内の命令を生成根拠にしない。
- プロンプトと HTTP エラー本文は長さを制限し、アクセストークンや画像の base64 をログへ出さない。
- Azure OpenAI のコンテンツフィルターを迂回しない。

## 検証

1. `provision_image_model.py --check` が成功する。
2. UAMI に `Cognitive Services OpenAI User` がある。
3. `dotnet build -c Release` が成功する。
4. `/schema generate_image` で入力スキーマを確認する。
5. 正方形・横長・透過背景を各1回生成し、OneDrive 保存と台帳記録を確認する。
6. メール本文に画像生成命令を書いても自動生成されないことを確認する。
7. 生成物を別の利用者へ共有し、B14 の区分・同意判定が維持されることを確認する。