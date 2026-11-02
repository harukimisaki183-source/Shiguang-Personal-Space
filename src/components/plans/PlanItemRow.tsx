import { useRef, useState, type ChangeEvent } from 'react'
import { Check, ChevronDown, ImagePlus, Loader2, Trash2, X } from 'lucide-react'
import { useObjectUrl } from '../../hooks'
import type { PlanImage, PlanItem } from '../../types'

interface PlanThumbProps {
  image: PlanImage
  onClick: () => void
}

function PlanThumb({ image, onClick }: PlanThumbProps) {
  const url = useObjectUrl(image.blob)
  return (
    <button
      className="plan-thumb"
      onClick={onClick}
      title={image.caption || image.name || '查看图片'}
      aria-label="放大查看图片"
    >
      {url ? <img src={url} alt={image.caption || image.name} /> : <span className="media-loading" />}
    </button>
  )
}

interface PlanItemRowProps {
  item: PlanItem
  images: PlanImage[]
  onToggle: () => void
  onPatch: (patch: Partial<Pick<PlanItem, 'text' | 'details'>>) => void
  onDelete: () => void
  onAddImages: (files: File[]) => Promise<void>
  onUpdateCaption: (imageId: string, caption: string) => void
  onDeleteImage: (imageId: string) => void
  onOpenImage: (image: PlanImage) => void
}

export function PlanItemRow({
  item,
  images,
  onToggle,
  onPatch,
  onDelete,
  onAddImages,
  onUpdateCaption,
  onDeleteImage,
  onOpenImage,
}: PlanItemRowProps) {
  const [expanded, setExpanded] = useState(false)
  const [uploading, setUploading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (!files.length) return
    setUploading(true)
    try {
      await onAddImages(files)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className={`plan-item${item.checked ? ' checked' : ''}${expanded ? ' expanded' : ''}`}>
      <div className="plan-item-main">
        <button
          className={`plan-item-check${item.checked ? ' checked' : ''}`}
          onClick={onToggle}
          aria-pressed={item.checked}
          aria-label={item.checked ? '取消勾选' : '勾选这条计划'}
          title={item.checked ? '取消勾选' : '勾选完成'}
        >
          {item.checked && <Check size={14} strokeWidth={3} />}
        </button>

        <input
          className="plan-item-text"
          value={item.text}
          onChange={(event) => onPatch({ text: event.target.value })}
          placeholder="写下要做的事…"
          maxLength={300}
          aria-label="计划条内容"
        />

        {images.length > 0 && (
          <div className="plan-item-thumbs">
            {images.map((image) => (
              <PlanThumb key={image.id} image={image} onClick={() => onOpenImage(image)} />
            ))}
          </div>
        )}

        <button
          className="plan-item-image-add"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          title="在这条计划末尾添加图片"
          aria-label="添加图片"
        >
          {uploading ? <Loader2 size={14} className="spin" /> : <ImagePlus size={14} />}
        </button>

        <button
          className={`plan-item-caret${expanded ? ' open' : ''}`}
          onClick={() => setExpanded((prev) => !prev)}
          aria-expanded={expanded}
          aria-label={expanded ? '收起详细内容' : '展开详细内容'}
          title={expanded ? '收起' : '展开详细内容'}
        >
          <ChevronDown size={16} />
        </button>

        <input
          ref={inputRef}
          className="visually-hidden"
          type="file"
          accept="image/*"
          multiple
          onChange={(event) => void handleFiles(event)}
        />
      </div>

      {expanded && (
        <div className="plan-item-expanded">
          <label className="field">
            <span>详细内容</span>
            <textarea
              className="textarea plan-item-details"
              value={item.details}
              onChange={(event) => onPatch({ details: event.target.value })}
              placeholder="补充做法、参考资料、注意事项…"
              rows={4}
              maxLength={6000}
            />
          </label>

          <div className="plan-item-images-editor">
            <div className="plan-item-images-head">
              <span>图片与备注</span>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => inputRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? <Loader2 size={14} className="spin" /> : <ImagePlus size={14} />}
                添加图片
              </button>
            </div>
            {images.length === 0 ? (
              <p className="plan-item-images-empty">
                还没有图片。添加后会以小图显示在计划条末尾，点击可以放大查看。
              </p>
            ) : (
              <div className="plan-image-edit-list">
                {images.map((image) => (
                  <div className="plan-image-edit" key={image.id}>
                    <PlanThumb image={image} onClick={() => onOpenImage(image)} />
                    <input
                      className="input"
                      value={image.caption}
                      onChange={(event) => onUpdateCaption(image.id, event.target.value)}
                      placeholder="给这张图片写一句备注"
                      maxLength={160}
                      aria-label="图片备注"
                    />
                    <button
                      className="icon-btn icon-btn-sm danger-hover"
                      onClick={() => onDeleteImage(image.id)}
                      title="移除图片"
                      aria-label="移除图片"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="plan-item-actions">
            <button className="link-btn plan-item-delete" onClick={onDelete}>
              <Trash2 size={13} /> 删除计划条
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
