const api = require("../../services/api")

Page({
  data: {
    name: "",
    email: "",
    code: "",
    password: "",
    showPassword: false,
    accountType: "learner",
    learnerType: "worker",
    studyStages: ["本科", "研究生", "博士"],
    studyStageIndex: 0,
    studyStage: "",
    company: "",
    targetRole: "",
    codeLoading: false,
    loading: false,
    countdown: 0,
    notice: "",
    error: "",
  },

  onUnload() {
    if (this.countdownTimer) clearInterval(this.countdownTimer)
  },

  onNameInput(event) { this.setData({ name: event.detail.value, error: "" }) },
  onEmailInput(event) { this.setData({ email: event.detail.value, error: "" }) },
  onCodeInput(event) { this.setData({ code: event.detail.value, error: "" }) },
  onPasswordInput(event) { this.setData({ password: event.detail.value, error: "" }) },
  onCompanyInput(event) { this.setData({ company: event.detail.value, error: "" }) },
  onTargetRoleInput(event) { this.setData({ targetRole: event.detail.value, error: "" }) },

  selectLearner() { this.setData({ accountType: "learner", error: "" }) },
  selectAdmin() { this.setData({ accountType: "enterprise_admin", error: "" }) },
  selectStudent() { this.setData({ learnerType: "student", error: "" }) },
  selectWorker() { this.setData({ learnerType: "worker", error: "" }) },
  togglePassword() { this.setData({ showPassword: !this.data.showPassword }) },

  onStudyStageChange(event) {
    const index = Number(event.detail.value)
    this.setData({ studyStageIndex: index, studyStage: this.data.studyStages[index], error: "" })
  },

  async sendCode() {
    const email = this.data.email.trim()
    if (!email) {
      this.setData({ error: "请先填写邮箱" })
      return
    }
    this.setData({ codeLoading: true, error: "" })
    try {
      const result = await api.post("/auth/register/send-code", { email })
      this.setData({ countdown: Number(result.resend_after || 60) })
      this.setData({ notice: "验证码已发送，请检查收件箱或垃圾邮件" })
      this.countdownTimer = setInterval(() => {
        const next = this.data.countdown - 1
        if (next <= 0) {
          clearInterval(this.countdownTimer)
          this.setData({ countdown: 0 })
        } else {
          this.setData({ countdown: next })
        }
      }, 1000)
      wx.showToast({ title: "验证码已发送", icon: "success" })
    } catch (error) {
      this.setData({ error: error.message || "验证码发送失败，请稍后重试" })
    } finally {
      this.setData({ codeLoading: false })
    }
  },

  async register() {
    const { name, email, code, password, accountType, learnerType, studyStage, company, targetRole } = this.data
    const missingLearnerInfo = accountType === "learner" && ((learnerType === "student" && !studyStage) || (learnerType === "worker" && !targetRole.trim()))
    if (!name.trim() || !email.trim() || !/^\d{6}$/.test(code) || password.length < 8 || missingLearnerInfo) {
      this.setData({ error: accountType === "learner" && learnerType === "worker" ? "请填写当前岗位后再注册" : "请完整填写注册信息、6 位验证码和至少 8 位密码" })
      return
    }
    this.setData({ loading: true, error: "" })
    try {
      const user = await api.post("/auth/register", {
        name: name.trim(),
        email: email.trim(),
        code,
        password,
        account_type: accountType,
        learner_type: learnerType,
        study_stage: studyStage,
        company: company.trim(),
        target_role: targetRole.trim(),
      })
      getApp().setUser(user)
      wx.showToast({ title: "注册成功", icon: "success" })
      setTimeout(() => wx.reLaunch({ url: "/pages/home/home" }), 450)
    } catch (error) {
      this.setData({ error: error.message || "注册失败，请稍后重试" })
    } finally {
      this.setData({ loading: false })
    }
  },

  backToLogin() {
    wx.navigateBack({ delta: 1 })
  },
})
