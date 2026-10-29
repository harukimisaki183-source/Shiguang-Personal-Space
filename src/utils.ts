import { format, isSameYear, isToday, isYesterday } from 'date-fns'
import type { Track } from './types'

export function uid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  const value = bytes / 1024 ** index
  return `${value >= 10 || index === 0 ? Math.round(value) : value.toFixed(1)} ${units[index]}`
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0:00'
  const total = Math.round(seconds)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

export function dateKey(value: Date | number): string {
  return format(value, 'yyyy-MM-dd')
}

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

export function formatMonthTitle(date: Date): string {
  return `${date.getFullYear()}年${date.getMonth() + 1}月`
}

export function formatNoteTime(timestamp: number): string {
  const d = new Date(timestamp)
  const time = format(d, 'HH:mm')
  if (isToday(d)) return `今天 ${time}`
  if (isYesterday(d)) return `昨天 ${time}`
  if (isSameYear(d, new Date())) return `${format(d, 'M月d日')} ${WEEKDAYS[d.getDay()]} ${time}`
  return `${format(d, 'yyyy年M月d日')} ${time}`
}

export function formatChatTime(timestamp: number): string {
  const d = new Date(timestamp)
  if (isToday(d)) return format(d, 'HH:mm')
  if (isYesterday(d)) return '昨天'
  if (isSameYear(d, new Date())) return format(d, 'M月d日')
  return format(d, 'yyyy/M/d')
}

export function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp
  if (diff < 60_000) return '刚刚'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`
  const d = new Date(timestamp)
  if (isToday(d)) return `${Math.floor(diff / 3_600_000)} 小时前`
  if (isYesterday(d)) return '昨天'
  return format(d, 'M月d日')
}

export function parseDateKey(key: string): Date {
  const [year, month, day] = key.split('-').map(Number)
  return new Date(year, (month ?? 1) - 1, day ?? 1)
}

export interface ImageResult {
  blob: Blob
  width?: number
  height?: number
}

const IMAGE_MAX_SIDE = 1600
const IMAGE_QUALITY = 0.86

export async function compressImage(file: File): Promise<ImageResult> {
  if (!file.type.startsWith('image/')) {
    throw new Error('不是图片文件')
  }
  if (file.type === 'image/gif' || file.type === 'image/svg+xml') {
    return { blob: file }
  }

  let bitmap: ImageBitmap | null = null
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    const scale = Math.min(1, IMAGE_MAX_SIDE / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return { blob: file }
    ctx.drawImage(bitmap, 0, 0, width, height)
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/webp', IMAGE_QUALITY)
    })
    if (!blob) return { blob: file, width: bitmap.width, height: bitmap.height }
    // 压缩后反而更大时保留原图
    if (blob.size >= file.size && file.size < 3 * 1024 * 1024) {
      return { blob: file, width: bitmap.width, height: bitmap.height }
    }
    return { blob, width, height }
  } catch {
    return { blob: file }
  } finally {
    bitmap?.close()
  }
}

const AVATAR_SOURCE_LIMIT = 12 * 1024 * 1024
const AVATAR_SIZE = 256

/** 把本地图片居中裁成正方形，压缩成可放进 localStorage 的头像 data URL。 */
export async function createAvatarDataUrl(file: File): Promise<string> {
  if (!isImageFile(file)) {
    throw new Error('请选择 JPG、PNG、WebP 等图片文件')
  }
  if (file.size > AVATAR_SOURCE_LIMIT) {
    throw new Error('图片超过 12MB，请换一张小一点的图片')
  }

  let bitmap: ImageBitmap | null = null
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    if (!bitmap.width || !bitmap.height) throw new Error('无法读取这张图片')

    const side = Math.min(bitmap.width, bitmap.height)
    const sx = (bitmap.width - side) / 2
    const sy = (bitmap.height - side) / 2
    const canvas = document.createElement('canvas')
    canvas.width = AVATAR_SIZE
    canvas.height = AVATAR_SIZE
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('当前浏览器不支持图片处理')
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE)

    const webp = canvas.toDataURL('image/webp', 0.86)
    if (webp.startsWith('data:image/webp')) return webp
    return canvas.toDataURL('image/jpeg', 0.88)
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('无法')) throw error
    throw new Error('这个图片格式无法处理，请换成 JPG、PNG 或 WebP')
  } finally {
    bitmap?.close()
  }
}

export async function getVideoMeta(
  file: File,
): Promise<{ duration: number; width: number; height: number }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const video = document.createElement('video')
    let done = false
    const finish = (result: { duration: number; width: number; height: number }) => {
      if (done) return
      done = true
      video.removeAttribute('src')
      video.load()
      URL.revokeObjectURL(url)
      resolve(result)
    }
    const timer = window.setTimeout(() => finish({ duration: 0, width: 0, height: 0 }), 5000)
    video.preload = 'metadata'
    video.onloadedmetadata = () => {
      window.clearTimeout(timer)
      finish({
        duration: Number.isFinite(video.duration) ? video.duration : 0,
        width: video.videoWidth || 0,
        height: video.videoHeight || 0,
      })
    }
    video.onerror = () => {
      window.clearTimeout(timer)
      finish({ duration: 0, width: 0, height: 0 })
    }
    video.src = url
  })
}

export async function getAudioDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const audio = document.createElement('audio')
    let done = false
    const finish = (duration: number) => {
      if (done) return
      done = true
      audio.removeAttribute('src')
      audio.load()
      URL.revokeObjectURL(url)
      resolve(duration)
    }
    const timer = window.setTimeout(() => finish(0), 5000)
    audio.preload = 'metadata'
    audio.onloadedmetadata = () => {
      window.clearTimeout(timer)
      finish(Number.isFinite(audio.duration) ? audio.duration : 0)
    }
    audio.onerror = () => {
      window.clearTimeout(timer)
      finish(0)
    }
    audio.src = url
  })
}

export function parseTrackName(fileName: string): { title: string; artist: string } {
  const base = fileName.replace(/\.[^.]+$/, '')
  const parts = base.split(' - ')
  if (parts.length >= 2) {
    return { artist: parts[0].trim(), title: parts.slice(1).join(' - ').trim() }
  }
  return { artist: '未知艺术家', title: base.trim() }
}

export function isAudioFile(file: File): boolean {
  return file.type.startsWith('audio/') || /\.(mp3|wav|flac|ogg|m4a|aac|opus|webm)$/i.test(file.name)
}

export function isVideoFile(file: File): boolean {
  return file.type.startsWith('video/') || /\.(mp4|webm|mov|m4v|ogv)$/i.test(file.name)
}

export function isImageFile(file: File): boolean {
  return file.type.startsWith('image/') || /\.(png|jpe?g|webp|gif|svg|avif|bmp)$/i.test(file.name)
}

export function mediaKindOf(file: File): 'image' | 'video' {
  return isVideoFile(file) ? 'video' : 'image'
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error('读取文件失败'))
    reader.readAsDataURL(blob)
  })
}

export function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64] = dataUrl.split(',')
  const mime = /data:([^;]+)/.exec(header)?.[1] ?? 'application/octet-stream'
  const binary = atob(base64 ?? '')
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // 降级到 execCommand
  }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    ta.remove()
    return ok
  } catch {
    return false
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

export function makeTrackTitle(track: Pick<Track, 'title' | 'artist'>): string {
  return track.artist && track.artist !== '未知艺术家'
    ? `${track.artist} - ${track.title}`
    : track.title
}
