import { Pencil, Trash2 } from 'lucide-react'
import { useSettings } from '../../contexts/SettingsContext'
import type { Category, NoteWithMedia } from '../../types'
import { formatNoteTime } from '../../utils'
import { MediaThumb } from './MediaThumb'

interface NoteCardProps {
  note: NoteWithMedia
  onEdit: (note: NoteWithMedia) => void
  onDelete: (note: NoteWithMedia) => void
  onOpenMedia: (note: NoteWithMedia, index: number) => void
}

const CATEGORY_CLASS: Record<Category, string> = {
  日常: 'cat-daily',
  面试: 'cat-interview',
  学习: 'cat-study',
  心情: 'cat-mood',
  其他: 'cat-other',
}

export function NoteCard({ note, onEdit, onDelete, onOpenMedia }: NoteCardProps) {
  const { settings } = useSettings()
  const mediaClass =
    note.media.length === 1 ? 'single' : note.media.length === 2 ? 'two' : 'many'

  return (
    <article className="note-card card">
      <header className="note-head">
        <span className="avatar avatar-sm">{settings.avatar}</span>
        <div className="note-meta">
          <div className="note-meta-top">
            <strong>{settings.nickname || '小拾'}</strong>
            <span className={`category-badge ${CATEGORY_CLASS[note.category]}`}>
              {note.category}
            </span>
            {note.updatedAt - note.createdAt > 5000 && <span className="edited-tag">已编辑</span>}
          </div>
          <time dateTime={new Date(note.createdAt).toISOString()}>
            {formatNoteTime(note.createdAt)}
          </time>
        </div>
        <div className="note-actions">
          <button
            className="icon-btn icon-btn-sm"
            onClick={() => onEdit(note)}
            aria-label="编辑这条记录"
            title="编辑"
          >
            <Pencil size={15} />
          </button>
          <button
            className="icon-btn icon-btn-sm danger-hover"
            onClick={() => onDelete(note)}
            aria-label="删除这条记录"
            title="删除"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </header>

      {note.content && <p className="note-content">{note.content}</p>}

      {note.media.length > 0 && (
        <div className={`note-media ${mediaClass}`}>
          {note.media.map((item, index) => (
            <MediaThumb
              key={item.id}
              item={item}
              onClick={() => onOpenMedia(note, index)}
            />
          ))}
        </div>
      )}
    </article>
  )
}
