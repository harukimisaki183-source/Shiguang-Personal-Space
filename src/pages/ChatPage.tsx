import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  AlertCircle,
  CalendarPlus,
  ChevronDown,
  Copy,
  Library,
  MessageSquarePlus,
  Plus,
  Send,
  Settings2,
  Sparkles,
  Square,
  Trash2,
} from 'lucide-react'
import { useConfirm } from '../contexts/ConfirmContext'
import { useSettings } from '../contexts/SettingsContext'
import { useToast } from '../contexts/ToastContext'
import {
  addMessage,
  createChat,
  db,
  deleteChat,
  getChatMessages,
  listCustomSkills,
  renameChatFromFirstMessage,
  setChatSkill,
} from '../db'
import { streamChat, type ChatTurn } from '../llm'
import {
  DEFAULT_SKILL_ID,
  listSkills,
  resolveSkill,
} from '../skills'
import type { Chat, ChatMessage, DayCard, Skill } from '../types'
import { copyText, formatChatTime, formatRelativeTime } from '../utils'
import { CardLibrary } from '../components/chat/CardLibrary'
import { CardStudio } from '../components/chat/CardStudio'
import { SkillEditorModal } from '../components/chat/SkillEditorModal'
import { SkillPicker } from '../components/chat/SkillPicker'

interface ChatPageProps {
  onGoSettings: () => void
}

function Markdown({ content }: { content: string }) {
  return (
    <div className="md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ node: _node, ...props }) => (
            <a {...props} target="_blank" rel="noopener noreferrer" />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}

function MessageBubble({
  message,
  avatar,
  onCopy,
}: {
  message: ChatMessage
  avatar: string
  onCopy: (text: string) => void
}) {
  const isUser = message.role === 'user'
  return (
    <div className={`msg-row ${isUser ? 'user' : 'assistant'}`}>
      {!isUser && (
        <span className="msg-avatar assistant-avatar">
          <Sparkles size={16} />
        </span>
      )}
      <div className={`msg-bubble ${message.error ? 'error' : ''}`}>
        <div className="msg-content">
          {isUser ? (
            <p className="user-text">{message.content}</p>
          ) : (
            <Markdown content={message.content} />
          )}
        </div>
        <div className="msg-foot">
          <span>{formatChatTime(message.createdAt)}</span>
          <button className="msg-copy" onClick={() => onCopy(message.content)}>
            <Copy size={12} /> 复制
          </button>
        </div>
      </div>
      {isUser && <span className="msg-avatar user-avatar">{avatar}</span>}
    </div>
  )
}

const FALLBACK_SUGGESTIONS = [
  '先告诉我，你能帮我做什么？',
  '帮我把今天要做的事情排个优先级',
  '我最近有点乱，陪我把思路理清楚',
]

export function ChatPage({ onGoSettings }: ChatPageProps) {
  const { settings } = useSettings()
  const { showToast } = useToast()
  const { confirm } = useConfirm()

  const chats = useLiveQuery(() => db.chats.orderBy('updatedAt').reverse().toArray(), [], []) ?? []
  const customSkills =
    useLiveQuery(() => listCustomSkills(), [], []) ?? []
  const skills = useMemo(() => listSkills(customSkills), [customSkills])

  const [activeId, setActiveId] = useState<string | null>(null)
  const [selectedSkillId, setSelectedSkillId] = useState(DEFAULT_SKILL_ID)
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [streamingText, setStreamingText] = useState('')
  const [streamingChatId, setStreamingChatId] = useState<string | null>(null)
  const [skillPickerOpen, setSkillPickerOpen] = useState(false)
  const [skillEditorOpen, setSkillEditorOpen] = useState(false)
  const [editingSkill, setEditingSkill] = useState<Skill | null>(null)
  const [cardStudio, setCardStudio] = useState<{ card?: DayCard } | null>(null)
  const [cardLibraryOpen, setCardLibraryOpen] = useState(false)

  const messages =
    useLiveQuery(
      () =>
        activeId
          ? db.messages.where('chatId').equals(activeId).sortBy('createdAt')
          : Promise.resolve([] as ChatMessage[]),
      [activeId],
      [],
    ) ?? []

  const activeChat = chats.find((chat) => chat.id === activeId) ?? null
  const activeSkill = useMemo(
    () => resolveSkill(activeChat?.skillId ?? selectedSkillId, customSkills),
    [activeChat?.skillId, customSkills, selectedSkillId],
  )
  const suggestions = activeSkill.suggestions?.length
    ? activeSkill.suggestions
    : FALLBACK_SUGGESTIONS
  const welcomeSkills = useMemo(() => {
    const featured = skills.filter((skill) => skill.featured)
    const custom = skills.filter((skill) => skill.custom).slice(0, 2)
    const merged = [...featured, ...custom]
    return merged.filter(
      (skill, index) => merged.findIndex((item) => item.id === skill.id) === index,
    )
  }, [skills])

  const pendingChatRef = useRef<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  /* 自动选中最近的对话；新建对话时避免被旧数据覆盖 */
  useEffect(() => {
    if (pendingChatRef.current) {
      if (chats.some((chat) => chat.id === pendingChatRef.current)) {
        pendingChatRef.current = null
      } else {
        return
      }
    }
    if (chats.length === 0) {
      if (activeId) setActiveId(null)
      return
    }
    if (!activeId || !chats.some((chat) => chat.id === activeId)) {
      setActiveId(chats[0].id)
    }
  }, [chats, activeId])

  useEffect(() => {
    if (activeChat) setSelectedSkillId(activeChat.skillId)
  }, [activeChat?.id, activeChat?.skillId])

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages.length, streamingText, activeId, streaming])

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 150)}px`
  }, [input])

  useEffect(() => {
    return () => {
      abortRef.current?.abort()
    }
  }, [])

  async function changeSkill(skill: Skill) {
    setSkillPickerOpen(false)
    if (skill.kind === 'card') {
      setCardStudio({})
      return
    }
    setSelectedSkillId(skill.id)
    if (activeChat) {
      try {
        await setChatSkill(activeChat.id, skill.id)
      } catch {
        showToast('切换技能失败，请稍后再试', 'error')
      }
    }
    window.setTimeout(() => textareaRef.current?.focus(), 80)
  }

  function selectChat(id: string) {
    if (id === activeId) return
    if (streaming) abortRef.current?.abort()
    setActiveId(id)
  }

  async function newChat() {
    if (streaming) abortRef.current?.abort()
    try {
      const chat = await createChat(activeSkill.kind === 'chat' ? activeSkill.id : DEFAULT_SKILL_ID)
      pendingChatRef.current = chat.id
      setActiveId(chat.id)
      setInput('')
      textareaRef.current?.focus()
    } catch {
      showToast('创建对话失败，请稍后再试', 'error')
    }
  }

  async function removeChat(chat: Chat) {
    const ok = await confirm({
      title: '删除这个对话？',
      message: `「${chat.title}」中的所有消息都会被删除，无法恢复。`,
      confirmText: '删除',
      danger: true,
    })
    if (!ok) return
    if (streaming && streamingChatId === chat.id) abortRef.current?.abort()
    try {
      await deleteChat(chat.id)
      if (activeId === chat.id) setActiveId(null)
      showToast('对话已删除', 'success')
    } catch {
      showToast('删除失败，请稍后再试', 'error')
    }
  }

  async function send(explicit?: string) {
    const text = (explicit ?? input).trim()
    if (!text || streaming) return
    if (activeSkill.kind !== 'chat') {
      setCardStudio({})
      return
    }

    let chatId = activeId
    try {
      if (!chatId) {
        const chat = await createChat(activeSkill.id)
        pendingChatRef.current = chat.id
        setActiveId(chat.id)
        chatId = chat.id
        setSelectedSkillId(activeSkill.id)
      }

      setInput('')
      await addMessage(chatId, 'user', text)
      await renameChatFromFirstMessage(chatId, text)

      const history = await getChatMessages(chatId)
      const turns: ChatTurn[] = history
        .filter((message) => !message.error && message.content.trim())
        .map((message) => ({ role: message.role, content: message.content }))

      const controller = new AbortController()
      abortRef.current = controller
      setStreaming(true)
      setStreamingText('')
      setStreamingChatId(chatId)

      let accumulated = ''
      try {
        await streamChat({
          settings,
          skill: activeSkill,
          history: turns,
          signal: controller.signal,
          onDelta: (delta) => {
            accumulated += delta
            setStreamingText((prev) => prev + delta)
          },
        })
        if (!accumulated.trim()) throw new Error('模型没有返回内容')
        await addMessage(chatId, 'assistant', accumulated)
      } catch (error) {
        if (controller.signal.aborted) {
          if (accumulated.trim()) await addMessage(chatId, 'assistant', accumulated)
        } else {
          const detail = error instanceof Error ? error.message : '请求失败'
          await addMessage(chatId, 'assistant', `请求失败：${detail}`, true)
          showToast('生成失败，详情见对话', 'error')
        }
      } finally {
        setStreaming(false)
        setStreamingText('')
        setStreamingChatId(null)
        abortRef.current = null
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : '发送失败，请稍后再试', 'error')
    }
  }

  function stop() {
    abortRef.current?.abort()
  }

  async function copyMessage(text: string) {
    const ok = await copyText(text)
    showToast(ok ? '已复制' : '复制失败，请手动选择文本', ok ? 'success' : 'error')
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void send()
    }
  }

  function openSkillEditor(skill: Skill | null) {
    setSkillPickerOpen(false)
    setEditingSkill(skill)
    setSkillEditorOpen(true)
  }

  function handleSkillSaved(skill: Skill) {
    setSkillEditorOpen(false)
    setEditingSkill(null)
    void changeSkill(skill)
  }

  function openCardStudio(card?: DayCard) {
    setCardLibraryOpen(false)
    setSkillPickerOpen(false)
    setCardStudio({ card })
  }

  function openCardLibrary() {
    setCardStudio(null)
    setCardLibraryOpen(true)
  }

  const noKey = !settings.demoMode && !settings.apiKey.trim()
  const showEmptyChat =
    activeChat && messages.length === 0 && !(streaming && streamingChatId === activeId)
  const modelLabel = settings.demoMode ? '演示模式' : settings.model || '未配置模型'

  return (
    <>
      <div className="assistant-layout">
        <aside className="chat-list-panel card">
          <div className="chat-list-head">
            <div>
              <strong>对话</strong>
              <span>{chats.length}</span>
            </div>
            <button className="icon-btn" onClick={() => void newChat()} title="新对话" aria-label="新对话">
              <Plus size={18} />
            </button>
          </div>
          <div className="chat-list">
            {chats.length === 0 ? (
              <div className="chat-list-empty">
                <MessageSquarePlus size={20} />
                <span>还没有对话</span>
              </div>
            ) : (
              chats.map((chat) => {
                const skill = resolveSkill(chat.skillId, customSkills)
                return (
                  <div
                    key={chat.id}
                    className={`chat-list-item ${chat.id === activeId ? 'active' : ''}`}
                  >
                    <button className="chat-select" onClick={() => selectChat(chat.id)}>
                      <span className="chat-item-title">{chat.title}</span>
                      <span className="chat-item-meta">
                        <em>
                          {skill.icon} {skill.name}
                        </em>
                        <span>{formatRelativeTime(chat.updatedAt)}</span>
                      </span>
                    </button>
                    <button
                      className="chat-delete"
                      onClick={() => void removeChat(chat)}
                      title="删除对话"
                      aria-label="删除对话"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )
              })
            )}
          </div>
          <div className="chat-side-tools">
            <button onClick={() => setSkillPickerOpen(true)}>
              <Sparkles size={14} /> 技能库
            </button>
            <button onClick={() => openCardStudio()}>
              <CalendarPlus size={14} /> 每日卡片
            </button>
            <button onClick={openCardLibrary}>
              <Library size={14} /> 卡片库
            </button>
          </div>
          <div className="chat-list-foot">
            <Sparkles size={14} />
            {modelLabel}
          </div>
        </aside>

        <section className="chat-main card">
          <header className="chat-head">
            <div className="chat-head-title">
              <span className="chat-mode-icon chat-skill-icon">{activeSkill.icon}</span>
              <div>
                <strong>{activeChat?.title ?? '新的对话'}</strong>
                <span>
                  {activeSkill.name} · {modelLabel}
                </span>
              </div>
            </div>
            <div className="chat-head-actions">
              <button
                className="chat-skill-trigger"
                onClick={() => setSkillPickerOpen(true)}
                title="切换技能"
              >
                <Sparkles size={14} />
                <span>{activeSkill.name}</span>
                <ChevronDown size={13} />
              </button>
              <button
                className="icon-btn"
                onClick={() => openCardStudio()}
                title="每日卡片"
                aria-label="每日卡片"
              >
                <CalendarPlus size={17} />
              </button>
              {activeChat && (
                <button
                  className="icon-btn danger-hover"
                  onClick={() => void removeChat(activeChat)}
                  title="删除当前对话"
                  aria-label="删除当前对话"
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          </header>

          <div className="chat-messages" ref={scrollRef}>
            {!activeChat ? (
              <div className="chat-welcome">
                <div className="welcome-icon">
                  <Sparkles size={25} />
                </div>
                <h2>今天想聊点什么？</h2>
                <p>
                  对话是一个小型的 AI 工作台。选一个技能开始，也可以把自己的常用提示词做成专属技能。
                </p>
                <div className="welcome-skill-grid">
                  {welcomeSkills.map((skill) => (
                    <button
                      key={skill.id}
                      className={`welcome-skill-card ${
                        activeSkill.id === skill.id ? 'active' : ''
                      }`}
                      onClick={() => void changeSkill(skill)}
                    >
                      <span className="welcome-skill-icon">{skill.icon}</span>
                      <span>
                        <strong>
                          {skill.name}
                          {skill.kind === 'card' && <em>卡片</em>}
                        </strong>
                        <small>{skill.description}</small>
                      </span>
                    </button>
                  ))}
                  <button className="welcome-skill-card add" onClick={() => openSkillEditor(null)}>
                    <span className="welcome-skill-icon">
                      <Plus size={18} />
                    </span>
                    <span>
                      <strong>添加自定义技能</strong>
                      <small>用一段提示词，做一个只属于你的助手</small>
                    </span>
                  </button>
                </div>
                <div className="welcome-actions">
                  <button className="link-btn" onClick={() => setSkillPickerOpen(true)}>
                    查看全部技能
                  </button>
                  <button className="link-btn" onClick={openCardLibrary}>
                    <Library size={13} /> 卡片库
                  </button>
                </div>
                <div className="suggestion-list">
                  {suggestions.map((text) => (
                    <button
                      key={text}
                      className="suggestion-chip"
                      onClick={() => void send(text)}
                    >
                      {text}
                    </button>
                  ))}
                </div>
              </div>
            ) : showEmptyChat ? (
              <div className="chat-welcome compact">
                <div className="welcome-icon">{activeSkill.icon}</div>
                <h2>{activeSkill.name}</h2>
                <p>{activeSkill.description}</p>
                <div className="suggestion-list">
                  {suggestions.map((text) => (
                    <button
                      key={text}
                      className="suggestion-chip"
                      onClick={() => void send(text)}
                    >
                      {text}
                    </button>
                  ))}
                </div>
                <div className="welcome-actions">
                  <button className="link-btn" onClick={() => setSkillPickerOpen(true)}>
                    切换技能
                  </button>
                </div>
              </div>
            ) : (
              messages.map((message) => (
                <MessageBubble
                  key={message.id}
                  message={message}
                  avatar={settings.avatar}
                  onCopy={(text) => void copyMessage(text)}
                />
              ))
            )}

            {streaming && streamingChatId === activeId && (
              <div className="msg-row assistant">
                <span className="msg-avatar assistant-avatar">
                  <Sparkles size={16} />
                </span>
                <div className="msg-bubble streaming">
                  {streamingText ? (
                    <>
                      <Markdown content={streamingText} />
                      <span className="stream-cursor" />
                    </>
                  ) : (
                    <span className="typing" aria-label="正在思考">
                      <i />
                      <i />
                      <i />
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          {noKey && (
            <div className="chat-banner">
              <AlertCircle size={16} />
              <span>还没有配置 API Key，发送请求会失败。</span>
              <button className="link-btn" onClick={onGoSettings}>
                <Settings2 size={13} /> 去设置
              </button>
            </div>
          )}

          <div className="chat-composer">
            <textarea
              ref={textareaRef}
              className="chat-input"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                settings.demoMode
                  ? `和「${activeSkill.name}」聊聊，演示模式会给出示例回答…`
                  : `和「${activeSkill.name}」聊聊，Enter 发送…`
              }
              rows={1}
            />
            <div className="chat-composer-foot">
              <div className="composer-left">
                <button className="composer-skill" onClick={() => setSkillPickerOpen(true)}>
                  <Sparkles size={13} />
                  {activeSkill.name}
                  <ChevronDown size={12} />
                </button>
                <span className="composer-hint">
                  {settings.demoMode ? '演示模式 · 不消耗 API' : 'Enter 发送 · Shift + Enter 换行'}
                </span>
              </div>
              {streaming ? (
                <button className="btn btn-danger btn-sm" onClick={stop}>
                  <Square size={13} /> 停止
                </button>
              ) : (
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => void send()}
                  disabled={!input.trim()}
                >
                  <Send size={14} /> 发送
                </button>
              )}
            </div>
          </div>
        </section>
      </div>

      <SkillPicker
        open={skillPickerOpen}
        skills={skills}
        currentSkillId={activeSkill.id}
        onClose={() => setSkillPickerOpen(false)}
        onSelect={(skill) => void changeSkill(skill)}
        onCreate={() => openSkillEditor(null)}
        onEdit={(skill) => openSkillEditor(skill)}
      />

      <SkillEditorModal
        open={skillEditorOpen}
        skill={editingSkill}
        onClose={() => {
          setSkillEditorOpen(false)
          setEditingSkill(null)
        }}
        onSaved={handleSkillSaved}
      />

      <CardStudio
        open={!!cardStudio}
        initialCard={cardStudio?.card ?? null}
        owner={settings.nickname}
        onClose={() => setCardStudio(null)}
        onOpenLibrary={openCardLibrary}
        onSaved={() => {
          // 卡片保存后，卡片库会通过 liveQuery 自动刷新
        }}
      />

      <CardLibrary
        open={cardLibraryOpen}
        owner={settings.nickname}
        onClose={() => setCardLibraryOpen(false)}
        onCreate={() => openCardStudio()}
        onEdit={(card) => openCardStudio(card)}
      />
    </>
  )
}
