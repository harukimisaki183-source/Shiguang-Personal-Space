export type PageKey = 'blog' | 'chat' | 'settings'

export const CATEGORIES = ['日常', '面试', '学习', '心情', '其他'] as const
export type Category = (typeof CATEGORIES)[number]

export type MediaKind = 'image' | 'video'

export interface Note {
  id: string
  content: string
  category: Category
  createdAt: number
  updatedAt: number
}

export interface MediaItem {
  id: string
  noteId: string
  kind: MediaKind
  name: string
  mime: string
  size: number
  width?: number
  height?: number
  duration?: number
  blob: Blob
  createdAt: number
}

export interface NoteWithMedia extends Note {
  media: MediaItem[]
}

/**
 * 旧版的面试模式。保留它只用于把 0.1.x 的旧对话迁移到技能系统。
 * @deprecated 请使用 Chat.skillId
 */
export type ChatMode = 'general' | 'project' | 'fundamentals' | 'mock' | 'review'

export type SkillGroup = '面试辅助' | '通用' | '记录' | '我的技能'
export type SkillKind = 'chat' | 'card'

export interface Skill {
  id: string
  name: string
  icon: string
  description: string
  systemPrompt: string
  group: SkillGroup
  kind: SkillKind
  /** 内置技能随代码更新，自定义技能保存在 IndexedDB */
  custom: boolean
  /** 欢迎页上是否优先展示 */
  featured?: boolean
  suggestions?: string[]
  createdAt: number
  updatedAt: number
}

export interface Chat {
  id: string
  title: string
  skillId: string
  createdAt: number
  updatedAt: number
  /** 旧数据迁移用，新对话不再写入 */
  mode?: ChatMode
}

export type ChatRole = 'user' | 'assistant'

export interface ChatMessage {
  id: string
  chatId: string
  role: ChatRole
  content: string
  createdAt: number
  error?: boolean
}

export const CARD_TAGS = ['日常', '工作', '技能', '兴趣', '求职'] as const
export type CardTag = (typeof CARD_TAGS)[number]
export type CardType = 'plan' | 'summary'

export interface DayCard {
  id: string
  date: string
  type: CardType
  tag: CardTag
  title: string
  fields: Record<string, string>
  createdAt: number
  updatedAt: number
}

export interface Track {
  id: string
  title: string
  artist: string
  fileName: string
  mime: string
  size: number
  duration: number
  blob: Blob
  createdAt: number
}

export interface Settings {
  nickname: string
  avatar: string
  bio: string
  theme: 'light' | 'dark'
  demoMode: boolean
  baseUrl: string
  apiKey: string
  model: string
  temperature: number
}
