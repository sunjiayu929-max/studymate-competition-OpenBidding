import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid } from "recharts"
import { Activity } from "lucide-react"

export function FeedbackActivityChart({ data }: { data: { name: string; count: number }[] }) {
  if (data.length === 0) {
    return (
      <div className="feedback-activity-empty">
        <Activity className="size-5" />
        <span><strong>近 24 小时暂无行为数据</strong><small>产生真实学习行为后，此处会自动显示分布。</small></span>
      </div>
    )
  }

  return (
    <div className="feedback-activity-chart" style={{ height: Math.max(184, data.length * 36) }} role="img" aria-label="近 24 小时高频学习行为分布图">
      <ResponsiveContainer minWidth={0} initialDimension={{ width: 320, height: 216 }}>
        <BarChart data={data} layout="vertical" margin={{ top: 8, right: 24, left: 2, bottom: 6 }} barCategoryGap="24%">
          <CartesianGrid strokeDasharray="3 5" stroke="#D5E2E3" opacity={0.75} horizontal={false} />
          <XAxis type="number" tick={{ fontSize: 10, fill: "#71868E" }} allowDecimals={false} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: "#486976" }} axisLine={false} tickLine={false} width={94} />
          <Tooltip
            contentStyle={{ background: "#FAFEFE", border: "1px solid #C8DCDF", borderRadius: 10, fontSize: 11, boxShadow: "0 10px 24px rgba(28,72,88,.10)" }}
            cursor={{ fill: "#EDF6F5" }}
            formatter={(value: unknown) => [`${Number(value || 0).toLocaleString("zh-CN")} 次`, "行为次数"]}
          />
          <Bar dataKey="count" name="行为次数" fill="#2E7E8C" radius={[0, 7, 7, 0]} maxBarSize={18} minPointSize={3} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
