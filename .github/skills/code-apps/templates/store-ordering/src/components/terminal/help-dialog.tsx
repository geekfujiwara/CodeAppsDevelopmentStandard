import { useState } from "react"
import { TerminalDialog } from "@/components/terminal/terminal-dialog"

const PAGES: { title: string; body: React.ReactNode }[] = [
  {
    title: "1/5 このシステムについて",
    body: (
      <>
        <p>店舗の<b>単品発注</b>と、<b>発注・在庫・天気と催事の照会</b>を行う端末です。</p>
        <p>データは本部のシステム（Dataverse）にあります。AI アシスタント（Cowork の店長アシスト）から店長が承認して登録した発注も、この端末の発注照会に並びます。</p>
      </>
    ),
  },
  {
    title: "2/5 操作の基本",
    body: (
      <ul>
        <li>業務メニューは <kbd>1</kbd>〜<kbd>4</kbd> の数字キーでも選べます。</li>
        <li>画面下の <kbd>F1</kbd>〜<kbd>F10</kbd> はキーボードのファンクションキーでも、マウスでも押せます。</li>
        <li><kbd>F1</kbd> 業務メニュー ／ <kbd>F2</kbd>・<kbd>Esc</kbd> 戻る ／ <kbd>F5</kbd> 再表示 は、どの画面でも同じです。</li>
        <li>画面下の黒い行に、案内とエラーが出ます。</li>
      </ul>
    ),
  },
  {
    title: "3/5 単品発注",
    body: (
      <ol>
        <li><kbd>F6</kbd> で便（今日の<b>夕方便</b> 16:00 納品／明日の<b>朝便</b> 6:00 納品）を切り替えます。</li>
        <li><kbd>F3</kbd>・<kbd>F4</kbd> で分類（おにぎり・弁当…）を切り替えます。</li>
        <li>黄色い欄に発注数を入れます。<kbd>Enter</kbd> と <kbd>↓</kbd> で次の行、<kbd>↑</kbd> で前の行。</li>
        <li><kbd>F10</kbd> で確認画面、もう一度 <kbd>F10</kbd> で送信します。</li>
      </ol>
      ),
  },
  {
    title: "4/5 発注のきまり",
    body: (
      <ul>
        <li>数量は<b>発注単位の倍数</b>（おにぎり 2 個、おでん 5 個、飲料 6 本 など）。1 品目 200 個まで。</li>
        <li>締め時刻: 夕方便は今日 10:00。朝便は日配品が今日 21:00、常温・冷凍品が今日 11:00。</li>
        <li>カップ麺・アイスなどは夕方便では発注できません（翌日の朝便から）。</li>
        <li>締め時刻までは、発注照会で <kbd>F8</kbd> 取消ができます。</li>
      </ul>
    ),
  },
  {
    title: "5/5 ご注意",
    body: (
      <ul>
        <li>データはすべて<b>架空の店舗の合成データ</b>です（デモ用）。</li>
        <li>画面上部の「業務時刻」は、本部のデモ設定の時刻です（締め時刻の判定に使います）。</li>
        <li>この説明は業務メニューの <kbd>9</kbd> でいつでも開けます。</li>
      </ul>
    ),
  },
]

export function HelpDialog({ onClose }: { onClose: () => void }) {
  const [page, setPage] = useState(0)
  const last = page === PAGES.length - 1
  return (
    <TerminalDialog
      title={`操作説明 — ${PAGES[page].title}`}
      icon="i"
      wide
      onClose={onClose}
      actions={[
        { label: "＜ 前へ", onClick: () => setPage((p) => Math.max(0, p - 1)), disabled: page === 0 },
        last ? { label: "閉じる", onClick: onClose, primary: true } : { label: "次へ ＞", onClick: () => setPage((p) => p + 1), primary: true },
        ...(last ? [] : [{ label: "閉じる", onClick: onClose }]),
      ]}
    >
      <div className="t-help">{PAGES[page].body}</div>
    </TerminalDialog>
  )
}
