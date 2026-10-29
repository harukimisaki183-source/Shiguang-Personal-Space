import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight, Download, X } from 'lucide-react'
import { useObjectUrl } from '../../hooks'
import type { MediaItem } from '../../types'
import { downloadBlob } from '../../utils'

interface LightboxProps {
  items: MediaItem[]
  index: number
  onClose: () => void
  onChange: (index: number) => void
}

export function Lightbox({ items, index, onClose, onChange }: LightboxProps) {
  const current = items[index]
  const url = useObjectUrl(current?.blob)

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      if (event.key === 'ArrowLeft' && items.length > 1) {
        onChange((index - 1 + items.length) % items.length)
      }
      if (event.key === 'ArrowRight' && items.length > 1) {
        onChange((index + 1) % items.length)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [index, items.length, onChange, onClose])

  if (!current) return null

  return createPortal(
    <div
      className="lightbox"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="lightbox-top">
        <span className="lightbox-counter">
          {index + 1} / {items.length}
        </span>
        <span className="lightbox-name" title={current.name}>
          {current.name}
        </span>
        <div className="lightbox-actions">
          <button
            className="icon-btn lightbox-icon"
            onClick={() => downloadBlob(current.blob, current.name)}
            aria-label="下载原文件"
            title="下载原文件"
          >
            <Download size={18} />
          </button>
          <button
            className="icon-btn lightbox-icon"
            onClick={onClose}
            aria-label="关闭"
            title="关闭"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      {items.length > 1 && (
        <button
          className="lightbox-nav prev"
          onClick={() => onChange((index - 1 + items.length) % items.length)}
          aria-label="上一个"
        >
          <ChevronLeft size={26} />
        </button>
      )}

      <div className="lightbox-stage" onMouseDown={(event) => event.stopPropagation()}>
        {!url ? (
          <div className="media-loading large" />
        ) : current.kind === 'image' ? (
          <img src={url} alt={current.name} />
        ) : (
          <video src={url} controls playsInline />
        )}
      </div>

      {items.length > 1 && (
        <button
          className="lightbox-nav next"
          onClick={() => onChange((index + 1) % items.length)}
          aria-label="下一个"
        >
          <ChevronRight size={26} />
        </button>
      )}
    </div>,
    document.body,
  )
}
