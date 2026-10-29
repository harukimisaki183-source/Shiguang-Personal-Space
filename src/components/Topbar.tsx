import { CalendarDays, Moon, Sun } from 'lucide-react'
import { useSettings } from '../contexts/SettingsContext'
import type { PageKey } from '../types'

interface TopbarProps {
  page: PageKey
  onOpenSettings: () => void
}

const TITLES: Record<PageKey, { title: string; subtitle: string }> = {
  blog: { title: '说说', subtitle: '记录今天，也记录成长' },
  chat: { title: '对话', subtitle: '和 AI 一起练习、复盘，也记录今天' },
  settings: { title: '设置', subtitle: '让这个空间更像你' },
}

export function Topbar({ page, onOpenSettings }: TopbarProps) {
  const { settings, updateSettings } = useSettings()
  const isDark = settings.theme === 'dark'
  const dateLabel = new Intl.DateTimeFormat('zh-CN', {
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  }).format(new Date())
  const info = TITLES[page]

  return (
    <header className="topbar">
      <div className="topbar-title">
        <h1>{info.title}</h1>
        <p>{info.subtitle}</p>
      </div>
      <div className="topbar-actions">
        <span className="date-chip">
          <CalendarDays size={15} />
          {dateLabel}
        </span>
        <button
          className="icon-btn"
          onClick={() => updateSettings({ theme: isDark ? 'light' : 'dark' })}
          title={isDark ? '切换到浅色模式' : '切换到深色模式'}
          aria-label={isDark ? '切换到浅色模式' : '切换到深色模式'}
        >
          {isDark ? <Sun size={18} /> : <Moon size={18} />}
        </button>
        <button className="avatar avatar-button" onClick={onOpenSettings} title="打开设置">
          {settings.avatar}
        </button>
      </div>
    </header>
  )
}
