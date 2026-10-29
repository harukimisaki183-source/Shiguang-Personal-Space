import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { CalendarDays, FolderOpen, Search, Sparkles, X } from 'lucide-react'
import { CalendarPanel } from '../components/blog/CalendarPanel'
import { Composer } from '../components/blog/Composer'
import { Lightbox } from '../components/blog/Lightbox'
import { NoteCard } from '../components/blog/NoteCard'
import { NoteEditorModal } from '../components/blog/NoteEditorModal'
import { useConfirm } from '../contexts/ConfirmContext'
import { useToast } from '../contexts/ToastContext'
import { deleteNote, listNotesWithMedia } from '../db'
import { CATEGORIES, type Category, type MediaItem, type NoteWithMedia } from '../types'
import { dateKey, formatBytes, parseDateKey } from '../utils'

interface LightboxState {
  items: MediaItem[]
  index: number
}

export function BlogPage() {
  const { confirm } = useConfirm()
  const { showToast } = useToast()
  const notes = useLiveQuery(() => listNotesWithMedia(), [], []) ?? []
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [category, setCategory] = useState<Category | 'all'>('all')
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<NoteWithMedia | null>(null)
  const [lightbox, setLightbox] = useState<LightboxState | null>(null)

  const counts = useMemo(() => {
    const result: Record<string, number> = {}
    for (const note of notes) {
      const key = dateKey(note.createdAt)
      result[key] = (result[key] ?? 0) + 1
    }
    return result
  }, [notes])

  const categoryCounts = useMemo(() => {
    const result = Object.fromEntries(CATEGORIES.map((item) => [item, 0])) as Record<
      Category,
      number
    >
    for (const note of notes) result[note.category] += 1
    return result
  }, [notes])

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    return notes.filter((note) => {
      if (selectedDate && dateKey(note.createdAt) !== selectedDate) return false
      if (category !== 'all' && note.category !== category) return false
      if (keyword && !note.content.toLowerCase().includes(keyword)) return false
      return true
    })
  }, [notes, selectedDate, category, query])

  const mediaStats = useMemo(() => {
    let count = 0
    let bytes = 0
    for (const note of notes) {
      for (const item of note.media) {
        count += 1
        bytes += item.size
      }
    }
    return { count, bytes }
  }, [notes])

  const monthPrefix = dateKey(new Date()).slice(0, 7)
  const monthCount = useMemo(
    () => notes.filter((note) => dateKey(note.createdAt).startsWith(monthPrefix)).length,
    [notes, monthPrefix],
  )

  const selectedLabel = selectedDate
    ? new Intl.DateTimeFormat('zh-CN', {
        month: 'long',
        day: 'numeric',
        weekday: 'long',
      }).format(parseDateKey(selectedDate))
    : null

  const hasFilter = !!selectedDate || category !== 'all' || !!query.trim()

  function resetFilters() {
    setSelectedDate(null)
    setCategory('all')
    setQuery('')
  }

  function handlePublished() {
    resetFilters()
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function handleDelete(note: NoteWithMedia) {
    const ok = await confirm({
      title: '删除这条记录？',
      message: '内容和附带的图片、视频会一并从本地删除，无法恢复。',
      confirmText: '删除',
      danger: true,
    })
    if (!ok) return
    try {
      await deleteNote(note.id)
      showToast('记录已删除', 'success')
    } catch {
      showToast('删除失败，请稍后再试', 'error')
    }
  }

  function openMedia(note: NoteWithMedia, index: number) {
    setLightbox({ items: note.media, index })
  }

  return (
    <div className="blog-layout">
      <section className="feed-column">
        <Composer onPublished={handlePublished} />

        <div className="feed-toolbar card">
          <div className="search-box">
            <Search size={16} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索记录…"
              aria-label="搜索记录"
            />
            {query && (
              <button className="search-clear" onClick={() => setQuery('')} aria-label="清空搜索">
                <X size={14} />
              </button>
            )}
          </div>
          <div className="category-filter" role="group" aria-label="按分类筛选">
            <button
              className={`chip chip-sm ${category === 'all' ? 'active' : ''}`}
              onClick={() => setCategory('all')}
            >
              全部 <em>{notes.length}</em>
            </button>
            {CATEGORIES.map((item) => (
              <button
                key={item}
                className={`chip chip-sm ${category === item ? 'active' : ''}`}
                onClick={() => setCategory(item)}
              >
                {item} <em>{categoryCounts[item]}</em>
              </button>
            ))}
          </div>
        </div>

        {selectedDate && selectedLabel && (
          <div className="date-filter card">
            <div className="date-filter-label">
              <CalendarDays size={16} />
              <span>
                正在查看 <strong>{selectedLabel}</strong> 的记录
              </span>
            </div>
            <button className="link-btn" onClick={() => setSelectedDate(null)}>
              <X size={13} /> 清除日期
            </button>
          </div>
        )}

        <div className="feed-summary">
          <span>{hasFilter ? `筛选出 ${filtered.length} 条记录` : `共 ${notes.length} 条记录`}</span>
          {hasFilter && (
            <button className="link-btn" onClick={resetFilters}>
              <X size={13} /> 清除全部筛选
            </button>
          )}
        </div>

        <div className="feed-list">
          {filtered.map((note) => (
            <NoteCard
              key={note.id}
              note={note}
              onEdit={setEditing}
              onDelete={(item) => void handleDelete(item)}
              onOpenMedia={openMedia}
            />
          ))}

          {filtered.length === 0 && (
            <div className="empty-state card">
              <div className="empty-icon">
                {notes.length > 0 ? <Search size={24} /> : <Sparkles size={24} />}
              </div>
              <strong>{notes.length > 0 ? '没有找到符合条件的记录' : '还没有写下第一条记录'}</strong>
              <span>
                {notes.length > 0
                  ? '换一个日期、分类或关键词试试。'
                  : '记录今天的一个瞬间，面试、学习、心情都可以。'}
              </span>
              {notes.length > 0 && (
                <button className="btn btn-subtle btn-sm" onClick={resetFilters}>
                  清除筛选
                </button>
              )}
            </div>
          )}
        </div>
      </section>

      <aside className="blog-side">
        <CalendarPanel selectedDate={selectedDate} onSelectDate={setSelectedDate} counts={counts} />

        <div className="side-panel stats-panel card">
          <div className="panel-title">
            <FolderOpen size={16} />
            <span>空间概览</span>
          </div>
          <div className="stat-grid">
            <div>
              <span>累计记录</span>
              <strong>{notes.length}</strong>
            </div>
            <div>
              <span>本月记录</span>
              <strong>{monthCount}</strong>
            </div>
            <div>
              <span>媒体文件</span>
              <strong>{mediaStats.count}</strong>
            </div>
            <div>
              <span>媒体占用</span>
              <strong>{formatBytes(mediaStats.bytes)}</strong>
            </div>
          </div>
          <p className="muted stats-note">数据保存在当前浏览器，建议定期在设置里导出备份。</p>
        </div>
      </aside>

      {editing && (
        <NoteEditorModal
          note={editing}
          onClose={() => setEditing(null)}
          onSaved={() => setEditing(null)}
        />
      )}

      {lightbox && (
        <Lightbox
          items={lightbox.items}
          index={lightbox.index}
          onChange={(index) => setLightbox((prev) => (prev ? { ...prev, index } : prev))}
          onClose={() => setLightbox(null)}
        />
      )}
    </div>
  )
}
