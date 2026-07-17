/**
 * 路由守卫。
 * - RequireAuth: 未登录 → 跳 /login，登录后回原路径
 * - RequireAdmin: 非管理员/评委 → 跳首页（避免普通用户误访问管理页）
 */
import { Navigate, useLocation } from "react-router-dom"
import { isPrivilegedRole, useCurrentUser } from "@/store/user"

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const user = useCurrentUser()
  const location = useLocation()
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }
  return <>{children}</>
}

export function RequireAdmin({ children }: { children: React.ReactNode }) {
  const user = useCurrentUser()
  const location = useLocation()
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }
  if (!isPrivilegedRole(user.role)) {
    return <Navigate to="/" replace />
  }
  return <>{children}</>
}
