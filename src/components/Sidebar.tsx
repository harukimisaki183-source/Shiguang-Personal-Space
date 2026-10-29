import {
  ChevronRight,
  History,
  LockKeyhole,
  MessageSquare,
  Moon,
  NotebookPen,
  Settings2,
  Sun,
} from 'lucide-react'
import { APP_VERSION } from '../changelog'
import { useSettings } from '../contexts/SettingsContext'
import type { PageKey } from '../types'
import { Avatar } from './Avatar'

interface SidebarProps {
  page: PageKey
  onNavigate: (page: PageKey) => void
  onShowUpdateLog: () => void
}

const NAV_ITEMS: { key: PageKey; label: string; icon: typeof NotebookPen }[] = [
  { key: 'blog', label: '说说', icon: NotebookPen },
  { key: 'chat', label: '对话', icon: MessageSquare },
  { key: 'settings', label: '设置', icon: Settings2 },
]

export function Sidebar({ page, onNavigate, onShowUpdateLog }: SidebarProps) {
  const { settings, updateSettings } = useSettings()
  const isDark = settings.theme === 'dark'

  return (
    <aside className="sidebar">
      <button className="brand" onClick={() => onNavigate('blog')} aria-label="回到说说">
        <span className="brand-logo">拾</span>
        <span className="brand-text">
          <strong>拾光</strong>
          <small>记录 · 对话 · 成长</small>
        </span>
      </button>

      <nav className="nav" aria-label="主导航">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon
          return (
            <button
              key={item.key}
              className={`nav-item ${page === item.key ? 'active' : ''}`}
              onClick={() => onNavigate(item.key)}
              aria-current={page === item.key ? 'page' : undefined}
              title={item.label}
            >
              <Icon size={19} />
              <span>{item.label}</span>
              {item.key === 'chat' && settings.demoMode && <em className="nav-dot" title="演示模式" />}
            </button>
          )
        })}
      </nav>

      <div className="sidebar-tip">
        <LockKeyhole size={14} />
        <span>内容默认只保存在本机</span>
      </div>

      <div className="sidebar-footer">
        <button className="profile-chip" onClick={() => onNavigate('settings')}>
          <Avatar value={settings.avatar} className="avatar-sm" />
          <span className="profile-meta">
            <strong>{settings.nickname || '小拾'}</strong>
            <small>{settings.bio || '记录每一天，也记录成长。'}</small>
          </span>
          <ChevronRight size={16} />
        </button>
        <div className="sidebar-actions">
          <button
            className="side-link"
            onClick={() => updateSettings({ theme: isDark ? 'light' : 'dark' })}
            title={isDark ? '切换到浅色模式' : '切换到深色模式'}
          >
            {isDark ? <Sun size={14} /> : <Moon size={14} />}
            {isDark ? '浅色模式' : '深色模式'}
          </button>
          <button className="side-link" onClick={onShowUpdateLog} title="查看更新日志">
            <History size={14} />
            v{APP_VERSION}
          </button>
        </div>
      </div>
    </aside>
  )
}
