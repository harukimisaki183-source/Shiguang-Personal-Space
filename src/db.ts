import Dexie, { type Table } from 'dexie'
import type {
  CardTag,
  CardType,
  Category,
  Chat,
  ChatMessage,
  ChatMode,
  DayCard,
  MediaItem,
  MediaKind,
  Note,
  NoteWithMedia,
  Skill,
  Track,
} from './types'
import { DEFAULT_SKILL_ID, MODE_TO_SKILL } from './skills'
import { STORAGE_KEYS } from './storage'
import {
  compressImage,
  getAudioDuration,
  getVideoMeta,
  isAudioFile,
  isImageFile,
  isVideoFile,
  mediaKindOf,
  parseTrackName,
  uid,
} from './utils'

class InterviewHubDB extends Dexie {
  notes!: Table<Note, string>
  media!: Table<MediaItem, string>
  chats!: Table<Chat, string>
  messages!: Table<ChatMessage, string>
  tracks!: Table<Track, string>
  skills!: Table<Skill, string>
  cards!: Table<DayCard, string>

  constructor() {
    super('interview-hub-db')
    // 发布后如需改表结构：新增 this.version(n).stores(...).upgrade(...)，
    // 保留旧版本的声明，让 Dexie 在事务里升级。桌面版在跨版本启动前
    // 还会由主进程自动生成一份数据快照（见 electron/data-safety.cjs）。
    this.version(1).stores({
      notes: 'id, createdAt, updatedAt, category',
      media: 'id, noteId, createdAt',
      chats: 'id, updatedAt',
      messages: 'id, chatId, createdAt',
      tracks: 'id, createdAt',
    })
    this.version(2)
      .stores({
        notes: 'id, createdAt, updatedAt, category',
        media: 'id, noteId, createdAt',
        chats: 'id, updatedAt, skillId',
        messages: 'id, chatId, createdAt',
        tracks: 'id, createdAt',
        skills: 'id, createdAt, updatedAt',
        cards: 'id, date, tag, createdAt',
      })
      .upgrade(async (transaction) => {
        await transaction
          .table<Chat & { mode?: ChatMode }>('chats')
          .toCollection()
          .modify((chat) => {
            if (!chat.skillId) {
              chat.skillId = MODE_TO_SKILL[chat.mode ?? 'general'] ?? DEFAULT_SKILL_ID
            }
            delete chat.mode
          })
      })
  }
}

export const db = new InterviewHubDB()

const MAX_IMAGE_BYTES = 25 * 1024 * 1024
const MAX_VIDEO_BYTES = 120 * 1024 * 1024
const MAX_AUDIO_BYTES = 80 * 1024 * 1024

async function buildMediaItems(noteId: string, files: File[]): Promise<MediaItem[]> {
  const result: MediaItem[] = []
  for (const file of files) {
    const kind: MediaKind = mediaKindOf(file)
    const id = uid()
    const createdAt = Date.now()

    if (kind === 'image') {
      if (!isImageFile(file)) {
        throw new Error(`「${file.name}」不是支持的图片格式`)
      }
      if (file.size > MAX_IMAGE_BYTES) {
        throw new Error(`图片「${file.name}」超过 25MB，请压缩后再试`)
      }
      const compressed = await compressImage(file)
      result.push({
        id,
        noteId,
        kind,
        name: file.name,
        mime: compressed.blob.type || file.type || 'image/webp',
        size: compressed.blob.size,
        width: compressed.width,
        height: compressed.height,
        blob: compressed.blob,
        createdAt,
      })
    } else {
      if (!isVideoFile(file)) {
        throw new Error(`「${file.name}」不是支持的视频格式`)
      }
      if (file.size > MAX_VIDEO_BYTES) {
        throw new Error(`视频「${file.name}」超过 120MB，请压缩后再试`)
      }
      const meta = await getVideoMeta(file)
      result.push({
        id,
        noteId,
        kind,
        name: file.name,
        mime: file.type || 'video/mp4',
        size: file.size,
        width: meta.width,
        height: meta.height,
        duration: meta.duration,
        blob: file,
        createdAt,
      })
    }
  }
  return result
}

export async function createNote(
  content: string,
  category: Category,
  files: File[] = [],
): Promise<Note> {
  const trimmed = content.trim()
  if (!trimmed && files.length === 0) {
    throw new Error('写点什么，或者添加一张图片吧')
  }
  const id = uid()
  const now = Date.now()
  const note: Note = {
    id,
    content: trimmed,
    category,
    createdAt: now,
    updatedAt: now,
  }
  const media = await buildMediaItems(id, files)
  await db.transaction('rw', db.notes, db.media, async () => {
    await db.notes.add(note)
    if (media.length) await db.media.bulkAdd(media)
  })
  return note
}

export async function updateNote(
  noteId: string,
  patch: { content: string; category: Category },
  newFiles: File[] = [],
  removeMediaIds: string[] = [],
): Promise<void> {
  const existing = await db.notes.get(noteId)
  if (!existing) throw new Error('这条记录已经不存在了')
  const trimmed = patch.content.trim()
  const newMedia = await buildMediaItems(noteId, newFiles)
  const remaining = await db.media.where('noteId').equals(noteId).count()
  if (!trimmed && remaining - removeMediaIds.length + newMedia.length === 0) {
    throw new Error('内容不能为空')
  }
  await db.transaction('rw', db.notes, db.media, async () => {
    if (removeMediaIds.length) await db.media.bulkDelete(removeMediaIds)
    if (newMedia.length) await db.media.bulkAdd(newMedia)
    await db.notes.update(noteId, {
      content: trimmed,
      category: patch.category,
      updatedAt: Date.now(),
    })
  })
}

export async function deleteNote(noteId: string): Promise<void> {
  await db.transaction('rw', db.notes, db.media, async () => {
    await db.media.where('noteId').equals(noteId).delete()
    await db.notes.delete(noteId)
  })
}

export async function listNotesWithMedia(): Promise<NoteWithMedia[]> {
  const [notes, media] = await Promise.all([
    db.notes.orderBy('createdAt').reverse().toArray(),
    db.media.toArray(),
  ])
  const grouped = new Map<string, MediaItem[]>()
  for (const item of media) {
    const list = grouped.get(item.noteId)
    if (list) list.push(item)
    else grouped.set(item.noteId, [item])
  }
  for (const list of grouped.values()) {
    list.sort((a, b) => a.createdAt - b.createdAt)
  }
  return notes.map((note) => ({ ...note, media: grouped.get(note.id) ?? [] }))
}

export async function getNoteWithMedia(noteId: string): Promise<NoteWithMedia | null> {
  const note = await db.notes.get(noteId)
  if (!note) return null
  const media = await db.media.where('noteId').equals(noteId).sortBy('createdAt')
  return { ...note, media }
}

/* ----------------------------- 对话 ----------------------------- */

export async function createChat(skillId = DEFAULT_SKILL_ID): Promise<Chat> {
  const now = Date.now()
  const chat: Chat = {
    id: uid(),
    title: '新对话',
    skillId,
    createdAt: now,
    updatedAt: now,
  }
  await db.chats.add(chat)
  return chat
}

export async function setChatSkill(chatId: string, skillId: string): Promise<void> {
  await db.chats.update(chatId, { skillId, updatedAt: Date.now() })
}

export async function renameChatFromFirstMessage(chatId: string, text: string): Promise<void> {
  const chat = await db.chats.get(chatId)
  if (!chat || chat.title !== '新对话') return
  const clean = text.replace(/\s+/g, ' ').trim()
  if (!clean) return
  const title = clean.length > 22 ? `${clean.slice(0, 22)}…` : clean
  await db.chats.update(chatId, { title, updatedAt: Date.now() })
}

export async function addMessage(
  chatId: string,
  role: ChatMessage['role'],
  content: string,
  error = false,
): Promise<ChatMessage> {
  const message: ChatMessage = {
    id: uid(),
    chatId,
    role,
    content,
    createdAt: Date.now(),
    ...(error ? { error: true } : {}),
  }
  await db.transaction('rw', db.messages, db.chats, async () => {
    await db.messages.add(message)
    await db.chats.update(chatId, { updatedAt: Date.now() })
  })
  return message
}

export async function deleteChat(chatId: string): Promise<void> {
  await db.transaction('rw', db.chats, db.messages, async () => {
    await db.messages.where('chatId').equals(chatId).delete()
    await db.chats.delete(chatId)
  })
}

export async function clearChatMessages(chatId: string): Promise<void> {
  await db.transaction('rw', db.chats, db.messages, async () => {
    await db.messages.where('chatId').equals(chatId).delete()
    await db.chats.update(chatId, { title: '新对话', updatedAt: Date.now() })
  })
}

export async function getChatMessages(chatId: string): Promise<ChatMessage[]> {
  return db.messages.where('chatId').equals(chatId).sortBy('createdAt')
}

/* ----------------------------- 技能 ----------------------------- */

interface SkillInput {
  name: string
  icon: string
  description: string
  systemPrompt: string
}

function cleanSkillInput(input: SkillInput): SkillInput {
  const name = input.name.trim()
  const description = input.description.trim()
  const systemPrompt = input.systemPrompt.trim()
  if (!name) throw new Error('给技能取个名字吧')
  if (name.length > 20) throw new Error('技能名称不要超过 20 个字')
  if (!systemPrompt) throw new Error('系统提示词不能为空')
  if (systemPrompt.length > 6000) throw new Error('系统提示词太长了，请控制在 6000 字以内')
  return {
    name,
    icon: input.icon.trim().slice(0, 4) || '🧩',
    description: description.slice(0, 80),
    systemPrompt,
  }
}

export async function createCustomSkill(input: SkillInput): Promise<Skill> {
  const clean = cleanSkillInput(input)
  const now = Date.now()
  const skill: Skill = {
    id: uid(),
    ...clean,
    group: '我的技能',
    kind: 'chat',
    custom: true,
    createdAt: now,
    updatedAt: now,
  }
  await db.skills.add(skill)
  return skill
}

export async function updateCustomSkill(skillId: string, input: SkillInput): Promise<Skill> {
  const existing = await db.skills.get(skillId)
  if (!existing) throw new Error('这个技能已经不存在了')
  const clean = cleanSkillInput(input)
  const patch = { ...clean, updatedAt: Date.now() }
  await db.skills.update(skillId, patch)
  return { ...existing, ...patch }
}

export async function deleteCustomSkill(skillId: string): Promise<void> {
  await db.transaction('rw', db.skills, db.chats, async () => {
    await db.chats.where('skillId').equals(skillId).modify({ skillId: DEFAULT_SKILL_ID })
    await db.skills.delete(skillId)
  })
}

export async function listCustomSkills(): Promise<Skill[]> {
  return db.skills.orderBy('createdAt').toArray()
}

/* ----------------------------- 每日卡片 ----------------------------- */

export interface CardInput {
  date: string
  type: CardType
  tag: CardTag
  title: string
  fields: Record<string, string>
}

function cleanCardInput(input: CardInput): CardInput {
  const fields: Record<string, string> = {}
  for (const [key, value] of Object.entries(input.fields)) {
    fields[key] = String(value ?? '').slice(0, 240)
  }
  return {
    date: input.date,
    type: input.type,
    tag: input.tag,
    title: input.title.trim().slice(0, 60),
    fields,
  }
}

export async function saveCard(input: CardInput, cardId?: string): Promise<DayCard> {
  const clean = cleanCardInput(input)
  if (!clean.date) throw new Error('选一下卡片日期吧')
  if (!cardHasAnyContent(clean)) throw new Error('至少写下一点今天的内容')
  const now = Date.now()
  if (cardId) {
    const existing = await db.cards.get(cardId)
    if (!existing) throw new Error('这张卡片已经不存在了')
    const card: DayCard = { ...existing, ...clean, updatedAt: now }
    await db.cards.put(card)
    return card
  }
  const card: DayCard = {
    id: uid(),
    ...clean,
    createdAt: now,
    updatedAt: now,
  }
  await db.cards.add(card)
  return card
}

function cardHasAnyContent(input: CardInput): boolean {
  if (input.title.trim()) return true
  return Object.values(input.fields).some((value) => value.trim() && value.trim() !== '0')
}

export async function deleteCard(cardId: string): Promise<void> {
  await db.cards.delete(cardId)
}

export async function listCards(): Promise<DayCard[]> {
  return db.cards.orderBy('date').reverse().toArray()
}

/* ----------------------------- 音乐 ----------------------------- */

export async function addTracks(files: File[]): Promise<{ added: Track[]; errors: string[] }> {
  const existing = await db.tracks.toArray()
  const seen = new Set(existing.map((track) => `${track.fileName}::${track.size}`))
  const added: Track[] = []
  const errors: string[] = []

  for (const file of files) {
    if (!isAudioFile(file)) {
      errors.push(`「${file.name}」不是浏览器支持的音频格式`)
      continue
    }
    if (file.size > MAX_AUDIO_BYTES) {
      errors.push(`「${file.name}」超过 80MB，已跳过`)
      continue
    }
    const key = `${file.name}::${file.size}`
    if (seen.has(key)) {
      errors.push(`「${file.name}」已经在音乐库里了`)
      continue
    }
    const { title, artist } = parseTrackName(file.name)
    const duration = await getAudioDuration(file)
    const track: Track = {
      id: uid(),
      title,
      artist,
      fileName: file.name,
      mime: file.type || 'audio/mpeg',
      size: file.size,
      duration,
      blob: file,
      createdAt: Date.now(),
    }
    seen.add(key)
    added.push(track)
  }

  if (added.length) await db.tracks.bulkAdd(added)
  return { added, errors }
}

export async function deleteTrack(trackId: string): Promise<void> {
  await db.tracks.delete(trackId)
}

/* --------------------------- 统计 / 工具 --------------------------- */

export async function getContentCounts() {
  const [notes, media, chats, messages, tracks, cards, skills] = await Promise.all([
    db.notes.count(),
    db.media.count(),
    db.chats.count(),
    db.messages.count(),
    db.tracks.count(),
    db.cards.count(),
    db.skills.count(),
  ])
  return { notes, media, chats, messages, tracks, cards, skills }
}

export async function getStorageStats() {
  if (navigator.storage?.estimate) {
    const estimate = await navigator.storage.estimate()
    return { usage: estimate.usage ?? 0, quota: estimate.quota ?? 0 }
  }
  return { usage: 0, quota: 0 }
}

export async function clearAllContent(): Promise<void> {
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
    },
  )
}

let seedPromise: Promise<void> | null = null

export function seedIfNeeded(): Promise<void> {
  if (seedPromise) return seedPromise
  seedPromise = (async () => {
    try {
      if (localStorage.getItem(STORAGE_KEYS.seeded)) return
      const count = await db.notes.count()
      if (count === 0) {
        const now = Date.now()
        await db.notes.add({
          id: uid(),
          content:
            '欢迎来到拾光 🌿\n\n这里是你记录、复盘和准备面试的私人空间。\n\n· 在「说说」里记录每天的想法，可以配图片和视频，日历会自动标记有记录的日期；\n· 在「对话」里选一个技能开始练习：面试教练、项目深挖、模拟面试，或者自己创建一个技能；\n· 想给今天留个印记时，打开「每日卡片」，选标签、填内容，生成一张可以导出的卡片；\n· 在「设置」里换主题、配置大模型、导出备份。所有内容默认只保存在这台设备上。\n\n把这条记录删掉，就可以开始写你自己的故事了。',
          category: '日常',
          createdAt: now,
          updatedAt: now,
        })
      }
      localStorage.setItem(STORAGE_KEYS.seeded, '1')
    } catch {
      // 存储不可用时不影响应用启动
    }
  })()
  return seedPromise
}
