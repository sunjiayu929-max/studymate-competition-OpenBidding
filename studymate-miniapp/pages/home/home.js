const api = require("../../services/api")

const STATUS_LABELS = {
  pending: "待接受",
  accepted: "已接受",
  in_progress: "进行中",
  completed: "已完成",
}

function decorateTask(task) {
  const status = task.assignment_status || "pending"
  return {
    ...task,
    statusLabel: STATUS_LABELS[status] || "待处理",
    typeLabel: task.task_type === "training" ? "岗位训练任务" : "普通阅读任务",
    actionLabel: status === "pending" ? "接受任务" : status === "completed" ? "查看记录" : "继续处理",
  }
}

Page({
  data: {
    loading: true,
    joinLoading: false,
    error: "",
    context: null,
    hasEnterprise: false,
    tasks: [],
    stats: { total: 0, pending: 0, completed: 0 },
    inviteCode: "",
  },

  onLoad() {
    this.loadData()
  },

  onShow() {
    if (this.hasLoaded) this.loadData()
  },

  onPullDownRefresh() {
    this.loadData().finally(() => wx.stopPullDownRefresh())
  },

  async loadData() {
    this.setData({ loading: true, error: "" })
    try {
      const [user, context, result] = await Promise.all([
        api.get("/auth/me"),
        api.get("/learner/context"),
        api.get("/learner/tasks"),
      ])
      getApp().setUser(user)
      const tasks = (result.items || []).map(decorateTask)
      const pending = tasks.filter((task) => task.assignment_status === "pending" || task.assignment_status === "in_progress").length
      const completed = tasks.filter((task) => task.assignment_status === "completed").length
      this.setData({
        context,
        hasEnterprise: Boolean(context.enterprise),
        tasks,
        stats: { total: tasks.length, pending, completed },
      })
      this.hasLoaded = true
    } catch (error) {
      if ((error.message || "").includes("登录状态已失效")) {
        wx.reLaunch({ url: "/pages/login/login" })
        return
      }
      this.setData({ error: error.message || "任务加载失败，请稍后重试" })
    } finally {
      this.setData({ loading: false })
    }
  },

  onInviteInput(event) {
    this.setData({ inviteCode: event.detail.value, error: "" })
  },

  async joinEnterprise() {
    const inviteCode = this.data.inviteCode.trim()
    if (!inviteCode) {
      this.setData({ error: "请输入企业邀请码" })
      return
    }
    this.setData({ joinLoading: true, error: "" })
    try {
      await api.post("/learner/join", { invite_code: inviteCode })
      wx.showToast({ title: "已加入企业", icon: "success" })
      await this.loadData()
    } catch (error) {
      this.setData({ error: error.message || "加入企业失败，请检查邀请码" })
    } finally {
      this.setData({ joinLoading: false })
    }
  },

  openTask(event) {
    const id = event.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/task-detail/task-detail?id=${id}` })
  },

  async logout() {
    wx.showLoading({ title: "正在退出" })
    try {
      await api.logout()
      getApp().clearUser()
      wx.reLaunch({ url: "/pages/login/login" })
    } finally {
      wx.hideLoading()
    }
  },
})
