import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid } from "recharts"
import { Activity } from "lucide-react"

export function FeedbackActivityChart({ data }: { data: { name: string; count: number }[] }) {
  if (data.length === 0) {
    return (
      <div className="grid h-72 place-items-center rounded-2xl border border-dashed border-[#D7D1C4] bg-[#FBF8F0] px-5 text-center">
        <div><span className="mx-auto grid size-10 place-items-center rounded-2xl bg-[#E7EDF3] text-[#315E83]"><Activity className="size-4" /></span><strong className="mt-3 block text-xs text-[#243746]">近24小时还没有行为数据</strong><p className="mt-1 text-[10px] leading-5 text-[#7A817F]">打开学习页、生成资源或提交答题后，此处会自动形成分布。</p></div>
      </div>
    )
  }

  return (
    <div className="h-72 w-full" aria-label="近24小时学习行为分布图">
      <ResponsiveContainer minWidth={0} initialDimension={{ width: 320, height: 288 }}>
        <BarChart data={data} margin={{ top: 10, right: 16, left: 8, bottom: 12 }} barCategoryGap="18%">
          <defs><linearGradient id="feedbackBarFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#315E83" /><stop offset="100%" stopColor="#6F8A89" /></linearGradient></defs>
          <CartesianGrid strokeDasharray="3 5" stroke="#D7D1C4" opacity={0.65} vertical={false} />
          <XAxis dataKey="name" interval={0} tick={{ fontSize: 11, fill: "#66717B" }} axisLine={false} tickLine={false} tickMargin={8} />
          <YAxis tick={{ fontSize: 11, fill: "#66717B" }} allowDecimals={false} domain={[0, (max: number) => Math.max(1, Math.ceil(max * 1.12))]} axisLine={false} tickLine={false} width={44} />
          <Tooltip
            contentStyle={{ background: "#FFFEFA", border: "1px solid #D7D1C4", borderRadius: 12, fontSize: 12, boxShadow: "0 12px 28px rgba(24,35,45,.10)" }}
            cursor={{ fill: "#F4F1EA" }}
            formatter={(value: unknown) => [`${Number(value || 0).toLocaleString("zh-CN")} 次`, "行为次数"]}
          />
          <Bar dataKey="count" name="行为次数" fill="url(#feedbackBarFill)" radius={[8, 8, 2, 2]} maxBarSize={108} minPointSize={10} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
