/**
 * 图片压缩：上传前把图缩到 maxDim 以内并转 JPEG。
 * 目的：① 减小传给 qwen-vl 的体积、加快上传；② 控制 base64 大小，
 *       避免塞进 localStorage 对话历史时撑爆配额。
 */
export async function compressImage(
  file: File,
  maxDim = 768,
  quality = 0.82
): Promise<string> {
  const dataUrl = await readAsDataURL(file)
  const img = await loadImage(dataUrl)

  let { width, height } = img
  if (width > maxDim || height > maxDim) {
    const scale = maxDim / Math.max(width, height)
    width = Math.round(width * scale)
    height = Math.round(height * scale)
  }

  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext("2d")
  if (!ctx) return dataUrl // 兜底：拿不到 ctx 就用原图
  // 透明背景（如 PNG）转 JPEG 会变黑，先铺白底
  ctx.fillStyle = "#ffffff"
  ctx.fillRect(0, 0, width, height)
  ctx.drawImage(img, 0, 0, width, height)
  return canvas.toDataURL("image/jpeg", quality)
}

function readAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}
