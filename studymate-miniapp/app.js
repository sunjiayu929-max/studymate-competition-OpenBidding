App({
  globalData: {
    user: null,
  },

  onLaunch() {
    try {
      this.globalData.user = wx.getStorageSync("sm_user") || null
    } catch (error) {
      this.globalData.user = null
    }
  },

  setUser(user) {
    this.globalData.user = user
    wx.setStorageSync("sm_user", user)
  },

  clearUser() {
    this.globalData.user = null
    wx.removeStorageSync("sm_user")
  },
})
