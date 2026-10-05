import { useQuery } from "@tanstack/react-query"
import { ConstructionService, type Knowledge } from "@/services/construction-service"
import { RecordExplorer } from "@/components/records/record-explorer"
import { Breakdown } from "@/components/records/record-charts"
import { optionsOf, useLookups } from "@/components/records/use-lookups"
import { KNOWLEDGE_TYPE_COLOR, KNOWLEDGE_TYPE_LABEL } from "@/lib/record-labels"

export default function KnowledgeSearch() {
  const knowledge = useQuery({ queryKey: ["knowledge"], queryFn: ConstructionService.knowledge })
  const lookups = useLookups()
  return (
    <RecordExplorer<Knowledge>
      tourId="knowledge-list"
      eyebrow="現場横断の知恵"
      title="ナレッジ検索"
      description="過去の事象・原因・教訓を工種・区分で探せます。KY の危険予測もこのナレッジを根拠にします。記録をクリックすると詳細と元のヒヤリハットを確認・編集できます。"
      items={knowledge.data}
      isLoading={knowledge.isLoading || lookups.isLoading}
      error={knowledge.error ?? lookups.error}
      rowKey={(item) => item.id}
      rowHref={(item) => `/knowledge/${item.id}`}
      rowLabel={(item) => item.name}
      emptyText="ナレッジはまだありません。ヒヤリハットの詳細から「ナレッジ化」するか、Copilot Studio から登録できます。"
      searchPlaceholder="タイトル・事象・原因・教訓・キーワードで検索"
      searchText={(item) => `${item.name} ${item.event} ${item.cause} ${item.lesson} ${item.keywords} ${lookups.workTypeName(item.workTypeId)}`}
      filters={[
        { key: "worktype", label: "工種", options: lookups.workTypeOptions, match: (item, value) => item.workTypeId === value },
        { key: "type", label: "区分", options: optionsOf(KNOWLEDGE_TYPE_LABEL), match: (item, value) => item.knowledgeType === Number(value) },
        { key: "source", label: "出典", options: [{ value: "incident", label: "ヒヤリハットから" }, { value: "manual", label: "直接登録" }], match: (item, value) => Boolean(item.sourceIncidentId) === (value === "incident") },
      ]}
      summary={(items) => [
        { label: "ナレッジ件数", value: `${items.length} 件` },
        { label: "安全", value: `${items.filter((item) => item.knowledgeType === 100000000).length} 件`, tone: "danger" },
        { label: "ヒヤリハットから", value: `${items.filter((item) => item.sourceIncidentId).length} 件`, tone: "good" },
        { label: "対象の工種", value: `${new Set(items.map((item) => item.workTypeId).filter(Boolean)).size} 種` },
      ]}
      charts={(items) => <>
        <Breakdown title="工種別のナレッジ件数" items={items} groupOf={(item) => lookups.workTypeName(item.workTypeId)} variant="bar" />
        <Breakdown title="区分の内訳" items={items} groupOf={(item) => item.knowledgeType} labels={KNOWLEDGE_TYPE_LABEL} colors={KNOWLEDGE_TYPE_COLOR} />
      </>}
      columns={[
        { key: "name", header: "タイトル", render: (item) => item.name, sortValue: (item) => item.name },
        {
          key: "type", header: "区分", sortValue: (item) => item.knowledgeType,
          render: (item) => <span className="whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-black text-white" style={{ background: KNOWLEDGE_TYPE_COLOR[item.knowledgeType] ?? "#94a3b8" }}>{KNOWLEDGE_TYPE_LABEL[item.knowledgeType] ?? "-"}</span>,
        },
        { key: "worktype", header: "工種", render: (item) => lookups.workTypeName(item.workTypeId), sortValue: (item) => lookups.workTypeName(item.workTypeId) },
        { key: "lesson", header: "教訓・対策", render: (item) => <span className="line-clamp-2">{item.lesson}</span> },
        { key: "keywords", header: "キーワード", render: (item) => <span className="line-clamp-1 text-slate-500">{item.keywords}</span> },
      ]}
    />
  )
}
