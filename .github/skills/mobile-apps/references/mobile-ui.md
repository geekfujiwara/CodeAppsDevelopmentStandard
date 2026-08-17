# React Native モバイル UI 標準

## Navigation

- 3〜5 個の主要領域は Expo Router `Tabs`
- 階層遷移、詳細、modal は folder ごとの `Stack`
- 画面数が多い管理系のみ `Drawer`
- auth 前後は route group を分け、未認証時は login へ redirect

## レイアウト

- root: `SafeAreaProvider`
- screen: `SafeAreaView` または `useSafeAreaInsets()`
- form: `KeyboardAvoidingView` + scroll container
- 固定 footer は home indicator と keyboard の両方を避ける
- orientation／小画面／font scaling で文字や操作が欠けない

## Accessibility

- touch target は原則 44 x 44 pt 以上
- icon-only control に `accessibilityLabel` と role を付ける
- color だけで状態を表さない
- dynamic text を固定 height に閉じ込めない
- screen reader の focus order を視覚順と一致させる

## 必須状態

全データ画面に loading、empty、error、retry、refresh を実装する。一覧は `result.skipToken` 等の cursor を使い、
総件数とページ番号へ依存しない。offline 表示は [offline.md](offline.md) の runtime support が確認できた場合だけ出す。

## 品質検証

`validate_mobile_project.py` は root provider、UI 危険パターン、allowlist、Preview marker を静的検証する。
静的検証だけでは touch target や keyboard の実挙動を保証できないため、Power Apps Developer app の実機確認を必須とする。
