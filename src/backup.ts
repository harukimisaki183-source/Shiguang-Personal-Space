import { APP_VERSION } from './changelog'
import { db } from './db'
import { DEFAULT_SKILL_ID, MODE_TO_SKILL } from './skills'
import type {
  Chat,
  ChatMessage,
  DayCard,
  MediaItem,
  Note,
  Settings,
  Skill,
  Track,
} from './types'
import { blobToDataUrl, dataUrlToBlob, downloadBlob } from './utils'

interface BackupMedia extends Omit<MediaItem, 'blob'> {
  dataUrl: string
}

interface BackupTrack extends Omit<Track, 'blob'> {
  dataUrl: string
}

interface BackupPayload {
  app: 'interview-hub'
  format: 1 | 2
  appVersion: string
  exportedAt: number
  notes: Note[]
  media: BackupMedia[]
  chats: Chat[]
  messages: ChatMessage[]
  tracks: BackupTrack[]
  skills?: Skill[]
  cards?: DayCard[]
  settings: Omit<Settings, 'apiKey'>
}

export interface BackupResult {
  blob: Blob
  filename: string
  counts: {
    notes: number
    media: number
    chats: number
    messages: number
    tracks: number
    cards: number
    skills: number
  }
}

export interface RestoreResult {
  counts: BackupResult['counts']
  settings?: Partial<Settings>
}

export async function buildBackup(settings: Settings): Promise<BackupResult> {
  const [notes, mediaItems, chats, messages, trackItems, customSkills, cards] = await Promise.all([
    db.notes.toArray(),
    db.media.toArray(),
    db.chats.toArray(),
    db.messages.toArray(),
    db.tracks.toArray(),
    db.skills.toArray(),
    db.cards.toArray(),
  ])

  const media: BackupMedia[] = []
  for (const item of mediaItems) {
    const { blob, ...rest } = item
    media.push({ ...rest, dataUrl: await blobToDataUrl(blob) })
  }

  const tracks: BackupTrack[] = []
  for (const item of trackItems) {
    const { blob, ...rest } = item
    tracks.push({ ...rest, dataUrl: await blobToDataUrl(blob) })
  }

  const { apiKey: _apiKey, ...safeSettings } = settings
  const payload: BackupPayload = {
    app: 'interview-hub',
    format: 2,
    appVersion: APP_VERSION,
    exportedAt: Date.now(),
    notes,
    media,
    chats,
    messages,
    tracks,
    skills: customSkills,
    cards,
    settings: safeSettings,
  }

  const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' })
  const date = new Date().toISOString().slice(0, 10)
  return {
    blob,
    filename: `拾光备份-${date}.json`,
    counts: {
      notes: notes.length,
      media: media.length,
      chats: chats.length,
      messages: messages.length,
      tracks: tracks.length,
      cards: cards.length,
      skills: customSkills.length,
    },
  }
}

export async function exportBackup(settings: Settings): Promise<BackupResult> {
  const result = await buildBackup(settings)
  downloadBlob(result.blob, result.filename)
  return result
}

export async function restoreBackup(file: File): Promise<RestoreResult> {
  if (!file.size) throw new Error('备份文件是空的')
  if (file.size > 512 * 1024 * 1024) {
    throw new Error('备份文件超过 512MB，网页原型可能没有足够内存，请拆分为更小的备份。')
  }

  let payload: BackupPayload
  try {
    payload = JSON.parse(await file.text()) as BackupPayload
  } catch {
    throw new Error('无法解析备份文件，请确认它没有被损坏')
  }

  if (!payload || payload.app !== 'interview-hub') {
    throw new Error('这不是拾光的备份文件')
  }
  if (
    !Array.isArray(payload.notes) ||
    !Array.isArray(payload.media) ||
    !Array.isArray(payload.chats) ||
    !Array.isArray(payload.messages) ||
    !Array.isArray(payload.tracks)
  ) {
    throw new Error('备份文件结构不完整，可能来自不兼容的版本')
  }
  if (payload.skills !== undefined && !Array.isArray(payload.skills)) {
    throw new Error('备份中的自定义技能数据不完整')
  }
  if (payload.cards !== undefined && !Array.isArray(payload.cards)) {
    throw new Error('备份中的卡片数据不完整')
  }

  const media: MediaItem[] = []
  for (const item of payload.media) {
    const { dataUrl, ...rest } = item
    if (!dataUrl) throw new Error('备份中的媒体数据不完整')
    media.push({ ...rest, blob: dataUrlToBlob(dataUrl) })
  }

  const tracks: Track[] = []
  for (const item of payload.tracks) {
    const { dataUrl, ...rest } = item
    if (!dataUrl) throw new Error('备份中的音乐数据不完整')
    tracks.push({ ...rest, blob: dataUrlToBlob(dataUrl) })
  }

  // 兼容 0.1.x 备份里的旧 mode 字段
  const chats: Chat[] = payload.chats.map((chat) => ({
    ...chat,
    skillId:
      chat.skillId ||
      (chat.mode ? MODE_TO_SKILL[chat.mode] : undefined) ||
      DEFAULT_SKILL_ID,
  }))
  const customSkills = (payload.skills ?? []).filter((skill) => skill.custom)
  const cards = payload.cards ?? []

  await db.transaction(
    'rw',
    [db.notes, db.media, db.chats, db.messages, db.tracks, db.skills, db.cards],
    async () => {
      await Promise.all([
        db.notes.clear(),
        db.media.clear(),
        db.chats.clear(),
        db.messages.clear(),
        db.tracks.clear(),
        db.skills.clear(),
        db.cards.clear(),
      ])
      if (payload.notes.length) await db.notes.bulkAdd(payload.notes)
      if (media.length) await db.media.bulkAdd(media)
      if (chats.length) await db.chats.bulkAdd(chats)
      if (payload.messages.length) await db.messages.bulkAdd(payload.messages)
      if (tracks.length) await db.tracks.bulkAdd(tracks)
      if (customSkills.length) await db.skills.bulkAdd(customSkills)
      if (cards.length) await db.cards.bulkAdd(cards)
    },
  )

  return {
    counts: {
      notes: payload.notes.length,
      media: media.length,
      chats: chats.length,
      messages: payload.messages.length,
      tracks: tracks.length,
      cards: cards.length,
      skills: customSkills.length,
    },
    settings: payload.settings,
  }
}
