import { chromium } from "playwright"

let browser
try {
  browser = await chromium.launch({ channel: "chrome" })
} catch {
  browser = await chromium.launch({ channel: "msedge" })
}
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 })
const page = await context.newPage()
page.on("pageerror", (error) => console.error("PAGE_ERROR", error.message))

const profile = {
  user_id: 13,
  version: 5,
  intake_complete: true,
  missing_fields: [],
  dims: {
    knowledge_base: { math: 3, programming: 4, statistics: 2, english: 3, subject_prior: 2 },
    cognitive_style: { visual: 4, reading: 3, hands_on: 5, auditory: 2 },
    preference: { document: 4, mindmap: 3, quiz: 4, code: 5, video: 2, reading: 3 },
    goals: { primary: "应聘前线部署工程师（FDE）", deadline: "三个月", target_topics: ["需求澄清", "系统集成"] },
    weak_points: { topics: ["部署依赖分析", "验收口径设计"], error_types: ["场景判断"] },
    pace: { hours_per_week: 6, intensity: "medium" },
    employment_skills: { programming: 3, algorithms: 1, data_ai: 2, systems: 1, engineering: 2, professional: 2 },
    learner_background: { education: "计算机本科", major: "计算机科学", practice_status: "has" },
    profile_coverage: { knowledge_base: true, cognitive_style: true, resource_preference: true, employment_skills: true },
    theory_assessments: { fde: { assessment_id: 1, role_id: "fde", role_name: "前线部署工程师（FDE）", score: 58, knowledge_level: "基础", competency_scores: {}, weak_topics: ["需求澄清", "系统集成"], completed_at: "2026-08-14" } },
  },
}

await page.route("**/api/auth/me", (route) => route.fulfill({ json: null }))
await page.route("**/api/profile/13", (route) => route.fulfill({ json: profile }))
await page.route("**/api/theory-assessments/status**", (route) => route.fulfill({ json: { role_id: "fde", profile_ready: true, profile_score: 90, required: false, assessment: { id: 1, role_id: "fde", role_name: "前线部署工程师（FDE）", course_id: 6, status: "submitted", score: 58, items: [], result: {} } } }))

await page.addInitScript(() => {
  localStorage.setItem("sm:current-user", JSON.stringify({ user_id: 13, name: "视觉检查", email: "demo@example.com", role: "student" }))
  localStorage.setItem("sm:target-role", JSON.stringify({ domainId: "software", roleId: "fde" }))
  localStorage.setItem("sm:current-course", JSON.stringify({ id: 6, name: "FDE 岗位知识库", chunk_count: 11 }))
  const plan = {
    type: "training_plan", title: "FDE 本轮训练计划", cycle: 1,
    rationale: "先补齐需求澄清和系统集成基础，再用交付场景验证迁移能力。",
    priority_competencies: ["需求澄清", "系统集成"], deferred_competencies: ["客户沟通"],
    weekly_hours: 6, target_difficulty: 2.6, preferred_mode: "practice",
    stages: [
      { id: "s1", resource: "定制讲义", goal: "补齐需求澄清与验收口径", evidence: "完成核心概念检查" },
      { id: "s2", resource: "实操指南", goal: "完成接口联调与异常排查", evidence: "提交可复现实操记录" },
      { id: "s3", resource: "分阶测试", goal: "验证场景判断与迁移", evidence: "正确率达到 70%" },
    ],
    acceptance_criteria: ["场景测试达到 70 分"],
    debate: { expert_position: "覆盖岗位交付链路", strategy_position: "控制认知负荷", conflict: "覆盖范围与时间预算冲突", resolution: "本轮聚焦两个优先能力" },
    release_gate: "三项审核通过", next_round_rule: "达到 85% 后升阶",
  }
  sessionStorage.setItem("sm:workspace-state", JSON.stringify({
    topic: "澄清客户场景与验收口径", courseId: 6, courseName: "FDE 岗位知识库", status: "done", runId: "demo-report-20260814", domain: "软件开发", targetRole: "FDE", roleSummary: "", coreCompetencies: ["需求澄清", "系统集成"], stage: "published", generationRound: 1, reworkHistory: [],
    diagnosis: { type: "diagnosis", title: "学情诊断", current_level: "基础", target_difficulty: 2.6, knowledge_score: 58, evidence_confidence: .86, knowledge_gaps: ["需求澄清", "部署依赖分析", "异常排查"], training_goal: "形成最小交付闭环", training_contract: {} },
    reviews: { evidence_review: { status: "pass", score: 92, findings: [] }, practice_review: { status: "pass", score: 89, findings: [] }, difficulty_review: { status: "pass", score: 91, findings: [] } },
    decision: { decision: "publish", summary: "三类资源通过审核，可以发布。", quality_score: 91, generation_round: 1, rework_targets: [], required_fixes: [], review_scores: {}, release_gate: { review_count: 3, blocker_count: 0, all_reviews_present: true } },
    feedback: null, outputs: { training_plan: plan, doc: { type: "doc", title: "定制讲义", content: "", citations: [] }, guide: { type: "guide", title: "实操指南", content: "", citations: [] }, quiz: { type: "quiz", title: "分阶测试", items: [], count: 8 } }, stream: { doc: "", guide: "", mindmap: "", quiz: "", path: "", reading: "", code: "" }, agentStatus: {}, agents: [], logs: [], quizAttempts: {}, resourcesConsumed: {}, quizSessionsRecorded: {}, learningStartedAt: 0, learningDurationMs: 0, startedAt: Date.now(), finishedAt: Date.now(), lastError: "", updatedAt: Date.now(),
  }))
  sessionStorage.setItem("sm:learning-universe-entered", "1")
})

await page.goto("http://localhost:5173/login", { waitUntil: "networkidle" })
await page.evaluate(async () => {
  document.body.innerHTML = '<div id="report-test-root"></div>'
  const harness = await import("/scripts/learner-report-harness.tsx")
  harness.mountCompetency()
  window.__reportTest = harness
})
await page.getByText("岗位训练中心", { exact: true }).first().waitFor()
if (await page.getByRole("link", { name: "能力路径" }).count()) throw new Error("岗位训练中心仍保留能力路径分页")
if (await page.getByRole("link", { name: "协作审计" }).count()) throw new Error("岗位训练中心仍保留协作审计分页")
if (await page.getByRole("link", { name: "训练资源" }).count()) throw new Error("岗位训练中心仍保留训练资源分页")
if (await page.getByRole("img", { name: /路径地图/ }).count() !== 1) throw new Error("岗位训练中心顶部路径地图未渲染")
const competencyText = await page.locator("body").innerText()
for (const label of ["学情诊断 Agent", "领域专家 Agent", "教学策略 Agent", "资源生成 Agent", "事实与来源校验 Agent", "实操规范校验 Agent", "难度与覆盖校验 Agent", "总决策 Agent", "发布门禁"]) {
  if (!competencyText.includes(label)) throw new Error(`协作流程缺少节点：${label}`)
}
if (competencyText.includes("训练计划仲裁 Agent")) throw new Error("协作流程仍包含训练计划仲裁 Agent")
if (await page.getByText("辩论实录", { exact: true }).count() !== 1) throw new Error("辩论实录标题不正确")
if (!competencyText.includes("交叉验证结果") || !competencyText.includes("审核结果")) throw new Error("交叉验证结果与审核结果未并置显示")
if (await page.locator("details").count() !== 1) throw new Error("辩论实录应是唯一的折叠容器")
if (competencyText.includes("自动返工记录") || competencyText.includes("查看最近处理记录")) throw new Error("岗位训练中心仍显示已移除的记录区块")
await page.screenshot({ path: "test-results/screenshots/competency-training.png", fullPage: true })
if (await page.locator("#learner-match-report").count()) {
  throw new Error("岗位训练中心不应再显示个人学情与资源匹配度报告")
}
await page.evaluate(() => {
  window.__reportTest.mountHome()
})
await page.locator("#learner-match-report").waitFor()
if (!(await page.locator("#learner-match-report").innerText()).includes("前线部署工程师（FDE）")) {
  throw new Error("路径地图终点未显示当前选择的目标岗位")
}
await page.addStyleTag({ content: ".app-topbar { position: static !important; }" })
await page.locator("#learner-match-report").scrollIntoViewIfNeeded()
await page.waitForTimeout(800)
await page.locator("#learner-match-report").screenshot({ path: "test-results/screenshots/learner-match-report.png" })
const layout = await page.evaluate(() => {
  const report = document.querySelector("#learner-match-report")
  const route = [...document.querySelectorAll("span")].find((node) => node.textContent?.includes("今日学习航线"))
  const capabilities = [...document.querySelectorAll("span")].find((node) => node.textContent?.includes("常用学习能力"))
  const top = (node) => node ? node.getBoundingClientRect().top + window.scrollY : Number.POSITIVE_INFINITY
  return { report: top(report), route: top(route), capabilities: top(capabilities) }
})
if (!(layout.report < layout.route && layout.report < layout.capabilities)) {
  throw new Error(`报告位置不正确: ${JSON.stringify(layout)}`)
}
await page.setViewportSize({ width: 390, height: 844 })
await page.locator("#learner-match-report").scrollIntoViewIfNeeded()
const mobileBounds = await page.locator("#learner-match-report").evaluate((node) => {
  const rect = node.getBoundingClientRect()
  return { left: rect.left, right: rect.right, viewport: window.innerWidth }
})
if (mobileBounds.left < -1 || mobileBounds.right > mobileBounds.viewport + 1) {
  throw new Error(`移动端报告外框溢出: ${JSON.stringify(mobileBounds)}`)
}
await page.locator("#learner-match-report").screenshot({ path: "test-results/screenshots/learner-match-report-mobile.png" })
console.log("REPORT_OK", await page.locator("#learner-match-report").getByText("知识盲区定位").count(), await page.locator("#learner-match-report").getByText("资源难度匹配曲线").count(), await page.locator("#learner-match-report").getByText("学习路径规划图").count(), "ALWAYS_VISIBLE")
if (await page.locator("#learner-match-report").getByRole("img", { name: /路径地图/ }).count() !== 1) throw new Error("路径地图未渲染")
if (await page.locator("#learner-match-report").getByRole("link", { name: /开始今日学习/ }).count() !== 1) throw new Error("开始今日学习按钮未渲染")
const startLearningLink = page.locator("#learner-match-report").getByRole("link").filter({ hasText: "开始今日学习" })
if (await startLearningLink.count() !== 1) throw new Error("开始今日学习按钮未渲染")
if (await startLearningLink.getAttribute("href") !== "/competency") throw new Error("开始今日学习按钮路径不正确")
await browser.close()
