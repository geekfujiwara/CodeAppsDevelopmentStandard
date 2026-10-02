import { app } from "@azure/functions"

// 生成の回答案を Server-Sent Events で流すため、HTTP のストリーム応答を有効にする
app.setup({ enableHttpStream: true })

import "./functions/speechToken"
import "./functions/answer"
