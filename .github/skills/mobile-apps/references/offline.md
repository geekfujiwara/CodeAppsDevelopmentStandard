# Mobile Offline の境界

## Profile authoring

Dataverse Mobile Offline Profile では、対象テーブル、filter、relation、ユーザー／チーム割り当てを管理する。
スキーマ変更後は profile と generated schema の drift を再確認する。これは管理面の設定であり、
アプリ内の offline runtime が動作することを意味しない。

## Runtime support

同期済み公式 template は `@microsoft/power-apps-native-offline` を含むが、本スキルでは次を未検証として扱う。

- runtime store への read／write
- offline mutation queue と conflict resolution
- reconnect 時の sync、retry、duplicate prevention
- offline cursor paging

upstream host の対応と iOS／Android 実機テストが確認できるまで、独自 AsyncStorage cache を
「Dataverse Mobile Offline」と呼ばない。offline UI、sync badge、queue count も実装済みと案内しない。

Phase 3 では profile authoring／assignment／drift check だけを実施し、runtime は別の受け入れテストを設ける。
