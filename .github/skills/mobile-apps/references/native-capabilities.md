# ネイティブ機能と allowlist

## 原則

生成済みプロジェクトの `package.json` が native module の allowlist である。
module がなければ追加実装を停止し、upstream 対応待ちと明示する。native package を個別 install して
Wrap runtime に存在するように見せかけない。

同期済み template で Phase 1 に使える代表例:

| 機能 | module | 備考 |
|---|---|---|
| camera／barcode／QR | `expo-camera` | camera permission が必要 |
| image picker | `expo-image-picker` | photo library permission を分離 |
| location | `expo-location` | foreground／background を分離 |
| document | `expo-document-picker` | cancel を正常分岐として扱う |
| secure storage | `expo-secure-store` | secret を AsyncStorage に置かない |
| biometric | `expo-local-authentication` | 利用不能／未登録を分離 |
| sharing | `expo-sharing` | availability を確認 |

## Camera wrapper

画面から `expo-camera` を直接呼ばず、permission と結果を union に閉じる。

```typescript
// src/native/camera.ts
import { CameraView, useCameraPermissions } from "expo-camera"

export type CameraPermissionState =
  | { ok: true }
  | { ok: false; reason: "permission-denied" | "unsupported" }

export function useCameraAccess() {
  const [permission, requestPermission] = useCameraPermissions()

  const ensurePermission = async (): Promise<CameraPermissionState> => {
    if (!permission) return { ok: false, reason: "unsupported" }
    if (permission.granted) return { ok: true }
    const requested = await requestPermission()
    return requested.granted
      ? { ok: true }
      : { ok: false, reason: "permission-denied" }
  }

  return { CameraView, ensurePermission }
}
```

barcode／QR は `CameraView` の scanner callback を wrapper component に閉じ、同じ値の連続読取を debounce する。
permission denied では設定画面への導線を提示し、クラッシュや無限 permission prompt にしない。

Dataverse File／Image 列への保存は、generated service／native host control の実際の upload API を確認して bridge を作る。
base64 全体を画面 state やログへ保持しない。
