App({
  globalData: {
    user: null,
  },

  onLaunch() {
    try {
      const user = wx.getStorageSync("yczx_user") || wx.getStorageSync("sm_user") || null
      this.globalData.user = user
      if (user) wx.setStorageSync("yczx_user", user)
      wx.removeStorageSync("sm_user")
    } catch (error) {
      this.globalData.user = null
    }
  },

  setUser(user) {
    this.globalData.user = user
    wx.setStorageSync("yczx_user", user)
  },

  clearUser() {
    this.globalData.user = null
    wx.removeStorageSync("yczx_user")
    wx.removeStorageSync("sm_user")
  },
})
