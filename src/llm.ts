import type { ChatMode, Settings, Skill } from './types'
import { sleep } from './utils'

export interface ChatTurn {
  role: 'user' | 'assistant'
  content: string
}

export interface StreamChatOptions {
  settings: Settings
  skill: Skill
  history: ChatTurn[]
  onDelta: (text: string) => void
  signal?: AbortSignal
}

function buildEndpoint(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, '')
  if (!trimmed) throw new Error('请先填写 API Base URL')
  if (/\/chat\/completions$/i.test(trimmed)) return trimmed
  return `${trimmed}/chat/completions`
}

function trimHistory(history: ChatTurn[]): ChatTurn[] {
  const usable = history
    .filter((turn) => turn.content.trim() && (turn.role === 'user' || turn.role === 'assistant'))
    .slice(-20)
  let total = usable.reduce((sum, turn) => sum + turn.content.length, 0)
  while (usable.length > 2 && total > 24_000) {
    const removed = usable.shift()
    total -= removed?.content.length ?? 0
  }
  return usable
}

export async function streamChat({
  settings,
  skill,
  history,
  onDelta,
  signal,
}: StreamChatOptions): Promise<void> {
  if (skill.kind !== 'chat') {
    throw new Error('这不是一个对话技能')
  }
  if (settings.demoMode) {
    await streamDemo(skill, history, onDelta, signal)
    return
  }
  if (!settings.apiKey.trim()) {
    throw new Error('还没有配置 API Key。可以去「设置」填写，或打开演示模式先体验。')
  }

  const endpoint = buildEndpoint(settings.baseUrl)
  const messages = [
    { role: 'system', content: skill.systemPrompt },
    ...trimHistory(history).map((turn) => ({ role: turn.role, content: turn.content })),
  ]

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${settings.apiKey.trim()}`,
    },
    body: JSON.stringify({
      model: settings.model.trim() || 'deepseek-chat',
      messages,
      temperature: settings.temperature,
      stream: true,
    }),
    signal,
  })

  if (!response.ok) {
    const detail = (await response.text().catch(() => '')).slice(0, 300)
    throw new Error(
      `请求失败（HTTP ${response.status}）${detail ? `：${detail}` : ''}。请检查 Base URL、模型名和 API Key，或确认接口是否允许浏览器跨域访问。`,
    )
  }
  if (!response.body) {
    throw new Error('当前浏览器不支持流式响应，请换用新版 Chrome / Edge。')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let received = false

  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const events = buffer.split(/\r?\n\r?\n/)
    buffer = events.pop() ?? ''

    for (const event of events) {
      for (const line of event.split(/\r?\n/)) {
        if (!line.startsWith('data:')) continue
        const data = line.slice(5).trim()
        if (!data || data === '[DONE]') continue
        try {
          const json = JSON.parse(data) as {
            choices?: { delta?: { content?: string }; message?: { content?: string } }[]
          }
          const delta = json.choices?.[0]?.delta?.content ?? json.choices?.[0]?.message?.content
          if (typeof delta === 'string' && delta) {
            received = true
            onDelta(delta)
          }
        } catch {
          // 忽略服务端的心跳或非标准行
        }
      }
    }
  }

  if (!received) {
    throw new Error('模型没有返回内容。请检查模型名是否正确，或稍后再试。')
  }
}

export async function testConnection(settings: Settings): Promise<string> {
  if (settings.demoMode) return '当前是演示模式，无需连接。'
  if (!settings.apiKey.trim()) throw new Error('请先填写 API Key')
  const endpoint = buildEndpoint(settings.baseUrl)
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), 20_000)
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${settings.apiKey.trim()}`,
      },
      body: JSON.stringify({
        model: settings.model.trim() || 'deepseek-chat',
        messages: [{ role: 'user', content: '请只回复：OK' }],
        temperature: 0,
        max_tokens: 10,
        stream: false,
      }),
      signal: controller.signal,
    })
    if (!response.ok) {
      const detail = (await response.text().catch(() => '')).slice(0, 240)
      throw new Error(`连接失败（HTTP ${response.status}）${detail ? `：${detail}` : ''}`)
    }
    const json = (await response.json()) as {
      choices?: { message?: { content?: string } }[]
    }
    const content = json.choices?.[0]?.message?.content?.trim()
    return content || '连接成功，但模型没有返回文本。'
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('连接超时（20 秒）。请检查网络、Base URL 或代理设置。')
    }
    throw error
  } finally {
    window.clearTimeout(timer)
  }
}

/* --------------------------- 演示模式 --------------------------- */

const INTERVIEW_MODE_BY_SKILL: Record<string, ChatMode> = {
  'interview-general': 'general',
  'interview-project': 'project',
  'interview-fundamentals': 'fundamentals',
  'interview-mock': 'mock',
  'interview-review': 'review',
}

function interviewDemoAnswer(mode: ChatMode, lastUserText: string): string {
  const text = lastUserText.trim().slice(0, 60)
  const prefix = '> 演示模式：未调用真实模型。配置 API Key 后即可获得针对你回答的实时反馈。\n\n'

  if (mode === 'mock') {
    return `${prefix}好的，我们开始一场 20 分钟左右的模拟面试。\n\n先做一下自我介绍吧：**请用 1–2 分钟介绍你自己，重点讲和你目标岗位最相关的经历。**\n\n> 小提示：回答时尽量包含「我是谁 → 我做过什么 → 和岗位的关系 → 我想做什么」。\n\n（你回答后，我会继续追问项目细节。）`
  }

  if (mode === 'project') {
    return `${prefix}我们从一个具体的项目开始。\n\n你提到的是「${text || '你的项目'}」。请按下面的顺序讲一下：\n\n1. **背景**：这个项目解决谁的什么问题？\n2. **你的职责**：哪些部分是你独立负责的？\n3. **方案**：为什么选这个技术方案？替代方案是什么？\n4. **指标**：效果怎么衡量？数字是多少、怎么测的？\n\n先讲第 1 和第 2 点即可，我会顺着你的回答继续追问。`
  }

  if (mode === 'fundamentals') {
    if (/rag|检索|向量/i.test(lastUserText)) {
      return `${prefix}先问一道 RAG 的题：\n\n**RAG 系统里，召回率和精确率分别衡量什么？如果线上出现「答非所问」，你会先排查哪几个环节？**\n\n可以按「数据 → 切分 → 向量化 → 召回 → 重排 → 生成」的顺序回答。`
    }
    if (/react|hook|前端/i.test(lastUserText)) {
      return `${prefix}先问一道 React 的题：\n\n**useEffect 的依赖数组为空、不写依赖、写依赖，这三种情况分别意味着什么？清理函数在什么时候执行？**\n\n回答时可以结合一个真实的副作用场景（比如订阅、定时器或请求）。`
    }
    return `${prefix}先来一道 AI 应用开发的基础题：\n\n**在做一个 LLM 应用时，你会如何设计评测？请至少说出「数据集、指标、人工评估、线上监控」四个方面中的三个，并说明各自的局限。**\n\n答完后我会继续追问。`
  }

  if (mode === 'review') {
    return `${prefix}把回答贴进来后，我会按这四步帮你复盘：\n\n1. **面试官想听什么**：这道题背后的考察点；\n2. **事实与逻辑**：有没有错误、跳跃或过度承诺；\n3. **结构**：结论是否前置，层次是否清楚；\n4. **更好的版本**：给出一版可以直接口述的回答。\n\n为了方便分析，请补充：目标岗位、面试轮次，以及你当时的完整回答。`
  }

  return `${prefix}我先把你的问题「${text || '这个问题'}」拆成三层来看：\n\n### 1. 先判断问题类型\n面试问题通常分成三类：**经历类**（讲你做过什么）、**知识类**（考概念和原理）、**场景类**（给一个假设情境让你设计）。先判断类型，再决定回答结构。\n\n### 2. 给一个可复用的结构\n- 经历类：背景 → 职责 → 方案 → 结果 → 复盘；\n- 知识类：定义 → 原理 → 例子 → 边界；\n- 场景类：澄清需求 → 给方案 → 讲取舍 → 说验证。\n\n### 3. 接下来怎么练\n选一道你最近被问住的题，用上面的结构写一版 200 字回答，然后发给我，我帮你逐句改。`
}

function generalDemoAnswer(lastUserText: string): string {
  const text = lastUserText.trim().slice(0, 80)
  return `> 演示模式：未调用真实模型。配置 API Key 后，我会针对你的具体背景给出回答。\n\n你提到的是「${text || '这个问题'}」。先给你一个通用的梳理方式：\n\n### 1. 把目标说具体\n你希望最终得到的是**一个决定**、**一份计划**，还是**一段可以直接使用的文字**？目标不同，回答的结构会不一样。\n\n### 2. 拆成可以行动的小步\n- 先列出已知条件和限制；\n- 再列出 2–3 个可选项，比较成本和收益；\n- 最后选一个今天就能开始的动作。\n\n### 3. 如果愿意，可以继续补充\n告诉我你的时间、背景和偏好的节奏，我可以把上面的框架变成更具体的建议。`
}

function customSkillDemoAnswer(skill: Skill, lastUserText: string): string {
  const text = lastUserText.trim().slice(0, 60)
  return `> 演示模式：未调用真实模型。你正在使用自定义技能「${skill.name}」。\n\n我已经收到你的输入：「${text || '（空白）'}」。真实模型接入后，会严格按照这个技能的系统提示词来回答。\n\n演示模式先给你一个通用的处理示例：\n\n1. **确认目标**：这次希望得到结论、计划，还是完整文本？\n2. **补充背景**：有哪些限制、已有材料和截止时间？\n3. **输出初稿**：先给出结构，再逐步细化。\n\n> 去「设置 → AI 助手 · 大模型」关闭演示模式并填写 API Key，就能测试这个技能的真实效果。`
}

function demoSkillAnswer(skill: Skill, lastUserText: string): string {
  const interviewMode = INTERVIEW_MODE_BY_SKILL[skill.id]
  if (interviewMode) return interviewDemoAnswer(interviewMode, lastUserText)
  if (skill.custom) return customSkillDemoAnswer(skill, lastUserText)
  return generalDemoAnswer(lastUserText)
}

async function streamDemo(
  skill: Skill,
  history: ChatTurn[],
  onDelta: (text: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  const lastUser = [...history].reverse().find((turn) => turn.role === 'user')
  const content = demoSkillAnswer(skill, lastUser?.content ?? '')
  for (let i = 0; i < content.length; i += 3) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    onDelta(content.slice(i, i + 3))
    await sleep(16)
  }
}
