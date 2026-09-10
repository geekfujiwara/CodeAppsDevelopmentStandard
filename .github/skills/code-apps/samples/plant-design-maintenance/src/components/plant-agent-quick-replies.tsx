import { useState } from "react"
import { plantAgentQuickReplies, type PlantAgentActivity } from "@/lib/plant-agent-quick-replies"
import type { PlantAgentSelection } from "@/lib/plant-agent-contract"

export function PlantAgentQuickReplies({ selection, activity, disabled, onSend }: {
  selection: PlantAgentSelection
  activity?: PlantAgentActivity
  disabled: boolean
  onSend: (text: string) => void
}) {
  const plan = plantAgentQuickReplies(selection, activity)
  return <ReplyGroups key={plan.contextKey} plan={plan} disabled={disabled} onSend={onSend} />
}

function ReplyGroups({ plan, disabled, onSend }: {
  plan: ReturnType<typeof plantAgentQuickReplies>
  disabled: boolean
  onSend: (text: string) => void
}) {
  const [activeGroup, setActiveGroup] = useState(plan.activeGroup)
  const group = plan.groups.find(candidate => candidate.id === activeGroup)!
  return <div className="agent-context-replies">
    <div className="agent-reply-groups" role="group" aria-label="質問の種類">
      {plan.groups.map(candidate => <button key={candidate.id} type="button" aria-pressed={candidate.id === activeGroup} onClick={() => setActiveGroup(candidate.id)}>{candidate.title}</button>)}
    </div>
    <div className="agent-quick-replies" role="group" aria-label={`${group.title}の質問候補`}>
      {group.replies.map(reply => <button key={reply.title} type="button" disabled={disabled} onClick={() => onSend(reply.text)}>{reply.title}</button>)}
    </div>
  </div>
}