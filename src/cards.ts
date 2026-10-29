import type { CardTag, CardType, DayCard } from './types'
import { downloadBlob, parseDateKey } from './utils'

export interface CardFieldDef {
  key: string
  label: string
  planLabel?: string
  type: 'text' | 'textarea' | 'number'
  placeholder: string
  maxLength?: number
}

export interface CardTagInfo {
  tag: CardTag
  icon: string
  caption: string
  accent: string
  accentSoft: string
  gradient: [string, string, string]
  fields: CardFieldDef[]
}

export const CARD_TYPE_INFO: Record<CardType, { label: string; hint: string }> = {
  plan: { label: '计划', hint: '给今天定一个轻量的方向' },
  summary: { label: '总结', hint: '把今天发生的事收好' },
}

export const CARD_TAG_INFO: CardTagInfo[] = [
  {
    tag: '日常',
    icon: '🌿',
    caption: '生活里的小事，也值得被记住',
    accent: '#2f7d5b',
    accentSoft: '#e2f2e7',
    gradient: ['#e4f3e9', '#b6dcc5', '#79b591'],
    fields: [
      { key: 'moment', label: '今日高光', planLabel: '今日重点', type: 'text', placeholder: '今天最想记住的一件小事', maxLength: 40 },
      { key: 'mood', label: '今天的心情', planLabel: '期待的状态', type: 'text', placeholder: '平静 / 有点累，但还不错', maxLength: 32 },
      { key: 'gratitude', label: '想记下的小确幸', planLabel: '想照顾自己的事', type: 'textarea', placeholder: '一顿好吃的饭、一段散步、一句被接住的话…', maxLength: 110 },
      { key: 'tomorrow', label: '明天想做', planLabel: '明天安排', type: 'textarea', placeholder: '给明天留一个小期待', maxLength: 80 },
    ],
  },
  {
    tag: '工作',
    icon: '💼',
    caption: '把做过的事，变成看得见的进度',
    accent: '#3f63cf',
    accentSoft: '#e6edff',
    gradient: ['#e8efff', '#bed0ff', '#8aa6f2'],
    fields: [
      { key: 'done', label: '完成事项', planLabel: '今日任务', type: 'textarea', placeholder: '完成了什么？推进了哪一步？', maxLength: 110 },
      { key: 'problem', label: '卡点 / 问题', planLabel: '风险 / 难点', type: 'textarea', placeholder: '哪里不顺利？需要谁的支持？', maxLength: 90 },
      { key: 'tomorrow', label: '明日计划', planLabel: '优先级', type: 'textarea', placeholder: '明天最重要的一件事', maxLength: 90 },
    ],
  },
  {
    tag: '技能',
    icon: '🛠️',
    caption: '每天长一点，时间会替你复利',
    accent: '#6a4bd0',
    accentSoft: '#eee9ff',
    gradient: ['#f0ebff', '#d0c3ff', '#a58cf1'],
    fields: [
      { key: 'learned', label: '学习内容', planLabel: '今天学什么', type: 'textarea', placeholder: '看了什么、理解了哪个概念？', maxLength: 100 },
      { key: 'practice', label: '练习 / 产出', planLabel: '练习计划', type: 'textarea', placeholder: '写了代码、做了题，还是产出一个小作品？', maxLength: 100 },
      { key: 'gain', label: '收获与卡点', type: 'textarea', placeholder: '最大的收获，以及还没想通的地方', maxLength: 100 },
      { key: 'next', label: '下一步', type: 'textarea', placeholder: '接下来准备怎么继续？', maxLength: 80 },
    ],
  },
  {
    tag: '兴趣',
    icon: '🎨',
    caption: '喜欢的事，是生活的充电口',
    accent: '#bd5b3f',
    accentSoft: '#ffede7',
    gradient: ['#ffebe3', '#ffc9b7', '#f39a7d'],
    fields: [
      { key: 'activity', label: '今天做了什么', planLabel: '想做什么', type: 'text', placeholder: '读书、画画、运动、听歌…', maxLength: 40 },
      { key: 'feeling', label: '感受', type: 'textarea', placeholder: '沉浸的时刻、新的发现、想留住的感觉', maxLength: 100 },
      { key: 'next', label: '下次继续', planLabel: '下次安排', type: 'textarea', placeholder: '下一次想尝试什么？', maxLength: 80 },
    ],
  },
  {
    tag: '求职',
    icon: '🎯',
    caption: '每一次投递，都算数',
    accent: '#98641b',
    accentSoft: '#fff1d8',
    gradient: ['#fff3df', '#f6d7a2', '#e3b25d'],
    fields: [
      { key: 'boss', label: 'BOSS直聘', planLabel: 'BOSS直聘目标', type: 'number', placeholder: '0', maxLength: 4 },
      { key: 'online', label: '网申', planLabel: '网申目标', type: 'number', placeholder: '0', maxLength: 4 },
      { key: 'other', label: '其他途径', planLabel: '其他目标', type: 'number', placeholder: '0', maxLength: 4 },
      { key: 'interview', label: '面试 / 沟通', planLabel: '面试准备', type: 'number', placeholder: '0', maxLength: 4 },
      { key: 'review', label: '今日复盘', planLabel: '重点关注', type: 'textarea', placeholder: '投了哪些方向？有什么反馈和判断？', maxLength: 100 },
      { key: 'next', label: '明日计划', planLabel: '今日安排', type: 'textarea', placeholder: '明天最想推进的一件事', maxLength: 80 },
    ],
  },
]

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

export function getCardTag(tag: CardTag): CardTagInfo {
  return CARD_TAG_INFO.find((item) => item.tag === tag) ?? CARD_TAG_INFO[0]
}

export function getCardType(type: CardType): { label: string; hint: string } {
  return CARD_TYPE_INFO[type] ?? CARD_TYPE_INFO.summary
}

export function getFieldLabel(field: CardFieldDef, type: CardType): string {
  return type === 'plan' && field.planLabel ? field.planLabel : field.label
}

export function getCardDate(date: string): Date {
  return parseDateKey(date)
}

export function cardDateLabel(date: string): string {
  const d = getCardDate(date)
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日 · ${WEEKDAYS[d.getDay()]}`
}

export function cardDateShort(date: string): string {
  const d = getCardDate(date)
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

export function getDefaultCardTitle(date: string, tag: CardTag, type: CardType): string {
  return `${cardDateShort(date)} · ${tag}${getCardType(type).label}`
}

export function applicationTotal(card: Pick<DayCard, 'fields'>): number {
  return ['boss', 'online', 'other'].reduce((sum, key) => {
    const value = Number.parseInt(card.fields[key] ?? '', 10)
    return sum + (Number.isFinite(value) ? Math.max(0, value) : 0)
  }, 0)
}

export function cardHasContent(fields: Record<string, string>, title: string): boolean {
  if (title.trim()) return true
  return Object.values(fields).some((value) => value.trim() && value.trim() !== '0')
}

export function cardSummary(card: DayCard, maxLength = 80): string {
  const tag = getCardTag(card.tag)
  const preferred = tag.fields
    .filter((field) => field.type !== 'number')
    .map((field) => card.fields[field.key]?.trim())
    .filter(Boolean)
  const text = preferred[0] || card.title
  if (text.length <= maxLength) return text
  return `${text.slice(0, maxLength)}…`
}

export function cardToText(card: DayCard, owner?: string): string {
  const tag = getCardTag(card.tag)
  const type = getCardType(card.type)
  const lines = [`${cardDateLabel(card.date)} · ${card.tag}${type.label}`, card.title]
  if (card.tag === '求职') {
    lines.push(
      `投递合计 ${applicationTotal(card)} 份`,
      `${getFieldLabel(tag.fields[0], card.type)} ${card.fields.boss || '0'} 份 · ${getFieldLabel(tag.fields[1], card.type)} ${card.fields.online || '0'} 份 · ${getFieldLabel(tag.fields[2], card.type)} ${card.fields.other || '0'} 份`,
    )
    if (card.fields.interview) lines.push(`面试 / 沟通 ${card.fields.interview}`)
  }
  for (const field of tag.fields) {
    if (field.type === 'number') continue
    const value = card.fields[field.key]?.trim()
    if (value) lines.push(`${getFieldLabel(field, card.type)}：${value}`)
  }
  if (owner) lines.push(`—— ${owner} 的拾光卡片`)
  return lines.filter(Boolean).join('\n')
}

export function cardFileName(card: DayCard): string {
  const safeTitle = card.title.replace(/[\\/:*?"<>|]/g, '').slice(0, 24) || '每日卡片'
  return `拾光-${card.date}-${safeTitle}.png`
}

/* ----------------------------- PNG 导出 ----------------------------- */

const CARD_W = 1080
const CARD_H = 1440
const FONT = '"Microsoft YaHei", "PingFang SC", "Hiragino Sans GB", sans-serif'

function pathRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.min(radius, width / 2, height / 2)
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + width, y, x + width, y + height, r)
  ctx.arcTo(x + width, y + height, x, y + height, r)
  ctx.arcTo(x, y + height, x, y, r)
  ctx.arcTo(x, y, x + width, y, r)
  ctx.closePath()
}

function wrapLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const chars = Array.from(text.trim())
  const lines: string[] = []
  let current = ''
  let truncated = false

  const pushCurrent = () => {
    lines.push(current.trimEnd())
    current = ''
  }

  const noLineStart = '，。！？；：、）》」』】…,.!?;:)]}%'

  for (let i = 0; i < chars.length; i += 1) {
    const char = chars[i]
    if (char === '\n') {
      pushCurrent()
      if (lines.length >= maxLines) {
        truncated = true
        break
      }
      continue
    }
    const next = current + char
    if (ctx.measureText(next).width > maxWidth && current) {
      // 中文标点不要单独跑到下一行开头
      if (noLineStart.includes(char)) {
        current = next
        continue
      }
      pushCurrent()
      current = char
      if (lines.length >= maxLines) {
        truncated = true
        break
      }
    } else {
      current = next
    }
  }
  if (!truncated && current) lines.push(current.trimEnd())
  if (lines.length > maxLines) lines.length = maxLines

  if (truncated && lines.length) {
    let last = lines[lines.length - 1]
    while (last && ctx.measureText(`${last}…`).width > maxWidth) {
      last = last.slice(0, -1)
    }
    lines[lines.length - 1] = `${last}…`
  }
  return lines.length ? lines : ['']
}

function drawText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  font: string,
  color: string,
  maxWidth?: number,
): void {
  ctx.font = font
  ctx.fillStyle = color
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  if (!maxWidth) {
    ctx.fillText(text, x, y)
    return
  }
  let value = text
  while (value && ctx.measureText(value).width > maxWidth) {
    value = value.slice(0, -1)
  }
  if (value !== text) value = `${value.slice(0, -1)}…`
  ctx.fillText(value, x, y)
}

function drawSection(
  ctx: CanvasRenderingContext2D,
  label: string,
  value: string,
  x: number,
  y: number,
  width: number,
  accent: string,
  maxLines = 3,
): number {
  ctx.fillStyle = accent
  pathRoundRect(ctx, x, y - 23, 7, 28, 4)
  ctx.fill()
  drawText(ctx, label, x + 22, y, `600 27px ${FONT}`, '#4d4a43')
  const bodyY = y + 48
  ctx.font = `400 30px ${FONT}`
  ctx.fillStyle = '#38352f'
  const lines = wrapLines(ctx, value || '——', width - 22, maxLines)
  lines.forEach((line, index) => {
    ctx.fillText(line, x + 22, bodyY + index * 43)
  })
  return bodyY + lines.length * 43
}

export async function renderCardPng(
  card: DayCard,
  owner?: string,
): Promise<Blob> {
  if (typeof document !== 'undefined' && document.fonts?.ready) {
    await document.fonts.ready.catch(() => undefined)
  }
  const tag = getCardTag(card.tag)
  const type = getCardType(card.type)
  const canvas = document.createElement('canvas')
  canvas.width = CARD_W
  canvas.height = CARD_H
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('当前浏览器不支持卡片导出')

  const bg = ctx.createLinearGradient(0, 0, CARD_W, CARD_H)
  bg.addColorStop(0, tag.gradient[0])
  bg.addColorStop(0.52, tag.gradient[1])
  bg.addColorStop(1, tag.gradient[2])
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, CARD_W, CARD_H)

  ctx.save()
  ctx.globalAlpha = 0.2
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  ctx.arc(948, 148, 230, 0, Math.PI * 2)
  ctx.fill()
  ctx.globalAlpha = 0.12
  ctx.beginPath()
  ctx.arc(88, 1330, 270, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()

  ctx.save()
  ctx.shadowColor = 'rgba(67, 52, 25, 0.2)'
  ctx.shadowBlur = 60
  ctx.shadowOffsetY = 24
  pathRoundRect(ctx, 64, 64, 952, 1312, 46)
  ctx.fillStyle = '#fffdf8'
  ctx.fill()
  ctx.restore()

  const left = 128
  const right = 952
  const contentWidth = right - left

  drawText(ctx, '拾光', left, 156, `700 33px ${FONT}`, tag.accent)
  drawText(ctx, '·  DAY CARD', left + 86, 155, `500 22px ${FONT}`, '#9a9488')

  ctx.font = `600 24px ${FONT}`
  const tagText = `${tag.icon} ${card.tag}${type.label}`
  const chipWidth = ctx.measureText(tagText).width + 46
  const chipX = right - chipWidth
  ctx.fillStyle = tag.accent
  pathRoundRect(ctx, chipX, 124, chipWidth, 52, 26)
  ctx.fill()
  drawText(ctx, tagText, chipX + 23, 158, `600 24px ${FONT}`, '#ffffff')

  drawText(ctx, cardDateLabel(card.date), left, 235, `500 27px ${FONT}`, '#837d70')
  const dateLine = ctx.createLinearGradient(left, 0, right, 0)
  dateLine.addColorStop(0, 'rgba(143, 132, 111, 0.35)')
  dateLine.addColorStop(1, 'rgba(143, 132, 111, 0)')
  ctx.fillStyle = dateLine
  ctx.fillRect(left, 260, contentWidth, 1.5)

  ctx.font = `700 64px ${FONT}`
  const titleLines = wrapLines(ctx, card.title, contentWidth, 2)
  titleLines.forEach((line, index) => {
    drawText(ctx, line, left, 344 + index * 80, `700 64px ${FONT}`, '#29261f')
  })
  const titleBottom = 344 + (titleLines.length - 1) * 80
  drawText(ctx, `${tag.caption} · ${type.hint}`, left, titleBottom + 58, `400 26px ${FONT}`, '#817b6e')

  let cursor = titleBottom + 120

  if (card.tag === '求职') {
    const total = applicationTotal(card)
    ctx.fillStyle = tag.accentSoft
    pathRoundRect(ctx, left, cursor, contentWidth, 172, 28)
    ctx.fill()
    drawText(ctx, card.type === 'plan' ? '计划投递' : '今日投递', left + 36, cursor + 54, `500 25px ${FONT}`, '#7e5b23')
    drawText(ctx, String(total), left + 34, cursor + 132, `700 76px ${FONT}`, tag.accent)
    ctx.font = `700 76px ${FONT}`
    const totalWidth = ctx.measureText(String(total)).width
    drawText(ctx, '份', left + 56 + totalWidth, cursor + 132, `400 28px ${FONT}`, '#7e5b23')

    const stats = tag.fields.slice(0, 3)
    const colWidth = 118
    const startX = left + 430
    stats.forEach((field, index) => {
      const x = startX + index * colWidth
      if (index > 0) {
        ctx.fillStyle = 'rgba(126, 91, 35, 0.14)'
        ctx.fillRect(x - 22, cursor + 32, 1, 108)
      }
      drawText(
        ctx,
        getFieldLabel(field, card.type).replace('目标', ''),
        x,
        cursor + 58,
        `400 20px ${FONT}`,
        '#8b6a35',
        94,
      )
      drawText(ctx, card.fields[field.key] || '0', x, cursor + 118, `700 48px ${FONT}`, tag.accent)
    })

    cursor += 208
    if (card.fields.interview) {
      ctx.fillStyle = 'rgba(152, 100, 27, 0.1)'
      pathRoundRect(ctx, left, cursor - 26, 300, 50, 25)
      ctx.fill()
      drawText(ctx, `${getFieldLabel(tag.fields[3], card.type)} · ${card.fields.interview}`, left + 22, cursor + 8, `500 23px ${FONT}`, tag.accent)
      cursor += 66
    } else {
      cursor += 14
    }

    for (const field of tag.fields.slice(4)) {
      const value = card.fields[field.key]?.trim()
      if (!value) continue
      cursor = drawSection(ctx, getFieldLabel(field, card.type), value, left, cursor + 34, contentWidth, tag.accent, 3) + 30
    }
  } else {
    const fields = tag.fields.filter((field) => field.type !== 'number')
    const maxLines = fields.length >= 4 ? 2 : fields.length === 3 ? 3 : 4
    for (const field of fields) {
      const value = card.fields[field.key]?.trim()
      if (!value) continue
      cursor = drawSection(
        ctx,
        getFieldLabel(field, card.type),
        value,
        left,
        cursor + 32,
        contentWidth,
        tag.accent,
        maxLines,
      ) + 36
    }
    if (cursor < titleBottom + 150) {
      drawText(ctx, '从左边写下一点今天的内容，这张卡片就会完整起来。', left, cursor + 36, `400 30px ${FONT}`, '#aaa295', contentWidth)
    }
  }

  ctx.fillStyle = 'rgba(128, 116, 95, 0.22)'
  ctx.fillRect(left, 1284, contentWidth, 1)
  drawText(ctx, '拾光 · 把每一天收好', left, 1330, `500 23px ${FONT}`, '#8f887b')
  if (owner) {
    const ownerText = `${owner} 的卡片`
    ctx.font = `500 23px ${FONT}`
    const ownerWidth = ctx.measureText(ownerText).width
    drawText(ctx, ownerText, right - ownerWidth, 1330, `500 23px ${FONT}`, '#8f887b')
  }

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/png')
  })
  if (!blob) throw new Error('卡片生成失败，请稍后再试')
  return blob
}

export async function exportCardPng(card: DayCard, owner?: string): Promise<void> {
  const blob = await renderCardPng(card, owner)
  downloadBlob(blob, cardFileName(card))
}
