import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { useObjectUrl } from '../../hooks'
import type { PlanImage } from '../../types'

interface PlanImageViewerProps {
  image: PlanImage | null
  onClose: () => void
}

export function PlanImageViewer({ image, onClose }: PlanImageViewerProps) {
  const url = useObjectUrl(image?.blob)

  useEffect(() => {
    if (!image) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [image, onClose])

  if (!image) return null

  return createPortal(
    <div
      className="plan-image-viewer"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="plan-image-viewer-shell" onMouseDown={(event) => event.stopPropagation()}>
        <button className="plan-image-viewer-close" onClick={onClose} aria-label="关闭图片预览">
          <X size={18} />
        </button>
        <div className="plan-image-viewer-stage">
          {url ? (
            <img src={url} alt={image.caption || image.name} />
          ) : (
            <span className="media-loading large" />
          )}
        </div>
        <div className="plan-image-viewer-caption">
          <strong>{image.name}</strong>
          <p>{image.caption.trim() || '暂无备注'}</p>
        </div>
      </div>
    </div>,
    document.body,
  )
}
