import { isImageFile, isVideoFile } from './utils'

export const MEDIA_LIMITS = {
  count: 9,
  imageBytes: 25 * 1024 * 1024,
  videoBytes: 120 * 1024 * 1024,
  totalBytes: 300 * 1024 * 1024,
}

export function validateMediaFiles(
  incoming: File[],
  existingCount: number,
  existingBytes: number,
): { files: File[]; errors: string[] } {
  const files: File[] = []
  const errors: string[] = []
  let count = existingCount
  let total = existingBytes

  for (const file of incoming) {
    const image = isImageFile(file)
    const video = isVideoFile(file)
    if (!image && !video) {
      errors.push(`「${file.name}」不是支持的图片或视频`)
      continue
    }
    if (count >= MEDIA_LIMITS.count) {
      errors.push(`一条记录最多添加 ${MEDIA_LIMITS.count} 个媒体文件`)
      break
    }
    if (image && file.size > MEDIA_LIMITS.imageBytes) {
      errors.push(`图片「${file.name}」超过 25MB`)
      continue
    }
    if (video && file.size > MEDIA_LIMITS.videoBytes) {
      errors.push(`视频「${file.name}」超过 120MB`)
      continue
    }
    if (total + file.size > MEDIA_LIMITS.totalBytes) {
      errors.push('媒体文件总大小超过 300MB，请减少一些再试')
      break
    }
    files.push(file)
    count += 1
    total += file.size
  }

  return { files, errors }
}
