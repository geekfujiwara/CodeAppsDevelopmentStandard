import sharedSpec from "./agent-design-spec.md?raw"

// チームメイト個別の設計ドキュメントは src/data/design-specs/<エージェントキー>.md に置く。
// 置かれていなければ共通の agent-design-spec.md を見せる。
const PER_AGENT = import.meta.glob("./design-specs/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>

export function getDesignSpec(agentKey: string) {
  const markdown = PER_AGENT[`./design-specs/${agentKey}.md`]
  return { markdown: markdown ?? sharedSpec, isShared: !markdown }
}
