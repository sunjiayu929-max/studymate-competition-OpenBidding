import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer } from "recharts"
import { motion } from "framer-motion"
import { cn } from "@/lib/utils"

interface ProfileRadarProps {
  title: string
  data: Record<string, number>
  /** 0-5 score */
  max?: number
  color?: string
  height?: number
  /** 桌面侧栏使用：让雷达卡片填满父容器剩余高度。 */
  fill?: boolean
  /** 在轴标签下直接显示“当前值/满分”，用于需要快速读数的单图场景。 */
  showScores?: boolean
}

interface RadarAxisTickProps {
  x?: number
  y?: number
  payload?: { value?: string }
  values: Record<string, number>
  max: number
}

const labelMap: Record<string, string> = {
  math: "数学",
  programming: "编程",
  statistics: "统计",
  english: "英语",
  subject_prior: "领域先验",
  ml_prior: "ML 先验",  // 向后兼容旧画像
  visual: "视觉",
  reading: "阅读",
  hands_on: "实操",
  auditory: "听觉",
  document: "文档",
  mindmap: "导图",
  quiz: "题目",
  code: "代码",
  video: "视频",
  employment_programming: "编程实现",
  employment_algorithms: "算法建模",
  employment_data_ai: "数据与 AI",
  employment_systems: "系统网络",
  employment_engineering: "工程实践",
  employment_professional: "职业素养",
  algorithms: "算法建模",
  data_ai: "数据与 AI",
  systems: "系统网络",
  engineering: "工程实践",
  professional: "职业素养",
}

const employmentLabelMap: Record<string, string> = {
  programming: "编程实现",
  algorithms: "算法建模",
  data_ai: "数据AI",
  systems: "系统网络",
  engineering: "工程实践",
  professional: "职业素养",
}

function formatScore(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/u, "")
}

function RadarAxisTick({ x = 0, y = 0, payload, values, max }: RadarAxisTickProps) {
  const label = payload?.value || ""
  const value = values[label] ?? 0
  const width = Math.max(58, Math.min(92, 32 + Array.from(label).length * 11))

  return (
    <g transform={`translate(${x}, ${y})`} role="img" aria-label={`${label}：${formatScore(value)}/${max}`}>
      <rect x={-width / 2} y={-18} width={width} height={36} rx={10} fill="#FFFEFA" fillOpacity={0.96} stroke="#E2DDD3" />
      <text x={0} y={-3} textAnchor="middle" fontSize={10} fontWeight={600} fill="#59636B">{label}</text>
      <text x={0} y={12} textAnchor="middle" fontSize={9} fontWeight={700} fill="#315E83">{formatScore(value)}/{max}</text>
    </g>
  )
}

export function ProfileRadar({ title, data, max = 5, color = "#6366f1", height = 176, fill = false, showScores = false }: ProfileRadarProps) {
  const labels = title.includes("就业") ? employmentLabelMap : labelMap
  const chartData = Object.entries(data).map(([k, v]) => ({
    dim: labels[k] || labelMap[k] || k,
    value: typeof v === "number" ? Math.max(0, Math.min(max, v)) : 0,
  }))
  const values = Object.fromEntries(chartData.map((item) => [item.dim, item.value]))
  const average = chartData.length ? chartData.reduce((sum, item) => sum + item.value, 0) / chartData.length : 0
  const highlights = [...chartData].sort((a, b) => b.value - a.value).slice(0, 3)
  const gradientId = `profile-radar-${title.replace(/[^a-zA-Z0-9\u4e00-\u9fff]/gu, "-")}`

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4 }}
      data-testid="profile-radar"
      className={cn(
        "profile-radar-card rounded-[22px] border border-[#D8E2F0] bg-[#FFFEFA] p-4 shadow-[0_12px_28px_rgba(48,83,139,.08)]",
        fill && "flex min-h-[220px] flex-1 flex-col",
      )}
      style={{ background: `radial-gradient(circle at 84% 8%, ${color}18, transparent 42%), linear-gradient(145deg, #ffffff 0%, #f8fbff 100%)` }}
    >
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="profile-radar-orb" style={{ background: `linear-gradient(135deg, ${color}, ${color}88)` }} aria-hidden="true" />
          <div className="truncate text-xs font-bold text-[#18232D]">{title}</div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 text-[10px] font-semibold text-[#8A8172]">
          <span>{chartData.length} 个维度</span>
          <span className="rounded-full bg-white/80 px-2 py-1 text-[#315E83] shadow-sm">均值 {formatScore(average)}</span>
        </div>
      </div>
      <div className={cn("profile-radar-visual", fill ? "min-h-0 flex-1" : "")}>
        <ResponsiveContainer
          width="100%"
          height={fill ? "100%" : height}
          minWidth={0}
          minHeight={fill ? 160 : undefined}
          initialDimension={{ width: 320, height: fill ? 320 : height }}
        >
          <RadarChart
            data={chartData}
            margin={showScores
              ? { top: 24, right: 28, bottom: 24, left: 28 }
              : { top: 8, right: 18, bottom: 20, left: 18 }}
            outerRadius={showScores ? "74%" : "76%"}
          >
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.58} />
                <stop offset="100%" stopColor={color} stopOpacity={0.16} />
              </linearGradient>
            </defs>
            <PolarGrid gridType="polygon" stroke="#C9D7E8" strokeDasharray="3 4" radialLines />
            <PolarAngleAxis
              dataKey="dim"
              tick={showScores
                ? (props) => (
                    <RadarAxisTick
                      x={typeof props.x === "number" ? props.x : 0}
                      y={typeof props.y === "number" ? props.y : 0}
                      payload={props.payload as { value?: string } | undefined}
                      values={values}
                      max={max}
                    />
                  )
                : { fontSize: 10, fill: "#526A88", fontWeight: 600 }}
            />
            <PolarRadiusAxis angle={90} domain={[0, max]} tick={false} axisLine={false} />
            <Radar
              name={title}
              dataKey="value"
              stroke={color}
              strokeWidth={2.5}
              strokeLinejoin="round"
              fillOpacity={0.42}
              fill={`url(#${gradientId})`}
              animationDuration={500}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>
      {highlights.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5" aria-label="优势维度">
          {highlights.map((item) => (
            <span key={item.dim} className="profile-radar-chip">
              <span className="profile-radar-chip-dot" style={{ backgroundColor: color }} />
              {item.dim} <b>{formatScore(item.value)}</b>
            </span>
          ))}
        </div>
      )}
    </motion.div>
  )
}
