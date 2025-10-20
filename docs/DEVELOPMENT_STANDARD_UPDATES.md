# 開発標準更新提案: SVGコンポーネントのベストプラクティス

## 📋 概要

本ドキュメントは、今回のロゴ表示問題（SVG ID衝突）の経験から得られた知見を基に、[CodeAppsDevelopmentStandard](https://github.com/geekfujiwara/CodeAppsDevelopmentStandard) に追加すべき項目を提案します。

---

## 🎯 更新が必要な理由

### 発生した問題
- SVGコンポーネント内の固定IDが複数インスタンスで衝突
- ロゴが表示されないという重大なUI不具合
- デバッグに時間がかかる（コンソールエラーなし）

### 標準化の必要性
1. ✅ **再発防止** - 同様の問題を未然に防ぐ
2. ✅ **開発効率向上** - ベストプラクティスの共有
3. ✅ **品質保証** - 一貫した実装パターン
4. ✅ **オンボーディング** - 新規開発者への教育資料

---

## 📚 提案する標準更新項目

### 1. SVGコンポーネント実装ガイドライン

#### 追加先
`CodeAppsDevelopmentStandard/guidelines/ui-components.md`

#### 内容

```markdown
## SVGコンポーネントの実装

### 必須要件

#### 1. ユニークID生成の義務化

SVG内で`<defs>`を使用する場合、必ず`React.useId()`でユニークIDを生成すること。

**❌ 避けるべき実装**
```tsx
export const MyIcon = () => (
  <svg>
    <defs>
      <linearGradient id="gradient">  {/* 固定ID */}
        {/* ... */}
      </linearGradient>
    </defs>
    <rect fill="url(#gradient)" />
  </svg>
);
```

**✅ 推奨実装**
```tsx
export const MyIcon = () => {
  const uniqueId = React.useId();
  const gradientId = `gradient-${uniqueId}`;
  
  return (
    <svg>
      <defs>
        <linearGradient id={gradientId}>  {/* 動的ID */}
          {/* ... */}
        </linearGradient>
      </defs>
      <rect fill={`url(#${gradientId})`} />
    </svg>
  );
};
```

#### 2. 対象となるSVG要素

以下の要素を使用する場合、必ずユニークID化が必要：

- `<linearGradient>`
- `<radialGradient>`
- `<pattern>`
- `<mask>`
- `<clipPath>`
- `<filter>`
- `<marker>`

#### 3. 命名規則

```tsx
const uniqueId = React.useId();
const elementId = `<要素名>-${uniqueId}`;

// 例
const gradientId = `bgGradient-${uniqueId}`;
const filterId = `dropShadow-${uniqueId}`;
const maskId = `circleMask-${uniqueId}`;
```

#### 4. 複数のdefs要素がある場合

```tsx
const uniqueId = React.useId();
const ids = {
  gradient1: `gradient1-${uniqueId}`,
  gradient2: `gradient2-${uniqueId}`,
  filter: `filter-${uniqueId}`,
  mask: `mask-${uniqueId}`,
};

return (
  <svg>
    <defs>
      <linearGradient id={ids.gradient1}>...</linearGradient>
      <linearGradient id={ids.gradient2}>...</linearGradient>
      <filter id={ids.filter}>...</filter>
      <mask id={ids.mask}>...</mask>
    </defs>
    <rect fill={`url(#${ids.gradient1})`} />
    <circle fill={`url(#${ids.gradient2})`} filter={`url(#${ids.filter})`} />
  </svg>
);
```

### テスト要件

#### 複数インスタンステスト

SVGコンポーネントは必ず複数インスタンスでの動作を確認すること。

```tsx
// テストケース
describe('MyIcon', () => {
  it('複数インスタンスで正常にレンダリングされる', () => {
    render(
      <>
        <MyIcon />
        <MyIcon />
        <MyIcon />
      </>
    );
    
    const icons = screen.getAllByRole('img');
    expect(icons).toHaveLength(3);
    // 各アイコンが視覚的に正しく表示されることを確認
  });
});
```

#### Storybookでの確認

```tsx
// MyIcon.stories.tsx
export const MultipleInstances: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: '20px' }}>
      <MyIcon size={32} />
      <MyIcon size={48} />
      <MyIcon size={64} />
    </div>
  ),
};
```

### チェックリスト

SVGコンポーネント実装時のレビューチェックリスト：

- [ ] `<defs>`内の全要素にユニークIDを使用している
- [ ] `React.useId()`フックを使用している
- [ ] `url(#...)`参照が動的IDを使用している
- [ ] 複数インスタンスでのテストが通る
- [ ] Storybookで視覚的確認が完了
- [ ] TypeScriptの型定義が適切
- [ ] アクセシビリティ属性（aria-label等）が設定されている
```

---

### 2. Reactフック使用ガイドライン

#### 追加先
`CodeAppsDevelopmentStandard/guidelines/react-patterns.md`

#### 内容

```markdown
## React.useId() フック

### 概要
React 18で導入された、コンポーネントインスタンスごとにユニークなIDを生成するフック。

### 使用ケース

#### 1. SVG要素のID生成（必須）
```tsx
const uniqueId = React.useId();
const gradientId = `gradient-${uniqueId}`;
```

#### 2. フォーム要素の紐付け
```tsx
const id = React.useId();

return (
  <>
    <label htmlFor={id}>ユーザー名</label>
    <input id={id} type="text" />
  </>
);
```

#### 3. ARIA属性の紐付け
```tsx
const id = React.useId();

return (
  <>
    <button aria-describedby={id}>詳細</button>
    <div id={id} role="tooltip">
      追加情報...
    </div>
  </>
);
```

### ベストプラクティス

#### ✅ 推奨
- コンポーネント内で1回だけ呼び出す
- 生成したIDをベースに複数のIDを派生させる
- SSR対応のため必ず使用する

#### ❌ 避ける
- ループ内での使用
- 条件分岐内での使用
- キー（key）属性での使用

```tsx
// ❌ 避けるべき
items.map(() => {
  const id = React.useId(); // ループ内
  return <div key={id} />; // keyには使わない
});

// ✅ 正しい実装
const baseId = React.useId();
items.map((item, index) => (
  <div key={item.id} id={`${baseId}-${index}`} />
));
```

### SSR対応

`React.useId()`はSSR環境で自動的にクライアントとサーバーのIDを一致させます。

```tsx
// サーバー側: :r1:
// クライアント側: :r1: （同じ）
```

従来の`Math.random()`や`Date.now()`では不一致が発生するため使用しないこと。
```

---

### 3. コンポーネントレビューチェックリスト

#### 追加先
`CodeAppsDevelopmentStandard/checklists/component-review.md`

#### 内容

```markdown
## UIコンポーネントレビューチェックリスト

### SVGコンポーネント

#### 必須項目
- [ ] `<defs>`内の全IDが`React.useId()`で生成されている
- [ ] 複数インスタンスでの動作確認が完了
- [ ] グラデーション/フィルター/マスクの参照が動的
- [ ] Storybookストーリーが作成されている
- [ ] アクセシビリティ属性（aria-label, role）が設定されている

#### パフォーマンス
- [ ] SVGファイルサイズが最適化されている（<5KB推奨）
- [ ] 不要なメタデータが削除されている
- [ ] パスが簡略化されている

#### ブラウザ互換性
- [ ] Chrome/Edge最新版で動作確認
- [ ] Firefox最新版で動作確認
- [ ] Safari最新版で動作確認
- [ ] Power Apps環境で動作確認

### 再利用可能コンポーネント

#### Props設計
- [ ] TypeScript型定義が適切
- [ ] デフォルト値が設定されている
- [ ] 必須/オプションが明確
- [ ] JSDocコメントが記載されている

#### テスト
- [ ] 単体テストが作成されている
- [ ] 複数インスタンステストが通る
- [ ] エッジケーステストが通る
- [ ] スナップショットテストが更新されている

#### ドキュメント
- [ ] README/Storybookに使用例が記載されている
- [ ] Props一覧が文書化されている
- [ ] 使用上の注意点が記載されている
```

---

### 4. トラブルシューティングガイド

#### 追加先
`CodeAppsDevelopmentStandard/troubleshooting/svg-issues.md`

#### 内容

```markdown
## SVGコンポーネントのトラブルシューティング

### 問題: SVGが表示されない

#### 症状
- コンポーネントはマウントされている
- コンソールにエラーがない
- レイアウトは正常だが、SVG要素が描画されない

#### 原因1: ID衝突

**確認方法**
```tsx
// Chrome DevToolsで確認
document.querySelectorAll('[id="gradient"]').length > 1
// 2以上の場合、ID衝突が発生
```

**解決方法**
```tsx
const uniqueId = React.useId();
const gradientId = `gradient-${uniqueId}`;
```

#### 原因2: viewBox設定ミス

**確認方法**
```tsx
<svg viewBox="0 0 100 100">  {/* 正しい */}
<svg viewBox="0,0,100,100">  {/* ❌ カンマ区切り */}
```

**解決方法**
```tsx
<svg viewBox="0 0 100 100" width={size} height={size}>
```

#### 原因3: fill/stroke未指定

**確認方法**
```tsx
<path d="..." />  {/* fill/strokeがない */}
```

**解決方法**
```tsx
<path d="..." fill="currentColor" />
// または
<path d="..." fill="#000000" />
```

### 問題: グラデーションが表示されない

#### 確認項目
1. グラデーションIDが正しく参照されているか
2. stop要素のoffsetが適切か（0%から100%）
3. stop要素が2つ以上あるか

```tsx
// ✅ 正しい実装
<linearGradient id={gradientId}>
  <stop offset="0%" stopColor="#000" />
  <stop offset="100%" stopColor="#fff" />
</linearGradient>
<rect fill={`url(#${gradientId})`} />
```

### 問題: フィルターが適用されない

#### 確認項目
```tsx
// filter IDの参照が正しいか
<filter id={filterId}>...</filter>
<rect filter={`url(#${filterId})`} />  // url()が必要

// ブラウザサポート確認
// Safari: 一部フィルターに制限あり
```

### デバッグ手順

1. **Chrome DevToolsで確認**
   ```
   Elements > SVG要素を選択 > Computed > defs要素を確認
   ```

2. **ID一覧を確認**
   ```javascript
   // コンソールで実行
   Array.from(document.querySelectorAll('[id]'))
     .map(el => el.id)
     .filter((id, index, arr) => arr.indexOf(id) !== index)
   // 重複IDが表示される
   ```

3. **SVG構造を確認**
   ```tsx
   console.log(document.querySelector('svg').outerHTML);
   ```

4. **レンダリング確認**
   ```tsx
   // 背景色を設定して確認
   <svg style={{ background: 'red' }}>
   ```
```

---

### 5. コード生成テンプレート

#### 追加先
`CodeAppsDevelopmentStandard/templates/svg-component.tsx`

#### 内容

```tsx
/**
 * SVGコンポーネントテンプレート
 * CodeAppsDevelopmentStandard準拠
 */

import React from 'react';

interface MyIconProps {
  /** アイコンのサイズ（px） */
  size?: number;
  /** カスタムCSSクラス */
  className?: string;
  /** アイコンの色 */
  color?: string;
  /** アクセシビリティラベル */
  ariaLabel?: string;
}

/**
 * MyIcon コンポーネント
 * 
 * @example
 * ```tsx
 * <MyIcon size={24} color="#0078D4" />
 * ```
 */
export const MyIcon: React.FC<MyIconProps> = ({
  size = 24,
  className = '',
  color = 'currentColor',
  ariaLabel = 'My Icon',
}) => {
  // ✅ ユニークID生成（SVG defs要素がある場合は必須）
  const uniqueId = React.useId();
  const gradientId = `gradient-${uniqueId}`;
  const filterId = `filter-${uniqueId}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label={ariaLabel}
      role="img"
    >
      {/* ✅ タイトル要素でアクセシビリティ向上 */}
      <title>{ariaLabel}</title>

      {/* ✅ defs内の全要素に動的IDを使用 */}
      <defs>
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={color} stopOpacity={1} />
          <stop offset="100%" stopColor={color} stopOpacity={0.5} />
        </linearGradient>

        <filter id={filterId}>
          <feDropShadow dx="0" dy="2" stdDeviation="2" floodOpacity="0.3" />
        </filter>
      </defs>

      {/* ✅ 動的IDを参照 */}
      <rect
        x="0"
        y="0"
        width="24"
        height="24"
        fill={`url(#${gradientId})`}
        filter={`url(#${filterId})`}
      />
    </svg>
  );
};

// ✅ TypeScript型のエクスポート
export type { MyIconProps };
```

#### Storybookテンプレート
`CodeAppsDevelopmentStandard/templates/svg-component.stories.tsx`

```tsx
import type { Meta, StoryObj } from '@storybook/react';
import { MyIcon } from './MyIcon';

const meta: Meta<typeof MyIcon> = {
  title: 'Components/Icons/MyIcon',
  component: MyIcon,
  tags: ['autodocs'],
  argTypes: {
    size: {
      control: { type: 'range', min: 16, max: 128, step: 8 },
    },
    color: {
      control: 'color',
    },
  },
};

export default meta;
type Story = StoryObj<typeof MyIcon>;

// ✅ 基本使用例
export const Default: Story = {
  args: {
    size: 24,
  },
};

// ✅ サイズバリエーション
export const Sizes: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
      <MyIcon size={16} />
      <MyIcon size={24} />
      <MyIcon size={32} />
      <MyIcon size={48} />
      <MyIcon size={64} />
    </div>
  ),
};

// ✅ 複数インスタンステスト（必須）
export const MultipleInstances: Story = {
  render: () => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '10px' }}>
      {Array.from({ length: 15 }).map((_, i) => (
        <MyIcon key={i} size={32} />
      ))}
    </div>
  ),
};

// ✅ カラーバリエーション
export const Colors: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: '20px' }}>
      <MyIcon size={48} color="#0078D4" />
      <MyIcon size={48} color="#107C10" />
      <MyIcon size={48} color="#D83B01" />
      <MyIcon size={48} color="#5C2D91" />
    </div>
  ),
};
```

#### テストテンプレート
`CodeAppsDevelopmentStandard/templates/svg-component.test.tsx`

```tsx
import { render, screen } from '@testing-library/react';
import { MyIcon } from './MyIcon';

describe('MyIcon', () => {
  // ✅ 基本レンダリング
  it('正常にレンダリングされる', () => {
    render(<MyIcon />);
    const icon = screen.getByRole('img');
    expect(icon).toBeInTheDocument();
  });

  // ✅ Props反映確認
  it('sizeプロパティが反映される', () => {
    render(<MyIcon size={48} />);
    const icon = screen.getByRole('img');
    expect(icon).toHaveAttribute('width', '48');
    expect(icon).toHaveAttribute('height', '48');
  });

  // ✅ アクセシビリティ
  it('aria-labelが設定される', () => {
    render(<MyIcon ariaLabel="テストアイコン" />);
    const icon = screen.getByLabelText('テストアイコン');
    expect(icon).toBeInTheDocument();
  });

  // ✅ 複数インスタンステスト（必須）
  it('複数インスタンスで正常に動作する', () => {
    render(
      <>
        <MyIcon ariaLabel="アイコン1" />
        <MyIcon ariaLabel="アイコン2" />
        <MyIcon ariaLabel="アイコン3" />
      </>
    );

    const icons = screen.getAllByRole('img');
    expect(icons).toHaveLength(3);

    // 各アイコンのIDがユニークであることを確認
    const svg1 = screen.getByLabelText('アイコン1');
    const svg2 = screen.getByLabelText('アイコン2');
    const svg3 = screen.getByLabelText('アイコン3');

    const gradient1 = svg1.querySelector('linearGradient')?.id;
    const gradient2 = svg2.querySelector('linearGradient')?.id;
    const gradient3 = svg3.querySelector('linearGradient')?.id;

    expect(gradient1).toBeDefined();
    expect(gradient2).toBeDefined();
    expect(gradient3).toBeDefined();
    expect(gradient1).not.toBe(gradient2);
    expect(gradient2).not.toBe(gradient3);
  });

  // ✅ スナップショット
  it('スナップショットに一致する', () => {
    const { container } = render(<MyIcon />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
```

---

### 6. CI/CDチェック項目

#### 追加先
`CodeAppsDevelopmentStandard/ci-cd/svg-validation.yml`

#### 内容

```yaml
name: SVG Component Validation

on:
  pull_request:
    paths:
      - 'src/components/**/*.tsx'
      - 'src/icons/**/*.tsx'

jobs:
  validate-svg:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        run: npm ci

      # ✅ SVGコンポーネントのID衝突チェック
      - name: Check for hardcoded SVG IDs
        run: |
          # 固定IDの使用を検出
          if grep -r 'id="[^{]' src/components src/icons; then
            echo "❌ Error: Hardcoded IDs found in SVG components"
            echo "Use React.useId() for dynamic ID generation"
            exit 1
          fi

      # ✅ React.useId()使用確認
      - name: Check for React.useId usage
        run: |
          # defs要素を含むファイルでuseIdが使用されているか確認
          FILES=$(grep -l '<defs>' src/**/*.tsx)
          for file in $FILES; do
            if ! grep -q 'useId()' "$file"; then
              echo "❌ Error: $file uses <defs> without React.useId()"
              exit 1
            fi
          done

      # ✅ テスト実行
      - name: Run tests
        run: npm test -- --coverage

      # ✅ Storybookビルド確認
      - name: Build Storybook
        run: npm run build-storybook

      # ✅ ビジュアルリグレッションテスト（オプション）
      - name: Visual regression test
        run: npm run test:visual
```

---

### 7. ESLintルール

#### 追加先
`CodeAppsDevelopmentStandard/linting/eslint-svg-rules.js`

#### 内容

```javascript
/**
 * SVGコンポーネント用カスタムESLintルール
 */
module.exports = {
  rules: {
    // SVG内の固定ID使用を警告
    'no-hardcoded-svg-ids': {
      meta: {
        type: 'problem',
        docs: {
          description: 'Disallow hardcoded IDs in SVG components',
          category: 'Best Practices',
          recommended: true,
        },
        messages: {
          hardcodedId: 'Use React.useId() instead of hardcoded ID "{{id}}"',
        },
      },
      create(context) {
        return {
          JSXAttribute(node) {
            if (
              node.name.name === 'id' &&
              node.value.type === 'Literal' &&
              typeof node.value.value === 'string'
            ) {
              // SVG要素かチェック
              const parent = node.parent;
              const isSvgElement = [
                'linearGradient',
                'radialGradient',
                'pattern',
                'mask',
                'clipPath',
                'filter',
                'marker',
              ].includes(parent.name.name);

              if (isSvgElement) {
                context.report({
                  node,
                  messageId: 'hardcodedId',
                  data: {
                    id: node.value.value,
                  },
                });
              }
            }
          },
        };
      },
    },

    // useId()の使用を強制
    'require-use-id-for-svg-defs': {
      meta: {
        type: 'problem',
        docs: {
          description: 'Require React.useId() when using SVG defs',
          category: 'Best Practices',
          recommended: true,
        },
        messages: {
          missingUseId: 'Component with SVG <defs> must use React.useId()',
        },
      },
      create(context) {
        let hasDefsElement = false;
        let hasUseId = false;

        return {
          JSXElement(node) {
            if (node.openingElement.name.name === 'defs') {
              hasDefsElement = true;
            }
          },
          CallExpression(node) {
            if (
              node.callee.type === 'MemberExpression' &&
              node.callee.object.name === 'React' &&
              node.callee.property.name === 'useId'
            ) {
              hasUseId = true;
            }
          },
          'Program:exit'() {
            if (hasDefsElement && !hasUseId) {
              context.report({
                node: context.getSourceCode().ast,
                messageId: 'missingUseId',
              });
            }
          },
        };
      },
    },
  },
};
```

`.eslintrc.js`に追加:

```javascript
module.exports = {
  // ...existing config
  plugins: ['@codeapps/svg-rules'],
  rules: {
    '@codeapps/svg-rules/no-hardcoded-svg-ids': 'error',
    '@codeapps/svg-rules/require-use-id-for-svg-defs': 'error',
  },
};
```

---

## 📊 実装優先度

### 高優先度（必須）
1. ✅ **SVGコンポーネント実装ガイドライン** - 即座に適用可能
2. ✅ **React.useId()使用ガイド** - 基本的な知識
3. ✅ **コンポーネントレビューチェックリスト** - PR時に活用

### 中優先度（推奨）
4. ✅ **トラブルシューティングガイド** - 問題発生時の参照資料
5. ✅ **コード生成テンプレート** - 新規コンポーネント作成時

### 低優先度（オプション）
6. ✅ **CI/CDチェック** - 自動化環境がある場合
7. ✅ **ESLintルール** - カスタムルール作成可能な場合

---

## 🔄 段階的な適用方法

### Phase 1: ドキュメント整備（Week 1-2）
1. SVG実装ガイドラインの作成
2. React.useId()使用ガイドの追加
3. チェックリストの整備

### Phase 2: テンプレート作成（Week 3-4）
1. SVGコンポーネントテンプレート
2. Storybookテンプレート
3. テストテンプレート

### Phase 3: 自動化（Week 5-6）
1. CI/CDパイプライン更新
2. ESLintルール実装
3. pre-commitフック追加

### Phase 4: 既存コードの修正（Week 7-8）
1. 既存SVGコンポーネントの棚卸し
2. 優先度付け（使用頻度順）
3. 段階的な修正とテスト

---

## 📝 GitHub Issue/PR テンプレート

### Issue テンプレート
`CodeAppsDevelopmentStandard/.github/ISSUE_TEMPLATE/svg-component.md`

```markdown
---
name: SVG Component Implementation
about: SVGコンポーネントの実装
title: '[SVG] '
labels: component, svg
assignees: ''
---

## コンポーネント概要
<!-- コンポーネントの目的と用途を記載 -->

## 実装チェックリスト

### 必須項目
- [ ] `React.useId()`を使用してユニークIDを生成
- [ ] 全ての`<defs>`要素IDが動的
- [ ] `url(#...)`参照が動的IDを使用
- [ ] TypeScript型定義が適切
- [ ] アクセシビリティ属性設定済み

### テスト
- [ ] 複数インスタンステストが通る
- [ ] Storybookストーリー作成済み
- [ ] 単体テスト作成済み
- [ ] ビジュアル確認完了

### ドキュメント
- [ ] JSDocコメント記載済み
- [ ] 使用例の記載
- [ ] Props一覧の文書化

## 関連ドキュメント
- [SVG実装ガイドライン](link)
- [テンプレート](link)
```

### PR テンプレート
`CodeAppsDevelopmentStandard/.github/PULL_REQUEST_TEMPLATE/svg-component.md`

```markdown
## 変更内容
<!-- SVGコンポーネントの実装内容を記載 -->

## SVGコンポーネントチェックリスト

### 実装
- [ ] `React.useId()`でユニークID生成
- [ ] 固定IDを使用していない
- [ ] グラデーション/フィルター参照が動的
- [ ] TypeScript型定義完備

### テスト
- [ ] 複数インスタンステストが通過
- [ ] 全ブラウザで動作確認
- [ ] Power Apps環境で動作確認

### レビュー依頼事項
<!-- 特に確認してほしいポイント -->

## スクリーンショット
<!-- 複数インスタンスの表示例を添付 -->

## 動作確認環境
- [ ] Chrome
- [ ] Edge
- [ ] Firefox
- [ ] Safari
- [ ] Power Apps

## 関連Issue
Closes #
```

---

## 🎓 教育・トレーニング資料

### 新規開発者向けオンボーディング資料

```markdown
# SVGコンポーネント開発クイックスタート

## 5分で理解するSVG ID問題

### 問題の本質
```tsx
// ❌ これは動きません
const Logo = () => (
  <svg>
    <defs>
      <linearGradient id="bg">...</linearGradient>
    </defs>
    <rect fill="url(#bg)" />
  </svg>
);

// 2つ表示すると...
<Logo /> <Logo />
// → 2つ目が表示されない！（ID衝突）
```

### 解決方法
```tsx
// ✅ これで解決
const Logo = () => {
  const id = React.useId();
  const bgId = `bg-${id}`;
  
  return (
    <svg>
      <defs>
        <linearGradient id={bgId}>...</linearGradient>
      </defs>
      <rect fill={`url(#${bgId})`} />
    </svg>
  );
};
```

### 覚えておくこと
1. SVGの`<defs>`を使う → `React.useId()`必須
2. IDは動的に生成
3. `url(#...)`も動的に参照
4. 複数インスタンスでテスト

### 実践演習
テンプレートをコピーして、自分のアイコンを作ってみましょう！
```

---

## 📈 成功指標（KPI）

標準更新後の効果測定:

1. **バグ削減率**
   - SVG関連のバグ報告: 目標 -80%
   - ID衝突エラー: 目標 0件

2. **開発効率**
   - SVGコンポーネント作成時間: 目標 -30%
   - レビュー時間: 目標 -40%

3. **コード品質**
   - テストカバレッジ: 目標 90%以上
   - ESLintエラー: 目標 0件

4. **開発者満足度**
   - オンボーディング期間: 目標 -50%
   - ドキュメント満足度: 目標 4.5/5.0以上

---

## 🔗 参考リンク

### 公式ドキュメント
- [React.useId() - React公式](https://react.dev/reference/react/useId)
- [SVG <defs> - MDN](https://developer.mozilla.org/en-US/docs/Web/SVG/Element/defs)
- [Accessible SVG Icons - A11y Project](https://www.a11yproject.com/posts/accessible-svg-icons/)

### 関連記事
- [Why You Should Never Use the Same ID Twice in SVG](https://www.sarasoueidan.com/blog/svg-id-collision/)
- [React 18: useId Hook Deep Dive](https://beta.reactjs.org/learn/reusing-logic-with-custom-hooks)

---

## 📋 まとめ

### 提案する標準更新項目

| # | 項目 | 追加先 | 優先度 | 工数 |
|---|------|--------|--------|------|
| 1 | SVG実装ガイドライン | `guidelines/ui-components.md` | 高 | 2日 |
| 2 | React.useId()ガイド | `guidelines/react-patterns.md` | 高 | 1日 |
| 3 | レビューチェックリスト | `checklists/component-review.md` | 高 | 1日 |
| 4 | トラブルシューティング | `troubleshooting/svg-issues.md` | 中 | 2日 |
| 5 | コードテンプレート | `templates/*.tsx` | 中 | 3日 |
| 6 | CI/CDチェック | `ci-cd/*.yml` | 低 | 3日 |
| 7 | ESLintルール | `linting/*.js` | 低 | 5日 |

**合計工数**: 17日（約3.5週間）

### 期待される効果

1. ✅ **品質向上**: SVG関連のバグが大幅に減少
2. ✅ **効率化**: テンプレートにより開発時間短縮
3. ✅ **標準化**: 一貫した実装パターンの確立
4. ✅ **教育**: 新規開発者のオンボーディング加速
5. ✅ **自動化**: CI/CDによる品質チェック

---

**作成日**: 2025年10月17日  
**対象標準**: [CodeAppsDevelopmentStandard](https://github.com/geekfujiwara/CodeAppsDevelopmentStandard)  
**提案者**: Gantt Chart Project Manager チーム  
**ステータス**: 📝 提案中
