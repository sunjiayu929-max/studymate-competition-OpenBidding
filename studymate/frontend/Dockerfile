# StudyMate Frontend · Vite 构建 + Nginx 静态托管
# 多阶段：node 构建 → nginx 运行，最终镜像 ~50MB
ARG NODE_IMAGE=node:20-alpine
ARG NGINX_IMAGE=nginx:alpine

FROM ${NODE_IMAGE} AS build

WORKDIR /app

# 国内源加速
RUN npm config set registry https://registry.npmmirror.com

# 先拷锁文件装依赖（利用 docker cache）
COPY package.json package-lock.json ./
RUN npm ci

# 拷源码并构建
COPY . .
RUN npm run build

# ===== 运行阶段：nginx 托管 dist + 反代 /api =====
FROM ${NGINX_IMAGE} AS runtime

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -qO- http://127.0.0.1/ >/dev/null 2>&1 || exit 1

CMD ["nginx", "-g", "daemon off;"]
