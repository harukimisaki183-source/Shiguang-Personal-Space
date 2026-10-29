import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import { ImagePlus, Loader2, Send, Video, X } from 'lucide-react'
import { useSettings } from '../../contexts/SettingsContext'
import { useToast } from '../../contexts/ToastContext'
import { createNote } from '../../db'
import { validateMediaFiles } from '../../mediaFiles'
import { CATEGORIES, type Category } from '../../types'

interface ComposerProps {
  onPublished: () => void
}

export function Composer({ onPublished }: ComposerProps) {
  const { settings } = useSettings()
  const { showToast } = useToast()
  const [content, setContent] = useState('')
  const [category, setCategory] = useState<Category>('日常')
  const [files, setFiles] = useState<File[]>([])
  const [publishing, setPublishing] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const videoInputRef = useRef<HTMLInputElement>(null)

  const previews = useMemo(
    () =>
      files.map((file) => ({
        file,
        url: URL.createObjectURL(file),
        kind: file.type.startsWith('video/') ? 'video' : 'image',
      })),
    [files],
  )

  useEffect(() => {
    return () => {
      previews.forEach((preview) => URL.revokeObjectURL(preview.url))
    }
  }, [previews])

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`
  }, [content])

  function handleFiles(event: ChangeEvent<HTMLInputElement>) {
    const incoming = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (!incoming.length) return
    const existingBytes = files.reduce((sum, file) => sum + file.size, 0)
    const { files: valid, errors } = validateMediaFiles(incoming, files.length, existingBytes)
    if (valid.length) setFiles((prev) => [...prev, ...valid])
    if (errors.length) showToast(errors.slice(0, 2).join('；'), 'error')
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, itemIndex) => itemIndex !== index))
  }

  async function publish() {
    if (publishing) return
    if (!content.trim() && files.length === 0) {
      showToast('写点什么，或者添加一张图片吧', 'info')
      return
    }
    setPublishing(true)
    try {
      await createNote(content, category, files)
      setContent('')
      setFiles([])
      showToast('已记录这一刻', 'success')
      onPublished()
    } catch (error) {
      showToast(error instanceof Error ? error.message : '发布失败，请稍后再试', 'error')
    } finally {
      setPublishing(false)
    }
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault()
      void publish()
    }
  }

  return (
    <div className="composer card">
      <div className="composer-head">
        <span className="avatar avatar-sm">{settings.avatar}</span>
        <div className="composer-head-text">
          <strong>{settings.nickname || '小拾'}</strong>
          <span>记录这一刻…</span>
        </div>
        <span className="composer-hint">Ctrl / ⌘ + Enter 发布</span>
      </div>

      <textarea
        ref={textareaRef}
        className="composer-input"
        value={content}
        onChange={(event) => setContent(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="今天发生了什么？面试、学习、生活，都可以写下来…"
        rows={3}
      />

      {previews.length > 0 && (
        <div className={`composer-previews count-${Math.min(previews.length, 3)}`}>
          {previews.map((preview, index) => (
            <div className="composer-preview" key={`${preview.file.name}-${index}`}>
              {preview.kind === 'image' ? (
                <img src={preview.url} alt={preview.file.name} />
              ) : (
                <>
                  <video src={preview.url} muted playsInline preload="metadata" />
                  <span className="preview-video-tag">视频</span>
                </>
              )}
              <button
                className="preview-remove"
                onClick={() => removeFile(index)}
                aria-label="移除这个文件"
                title="移除"
              >
                <X size={13} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="composer-toolbar">
        <div className="composer-tools">
          <button
            className="tool-btn"
            onClick={() => imageInputRef.current?.click()}
            title="添加图片（发布时自动压缩）"
          >
            <ImagePlus size={16} />
            图片
          </button>
          <button
            className="tool-btn"
            onClick={() => videoInputRef.current?.click()}
            title="添加视频（最大 120MB）"
          >
            <Video size={16} />
            视频
          </button>
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={handleFiles}
          />
          <input
            ref={videoInputRef}
            type="file"
            accept="video/*"
            multiple
            hidden
            onChange={handleFiles}
          />
        </div>

        <div className="category-pills" role="group" aria-label="选择分类">
          {CATEGORIES.map((item) => (
            <button
              key={item}
              className={`chip chip-sm ${category === item ? 'active' : ''}`}
              onClick={() => setCategory(item)}
            >
              {item}
            </button>
          ))}
        </div>

        <button
          className="btn btn-primary publish-btn"
          onClick={() => void publish()}
          disabled={publishing || (!content.trim() && files.length === 0)}
        >
          {publishing ? <Loader2 size={16} className="spin" /> : <Send size={16} />}
          {publishing ? '处理中…' : '发布'}
        </button>
      </div>
    </div>
  )
}
