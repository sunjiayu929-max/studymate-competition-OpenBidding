// 微信开发者工具本地调试时，后端默认通过 localhost:8000 提供服务。
// 若后端运行在 WSL 且 Windows 无法访问 localhost，请替换为 WSL 的局域网 IP。
const API_BASE_URL = "http://localhost:8000/api"

module.exports = { API_BASE_URL }
