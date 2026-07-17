import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer } from "recharts"
import { motion } from "framer-motion"

interface ProfileRadarProps {
  title: string
  data: Record<string, number>
  /** 0-5 score */
  max?: number
  color?: string
  height?: number
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

export function ProfileRadar({ title, data, max = 5, color = "#6366f1", height = 176 }: ProfileRadarProps) {
  const labels = title.includes("就业") ? employmentLabelMap : labelMap
  const chartData = Object.entries(data).map(([k, v]) => ({
    dim: labels[k] || labelMap[k] || k,
    value: typeof v === "number" ? v : 0,
  }))

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4 }}
      className="rounded-[22px] border border-[#CFC8B9] bg-[#FFFEFA] p-4 shadow-[0_9px_24px_rgba(24,35,45,.045)]"
    >
      <div className="mb-1 flex items-center justify-between gap-3">
        <div className="text-xs font-bold text-[#18232D]">{title}</div>
        <span className="text-[10px] font-semibold text-[#8A8172]">{chartData.length} 画像维度</span>
      </div>
      <ResponsiveContainer width="100%" height={height} minWidth={0}>
        <RadarChart data={chartData}>
          <PolarGrid stroke="#D7D1C4" />
          <PolarAngleAxis dataKey="dim" tick={{ fontSize: 10, fill: "#66717B" }} />
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
    </motion.div>
  )
}
