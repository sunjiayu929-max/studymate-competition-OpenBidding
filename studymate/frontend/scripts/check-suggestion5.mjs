import assert from "node:assert/strict"
import { chromium } from "playwright"

const baseUrl = (process.env.STUDYMATE_BASE_URL || "http://127.0.0.1:5173").replace(/\/$/, "")
const user = { user_id: 995, name: "建议5回归用户", email: "suggestion5@example.invalid", role: "student" }
const course = { id: 5, name: "计算机组成原理", description: "计算机组成原理" }
const dims = {
  knowledge_base: { math: 3, programming: 3, statistics: 3, english: 3, subject_prior: 2 },
  cognitive_style: { visual: 3, reading: 3, hands_on: 3, auditory: 3 },
  goals: { primary: "掌握计算机组成原理", deadline: "", target_topics: [] },
  weak_points: { topics: [], error_types: [] },
  pace: { hours_per_week: 6, intensity: "medium" },
  preference: { document: 3, mindmap: 3, quiz: 3, code: 3, video: 3, reading: 3 },
  employment_skills: { programming: 1, algorithms: 1, data_ai: 0, systems: 1, engineering: 0, professional: 0 },
}

const workspaceState = {
  topic: "原码反码补码",
  courseId: course.id,
  courseName: course.name,
  status: "done",
  outputs: {
    reading: {
      type: "reading",
      title: "拓展阅读",
      count: 3,
      items: [
        { title: "如何理解原码、反码和补码？", type: "blog", lang: "zh", url: "", source: "知乎", difficulty: "入门", summary: "通俗解释三种编码" },
        { title: "【哈工大】计算机组成原理 刘宏伟（全85讲）", type: "video", lang: "zh", url: "", source: "B站", difficulty: "入门", summary: "模型生成的视频描述" },
        { title: "原码、反码、补码详解", type: "blog", lang: "zh", url: "", source: "CSDN", difficulty: "入门", summary: "基础讲解" },
      ],
    },
  },
  stream: { doc: "", mindmap: "", quiz: "", path: "", reading: "", code: "" },
  agentStatus: {}, agents: [], logs: [], quizAttempts: {}, resourcesConsumed: {}, quizSessionsRecorded: {},
  learningStartedAt: 0, learningDurationMs: 0, startedAt: Date.now(), finishedAt: Date.now(), lastError: "", updatedAt: Date.now(),
}

const report = {
  user_id: user.user_id,
  profile_version: 1,
  current_dims: dims,
  projected_dims: dims,
  scores: {
    overall_correct_rate: 1,
    by_topic: { 原码反码补码: { correct: 1, total: 1, rate: 1 } },
    by_topic_difficulty: { 原码反码补码: { 1: { correct: 1, total: 1, rate: 1 } } },
    total_attempts: 1,
    total_correct: 1,
    engagement_score: 80,
    answer_completion: { answered: 1, total: 1, rate: 1 },
    resource_coverage: { consumed: 2, available: 3, rate: 0.67 },
    engagement_breakdown: { time_spent_min: 20, time_score: 40, resource_types: 2, resource_variety_score: 40 },
  },
  profile_delta: {}, suggestions: [], next_topics: [], summary_markdown: "## 总结\n继续学习。",
  generated_at: new Date().toISOString(),
  evidence: {
    course_id: course.id, course_name: course.name, topic: "原码反码补码", quiz_count: 1, time_spent_min: 20,
    resources_consumed: ["doc", "reading"], resources_available: ["doc", "reading", "code"], topics_studied: ["原码反码补码"],
  },
}

let browser
try {
  browser = await chromium.launch()
} catch (error) {
  if (!String(error).includes("Executable doesn't exist")) throw error
  browser = await chromium.launch({ channel: "chrome" })
}

const page = await browser.newPage({ viewport: { width: 1440, height: 960 } })
const talentRequests = []
const json = (route, value, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(value) })

await page.route("**/api/**", async (route) => {
  const request = route.request()
  const url = new URL(request.url())
  const path = url.pathname
  if (path === "/api/auth/me") return json(route, user)
  if (path === "/api/courses") return json(route, { count: 1, items: [course] })
  if (path === `/api/courses/${course.id}/config`) return json(route, {
    ...course, persona: "计组助教", code_style: "hardware", code_libs: [], reading_sources: [],
    sample_topics: ["原码反码补码"], sample_questions: [], syllabus_hint: "数据表示", from_registry: true,
  })
  if (path === `/api/profile/${user.user_id}`) return json(route, { user_id: user.user_id, version: 1, dims })
  if (path === `/api/profile/snapshots/${user.user_id}`) return json(route, { user_id: user.user_id, count: 0, items: [] })
  if (path === `/api/eval/history/${user.user_id}`) return json(route, { user_id: user.user_id, count: 0, items: [] })
  if (path === "/api/rencaiya/courses") {
    talentRequests.push(request.url())
    return json(route, {
      provider: "讯飞人才呀", source_state: "live", match_level: "course", resolved_query: "原码反码补码",
      course_name: course.name, platform_url: "http://rencaiya.vip/college/allcourse", items: [],
    })
  }
  if (path === "/api/bili/videos") return json(route, {
    ok: true,
    resolved_query: "原码反码补码",
    search_url: "https://search.bilibili.com/all?keyword=原码反码补码",
    videos: [{
      bvid: "BV16rNSzKEG4", title: "计组 原码反码补码移码 技巧", author: "计组讲解者", cover: "", play: 100,
      duration: "05:12", url: "https://www.bilibili.com/video/BV16rNSzKEG4",
    }],
  })
  if (path === "/api/reading/resolve") return json(route, { count: 0, items: [] })
  if (path === "/api/careers/recommendations") return json(route, { provider: "讯飞人才呀", source_state: "fallback", platform_url: "", current_course: course.name, historical_courses: [], evidence_note: "回归", items: [] })
  if (path === "/api/events" || path === "/api/events/batch") return json(route, { ok: true })
  return json(route, { ok: true })
})

await page.addInitScript(({ currentUser, currentCourse, state, evalReport }) => {
  localStorage.setItem("sm:current-user", JSON.stringify(currentUser))
  localStorage.setItem("sm:current-course", JSON.stringify(currentCourse))
  localStorage.setItem(`sm:getting-started-seen:v1:${currentUser.user_id}`, "1")
  localStorage.setItem(`sm:eval-report:${currentUser.user_id}`, JSON.stringify(evalReport))
  sessionStorage.setItem("sm:workspace-state", JSON.stringify(state))
}, { currentUser: user, currentCourse: course, state: workspaceState, evalReport: report })

await page.goto(`${baseUrl}/workspace/r/reading`, { waitUntil: "networkidle" })
assert.equal(await page.getByText("讯飞人才呀课程", { exact: true }).count(), 0, "无知识点匹配时不应展示课程级兜底")
assert.equal(talentRequests.length, 1, "人才呀只应执行一次知识点查询")
assert.match(talentRequests[0], /keyword=%E5%8E%9F%E7%A0%81%E5%8F%8D%E7%A0%81%E8%A1%A5%E7%A0%81/)
assert.equal(await page.getByText("【哈工大】计算机组成原理 刘宏伟（全85讲）", { exact: true }).count(), 0, "模型描述的视频应被真实检索结果替换")
const biliCard = page.getByText("计组 原码反码补码移码 技巧", { exact: true }).locator("xpath=ancestor::article")
assert.equal(await biliCard.getByRole("link", { name: "打开 B站视频" }).getAttribute("href"), "https://www.bilibili.com/video/BV16rNSzKEG4")
assert.equal(await biliCard.getByText("可直达", { exact: true }).count(), 1)
const zhihuCard = page.getByText("如何理解原码、反码和补码？", { exact: true }).locator("xpath=ancestor::article")
const zhihuHref = await zhihuCard.getByRole("link", { name: "搜索知乎相关文章" }).getAttribute("href")
assert.equal(new URL(zhihuHref).hostname, "cn.bing.com", "知乎无公开稳定检索接口时应明确保留搜索入口")
assert.equal(await zhihuCard.getByText("搜索入口", { exact: true }).count(), 1)

await page.goto(`${baseUrl}/report`, { waitUntil: "networkidle" })
await page.getByText("学习达成率拆解", { exact: true }).waitFor()
await page.getByText("分别展示作答、资源覆盖和学习投入", { exact: true }).waitFor()
assert.equal(await page.getByText(/不把不同证据混成一个含糊的综合分/).count(), 0)

console.log("建议5前端回归通过：人才呀无匹配不展示、B站真实视频直达、知乎搜索边界和报告文案均正常。")
await browser.close()
