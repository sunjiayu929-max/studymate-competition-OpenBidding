/**
 * 统一 API 客户端。
 * 开发：通过 Vite proxy 转发 /api → http://localhost:8000
 * 生产：同源
 *
 * 登录会话由后端写入 HttpOnly Cookie；credentials=include 确保请求携带 Cookie。
 */
import { logoutUser } from "@/store/user"

const BASE = "/api"

export class ApiError extends Error {
  readonly status: number
  readonly path: string

  constructor(status: number, path: string, message: string) {
    super(message)
    this.name = "ApiError"
    this.status = status
    this.path = path
  }

  override toString(): string {
    return this.message
  }
}

function authHeaders(extra?: HeadersInit): HeadersInit {
  return { ...(extra as Record<string, string> | undefined) }
}

async function ensureOk(r: Response, path: string): Promise<void> {
  if (r.ok) return
  let detail = ""
  try {
    const data = await r.json() as { detail?: unknown }
    if (typeof data.detail === "string") detail = data.detail.trim()
  } catch {
    // 非 JSON 错误响应使用状态码信息
  }

  if (r.status === 401) {
    logoutUser()
    if (!path.startsWith("/auth/")) detail = "登录状态已失效，请重新登录"
  }

  if (!detail || detail === "Not Found" || detail === "Unauthorized" || detail === "Forbidden") {
    detail = r.status === 401
      ? "登录状态已失效，请重新登录"
      : r.status === 403
        ? "当前账号没有执行此操作的权限"
        : r.status === 404
          ? "请求的内容不存在或已被移除"
          : r.status === 422
            ? "请求参数格式不正确，请返回上一页后重试"
          : r.status >= 500
            ? "因材智训服务暂时不可用，请稍后重试"
            : `请求失败（${r.status}）`
  }

  throw new ApiError(r.status, path, detail)
}

async function request(path: string, init?: RequestInit): Promise<Response> {
  try {
    const response = await fetch(`${BASE}${path}`, {
      ...init,
      headers: authHeaders(init?.headers),
      credentials: "include",
    })
    await ensureOk(response, path)
    return response
  } catch (error) {
    if (error instanceof ApiError) throw error
    throw new ApiError(0, path, "暂时无法连接因材智训服务，请检查网络后重试")
  }
}

export async function apiGet<T = unknown>(path: string): Promise<T> {
  const r = await request(path)
  return r.json()
}

export async function apiPost<T = unknown>(path: string, body?: unknown): Promise<T> {
  const r = await request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  })
  return r.json()
}

export async function apiPut<T = unknown>(path: string, body?: unknown): Promise<T> {
  const r = await request(path, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  })
  return r.json()
}

export async function apiPatch<T = unknown>(path: string, body?: unknown): Promise<T> {
  const r = await request(path, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  })
  return r.json()
}

export async function apiDelete<T = unknown>(path: string): Promise<T> {
  const r = await request(path, { method: "DELETE" })
  return r.json()
}

export function sseUrl(path: string, params?: Record<string, string>): string {
  const qs = params ? "?" + new URLSearchParams(params).toString() : ""
  return `${BASE}${path}${qs}`
}

/** SSE / fetchEventSource 用：认证 Cookie 由浏览器附带，这里只合并额外 headers。 */
export function sseHeaders(extra?: Record<string, string>): Record<string, string> {
  return { ...(extra || {}) }
}
