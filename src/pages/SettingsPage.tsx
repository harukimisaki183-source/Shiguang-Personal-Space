import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  Bot,
  CalendarDays,
  Check,
  Database,
  Download,
  Eye,
  EyeOff,
  HardDrive,
  ImagePlus,
  Info,
  KeyRound,
  Loader2,
  Moon,
  Music2,
  NotebookPen,
  Palette,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  ShieldCheck,
  Sparkles,
  Sun,
  Trash2,
  Upload,
  User,
  X,
} from 'lucide-react'
import { APP_VERSION } from '../changelog'
import { exportBackup, restoreBackup } from '../backup'
import { Avatar, isImageAvatar } from '../components/Avatar'
import { Modal } from '../components/Modal'
import { useConfirm } from '../contexts/ConfirmContext'
import { useSettings } from '../contexts/SettingsContext'
import { useToast } from '../contexts/ToastContext'
import { clearAllContent, getContentCounts, getStorageStats } from '../db'
import { testConnection } from '../llm'
import { DEFAULT_SETTINGS, normalizeCustomProviders } from '../storage'
import type { Settings } from '../types'
import { createAvatarDataUrl, formatBytes, uid } from '../utils'

interface SettingsPageProps {
  onShowUpdateLog: () => void
}

const AVATARS = ['🌿', '🌊', '🍀', '☀️', '🌙', '🐱', '🐼', '🦊', '🎧', '💻', '📚', '✨', '🍊', '🌻', '🪐', '🫧']

const PROVIDERS = [
  {
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
  },
  {
    name: '通义千问',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen-plus',
  },
  {
    name: '智谱 GLM',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    model: 'glm-4-flash',
  },
  {
    name: 'Kimi',
    baseUrl: 'https://api.moonshot.cn/v1',
    model: 'moonshot-v1-8k',
  },
]

export function SettingsPage({ onShowUpdateLog }: SettingsPageProps) {
  const { settings, updateSettings, resetSettings } = useSettings()
  const { showToast } = useToast()
  const { confirm } = useConfirm()
  const [form, setForm] = useState<Settings>(settings)
  const [showKey, setShowKey] = useState(false)
  const [testing, setTesting] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [importing, setImporting] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [storage, setStorage] = useState({ usage: 0, quota: 0 })
  const [avatarUploading, setAvatarUploading] = useState(false)
  const [providerModalOpen, setProviderModalOpen] = useState(false)
  const [providerForm, setProviderForm] = useState({ name: '', baseUrl: '', model: '' })
  const importInputRef = useRef<HTMLInputElement>(null)
  const avatarInputRef = useRef<HTMLInputElement>(null)

  const emptyCounts = {
    notes: 0,
    media: 0,
    chats: 0,
    messages: 0,
    tracks: 0,
    cards: 0,
    skills: 0,
  }
  const counts = useLiveQuery(() => getContentCounts(), [], emptyCounts) ?? emptyCounts

  useEffect(() => {
    let alive = true
    void getStorageStats().then((result) => {
      if (alive) setStorage(result)
    })
    return () => {
      alive = false
    }
  }, [counts.notes, counts.media, counts.tracks, counts.cards])

  const dirty = (Object.keys(form) as (keyof Settings)[]).some(
    (key) => form[key] !== settings[key],
  )

  function patch(partial: Partial<Settings>) {
    setForm((prev) => ({ ...prev, ...partial }))
  }

  function chooseTheme(theme: 'light' | 'dark') {
    patch({ theme })
    updateSettings({ theme })
  }

  async function handleAvatarFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setAvatarUploading(true)
    try {
      const dataUrl = await createAvatarDataUrl(file)
      patch({ avatar: dataUrl })
      showToast('头像已更新，记得保存设置', 'success')
    } catch (error) {
      showToast(error instanceof Error ? error.message : '头像处理失败', 'error')
    } finally {
      setAvatarUploading(false)
    }
  }

  function guessProviderName(baseUrl: string): string {
    try {
      return new URL(baseUrl).hostname.replace(/^api\./, '') || '自定义服务'
    } catch {
      return '自定义服务'
    }
  }

  function openProviderModal() {
    setProviderForm({
      name: guessProviderName(form.baseUrl),
      baseUrl: form.baseUrl,
      model: form.model,
    })
    setProviderModalOpen(true)
  }

  function addProvider() {
    const baseUrl = providerForm.baseUrl.trim().replace(/\/+$/, '')
    const model = providerForm.model.trim()
    const name = (providerForm.name.trim() || guessProviderName(baseUrl)).slice(0, 24)
    if (!/^https?:\/\//i.test(baseUrl)) {
      showToast('API Base URL 需要以 http:// 或 https:// 开头', 'error')
      return
    }
    if (!model) {
      showToast('请填写模型名', 'error')
      return
    }
    const exists = [...PROVIDERS, ...form.customProviders].find(
      (provider) => provider.baseUrl.replace(/\/+$/, '') === baseUrl && provider.model === model,
    )
    if (exists) {
      patch({ baseUrl, model })
      setProviderModalOpen(false)
      showToast(`已填入现有的「${exists.name}」`, 'success')
      return
    }
    if (form.customProviders.length >= 12) {
      showToast('快速填入最多保存 12 个自定义地址', 'error')
      return
    }
    const provider = { id: uid(), name, baseUrl, model }
    const customProviders = [...form.customProviders, provider]
    patch({ customProviders, baseUrl, model })
    updateSettings({ customProviders, baseUrl, model })
    setProviderModalOpen(false)
    showToast(`已加入快速填入：${name}`, 'success')
  }

  function removeProvider(providerId: string, name: string) {
    const customProviders = form.customProviders.filter((provider) => provider.id !== providerId)
    patch({ customProviders })
    updateSettings({ customProviders })
    showToast(`已移除快速填入「${name}」`, 'success')
  }

  function save() {
    updateSettings(form)
    showToast('设置已保存', 'success')
  }

  function undo() {
    setForm(settings)
  }

  async function test() {
    setTesting(true)
    try {
      const result = await testConnection(form)
      showToast(`连接成功：${result}`, 'success')
    } catch (error) {
      showToast(error instanceof Error ? error.message : '连接失败', 'error')
    } finally {
      setTesting(false)
    }
  }

  async function handleExport() {
    setExporting(true)
    try {
      const result = await exportBackup(settings)
      showToast(
        `已导出 ${result.counts.notes} 条记录、${result.counts.cards} 张卡片、${result.counts.tracks} 首音乐（${formatBytes(result.blob.size)}）`,
        'success',
      )
    } catch (error) {
      showToast(error instanceof Error ? error.message : '导出失败', 'error')
    } finally {
      setExporting(false)
    }
  }

  async function handleImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    const ok = await confirm({
      title: '导入备份并覆盖当前内容？',
      message: '当前的记录、对话、卡片、自定义技能和音乐会被备份文件中的内容替换。设置里的 API Key 会保留。',
      confirmText: '覆盖并导入',
      danger: true,
    })
    if (!ok) return
    setImporting(true)
    try {
      const result = await restoreBackup(file)
      if (result.settings) {
        const merged = {
          ...form,
          ...result.settings,
          apiKey: form.apiKey,
          customProviders:
            result.settings.customProviders !== undefined
              ? normalizeCustomProviders(result.settings.customProviders)
              : form.customProviders,
        }
        setForm(merged)
        updateSettings(merged)
      }
      showToast(
        `恢复完成：${result.counts.notes} 条记录、${result.counts.chats} 个对话、${result.counts.cards} 张卡片、${result.counts.tracks} 首音乐`,
        'success',
      )
    } catch (error) {
      showToast(error instanceof Error ? error.message : '导入失败', 'error')
    } finally {
      setImporting(false)
    }
  }

  async function handleClear() {
    const ok = await confirm({
      title: '清空所有内容？',
      message: '所有说说、图片、视频、对话、卡片、自定义技能和音乐都会从本机删除，设置会保留。建议先导出备份。',
      confirmText: '全部清空',
      danger: true,
    })
    if (!ok) return
    setClearing(true)
    try {
      await clearAllContent()
      showToast('所有内容已清空', 'success')
    } catch {
      showToast('清空失败，请稍后再试', 'error')
    } finally {
      setClearing(false)
    }
  }

  async function handleResetSettings() {
    const ok = await confirm({
      title: '恢复默认设置？',
      message: '昵称、头像、模型配置和主题都会恢复默认值，你的记录和对话不会受影响。',
      confirmText: '恢复默认',
      danger: true,
    })
    if (!ok) return
    resetSettings()
    setForm({ ...DEFAULT_SETTINGS })
    showToast('已恢复默认设置', 'success')
  }

  const usagePercent =
    storage.quota > 0 ? Math.min(100, (storage.usage / storage.quota) * 100) : 0

  return (
    <div className="settings-page">
      <div className="settings-layout">
        <div className="settings-main">
          <section className="settings-card card">
            <div className="settings-head">
              <span className="settings-icon">
                <User size={18} />
              </span>
              <div>
                <h2>个人资料</h2>
                <p>这些信息只用于界面展示，不会上传。</p>
              </div>
            </div>

            <div className="avatar-picker">
              <Avatar value={form.avatar} className="avatar-xl" />
              <div className="avatar-picker-main">
                <span className="field-label">选择头像</span>
                <div className="avatar-options">
                  {AVATARS.map((item) => (
                    <button
                      key={item}
                      className={`avatar-option ${
                        form.avatar === item && !isImageAvatar(form.avatar) ? 'active' : ''
                      }`}
                      onClick={() => patch({ avatar: item })}
                      aria-label={`选择头像 ${item}`}
                    >
                      {item}
                    </button>
                  ))}
                </div>
                <div className="avatar-upload-row">
                  <button
                    className="btn btn-subtle btn-sm"
                    onClick={() => avatarInputRef.current?.click()}
                    disabled={avatarUploading}
                  >
                    {avatarUploading ? (
                      <Loader2 size={14} className="spin" />
                    ) : (
                      <ImagePlus size={14} />
                    )}
                    {avatarUploading ? '处理中…' : '上传本地图片'}
                  </button>
                  {isImageAvatar(form.avatar) && (
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => patch({ avatar: DEFAULT_SETTINGS.avatar })}
                    >
                      <RotateCcw size={14} /> 恢复 emoji
                    </button>
                  )}
                  <span className="field-hint">自动裁成正方形，保存后会立即显示。</span>
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={(event) => void handleAvatarFile(event)}
                  />
                </div>
              </div>
            </div>

            <div className="form-grid">
              <label className="field">
                <span>昵称</span>
                <input
                  className="input"
                  value={form.nickname}
                  maxLength={20}
                  onChange={(event) => patch({ nickname: event.target.value })}
                  placeholder="怎么称呼你？"
                />
              </label>
              <label className="field">
                <span>一句话介绍</span>
                <input
                  className="input"
                  value={form.bio}
                  maxLength={60}
                  onChange={(event) => patch({ bio: event.target.value })}
                  placeholder="记录每一天，也记录成长。"
                />
              </label>
            </div>
          </section>

          <section className="settings-card card">
            <div className="settings-head">
              <span className="settings-icon">
                <Bot size={18} />
              </span>
              <div>
                <h2>AI 助手 · 大模型</h2>
                <p>对话与面试技能共用同一套配置，支持 OpenAI 兼容接口。</p>
              </div>
            </div>

            <div className="switch-row">
              <div>
                <strong>演示模式</strong>
                <span>不调用真实模型，返回内置示例回答，适合先体验技能和对话流程。</span>
              </div>
              <button
                className={`switch ${form.demoMode ? 'on' : ''}`}
                role="switch"
                aria-checked={form.demoMode}
                onClick={() => patch({ demoMode: !form.demoMode })}
                aria-label="切换演示模式"
              >
                <span />
              </button>
            </div>

            <div className="provider-row">
              <span className="field-label">快速填入</span>
              <div className="provider-chips">
                {PROVIDERS.map((provider) => (
                  <button
                    key={provider.name}
                    className={`chip chip-sm ${
                      form.baseUrl === provider.baseUrl && form.model === provider.model
                        ? 'active'
                        : ''
                    }`}
                    onClick={() => patch({ baseUrl: provider.baseUrl, model: provider.model })}
                  >
                    {provider.name}
                  </button>
                ))}
                {form.customProviders.map((provider) => {
                  const active =
                    form.baseUrl.replace(/\/+$/, '') === provider.baseUrl.replace(/\/+$/, '') &&
                    form.model === provider.model
                  return (
                    <span className="provider-chip-wrap" key={provider.id}>
                      <button
                        className={`chip chip-sm custom-provider ${active ? 'active' : ''}`}
                        onClick={() => patch({ baseUrl: provider.baseUrl, model: provider.model })}
                        title={`${provider.baseUrl} · ${provider.model}`}
                      >
                        {provider.name}
                      </button>
                      <button
                        className="provider-chip-remove"
                        onClick={() => removeProvider(provider.id, provider.name)}
                        title="从快速填入中移除"
                        aria-label={`移除快速填入 ${provider.name}`}
                      >
                        <X size={10} />
                      </button>
                    </span>
                  )
                })}
                <button
                  className="chip chip-sm provider-add"
                  onClick={openProviderModal}
                  title="添加自定义 API 地址"
                >
                  <Plus size={12} /> 自定义
                </button>
              </div>
              <span className="field-hint provider-hint">
                自定义地址会随设置保存，也会写进备份；接口需要兼容 OpenAI Chat Completions 格式。
              </span>
            </div>

            <div className="form-grid">
              <label className="field">
                <span>API Base URL</span>
                <input
                  className="input"
                  value={form.baseUrl}
                  onChange={(event) => patch({ baseUrl: event.target.value })}
                  placeholder="https://api.deepseek.com/v1"
                  spellCheck={false}
                />
              </label>
              <label className="field">
                <span>模型名</span>
                <input
                  className="input"
                  value={form.model}
                  onChange={(event) => patch({ model: event.target.value })}
                  placeholder="deepseek-chat"
                  spellCheck={false}
                />
              </label>
            </div>

            <label className="field">
              <span>API Key</span>
              <div className="input-with-action">
                <KeyRound size={15} className="input-icon" />
                <input
                  className="input input-with-icon"
                  type={showKey ? 'text' : 'password'}
                  value={form.apiKey}
                  onChange={(event) => patch({ apiKey: event.target.value })}
                  placeholder="sk-..."
                  autoComplete="off"
                  spellCheck={false}
                />
                <button
                  className="input-action"
                  onClick={() => setShowKey((prev) => !prev)}
                  aria-label={showKey ? '隐藏 API Key' : '显示 API Key'}
                >
                  {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <span className="field-hint">
                Web 原型会保存在浏览器 localStorage。打包桌面版后会改为系统加密存储。
              </span>
            </label>

            <div className="field">
              <span>温度（temperature）</span>
              <div className="temperature-row">
                <input
                  type="range"
                  min={0}
                  max={1.5}
                  step={0.1}
                  value={form.temperature}
                  onChange={(event) => patch({ temperature: Number(event.target.value) })}
                  style={
                    {
                      '--range-progress': `${(form.temperature / 1.5) * 100}%`,
                    } as React.CSSProperties
                  }
                />
                <strong>{form.temperature.toFixed(1)}</strong>
              </div>
              <span className="field-hint">越高越发散，对话与面试练习建议 0.6–0.8。</span>
            </div>

            <div className="settings-actions">
              <button className="btn btn-subtle" onClick={() => void test()} disabled={testing}>
                {testing ? <Loader2 size={16} className="spin" /> : <RefreshCw size={16} />}
                {testing ? '测试中…' : '测试连接'}
              </button>
              <span className="muted">
                {form.demoMode
                  ? '演示模式已开启，无需连接。'
                  : '浏览器直连接口可能受 CORS 限制，桌面版会由主进程代理。'}
              </span>
            </div>
          </section>

          <section className="settings-card card">
            <div className="settings-head">
              <span className="settings-icon">
                <Palette size={18} />
              </span>
              <div>
                <h2>外观</h2>
                <p>主题会立即生效。</p>
              </div>
            </div>
            <div className="theme-options">
              <button
                className={`theme-card ${form.theme === 'light' ? 'active' : ''}`}
                onClick={() => chooseTheme('light')}
              >
                <span className="theme-preview light">
                  <i />
                  <i />
                  <i />
                </span>
                <span>
                  <Sun size={15} /> 浅色模式
                </span>
                {form.theme === 'light' && <Check size={16} className="theme-check" />}
              </button>
              <button
                className={`theme-card ${form.theme === 'dark' ? 'active' : ''}`}
                onClick={() => chooseTheme('dark')}
              >
                <span className="theme-preview dark">
                  <i />
                  <i />
                  <i />
                </span>
                <span>
                  <Moon size={15} /> 深色模式
                </span>
                {form.theme === 'dark' && <Check size={16} className="theme-check" />}
              </button>
            </div>
          </section>

          <section className="settings-card card">
            <div className="settings-head">
              <span className="settings-icon">
                <Database size={18} />
              </span>
              <div>
                <h2>数据管理</h2>
                <p>记录、对话、卡片和音乐都保存在浏览器 IndexedDB，可整体备份。</p>
              </div>
            </div>

            <div className="data-stats">
              <div>
                <NotebookPen size={15} />
                <strong>{counts.notes}</strong>
                <span>条记录</span>
              </div>
              <div>
                <Music2 size={15} />
                <strong>{counts.tracks}</strong>
                <span>首音乐</span>
              </div>
              <div>
                <Bot size={15} />
                <strong>{counts.chats}</strong>
                <span>个对话</span>
              </div>
              <div>
                <CalendarDays size={15} />
                <strong>{counts.cards}</strong>
                <span>张卡片</span>
              </div>
              <div>
                <HardDrive size={15} />
                <strong>{formatBytes(storage.usage)}</strong>
                <span>已占用</span>
              </div>
            </div>

            {storage.quota > 0 && (
              <div className="storage-meter">
                <div className="storage-meter-head">
                  <span>浏览器存储</span>
                  <span>
                    {formatBytes(storage.usage)} / {formatBytes(storage.quota)}
                  </span>
                </div>
                <div className="storage-track">
                  <i style={{ width: `${Math.max(1, usagePercent)}%` }} />
                </div>
              </div>
            )}

            <div className="data-actions">
              <button className="btn btn-subtle" onClick={() => void handleExport()} disabled={exporting}>
                {exporting ? <Loader2 size={16} className="spin" /> : <Download size={16} />}
                {exporting ? '导出中…' : '导出备份'}
              </button>
              <button
                className="btn btn-subtle"
                onClick={() => importInputRef.current?.click()}
                disabled={importing}
              >
                {importing ? <Loader2 size={16} className="spin" /> : <Upload size={16} />}
                {importing ? '恢复中…' : '导入备份'}
              </button>
              <input
                ref={importInputRef}
                type="file"
                accept=".json,application/json"
                hidden
                onChange={(event) => void handleImport(event)}
              />
              <button className="btn btn-danger-ghost" onClick={() => void handleClear()} disabled={clearing}>
                {clearing ? <Loader2 size={16} className="spin" /> : <Trash2 size={16} />}
                {clearing ? '清空中…' : '清空所有内容'}
              </button>
            </div>
            <p className="field-hint">
              备份文件不包含 API Key。媒体文件会以 Base64 写入 JSON，数据较多时文件会比较大。
            </p>
          </section>

          <section className="settings-card card">
            <div className="settings-head">
              <span className="settings-icon">
                <Info size={18} />
              </span>
              <div>
                <h2>关于拾光</h2>
                <p>Web 原型 · 版本 v{APP_VERSION}</p>
              </div>
            </div>
            <div className="about-row">
              <div>
                <strong>拾光 · 个人空间</strong>
                <span>记录、AI 对话、每日卡片与音乐的一体化空间。桌面版正在规划中。</span>
              </div>
              <div className="about-actions">
                <button className="btn btn-subtle btn-sm" onClick={onShowUpdateLog}>
                  <Sparkles size={15} /> 更新日志
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => void handleResetSettings()}>
                  <RotateCcw size={15} /> 恢复默认设置
                </button>
              </div>
            </div>
          </section>
        </div>

        <aside className="settings-side">
          <div className="settings-card card profile-preview">
            <Avatar value={form.avatar} className="avatar-xxl" />
            <strong>{form.nickname || '小拾'}</strong>
            <p>{form.bio || '记录每一天，也记录成长。'}</p>
            <span className="local-badge">
              <ShieldCheck size={13} /> 本地空间
            </span>
            <div className="profile-stats">
              <div>
                <strong>{counts.notes}</strong>
                <span>记录</span>
              </div>
              <div>
                <strong>{counts.chats}</strong>
                <span>对话</span>
              </div>
              <div>
                <strong>{counts.tracks}</strong>
                <span>音乐</span>
              </div>
            </div>
          </div>

          <div className="settings-card card tips-card">
            <h3>
              <ShieldCheck size={16} /> 数据小贴士
            </h3>
            <ul>
              <li>说说、图片、视频、对话、卡片、自定义技能和音乐都只保存在当前浏览器。</li>
              <li>清理浏览器数据、换浏览器或重装系统会丢失内容，请定期导出备份。</li>
              <li>Web 版只是原型；桌面版会把数据放进应用目录，并支持托盘后台播放。</li>
              <li>API Key 不会写入备份文件。</li>
            </ul>
          </div>
        </aside>
      </div>

      <Modal
        open={providerModalOpen}
        onClose={() => setProviderModalOpen(false)}
        title="自定义快速填入"
        size="sm"
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setProviderModalOpen(false)}>
              取消
            </button>
            <button className="btn btn-primary" onClick={addProvider}>
              <Plus size={15} /> 添加并填入
            </button>
          </>
        }
      >
        <div className="provider-modal">
          <p>
            保存一个兼容 OpenAI Chat Completions 协议的 API 服务，下次可以直接从「快速填入」切换。
          </p>
          <label className="field">
            <span>显示名称</span>
            <input
              className="input"
              value={providerForm.name}
              maxLength={24}
              onChange={(event) =>
                setProviderForm((prev) => ({ ...prev, name: event.target.value }))
              }
              placeholder="例如：公司内网网关"
              autoFocus
            />
          </label>
          <label className="field">
            <span>API Base URL</span>
            <input
              className="input"
              value={providerForm.baseUrl}
              onChange={(event) =>
                setProviderForm((prev) => ({ ...prev, baseUrl: event.target.value }))
              }
              placeholder="https://api.example.com/v1"
              spellCheck={false}
            />
          </label>
          <label className="field">
            <span>模型名</span>
            <input
              className="input"
              value={providerForm.model}
              onChange={(event) =>
                setProviderForm((prev) => ({ ...prev, model: event.target.value }))
              }
              placeholder="qwen-plus"
              spellCheck={false}
            />
          </label>
          <span className="field-hint">
            名称和地址只保存在本机。API Key 仍然是当前这一套配置，不会写入备份。
          </span>
        </div>
      </Modal>

      {dirty && (
        <div className="save-bar">
          <span>
            <Save size={15} /> 有未保存的修改
          </span>
          <div>
            <button className="btn btn-ghost btn-sm" onClick={undo}>
              撤销
            </button>
            <button className="btn btn-primary btn-sm" onClick={save}>
              保存设置
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
