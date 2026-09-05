import { chromium } from "playwright"

const FRONTEND = process.env.STUDYMATE_FRONTEND_URL || "http://127.0.0.1:5173"
const BACKEND = process.env.STUDYMATE_BACKEND_URL || "http://127.0.0.1:8000"

let browser
try {
  browser = await chromium.launch({ channel: "chrome", headless: true })
} catch {
  browser = await chromium.launch({ channel: "msedge", headless: true })
}

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  const login = await context.request.post(`${BACKEND}/api/auth/login`, {
    data: { email: "sunjiayu@yczx.com", password: "m123456" },
  })
  if (!login.ok()) throw new Error(`演示账号登录失败：${login.status()}`)

  const page = await context.newPage()
  const pageErrors = []
  page.on("pageerror", (error) => pageErrors.push(error.message))

  await page.goto(`${FRONTEND}/report`, { waitUntil: "networkidle" })
  await page.getByText("主题 × 难度掌握热力图", { exact: true }).waitFor()
  const reportText = await page.locator("body").innerText()
  const compactReportText = reportText.replace(/\s+/g, "")
  for (const expected of ["93%", "39/42题", "215分钟·7类资源", "复杂异常路径覆盖"]) {
    if (!compactReportText.includes(expected)) throw new Error(`学习报告缺少：${expected}`)
  }
  const capabilitySignal = page.getByRole("region", { name: "能力变化信号" })
  if (await capabilitySignal.count() !== 1) throw new Error("能力变化信号未渲染")
  const capabilitySignalText = (await capabilitySignal.innerText()).replace(/\s+/g, "")
  if (!capabilitySignalText.includes("5项变化")) throw new Error(`能力变化数量异常：${capabilitySignalText}`)
  const heatmap = page.getByText("主题 × 难度掌握热力图", { exact: true }).locator("../..").locator("xpath=..")
  if ((await heatmap.innerText()).includes("暂无数据")) throw new Error("难度热力图仍有空数据格")

  const targetRole = await page.evaluate(() => localStorage.getItem("sm:target-role"))
  if (!targetRole?.includes('"roleId":"fde"')) throw new Error("数据库默认 FDE 岗位未恢复到新浏览器")

  await page.goto(`${FRONTEND}/notes`, { waitUntil: "networkidle" })
  await page.getByText("联调记录：偶发 502 的定位过程", { exact: true }).waitFor()
  const notesText = await page.locator("body").innerText()
  if (!notesText.includes("生产发布前 30 分钟检查记录")) throw new Error("长期使用笔记未完整展示")

  await page.goto(`${FRONTEND}/knowledge`, { waitUntil: "networkidle" })
  await page.getByText("FDE模式行业观察与实践", { exact: true }).first().waitFor()
  if (!(await page.locator("body").innerText()).includes("需求工程前沿与模式实践")) throw new Error("私有知识库历史未完整展示")

  await page.goto(`${FRONTEND}/rag`, { waitUntil: "networkidle" })
  await page.getByText("输入问题，立即定位可引用原文", { exact: true }).waitFor()
  const ragText = await page.locator("body").innerText()
  if (!/\d+ 条岗位知识片段可被检索/.test(ragText) || !ragText.includes("默认知识片段")) {
    throw new Error("FDE 公共岗位知识库没有恢复检索内容")
  }

  await page.goto(`${FRONTEND}/quiz`, { waitUntil: "networkidle" })
  await page.getByText("FDE 岗位阶段综合验收", { exact: true }).waitFor()
  if (!(await page.locator("body").innerText()).includes("历史测验题")) throw new Error("历史测验未展示")

  await page.goto(`${FRONTEND}/honors`, { waitUntil: "networkidle" })
  await page.getByText("AI Agent 开发工程师", { exact: true }).first().waitFor()
  if (!(await page.locator("body").innerText()).includes("边缘计算 AI 工程师")) throw new Error("持久化证书未展示")

  await page.goto(`${FRONTEND}/learner-report`, { waitUntil: "networkidle" })
  await page.getByText("个人学情与资源匹配度报告", { exact: true }).first().waitFor()
  const learnerReportText = await page.locator("body").innerText()
  const compactLearnerReportText = learnerReportText.replace(/\s+/g, "")
  for (const expected of ["定制讲义", "实操指南", "分阶测试", "100%", "96", "95", "91"]) {
    if (!compactLearnerReportText.includes(expected)) throw new Error(`个人学情报告缺少：${expected}`)
  }

  await page.goto(`${FRONTEND}/tutor`, { waitUntil: "networkidle" })
  await page.getByText("复盘会上列了问题，但后面没人跟进怎么办？", { exact: true }).waitFor()
  if (!(await page.locator("body").innerText()).includes("每项改进必须有负责人、截止时间、验证方式和升级条件")) throw new Error("助教长期对话未展示")

  await page.goto(`${FRONTEND}/ai-interview`, { waitUntil: "networkidle" })
  const interviewText = await page.locator("body").innerText()
  if (!interviewText.includes("FDE 岗位知识库") || interviewText.includes("岗位知识库\n待绑定")) {
    throw new Error("AI 面试没有恢复默认 FDE 岗位知识库")
  }
  if (!interviewText.includes("05") || !interviewText.includes("历史反馈")) throw new Error("AI 面试历史反馈数量未展示")

  await page.goto(`${FRONTEND}/capability-profile`, { waitUntil: "networkidle" })
  await page.getByTestId("role-capability-profile").waitFor()
  const capabilityText = await page.getByTestId("role-capability-profile").innerText()
  if (!capabilityText.includes("100%") || !capabilityText.includes("4 / 4")) throw new Error("岗位能力画像没有恢复已达标数据")
  if (capabilityText.includes("还需从 L3 提升至 L3")) throw new Error("已达标能力仍显示错误的升级提示")

  if (pageErrors.length) throw new Error(`页面运行错误：${pageErrors.join(" | ")}`)

  const workerContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  const workerLogin = await workerContext.request.post(`${BACKEND}/api/auth/login`, {
    data: { email: "sunjiayupra@yczx.com", password: "m123456" },
  })
  if (!workerLogin.ok()) throw new Error(`从业者账号登录失败：${workerLogin.status()}`)
  const workerPage = await workerContext.newPage()
  await workerPage.goto(`${FRONTEND}/enterprise`, { waitUntil: "networkidle" })
  await workerPage.getByText("我的企业任务", { exact: true }).waitFor()
  const enterpriseText = await workerPage.locator("body").innerText()
  if (!enterpriseText.includes("河南掌门互动网络科技有限公司") || !enterpriseText.includes("前线部署工程师（FDE）")) {
    throw new Error("从业者企业与 FDE 任务数据未展示")
  }
  await workerContext.close()

  for (const email of ["test1@yczx.com", "test2@yczx.com"]) {
    const blankContext = await browser.newContext()
    const blankLogin = await blankContext.request.post(`${BACKEND}/api/auth/login`, { data: { email, password: "m123456" } })
    if (!blankLogin.ok()) throw new Error(`空账号登录失败：${email}`)
    const blankUser = await blankLogin.json()
    if (blankUser.target_role !== "前线部署工程师（FDE）") throw new Error(`空账号没有默认 FDE 岗位：${email}`)
    const [blankEval, blankNotes, blankInterviews] = await Promise.all([
      blankContext.request.get(`${BACKEND}/api/eval/history/${blankUser.user_id}`),
      blankContext.request.get(`${BACKEND}/api/notes?user_id=${blankUser.user_id}`),
      blankContext.request.get(`${BACKEND}/api/interviews/attempts`),
    ])
    const [evalPayload, notesPayload, interviewsPayload] = await Promise.all([blankEval.json(), blankNotes.json(), blankInterviews.json()])
    if (evalPayload.count || notesPayload.count || interviewsPayload.items?.length) throw new Error(`空账号出现使用痕迹：${email}`)
    await blankContext.close()
  }

  console.log("YCZX_DEMO_OK report=42题/7类资源 notes=24 quiz=12 kb=5 interview=5 capability=4/4 enterprise=8 target=FDE blanks=2")
} finally {
  await browser.close()
}
