// three に依存しない定数（サービス層から参照しても 3D の依存を初期バンドルに含めないため分けている）

/** Dataverse のファイル列に保存した CAD モデルを示す ${PUBLISHER_PREFIX}_modelurl の値 */
export const CAD_MODEL_URL = "dataverse:${PUBLISHER_PREFIX}_modelfile"
/** 橋梁の標準モデル（アプリに同梱した GLB） */
export const BUNDLED_BRIDGE_URL = "bundled:bridge-3span"
export const MODEL_TYPE_BRIDGE = 100000000
