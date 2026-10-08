import { useEffect, useMemo, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ArrowLeft, Plus, Save, Trash2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { ListTable, type TableColumn, type FilterConfig } from "@/components/list-table"
import { LoadingSkeletonList } from "@/components/loading-skeleton"
import {
  createEvalRule,
  deleteEvalRule,
  EVAL_RULES_KEY,
  listEvalRules,
  TARGET_BOTH,
  TARGET_OPTIONS,
  updateEvalRule,
  validateRuleKey,
  type EvalRule,
  type EvalRuleInput,
} from "@/lib/eval-rules"

const NEW_ID = "new"

const DEFAULT_SCORE_GUIDE = `5: 指摘すべき問題が無い。そのまま手本にできる。
4: 実用上は問題ないが、細かい改善余地がある。
3: 目的は果たしているが、明確な欠陥がある。
2: 依頼の一部しか満たしておらず、利用者が手直しを要する。
1: 依頼を満たしていない、または誤った情報を与えている。`

const EMPTY: EvalRuleInput = {
  name: "",
  ruleKey: "",
  summary: "",
  prompt: "",
  scoreGuide: DEFAULT_SCORE_GUIDE,
  target: TARGET_BOTH,
  enabled: true,
  weight: 1,
  sortOrder: 100,
}

function toInput(rule: EvalRule): EvalRuleInput {
  return {
    name: rule.name,
    ruleKey: rule.ruleKey,
    summary: rule.summary,
    prompt: rule.prompt,
    scoreGuide: rule.scoreGuide || DEFAULT_SCORE_GUIDE,
    target: rule.target ?? TARGET_BOTH,
    enabled: rule.enabled,
    weight: rule.weight ?? 1,
    sortOrder: rule.sortOrder ?? 100,
  }
}

export default function Rules() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const { data, isLoading, isError, error } = useQuery({
    queryKey: EVAL_RULES_KEY,
    queryFn: listEvalRules,
  })
  const rules = useMemo(() => data ?? [], [data])

  if (isError) {
    return (
      <p className="text-sm text-destructive">
        評価ルールを取得できませんでした: {(error as Error).message}
      </p>
    )
  }
  if (isLoading) return <LoadingSkeletonList count={4} />

  if (id) {
    const rule = id === NEW_ID ? null : rules.find((item) => item.id === id)
    if (id !== NEW_ID && !rule) {
      return (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">評価ルールが見つかりませんでした。</p>
          <Button variant="outline" onClick={() => navigate("/rules")}>
            <ArrowLeft className="mr-2 size-4" />
            一覧へ戻る
          </Button>
        </div>
      )
    }
    return <RuleEditor rule={rule ?? null} rules={rules} />
  }

  return <RuleList rules={rules} />
}

function RuleList({ rules }: { rules: EvalRule[] }) {
  const navigate = useNavigate()

  const columns: TableColumn<EvalRule>[] = [
    {
      key: "sortOrder",
      label: "順",
      sortable: true,
      align: "center",
      width: "60px",
      render: (item) => <span className="text-xs text-muted-foreground">{item.sortOrder ?? "-"}</span>,
    },
    {
      key: "name",
      label: "ルール",
      render: (item) => (
        <div className="min-w-0 text-sm">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate font-medium">{item.name}</span>
            {item.builtIn && (
              <Badge variant="outline" className="shrink-0 text-[10px]">
                標準
              </Badge>
            )}
          </div>
          <div className="truncate text-xs text-muted-foreground">{item.summary}</div>
        </div>
      ),
    },
    {
      key: "ruleKey",
      label: "キー",
      sortable: true,
      width: "180px",
      render: (item) => <code className="text-xs">{item.ruleKey}</code>,
    },
    { key: "targetLabel", label: "評価対象", sortable: true, width: "170px" },
    {
      key: "enabledLabel",
      label: "状態",
      align: "center",
      width: "90px",
      render: (item) => (
        <Badge variant={item.enabled ? "default" : "outline"}>{item.enabledLabel}</Badge>
      ),
    },
  ]

  const filters: FilterConfig<EvalRule>[] = [
    {
      key: "enabledLabel",
      label: "状態",
      options: [
        { value: "有効", label: "有効" },
        { value: "無効", label: "無効" },
      ],
    },
    {
      key: "targetLabel",
      label: "評価対象",
      options: TARGET_OPTIONS.map((option) => ({ value: option.label, label: option.label })),
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">評価ルール</h1>
          <p className="text-muted-foreground">
            ここで編集した判定プロンプトが、そのまま次回の自動評価に使われます。
          </p>
        </div>
        <Button onClick={() => navigate("/rules/new")}>
          <Plus className="mr-2 size-4" />
          ルールを追加
        </Button>
      </div>

      <ListTable
        data={rules}
        columns={columns}
        filters={filters}
        searchKeys={["name", "ruleKey", "summary"]}
        searchPlaceholder="ルール名・キーで検索..."
        itemsPerPage={15}
        emptyMessage="評価ルールがまだありません"
        onRowClick={(item) => navigate(`/rules/${item.id}`)}
      />
    </div>
  )
}

function RuleEditor({ rule, rules }: { rule: EvalRule | null; rules: EvalRule[] }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [form, setForm] = useState<EvalRuleInput>(rule ? toInput(rule) : EMPTY)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    setForm(rule ? toInput(rule) : EMPTY)
  }, [rule])

  const set = <K extends keyof EvalRuleInput>(key: K, value: EvalRuleInput[K]) =>
    setForm((current) => ({ ...current, [key]: value }))

  const keyError = validateRuleKey(form.ruleKey, rules, rule?.id)
  const canSave = form.name.trim() !== "" && form.prompt.trim() !== "" && !keyError

  const save = useMutation({
    mutationFn: () => (rule ? updateEvalRule(rule.id, form) : createEvalRule(form)),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: EVAL_RULES_KEY })
      navigate("/rules")
    },
  })

  const remove = useMutation({
    mutationFn: () => deleteEvalRule(rule!.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: EVAL_RULES_KEY })
      navigate("/rules")
    },
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Button variant="ghost" size="sm" className="-ml-2 mb-1" onClick={() => navigate("/rules")}>
            <ArrowLeft className="mr-2 size-4" />
            評価ルール
          </Button>
          <h1 className="truncate text-2xl font-bold tracking-tight">
            {rule ? rule.name : "ルールを追加"}
          </h1>
        </div>
        <div className="flex gap-2">
          {rule && !rule.builtIn && (
            <Button variant="outline" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="mr-2 size-4" />
              削除
            </Button>
          )}
          <Button disabled={!canSave || save.isPending} onClick={() => save.mutate()}>
            <Save className="mr-2 size-4" />
            {save.isPending ? "保存中..." : "保存"}
          </Button>
        </div>
      </div>

      {save.isError && (
        <p className="text-sm text-destructive">保存できませんでした: {(save.error as Error).message}</p>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">判定プロンプト</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-xs text-muted-foreground">
                評価者 AI にそのまま渡されます。何を見て、何を見ないのかを具体的に書いてください。
              </p>
              <Textarea
                value={form.prompt}
                onChange={(event) => set("prompt", event.target.value)}
                rows={18}
                className="font-mono text-xs"
                placeholder="例) あなたは AI エージェントの◯◯を審査する評価者です。次の観点で評価してください。"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">スコア基準</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                value={form.scoreGuide}
                onChange={(event) => set("scoreGuide", event.target.value)}
                rows={7}
                className="font-mono text-xs"
              />
            </CardContent>
          </Card>
        </div>

        <div className="min-w-0 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">基本情報</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="rule-name">ルール名</Label>
                <Input
                  id="rule-name"
                  value={form.name}
                  onChange={(event) => set("name", event.target.value)}
                  placeholder="例) 出典の明示"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="rule-key">ルールキー</Label>
                <Input
                  id="rule-key"
                  value={form.ruleKey}
                  onChange={(event) => set("ruleKey", event.target.value)}
                  disabled={Boolean(rule)}
                  placeholder="citation_quality"
                  className="font-mono text-xs"
                />
                <p className="text-xs text-muted-foreground">
                  {rule
                    ? "評価結果の紐づけに使うため、作成後は変更できません。"
                    : "評価結果の主キーになります。後から変更できません。"}
                </p>
                {keyError && !rule && <p className="text-xs text-destructive">{keyError}</p>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="rule-summary">概要</Label>
                <Textarea
                  id="rule-summary"
                  value={form.summary}
                  onChange={(event) => set("summary", event.target.value)}
                  rows={3}
                  placeholder="一覧と詳細ページに出る 1〜2 文の説明"
                />
              </div>

              <div className="space-y-1.5">
                <Label>評価対象</Label>
                <div className="space-y-1">
                  {TARGET_OPTIONS.map((option) => (
                    <label
                      key={option.value}
                      className="flex cursor-pointer items-center gap-2 text-sm"
                    >
                      <input
                        type="radio"
                        name="rule-target"
                        className="accent-primary"
                        checked={form.target === option.value}
                        onChange={() => set("target", option.value)}
                      />
                      {option.label}
                    </label>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  選んだものだけが評価者 AI に渡されます。関係ない情報を渡さないほど判定が安定します。
                </p>
              </div>

              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <Checkbox
                  checked={form.enabled}
                  onCheckedChange={(checked) => set("enabled", checked === true)}
                />
                有効（次回の評価で使う）
              </label>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="rule-order">表示順</Label>
                  <Input
                    id="rule-order"
                    type="number"
                    value={form.sortOrder}
                    onChange={(event) => set("sortOrder", Number(event.target.value))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="rule-weight">重み</Label>
                  <Input
                    id="rule-weight"
                    type="number"
                    value={form.weight}
                    onChange={(event) => set("weight", Number(event.target.value))}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">反映のされ方</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs text-muted-foreground">
              <p>保存しただけでは過去のターンは評価し直されません。</p>
              <p>
                新しいルールは次回のパイプライン実行から適用されます。過去のデータにも適用したい場合は
                評価コマンドセンターから再実行を依頼してください。
              </p>
              <Button variant="outline" size="sm" onClick={() => navigate("/command-center")}>
                評価コマンドセンターへ
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      {rule && (
        <ConfirmDialog
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          title="このルールを削除しますか？"
          description={`「${rule.name}」を削除します。過去の評価結果は残りますが、次回以降は評価されなくなります。`}
          confirmLabel="削除する"
          variant="destructive"
          onConfirm={() => remove.mutate()}
        />
      )}
    </div>
  )
}
