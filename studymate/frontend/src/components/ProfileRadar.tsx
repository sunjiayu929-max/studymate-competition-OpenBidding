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
  cs_foundation: "计算机基础",
  data_sql: "数据与SQL",
  subject_prior: "领域先验",
  ml_prior: "ML 先验",  // 向后兼容旧画像
  statistics: "统计",    // 旧维度，兼容历史快照
  english: "英语",       // 旧维度，兼容历史快照
  practice_first: "实践优先",
  stepwise: "循序渐进",
  challenge_seeking: "挑战导向",
  reflective: "复盘总结",
  visual: "视觉",        // 旧维度，兼容历史快照
  reading: "阅读",
  hands_on: "实操",      // 旧维度，兼容历史快照
  auditory: "听觉",      // 旧维度，兼容历史快照
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

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4 }}
      data-testid="profile-radar"
      className={cn(
        "rounded-[22px] border border-[#CFC8B9] bg-[#FFFEFA] p-4 shadow-[0_9px_24px_rgba(24,35,45,.045)]",
        fill && "flex min-h-[220px] flex-1 flex-col",
      )}
    >
      <div className="mb-1 flex items-center justify-between gap-3">
        <div className="text-xs font-bold text-[#18232D]">{title}</div>
        <div className="flex items-center gap-2 text-[10px] font-semibold text-[#8A8172]">
          <span>{chartData.length} 画像维度</span>
          {showScores && <span className="rounded-full bg-[#E7EDF3] px-2 py-1 text-[#315E83]">满分 {max} 分</span>}
        </div>
      </div>
      <div className={fill ? "min-h-0 flex-1" : ""}>
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
            <PolarGrid stroke="#D7D1C4" />
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
                : { fontSize: 10, fill: "#66717B" }}
            />
            <PolarRadiusAxis angle={90} domain={[0, max]} tick={false} axisLine={false} />
            <Radar
              name={title}
              dataKey="value"
              stroke={color}
              fill={color}
              fillOpacity={0.35}
              animationDuration={500}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>
    </motion.div>
  )
}
