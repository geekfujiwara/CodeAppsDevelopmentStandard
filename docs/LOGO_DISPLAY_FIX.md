# ロゴ表示トラブルシューティング

## 問題: アプリ起動中にロゴが表示されない

### 発生日
2025年10月17日

### 症状
- アプリヘッダーでロゴコンポーネント（`<AppLogo />`）が呼び出されているが、画面にロゴが表示されない
- コンソールエラーなし
- レイアウトは正常

### 原因
**SVGグラデーションIDの衝突**

```tsx
// 問題のあるコード
<defs>
  <linearGradient id="bgGradient" ...>  <!-- ハードコードされたID -->
  <linearGradient id="barGradient1" ...>
  <linearGradient id="barGradient2" ...>
  <linearGradient id="barGradient3" ...>
  <filter id="shadow" ...>
</defs>
```

複数のロゴインスタンスが同じページに存在する場合、SVG内の`id`属性が重複し、ブラウザが正しくレンダリングできなくなります。

### 技術的詳細

#### SVG ID衝突の仕組み
1. DOMでは`id`属性はページ全体で一意である必要がある
2. 複数の`<AppLogo>`コンポーネントがレンダリングされると、同じIDが重複
3. `url(#bgGradient)`などの参照が最初のインスタンスのみを指す
4. 後続のロゴは正しいグラデーション参照を取得できず、表示されない

#### 影響範囲
- ヘッダーにロゴ
- サイドバーにロゴ
- ローディング画面にロゴ

上記のように複数箇所で使用される場合に問題が顕在化。

---

## 解決策

### ✅ React.useId() フックを使用

React 18+で提供される`useId()`フックを使って、各コンポーネントインスタンスごとにユニークなIDを生成。

```tsx
export const AppLogo: React.FC<AppLogoProps> = ({ 
  size = 40, 
  showText = true,
  className = '' 
}) => {
  // ✅ ユニークなIDを生成
  const uniqueId = React.useId();
  const bgGradientId = `bgGradient-${uniqueId}`;
  const barGradient1Id = `barGradient1-${uniqueId}`;
  const barGradient2Id = `barGradient2-${uniqueId}`;
  const barGradient3Id = `barGradient3-${uniqueId}`;
  const shadowId = `shadow-${uniqueId}`;

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <svg ...>
        <defs>
          <linearGradient id={bgGradientId} ...>
            {/* グラデーション定義 */}
          </linearGradient>
          {/* 他のグラデーション */}
        </defs>
        
        {/* ✅ 動的IDを参照 */}
        <circle fill={`url(#${bgGradientId})`} filter={`url(#${shadowId})`} />
        <rect fill={`url(#${barGradient1Id})`} />
        <rect fill={`url(#${barGradient2Id})`} />
        <rect fill={`url(#${barGradient3Id})`} />
      </svg>
    </div>
  );
};
```

### 修正内容

#### Before (v1.0.6)
```tsx
<linearGradient id="bgGradient">  <!-- ❌ 固定ID -->
  ...
</linearGradient>
<circle fill="url(#bgGradient)" />  <!-- ❌ 固定参照 -->
```

#### After (v1.0.7)
```tsx
const uniqueId = React.useId();
const bgGradientId = `bgGradient-${uniqueId}`;

<linearGradient id={bgGradientId}>  <!-- ✅ 動的ID -->
  ...
</linearGradient>
<circle fill={`url(#${bgGradientId})`} />  <!-- ✅ 動的参照 -->
```

---

## 修正箇所

### ファイル: `src/components/AppLogo.tsx`

#### 1. ユニークID生成（行16-24）
```tsx
const uniqueId = React.useId();
const bgGradientId = `bgGradient-${uniqueId}`;
const barGradient1Id = `barGradient1-${uniqueId}`;
const barGradient2Id = `barGradient2-${uniqueId}`;
const barGradient3Id = `barGradient3-${uniqueId}`;
const shadowId = `shadow-${uniqueId}`;
```

#### 2. グラデーション定義の更新（行36-54）
```tsx
<linearGradient id={bgGradientId} ...>
<linearGradient id={barGradient1Id} ...>
<linearGradient id={barGradient2Id} ...>
<linearGradient id={barGradient3Id} ...>
<filter id={shadowId} ...>
```

#### 3. グラデーション参照の更新（行58-68）
```tsx
<circle fill={`url(#${bgGradientId})`} filter={`url(#${shadowId})`} />
<rect fill={`url(#${barGradient1Id})`} />
<rect fill={`url(#${barGradient2Id})`} />
<rect fill={`url(#${barGradient3Id})`} />
```

---

## テスト結果

### ✅ 正常動作確認
- [x] ヘッダーにロゴ表示
- [x] 複数インスタンスでの表示
- [x] グラデーション正常レンダリング
- [x] シャドウエフェクト表示
- [x] レスポンシブ対応

### テスト環境
- Chrome 120+
- Edge 120+
- Power Apps (Web)

---

## React.useId() について

### 概要
React 18で導入されたフック。コンポーネントの各インスタンスごとにユニークなIDを生成。

### 特徴
- ✅ **サーバーサイドレンダリング（SSR）対応**: クライアントとサーバーで一致
- ✅ **ハイドレーション安全**: 再レンダリングでも同じIDを保持
- ✅ **衝突回避**: 複数インスタンスで自動的にユニークなIDを生成

### 生成されるID例
```
:r1:  // 最初のインスタンス
:r2:  // 2番目のインスタンス
:r3:  // 3番目のインスタンス
```

### 使用推奨シーン
- SVG内のグラデーション、マスク、フィルター定義
- `<label htmlFor>` と `<input id>` の紐付け
- ARIA属性（`aria-describedby`, `aria-labelledby`）
- カスタムUI要素のID管理

---

## 予防策

### SVGコンポーネント作成時のベストプラクティス

#### 1. 常にユニークIDを使用
```tsx
const uniqueId = React.useId();
const gradientId = `myGradient-${uniqueId}`;
```

#### 2. ID参照をテンプレートリテラルで動的化
```tsx
fill={`url(#${gradientId})`}
```

#### 3. 複数のdefs要素がある場合は全てユニーク化
```tsx
const uniqueId = React.useId();
const ids = {
  gradient1: `grad1-${uniqueId}`,
  gradient2: `grad2-${uniqueId}`,
  mask: `mask-${uniqueId}`,
  filter: `filter-${uniqueId}`,
};
```

#### 4. Storybookやテストで複数インスタンスを確認
```tsx
// 複数インスタンスのテスト
<>
  <AppLogo />
  <AppLogo />
  <AppLogo />
</>
```

---

## 関連する問題パターン

### 1. フィルター効果が表示されない
```tsx
// ❌ 問題
<filter id="shadow">...</filter>
<rect filter="url(#shadow)" />

// ✅ 解決
const filterId = `shadow-${React.useId()}`;
<filter id={filterId}>...</filter>
<rect filter={`url(#${filterId})`} />
```

### 2. マスクが適用されない
```tsx
// ❌ 問題
<mask id="myMask">...</mask>
<rect mask="url(#myMask)" />

// ✅ 解決
const maskId = `mask-${React.useId()}`;
<mask id={maskId}>...</mask>
<rect mask={`url(#${maskId})`} />
```

### 3. パターンが表示されない
```tsx
// ❌ 問題
<pattern id="dots">...</pattern>
<rect fill="url(#dots)" />

// ✅ 解決
const patternId = `dots-${React.useId()}`;
<pattern id={patternId}>...</pattern>
<rect fill={`url(#${patternId})`} />
```

---

## デプロイ情報

### バージョン
- **修正前**: v1.0.6
- **修正後**: v1.0.7

### デプロイ日時
2025年10月17日

### 影響範囲
- `src/components/AppLogo.tsx`: ID生成ロジック追加
- ビルドサイズ: 308.26 kB（変動なし）

### ロールバック手順
```bash
git checkout v1.0.6
npm run build
pac code push
```

---

## まとめ

### 学んだこと
1. ✅ SVGのID属性はDOM全体でユニークである必要がある
2. ✅ React.useId()は再利用可能なコンポーネントに必須
3. ✅ グラデーション/フィルター定義は動的IDで管理する
4. ✅ 複数インスタンスのテストは開発時に必須

### 今後の対応
- [ ] 他のSVGコンポーネントでも同様の修正を検討
- [ ] コンポーネントライブラリのレビュー
- [ ] Storybookでの複数インスタンステスト追加

---

**ステータス**: ✅ 解決済み  
**バージョン**: v1.0.7  
**デプロイ先**: Power Apps Production
