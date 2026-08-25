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
    actionLabel: status === "pending" ? "接受任务" : status === "accepted" ? "开始任务" : "标记为完成",
  }
}

Page({
  data: {
    task: null,
    loading: true,
    busy: false,
    error: "",
  },

  onLoad(options) {
    this.taskId = options.id
    this.loadTask()
  },

  async loadTask() {
    if (!this.taskId) {
      this.setData({ loading: false, error: "任务编号无效" })
      return
    }
    this.setData({ loading: true, error: "" })
    try {
      const task = await api.get(`/learner/tasks/${this.taskId}`)
      this.setData({ task: decorateTask(task) })
    } catch (error) {
      if ((error.message || "").includes("登录状态已失效")) {
        wx.reLaunch({ url: "/pages/login/login" })
        return
      }
      this.setData({ error: error.message || "任务无法打开，请稍后重试" })
    } finally {
      this.setData({ loading: false })
    }
  },

  async advanceTask() {
    const task = this.data.task
    if (!task || this.data.busy) return
    const status = task.assignment_status || "pending"
    const path = status === "pending"
      ? `/learner/tasks/${task.id}/accept`
      : status === "accepted"
        ? `/learner/tasks/${task.id}/start`
        : `/learner/tasks/${task.id}/complete`
    this.setData({ busy: true, error: "" })
    try {
      const next = await api.post(path)
      this.setData({ task: decorateTask(next) })
      wx.showToast({ title: decorateTask(next).statusLabel, icon: "success" })
    } catch (error) {
      this.setData({ error: error.message || "状态更新失败，请稍后重试" })
    } finally {
      this.setData({ busy: false })
    }
  },
})
