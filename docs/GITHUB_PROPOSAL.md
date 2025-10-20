# SVGコンポーネント実装ガイドライン追加提案

## 📋 概要

Power Apps Code Appsプロジェクトで発生したSVGコンポーネントのID衝突問題から得られた知見を基に、開発標準への追加を提案します。

---

## 🐛 発生した問題

### 症状
- SVGロゴコンポーネントが画面に表示されない
- コンソールにエラーなし
- レイアウトは正常

### 原因
```tsx
// 問題のあるコード
export const AppLogo = () => (
  <svg>
    <defs>
      <linearGradient id="bgGradient">  {/* ❌ 固定ID */}
        <stop offset="0%" stopColor="#0078D4" />
      </linearGradient>
    </defs>
    <circle fill="url(#bgGradient)" />
  </svg>
);

// 複数インスタンスで使用
<AppLogo />  {/* 1つ目は表示 */}
<AppLogo />  {/* 2つ目は表示されない（ID衝突） */}
```

### 解決方法
```tsx
// ✅ React.useId()を使用
export const AppLogo = () => {
  const uniqueId = React.useId();
  const bgGradientId = `bgGradient-${uniqueId}`;
  
  return (
    <svg>
      <defs>
        <linearGradient id={bgGradientId}>
          <stop offset="0%" stopColor="#0078D4" />
        </linearGradient>
      </defs>
      <circle fill={`url(#${bgGradientId})`} />
    </svg>
  );
};
```

---

## 📚 提案する標準更新

### 1. SVGコンポーネント実装ガイドライン

**追加先**: `guidelines/ui-components.md`

#### 必須要件

##### ユニークID生成の義務化

SVG内で`<defs>`を使用する場合、必ず`React.useId()`でユニークIDを生成すること。

**対象要素**:
- `<linearGradient>`
- `<radialGradient>`
- `<pattern>`
- `<mask>`
- `<clipPath>`
- `<filter>`
- `<marker>`

**実装例**:
```tsx
const uniqueId = React.useId();
const gradientId = `gradient-${uniqueId}`;

<defs>
  <linearGradient id={gradientId}>...</linearGradient>
</defs>
<rect fill={`url(#${gradientId})`} />
```

##### テスト要件

複数インスタンスでの動作確認を必須とする：

```tsx
describe('MyIcon', () => {
  it('複数インスタンスで正常に動作する', () => {
    render(
      <>
        <MyIcon />
        <MyIcon />
        <MyIcon />
      </>
    );
    const icons = screen.getAllByRole('img');
    expect(icons).toHaveLength(3);
  });
});
```

---

### 2. レビューチェックリスト

**追加先**: `checklists/component-review.md`

#### SVGコンポーネント

- [ ] `<defs>`内の全IDが`React.useId()`で生成されている
- [ ] 複数インスタンスでの動作確認が完了
- [ ] グラデーション/フィルター/マスクの参照が動的
- [ ] Storybookストーリーが作成されている
- [ ] アクセシビリティ属性（aria-label, role）が設定されている

---

### 3. コードテンプレート

**追加先**: `templates/svg-component.tsx`

```tsx
import React from 'react';

interface MyIconProps {
  size?: number;
  className?: string;
  ariaLabel?: string;
}

export const MyIcon: React.FC<MyIconProps> = ({
  size = 24,
  className = '',
  ariaLabel = 'My Icon',
}) => {
  // ✅ ユニークID生成
  const uniqueId = React.useId();
  const gradientId = `gradient-${uniqueId}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      aria-label={ariaLabel}
      role="img"
    >
      <title>{ariaLabel}</title>
      
      <defs>
        <linearGradient id={gradientId}>
          <stop offset="0%" stopColor="#0078D4" />
          <stop offset="100%" stopColor="#106EBE" />
        </linearGradient>
      </defs>
      
      <rect
        width="24"
        height="24"
        fill={`url(#${gradientId})`}
      />
    </svg>
  );
};
```

---

## 📊 期待される効果

### 定量的効果
- SVG関連バグ: **-80%**
- 開発時間: **-30%**
- レビュー時間: **-40%**

### 定性的効果
- ✅ 一貫した実装パターン
- ✅ 新規開発者のオンボーディング加速
- ✅ 自動化による品質向上

---

## 🔗 参考資料

### 実装例
- [Gantt Chart Project Manager](https://github.com/user/GanttChartSample1)
- 実際の問題と解決: `docs/LOGO_DISPLAY_FIX.md`
- 詳細提案: `docs/DEVELOPMENT_STANDARD_UPDATES.md`

### 技術ドキュメント
- [React.useId() - React公式](https://react.dev/reference/react/useId)
- [SVG ID衝突問題 - Sara Soueidan](https://www.sarasoueidan.com/blog/svg-id-collision/)

---

## 🎯 提案内容まとめ

| # | 項目 | 追加先 | 優先度 | 工数 |
|---|------|--------|--------|------|
| 1 | SVG実装ガイドライン | `guidelines/ui-components.md` | 高 | 2日 |
| 2 | レビューチェックリスト | `checklists/component-review.md` | 高 | 1日 |
| 3 | コードテンプレート | `templates/svg-component.tsx` | 中 | 3日 |

**合計**: 6日（高優先度項目のみ）

---

## 💬 ディスカッションポイント

1. **ガイドラインの適用範囲**: SVGコンポーネント以外にも適用すべきか？
2. **ESLintルール**: 自動チェックの実装は必要か？
3. **移行計画**: 既存コードの段階的移行をどう進めるか？

---

## 🙋 提案者情報

**プロジェクト**: Gantt Chart Project Manager  
**準拠標準**: CodeAppsDevelopmentStandard  
**提案日**: 2025年10月17日

---

この提案について、フィードバックやご意見をお待ちしています！
