import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from 'react'
import { ImagePlus, Loader2, Video, X } from 'lucide-react'
import { useObjectUrl } from '../../hooks'
import { useToast } from '../../contexts/ToastContext'
import { updateNote } from '../../db'
import { validateMediaFiles } from '../../mediaFiles'
import { CATEGORIES, type Category, type MediaItem, type NoteWithMedia } from '../../types'
import { formatNoteTime } from '../../utils'
import { Modal } from '../Modal'

interface NoteEditorModalProps {
  note: NoteWithMedia | null
  onClose: () => void
  onSaved: () => void
}

function ExistingMedia({
  item,
  onRemove,
}: {
  item: MediaItem
  onRemove: () => void
}) {
  const url = useObjectUrl(item.blob)
  return (
    <div className="edit-media-item">
      {url && item.kind === 'image' ? (
        <img src={url} alt={item.name} />
      ) : url ? (
        <video src={url} muted playsInline preload="metadata" />
      ) : (
        <span className="media-loading" />
      )}
      {item.kind === 'video' && <span className="preview-video-tag">视频</span>}
      <button className="preview-remove" onClick={onRemove} aria-label="移除这个媒体" title="移除">
        <X size={13} />
      </button>
    </div>
  )
}

function NewMedia({ file, onRemove }: { file: File; onRemove: () => void }) {
  const url = useObjectUrl(file)
  const isVideo = file.type.startsWith('video/')
  return (
    <div className="edit-media-item">
      {url && !isVideo ? (
        <img src={url} alt={file.name} />
      ) : url ? (
        <video src={url} muted playsInline preload="metadata" />
      ) : (
        <span className="media-loading" />
      )}
      {isVideo && <span className="preview-video-tag">视频</span>}
      <button className="preview-remove" onClick={onRemove} aria-label="移除这个文件" title="移除">
        <X size={13} />
      </button>
    </div>
  )
}

export function NoteEditorModal({ note, onClose, onSaved }: NoteEditorModalProps) {
  const { showToast } = useToast()
  const [content, setContent] = useState('')
  const [category, setCategory] = useState<Category>('日常')
  const [newFiles, setNewFiles] = useState<File[]>([])
  const [removedIds, setRemovedIds] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const videoInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!note) return
    setContent(note.content)
    setCategory(note.category)
    setNewFiles([])
    setRemovedIds([])
  }, [note?.id])

  const remainingMedia = useMemo(
    () => (note ? note.media.filter((item) => !removedIds.includes(item.id)) : []),
    [note, removedIds],
  )

  const existingBytes = remainingMedia.reduce((sum, item) => sum + item.size, 0)

  function handleFiles(event: ChangeEvent<HTMLInputElement>) {
    const incoming = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (!incoming.length) return
    const newBytes = newFiles.reduce((sum, file) => sum + file.size, 0)
    const { files, errors } = validateMediaFiles(
      incoming,
      remainingMedia.length + newFiles.length,
      existingBytes + newBytes,
    )
    if (files.length) setNewFiles((prev) => [...prev, ...files])
    if (errors.length) showToast(errors.slice(0, 2).join('；'), 'error')
  }

  function toggleRemove(id: string) {
    setRemovedIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]))
  }

  async function save() {
    if (!note || saving) return
    if (!content.trim() && remainingMedia.length + newFiles.length === 0) {
      showToast('内容不能为空', 'info')
      return
    }
    setSaving(true)
    try {
      await updateNote(note.id, { content, category }, newFiles, removedIds)
      showToast('修改已保存', 'success')
      onSaved()
    } catch (error) {
      showToast(error instanceof Error ? error.message : '保存失败，请稍后再试', 'error')
    } finally {
      setSaving(false)
    }
  }

  const totalMedia = remainingMedia.length + newFiles.length

  return (
    <Modal
      open={!!note}
      onClose={onClose}
      title="编辑记录"
      size="lg"
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose} disabled={saving}>
            取消
          </button>
          <button className="btn btn-primary" onClick={() => void save()} disabled={saving}>
            {saving && <Loader2 size={16} className="spin" />}
            {saving ? '保存中…' : '保存修改'}
          </button>
        </>
      }
    >
      {note && (
        <div className="editor-body">
          <div className="editor-meta">发布于 {formatNoteTime(note.createdAt)}</div>
          <textarea
            className="textarea editor-textarea"
            value={content}
            onChange={(event) => setContent(event.target.value)}
            rows={5}
            placeholder="写点什么…"
          />

          <div className="editor-row">
            <span className="field-label">分类</span>
            <div className="category-pills">
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
          </div>

          {totalMedia > 0 && (
            <div className="editor-media-grid">
              {remainingMedia.map((item) => (
                <ExistingMedia key={item.id} item={item} onRemove={() => toggleRemove(item.id)} />
              ))}
              {newFiles.map((file, index) => (
                <NewMedia
                  key={`${file.name}-${index}`}
                  file={file}
                  onRemove={() =>
                    setNewFiles((prev) => prev.filter((_, itemIndex) => itemIndex !== index))
                  }
                />
              ))}
            </div>
          )}

          <div className="editor-tools">
            <button className="tool-btn" onClick={() => imageInputRef.current?.click()}>
              <ImagePlus size={16} />
              添加图片
            </button>
            <button className="tool-btn" onClick={() => videoInputRef.current?.click()}>
              <Video size={16} />
              添加视频
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
            <span className="muted editor-tip">
              {removedIds.length > 0
                ? `${removedIds.length} 个媒体将在保存后移除`
                : `最多 9 个媒体，图片会自动压缩`}
            </span>
            {removedIds.length > 0 && (
              <button className="link-btn" onClick={() => setRemovedIds([])}>
                撤销移除
              </button>
            )}
          </div>
        </div>
      )}
    </Modal>
  )
}
