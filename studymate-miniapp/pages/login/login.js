const api = require("../../services/api")

Page({
  data: {
    email: "",
    password: "",
    showPassword: false,
    loading: false,
    error: "",
  },

  onEmailInput(event) {
    this.setData({ email: event.detail.value, error: "" })
  },

  onPasswordInput(event) {
    this.setData({ password: event.detail.value, error: "" })
  },

  togglePassword() {
    this.setData({ showPassword: !this.data.showPassword })
  },

  async login() {
    const { email, password } = this.data
    if (!email.trim() || !password) {
      this.setData({ error: "请输入邮箱和密码" })
      return
    }
    this.setData({ loading: true, error: "" })
    try {
      const user = await api.post("/auth/login", { email: email.trim(), password })
      getApp().setUser(user)
      wx.reLaunch({ url: "/pages/home/home" })
    } catch (error) {
      this.setData({ error: error.message || "登录失败，请稍后重试" })
    } finally {
      this.setData({ loading: false })
    }
  },

  openRegister() {
    wx.navigateTo({ url: "/pages/register/register" })
  },
})
