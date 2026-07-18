import assert from "node:assert/strict"
import { chromium } from "playwright"

const baseUrl = (process.env.STUDYMATE_BASE_URL || "http://127.0.0.1:5173").replace(/\/$/, "")
const user = { user_id: 999, name: "建议3回归用户", email: "suggestion3@example.invalid", role: "student" }
const course = { id: 1, name: "机器学习", description: "机器学习基础" }
const dims = {
  knowledge_base: { math: 3, programming: 3, statistics: 3, english: 3, subject_prior: 2 },
  cognitive_style: { visual: 3, reading: 3, hands_on: 3, auditory: 3 },
  goals: { primary: "掌握机器学习", deadline: "", target_topics: [] },
  weak_points: { topics: [], error_types: [] },
  pace: { hours_per_week: 6, intensity: "medium" },
  preference: { document: 3, mindmap: 3, quiz: 3, code: 3, video: 3, reading: 3 },
  employment_skills: { programming: 1, algorithms: 1, data_ai: 1, systems: 0, engineering: 1, professional: 0 },
}

const workspaceState = {
  topic: "梯度下降",
  courseId: 1,
  courseName: course.name,
  status: "done",
  outputs: {
    reading: {
      type: "reading",
      title: "拓展阅读",
      count: 7,
      items: [
        { title: "梯度下降法及其改进算法综述", type: "paper", lang: "zh", url: "", source: "中文核心期刊", difficulty: "进阶", summary: "中文论文" },
        { title: "图解梯度下降", type: "blog", lang: "zh", url: "https://blog.csdn.net/fabricated/404", source: "CSDN", difficulty: "入门", summary: "博客" },
        { title: "scikit-learn SGD", type: "doc", lang: "en", url: "https://scikit-learn.org/stable/modules/sgd.html", source: "scikit-learn", difficulty: "进阶", summary: "官方文档" },
        { title: "讯飞语音听写 WebAPI", type: "doc", lang: "zh", url: "https://www.xfyun.cn/doc/asr/voicedictation/API.html", source: "讯飞开放平台", difficulty: "进阶", summary: "讯飞官方文档" },
        { title: "伪造文档", type: "doc", lang: "zh", url: "https://example.invalid/404", source: "未知来源", difficulty: "进阶", summary: "不可信链接" },
        { title: "Attention Is All You Need", type: "paper", lang: "en", url: "", source: "NeurIPS", difficulty: "深入", summary: "Transformer 论文" },
        { title: "Pattern Recognition and Machine Learning", type: "book", lang: "en", url: "", source: "Springer", difficulty: "深入", summary: "模式识别教材" },
      ],
    },
  },
  stream: { doc: "", mindmap: "", quiz: "", path: "", reading: "", code: "" },
  agentStatus: {}, agents: [], logs: [], quizAttempts: {}, resourcesConsumed: {}, quizSessionsRecorded: {},
  learningStartedAt: 0, learningDurationMs: 0, startedAt: Date.now(), finishedAt: Date.now(), lastError: "", updatedAt: Date.now(),
}

const report = {
  user_id: 999,
  profile_version: 1,
  current_dims: dims,
  projected_dims: dims,
  scores: {
    overall_correct_rate: 0.5,
    by_topic: { 梯度下降: { correct: 1, total: 2, rate: 0.5 } },
    by_topic_difficulty: {
      梯度下降: {
        1: { correct: 1, total: 1, rate: 1 },
        2: { correct: 0, total: 1, rate: 0 },
      },
    },
    total_attempts: 2,
    total_correct: 1,
    engagement_score: 56,
    answer_completion: { answered: 1, total: 2, rate: 0.5 },
    resource_coverage: { consumed: 2, available: 4, rate: 0.5 },
    engagement_breakdown: { time_spent_min: 20, time_score: 40, resource_types: 2, resource_variety_score: 16 },
  },
  profile_delta: {}, suggestions: [], next_topics: [], summary_markdown: "## 总结\n继续学习。",
  generated_at: new Date().toISOString(),
  evidence: {
    course_id: 1, course_name: course.name, topic: "梯度下降", quiz_count: 2, time_spent_min: 20,
    resources_consumed: ["doc", "quiz"], resources_available: ["doc", "quiz", "reading", "concept"], topics_studied: ["梯度下降"],
  },
}

const oldReport = {
  ...report,
  scores: {
    overall_correct_rate: 0.5,
    by_topic: { 梯度下降: { correct: 1, total: 2, rate: 0.5 } },
    total_attempts: 2,
    total_correct: 1,
    engagement_score: 56,
  },
}

let browser
try {
  browser = await chromium.launch()
} catch (error) {
  if (!String(error).includes("Executable doesn't exist")) throw error
  browser = await chromium.launch({ channel: "chrome" })
}

const context = await browser.newContext({ viewport: { width: 1440, height: 960 } })
const page = await context.newPage()
let ragRequestUrl = ""
let readingResolveBody = null

const json = (route, value, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(value) })

await page.route("**/api/**", async (route) => {
  const request = route.request()
  const url = new URL(request.url())
  const path = url.pathname
  if (path === "/api/auth/me") return json(route, user)
  if (path === "/api/courses") return json(route, { count: 1, items: [course] })
  if (path === "/api/courses/1/config") return json(route, {
    ...course, persona: "机器学习助教", code_style: "ml", code_libs: [], reading_sources: [],
    sample_topics: ["梯度下降"], sample_questions: [], syllabus_hint: "优化", from_registry: true,
  })
  if (path === "/api/profile/999") return json(route, { user_id: 999, version: 1, dims })
  if (path === "/api/profile/snapshots/999") return json(route, { user_id: 999, count: 0, items: [] })
  if (path === "/api/eval/history/999") return json(route, { user_id: 999, count: 0, items: [] })
  if (path === "/api/careers/recommendations") return json(route, { provider: "讯飞人才呀", source_state: "fallback", platform_url: "http://rencaiya.vip/college/postcourse", current_course: course.name, historical_courses: [], evidence_note: "回归", items: [] })
  if (path === "/api/rencaiya/courses") return json(route, {
    provider: "讯飞人才呀", source_state: "live", match_level: "exact", resolved_query: "梯度下降", course_name: course.name,
    platform_url: "http://rencaiya.vip/college/allcourse",
    items: [{ course_id: 1, title: "机器学习基础", summary: "人才呀机器学习课程", difficulty: "初级", url: "http://rencaiya.vip/college/courseinfo/1" }],
  })
  if (path === "/api/reading/resolve") {
    readingResolveBody = request.postDataJSON()
    return json(route, {
      count: 3,
      items: [
        { index: 1, url: "https://blog.csdn.net/example/article/details/123456", provider: "CSDN", label: "打开博客原文", score: 1 },
        { index: 5, url: "https://arxiv.org/abs/1706.03762", provider: "arXiv", label: "打开 arXiv 原文", score: 1 },
        { index: 6, url: "https://book.douban.com/subject/2061116/", provider: "豆瓣图书", label: "打开图书详情", score: 1 },
      ],
    })
  }
  if (path === "/api/quiz-sessions/77") return json(route, {
    id: 77, user_id: 999, course_id: 1, topic: "梯度下降", mcq_count: 0, fill_count: 1, code_count: 0,
    total_count: 1, difficulty: 2, mode: "exam", code_grading: "llm", status: "submitted", score: 0, duration_ms: 1000,
    created_at: new Date().toISOString(), submitted_at: new Date().toISOString(),
    items: [{ id: 701, idx: 0, type: "fill", question: "动量超参数符号是？", options: [], starter: "", answer_key: "beta", explanation: "知识记忆。", difficulty: 2, user_answer: null, is_correct: false, score: 0, judge_reason: "", error_tags: ["未作答", "知识记忆"] }],
  })
  if (path === "/api/rag/stats") return json(route, { count: 938, engine: "BM25+Vector (RRF hybrid)", course_id: 1 })
  if (path === "/api/rag/search") {
    ragRequestUrl = request.url()
    return json(route, {
      query: url.searchParams.get("q"), k: Number(url.searchParams.get("k")), count: 8,
      score_meta: { method: "rrf", mode: "hybrid", active_branches: 2, label: "相对匹配度", note: "由 BM25 词法排序与向量语义排序融合后归一化，仅用于本次结果比较，不代表答案正确概率。" },
      results: Array.from({ length: 8 }, (_, index) => ({
        chunk_id: String(index + 1), content: `梯度下降课程片段 ${index + 1}`, source: "教材原文 · 优化算法", page: index + 1,
        url: null, meta: {}, score: 0.032787 - index * 0.00045, rank: index + 1, relevance_percent: 100 - index * 2, retrieval_mode: "hybrid",
      })),
    })
  }
  if (path === "/api/events" || path === "/api/events/batch") return json(route, { ok: true })
  return json(route, { ok: true })
})

await page.addInitScript(({ currentUser, currentCourse, state, evalReport }) => {
  localStorage.setItem("sm:current-user", JSON.stringify(currentUser))
  localStorage.setItem("sm:current-course", JSON.stringify(currentCourse))
  localStorage.setItem(`sm:getting-started-seen:v1:${currentUser.user_id}`, "1")
  if (!localStorage.getItem(`sm:eval-report:${currentUser.user_id}`)) {
    localStorage.setItem(`sm:eval-report:${currentUser.user_id}`, JSON.stringify(evalReport))
  }
  sessionStorage.setItem("sm:workspace-state", JSON.stringify(state))
}, { currentUser: user, currentCourse: course, state: workspaceState, evalReport: report })

await page.goto(`${baseUrl}/quiz/77`, { waitUntil: "networkidle" })
await page.getByText("错误类型", { exact: true }).waitFor()
assert.equal(await page.getByText("未作答", { exact: true }).count(), 1, "空答案应只显示一个未作答标签")
assert.equal(await page.getByText("知识记忆", { exact: true }).count(), 0, "历史混合标签不应继续显示能力标签")

await page.goto(`${baseUrl}/workspace/r/reading`, { waitUntil: "networkidle" })
const pager = page.getByRole("navigation", { name: "资源顺序导航" })
await pager.getByRole("link", { name: /下一资源.*代码案例/ }).waitFor()
assert.equal(new URL(await pager.getByRole("link", { name: /下一资源.*代码案例/ }).getAttribute("href"), baseUrl).pathname, "/workspace/r/code")

const cnkiHref = await page.getByRole("link", { name: "知网搜主题（可能需验证）" }).getAttribute("href")
const cnki = new URL(cnkiHref)
assert.equal(cnki.searchParams.get("kw"), "梯度下降")
assert.equal(cnki.href.includes("改进算法综述"), false)
assert.equal(cnki.searchParams.has("captchaId"), false)
const csdnHref = await page.getByRole("link", { name: "打开博客原文" }).getAttribute("href")
assert.equal(csdnHref, "https://blog.csdn.net/example/article/details/123456")
assert.equal(await page.locator('a[href="https://blog.csdn.net/fabricated/404"]').count(), 0, "模型博客直链不应进入页面")
const arxivCard = page.getByText("Attention Is All You Need", { exact: true }).locator("xpath=ancestor::article")
assert.equal(await arxivCard.getByRole("link", { name: "打开 arXiv 原文" }).getAttribute("href"), "https://arxiv.org/abs/1706.03762")
const bookCard = page.getByText("Pattern Recognition and Machine Learning", { exact: true }).locator("xpath=ancestor::article")
assert.equal(await bookCard.getByRole("link", { name: "打开图书详情" }).getAttribute("href"), "https://book.douban.com/subject/2061116/")
assert.equal(readingResolveBody.items.length, 4, "应只解析论文、书籍和博客")
const officialCard = page.getByText("scikit-learn SGD", { exact: true }).locator("xpath=ancestor::article")
assert.equal(await officialCard.getByRole("link", { name: "打开官方原文" }).getAttribute("href"), "https://scikit-learn.org/stable/modules/sgd.html")
assert.equal(await officialCard.getByText("可直达", { exact: true }).count(), 1)
const xfyunCard = page.getByText("讯飞语音听写 WebAPI", { exact: true }).locator("xpath=ancestor::article")
assert.equal(await xfyunCard.getByRole("link", { name: "打开官方原文" }).getAttribute("href"), "https://www.xfyun.cn/doc/asr/voicedictation/API.html")
const talentCard = page.getByText("机器学习基础", { exact: true }).locator("xpath=ancestor::article")
assert.equal(await talentCard.getByRole("link", { name: "打开人才呀课程" }).getAttribute("href"), "http://rencaiya.vip/college/courseinfo/1")
assert.equal(await page.locator('a[href="https://example.invalid/404"]').count(), 0, "非可信文档域名不应直达")

await page.goto(`${baseUrl}/report`, { waitUntil: "networkidle" })
await page.getByText("主题 × 难度掌握热力图", { exact: true }).waitFor()
await page.getByText("学习达成率拆解", { exact: true }).waitFor()
await page.getByText("1 / 2 题已作答", { exact: true }).waitFor()
await page.getByText("2 / 4 类可用资源已查看", { exact: true }).waitFor()
await page.getByText("学习时长 40/60 + 资源多样性 16/40", { exact: true }).waitFor()

await page.evaluate((value) => localStorage.setItem("sm:eval-report:999", JSON.stringify(value)), oldReport)
await page.reload({ waitUntil: "networkidle" })
await page.getByText("按主题正确率", { exact: true }).waitFor()
assert.equal(await page.getByText("主题 × 难度掌握热力图", { exact: true }).count(), 0, "旧报告应回退到原柱状图")

await page.goto(`${baseUrl}/rag`, { waitUntil: "networkidle" })
await page.getByRole("button", { name: "开始检索" }).click()
await page.getByText("相对匹配 100%", { exact: true }).waitFor()
await page.getByText("相对匹配 98%", { exact: true }).waitFor()
assert.equal(new URL(ragRequestUrl).searchParams.get("k"), "8")
assert.equal(await page.locator("main article").count(), 8)
await page.getByText(/不代表答案正确概率/).waitFor()

console.log("建议3前端回归通过：未作答标签、报告热力图、底部翻页、RAG 分数，以及论文/书籍/博客/官方文档/人才呀直达均正常。")
await browser.close()
