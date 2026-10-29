import { Play } from 'lucide-react'
import { useObjectUrl } from '../../hooks'
import type { MediaItem } from '../../types'
import { formatDuration } from '../../utils'

interface MediaThumbProps {
  item: MediaItem
  onClick?: () => void
  className?: string
}

export function MediaThumb({ item, onClick, className = '' }: MediaThumbProps) {
  const url = useObjectUrl(item.blob)

  return (
    <button
      type="button"
      className={`media-thumb ${item.kind === 'video' ? 'is-video' : ''} ${className}`.trim()}
      onClick={onClick}
      aria-label={item.kind === 'video' ? `播放视频 ${item.name}` : `查看图片 ${item.name}`}
    >
      {!url ? (
        <span className="media-loading" />
      ) : item.kind === 'image' ? (
        <img src={url} alt={item.name} loading="lazy" />
      ) : (
        <>
          <video src={url} muted playsInline preload="metadata" />
          <span className="video-play">
            <Play size={18} fill="currentColor" />
          </span>
          {item.duration ? <span className="video-duration">{formatDuration(item.duration)}</span> : null}
        </>
      )}
    </button>
  )
}
