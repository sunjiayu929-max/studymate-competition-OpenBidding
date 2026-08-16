import { useMemo, useState } from "react"
import { Check, ChevronLeft, History, Pencil, Search, Trash2, X } from "lucide-react"
import type { TutorConversation } from "@/store/tutorHistory"

interface TutorConversationPanelProps {
  conversations: TutorConversation[]
  courseName: string
  onBack: () => void
  onRestore: (id: string) => void
  onDelete: (id: string) => void
  onRename: (id: string, title: string) => void
  className?: string
}

type ConversationGroup = { label: string; items: TutorConversation[] }

function groupConversations(items: TutorConversation[]): ConversationGroup[] {
  const now = new Date()
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const groups: Record<string, TutorConversation[]> = { 今天: [], 最近七天: [], 更早: [] }
  items.forEach((item) => {
    const timestamp = new Date(item.updated_at).getTime()
    if (timestamp >= startToday) groups["今天"].push(item)
    else if (timestamp >= startToday - 6 * 86400000) groups["最近七天"].push(item)
    else groups["更早"].push(item)
  })
  return Object.entries(groups)
    .filter(([, groupItems]) => groupItems.length > 0)
    .map(([label, groupItems]) => ({ label, items: groupItems }))
}

function formatTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "时间未记录"
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function TutorConversationPanel({
  conversations,
  courseName,
  onBack,
  onRestore,
  onDelete,
  onRename,
  className = "",
}: TutorConversationPanelProps) {
  const [query, setQuery] = useState("")
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [draft, setDraft] = useState("")
  const filtered = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase("zh-CN")
    return keyword
      ? conversations.filter((item) => item.title.toLocaleLowerCase("zh-CN").includes(keyword))
      : conversations
  }, [conversations, query])
  const groups = useMemo(() => groupConversations(filtered), [filtered])

  const saveRename = (id: string) => {
    if (draft.trim()) onRename(id, draft)
    setEditingId(null)
    setDraft("")
  }

  return (
    <section className={`flex h-full min-h-0 flex-col bg-[#FDFBF6] ${className}`} aria-label="历史对话">
      <div className="shrink-0 border-b border-[#D7D1C4] bg-[#F8F6F0] px-4 pb-4 pt-4">
        <div className="flex items-center gap-3">
          <button type="button" onClick={onBack} className="grid size-9 shrink-0 place-items-center rounded-xl border border-transparent text-[#66717B] transition-colors hover:border-[#D7D1C4] hover:bg-[#FFFEFA] hover:text-[#244C66]" aria-label="返回当前对话">
            <ChevronLeft className="size-4" />
          </button>
          <div className="min-w-0 flex-1">
            <h3 className="text-[16px] font-bold tracking-[-0.02em] text-[#18232D]">历史对话</h3>
            <p className="mt-0.5 truncate text-[10px] text-[#7A817F]">目标岗位「{courseName}」· {conversations.length} 条记录</p>
          </div>
          <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-[#DDD4BF] bg-[#F4ECD8] text-[#9B7429]"><History className="size-4" /></span>
        </div>
        <label className="mt-3 flex h-10 items-center gap-2 rounded-xl border border-[#D7D1C4] bg-[#FFFEFA] px-3 text-[#7A817F] transition-colors focus-within:border-[#9FB1BC] focus-within:text-[#244C66]">
          <Search className="size-3.5 shrink-0" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索对话标题" className="min-w-0 flex-1 bg-transparent text-[12px] text-[#18232D] outline-none placeholder:text-[#9B9F9B]" />
          {query && <button type="button" onClick={() => setQuery("")} aria-label="清空搜索" className="grid size-6 place-items-center rounded-lg hover:bg-[#F1EDE4]"><X className="size-3" /></button>}
        </label>
        <div className="mt-3 flex items-center gap-2 rounded-xl border border-[#CED7CF] bg-[#E9EEE6] px-3 py-2 text-[10px] font-semibold text-[#557052]">
          <span className="size-1.5 shrink-0 rounded-full bg-[#6F8A69]" />当前对话会自动保存；开启新对话后会出现在这里
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
        {conversations.length === 0 ? (
          <div className="px-4 pt-14 text-center">
            <span className="mx-auto grid size-12 place-items-center rounded-2xl border border-[#D7D1C4] bg-[#F8F6F0] text-[#9B7429]"><History className="size-5" /></span>
            <p className="mt-4 text-[13px] font-bold text-[#59636B]">还没有历史对话</p>
            <p className="mx-auto mt-1 max-w-[230px] text-[11px] leading-5 text-[#8A908C]">聊过之后点击“新对话”，当前内容会自动保存到这里。</p>
          </div>
        ) : groups.length === 0 ? (
          <div className="px-4 pt-14 text-center text-[12px] text-[#8A908C]">没有找到匹配的对话</div>
        ) : (
          <div className="space-y-5">
            {groups.map((group) => (
              <div key={group.label}>
                <div className="mb-2 px-1 text-[10px] font-bold tracking-[0.12em] text-[#8A8172]">{group.label}</div>
                <div className="space-y-2">
                  {group.items.map((conversation) => (
                    <article key={conversation.id} className="group rounded-2xl border border-[#D7D1C4] bg-[#FFFEFA] p-3 transition-all hover:border-[#AFA796] hover:shadow-[0_7px_18px_rgba(24,35,45,.06)]">
                      {deletingId === conversation.id ? (
                        <div role="alert" className="rounded-xl border border-[#E1CFC6] bg-[#FBF3ED] p-2.5">
                          <div className="flex items-start gap-2 text-[11px] leading-4 text-[#6B5148]"><Trash2 className="mt-0.5 size-3.5 shrink-0 text-[#A05137]" /><span><strong className="block text-[#4E403B]">删除这条历史对话？</strong>删除后无法恢复。</span></div>
                          <div className="mt-2.5 flex justify-end gap-1.5">
                            <button type="button" onClick={() => setDeletingId(null)} className="h-7 rounded-lg border border-[#D7D1C4] bg-[#FFFEFA] px-2.5 text-[10px] font-bold text-[#59636B]">取消</button>
                            <button type="button" onClick={() => { onDelete(conversation.id); setDeletingId(null) }} className="h-7 rounded-lg bg-[#A05137] px-2.5 text-[10px] font-bold text-white">确认删除</button>
                          </div>
                        </div>
                      ) : editingId === conversation.id ? (
                        <form onSubmit={(event) => { event.preventDefault(); saveRename(conversation.id) }} className="flex items-center gap-1.5">
                          <input autoFocus value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") setEditingId(null) }} maxLength={256} className="h-8 min-w-0 flex-1 rounded-lg border border-[#9FB1BC] bg-[#FDFBF6] px-2 text-[12px] font-semibold text-[#244C66] outline-none" />
                          <button type="submit" className="grid size-8 place-items-center rounded-lg bg-[#244C66] text-white" aria-label="保存标题"><Check className="size-3.5" /></button>
                          <button type="button" onClick={() => setEditingId(null)} className="grid size-8 place-items-center rounded-lg text-[#7A817F] hover:bg-[#F1EDE4]" aria-label="取消重命名"><X className="size-3.5" /></button>
                        </form>
                      ) : (
                        <div className="flex items-start gap-2">
                          <button type="button" onClick={() => onRestore(conversation.id)} className="min-w-0 flex-1 text-left">
                            <div className="truncate text-[12px] font-bold text-[#244C66]">{conversation.title}</div>
                            <div className="mt-1 text-[10px] text-[#8A908C]">{formatTime(conversation.updated_at)} · {conversation.messages.length} 条消息</div>
                          </button>
                          <div className="flex shrink-0 items-center opacity-45 transition-opacity group-hover:opacity-100">
                            <button type="button" onClick={() => { setEditingId(conversation.id); setDraft(conversation.title) }} className="grid size-8 place-items-center rounded-lg text-[#7A817F] hover:bg-[#E7EDF3] hover:text-[#244C66]" aria-label={`重命名 ${conversation.title}`}><Pencil className="size-3.5" /></button>
                            <button type="button" onClick={() => setDeletingId(conversation.id)} className="grid size-8 place-items-center rounded-lg text-[#9A8D78] hover:bg-[#F4E8E2] hover:text-[#9A4E35]" aria-label={`删除 ${conversation.title}`}><Trash2 className="size-3.5" /></button>
                          </div>
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
