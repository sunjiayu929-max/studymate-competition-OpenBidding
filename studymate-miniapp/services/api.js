const { API_BASE_URL } = require("./config")

const COOKIE_KEY = "yczx_session_cookie"
const LEGACY_COOKIE_KEY = "sm_session_cookie"

function getCookie() {
  const cookie = wx.getStorageSync(COOKIE_KEY) || wx.getStorageSync(LEGACY_COOKIE_KEY) || ""
  if (cookie) wx.setStorageSync(COOKIE_KEY, cookie)
  wx.removeStorageSync(LEGACY_COOKIE_KEY)
  return cookie
}

function captureCookie(headers) {
  if (!headers) return
  const raw = headers["Set-Cookie"] || headers["set-cookie"] || headers["SET-COOKIE"]
  if (!raw) return
  const value = Array.isArray(raw) ? raw[0] : raw
  const cookie = String(value).split(";")[0].trim()
  if (cookie) wx.setStorageSync(COOKIE_KEY, cookie)
}

function clearSession() {
  wx.removeStorageSync(COOKIE_KEY)
  wx.removeStorageSync(LEGACY_COOKIE_KEY)
  wx.removeStorageSync("yczx_user")
  wx.removeStorageSync("sm_user")
}

function errorMessage(status, data, path) {
  if (data && typeof data.detail === "string" && data.detail.trim()) return data.detail.trim()
  if (status === 401) return "登录状态已失效，请重新登录"
  if (status === 403) return "当前账号没有执行此操作的权限"
  if (status === 404) return "请求的内容不存在或已被移除"
  if (status === 422) return "请求参数格式不正确，请检查后重试"
  if (status >= 500) return "因材智训服务暂时不可用，请稍后重试"
  if (status === 0) return "暂时无法连接因材智训服务，请检查网络后重试"
  return `请求失败（${status}）：${path}`
}

function request(path, method = "GET", data) {
  return new Promise((resolve, reject) => {
    const header = { "Content-Type": "application/json" }
    const cookie = getCookie()
    if (cookie) header.Cookie = cookie

    wx.request({
      url: `${API_BASE_URL}${path}`,
      method,
      data,
      header,
      timeout: 15000,
      success(response) {
        captureCookie(response.header)
        if (response.statusCode >= 200 && response.statusCode < 300) {
          resolve(response.data)
          return
        }
        if (response.statusCode === 401) clearSession()
        reject(new Error(errorMessage(response.statusCode, response.data, path)))
      },
      fail() {
        const usesLocalhost = /localhost|127\.0\.0\.1/.test(API_BASE_URL)
        reject(new Error(usesLocalhost
          ? "当前使用的是 localhost，真机请将 services/config.js 改为电脑的局域网 IPv4 地址后重试"
          : errorMessage(0, null, path)))
      },
    })
  })
}

function get(path) {
  return request(path, "GET")
}

function post(path, data) {
  return request(path, "POST", data)
}

function patch(path, data) {
  return request(path, "PATCH", data)
}

async function logout() {
  try {
    await post("/auth/logout")
  } finally {
    clearSession()
  }
}

module.exports = {
  get,
  post,
  patch,
  logout,
  clearSession,
}
