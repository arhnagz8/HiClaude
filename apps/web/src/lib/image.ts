/** Client-side receipt image compression (canvas → JPEG data URL), capped to what the API accepts (ReceiptSchema.imageDataUrl ≤ 2 000 000 chars). */
export const MAX_RECEIPT_DATA_URL = 1_900_000
export const MAX_RECEIPT_EDGE = 1280

/** Scale (w,h) so the longest edge ≤ max, preserving aspect ratio; never upscales. */
export function fitWithin(w: number, h: number, max = MAX_RECEIPT_EDGE): { width: number; height: number } {
  if (w <= 0 || h <= 0) return { width: 0, height: 0 }
  const scale = Math.min(1, max / Math.max(w, h))
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) }
}

/** Quality ladder: first fit under the cap wins. Returns the quality to try next, or undefined when exhausted. */
export function nextQuality(prev?: number): number | undefined {
  const ladder = [0.82, 0.7, 0.58, 0.46, 0.34]
  if (prev === undefined) return ladder[0]
  const i = ladder.findIndex((q) => Math.abs(q - prev) < 1e-6)
  return i >= 0 ? ladder[i + 1] : undefined
}

export function isAcceptableImageType(type: string): boolean {
  return /^image\/(jpeg|png|webp|heic|heif)$/i.test(type)
}

export async function compressImage(file: File, maxChars = MAX_RECEIPT_DATA_URL): Promise<string> {
  const bmp = await createImageBitmap(file)
  const { width, height } = fitWithin(bmp.width, bmp.height)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas unavailable')
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, width, height)
  ctx.drawImage(bmp, 0, 0, width, height)
  bmp.close?.()
  let q = nextQuality()
  let url = ''
  while (q !== undefined) {
    url = canvas.toDataURL('image/jpeg', q)
    if (url.length <= maxChars) return url
    q = nextQuality(q)
  }
  throw new Error('image too large')
}
