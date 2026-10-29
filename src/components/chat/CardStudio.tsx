import { useEffect, useMemo, useState } from 'react'
import {
  CalendarPlus,
  Copy,
  Download,
  Library,
  Loader2,
  RotateCcw,
  Save,
} from 'lucide-react'
import {
  CARD_TAG_INFO,
  cardToText,
  exportCardPng,
  getCardTag,
  getCardType,
  getDefaultCardTitle,
  getFieldLabel,
} from '../../cards'
import { useToast } from '../../contexts/ToastContext'
import { saveCard } from '../../db'
import type { CardTag, CardType, DayCard } from '../../types'
import { copyText, dateKey } from '../../utils'
import { Modal } from '../Modal'
import { CardPreview } from './CardPreview'

interface CardStudioProps {
  open: boolean
  initialCard?: DayCard | null
  owner?: string
  onClose: () => void
  onOpenLibrary: () => void
  onSaved?: (card: DayCard) => void
}

function makeEmptyFields(tag: CardTag): Record<string, string> {
  const info = getCardTag(tag)
  return Object.fromEntries(info.fields.map((field) => [field.key, '']))
}

export function CardStudio({
  open,
  initialCard,
  owner,
  onClose,
  onOpenLibrary,
  onSaved,
}: CardStudioProps) {
  const { showToast } = useToast()
  const [date, setDate] = useState(() => dateKey(new Date()))
  const [type, setType] = useState<CardType>('summary')
  const [tag, setTag] = useState<CardTag>('日常')
  const [title, setTitle] = useState('')
  const [fields, setFields] = useState<Record<string, string>>(() => makeEmptyFields('日常'))
  const [savedId, setSavedId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    if (!open) return
    if (initialCard) {
      setDate(initialCard.date)
      setType(initialCard.type)
      setTag(initialCard.tag)
      setTitle(initialCard.title)
      setFields({ ...makeEmptyFields(initialCard.tag), ...initialCard.fields })
      setSavedId(initialCard.id)
    } else {
      const today = dateKey(new Date())
      setDate(today)
      setType('summary')
      setTag('日常')
      setTitle('')
      setFields(makeEmptyFields('日常'))
      setSavedId(null)
    }
  }, [open, initialCard?.id])

  const tagInfo = getCardTag(tag)

  const previewCard = useMemo<DayCard>(
    () => ({
      id: savedId ?? 'preview',
      date: date || dateKey(new Date()),
      type,
      tag,
      title: title.trim() || getDefaultCardTitle(date, tag, type),
      fields,
      createdAt: initialCard?.createdAt ?? 0,
      updatedAt: initialCard?.updatedAt ?? 0,
    }),
    [date, fields, initialCard?.createdAt, initialCard?.updatedAt, savedId, tag, title, type],
  )

  function changeTag(next: CardTag) {
    setTag(next)
    const nextInfo = getCardTag(next)
    setFields((prev) => {
      const merged: Record<string, string> = {}
      for (const field of nextInfo.fields) {
        merged[field.key] = prev[field.key] ?? ''
      }
      return merged
    })
  }

  function resetForm() {
    setTitle('')
    setType('summary')
    setFields(makeEmptyFields(tag))
    setDate(dateKey(new Date()))
    setSavedId(null)
  }

  function hasSomething(): boolean {
    return Boolean(
      title.trim() ||
        Object.values(fields).some((value) => value.trim() && value.trim() !== '0'),
    )
  }

  async function handleSave() {
    if (saving) return
    if (!hasSomething()) {
      showToast('至少写下一点今天的内容', 'info')
      return
    }
    setSaving(true)
    try {
      const card = await saveCard(
        {
          date: date || dateKey(new Date()),
          type,
          tag,
          title: previewCard.title,
          fields,
        },
        savedId ?? undefined,
      )
      setSavedId(card.id)
      setTitle(card.title)
      showToast(savedId ? '卡片已更新' : '卡片已保存到本地', 'success')
      onSaved?.(card)
    } catch (error) {
      showToast(error instanceof Error ? error.message : '保存失败，请稍后再试', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleExport() {
    if (exporting) return
    if (!hasSomething()) {
      showToast('至少写下一点今天的内容', 'info')
      return
    }
    setExporting(true)
    try {
      await exportCardPng(previewCard, owner)
      showToast('卡片图片已导出', 'success')
    } catch (error) {
      showToast(error instanceof Error ? error.message : '导出失败，请稍后再试', 'error')
    } finally {
      setExporting(false)
    }
  }

  async function handleCopyText() {
    if (!hasSomething()) {
      showToast('至少写下一点今天的内容', 'info')
      return
    }
    const ok = await copyText(cardToText(previewCard, owner))
    showToast(ok ? '卡片文字已复制' : '复制失败，请手动选择文本', ok ? 'success' : 'error')
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        <span className="card-studio-title">
          <span className="card-studio-title-icon">
            <CalendarPlus size={18} />
          </span>
          每日卡片
        </span>
      }
      size="xl"
      className="card-studio-modal"
      footer={
        <>
          <button className="btn btn-ghost" onClick={onOpenLibrary}>
            <Library size={15} /> 卡片库
          </button>
          <button className="btn btn-ghost" onClick={() => void handleCopyText()}>
            <Copy size={15} /> 复制文字
          </button>
          <button className="btn btn-subtle" onClick={resetForm} disabled={saving || exporting}>
            <RotateCcw size={15} /> 清空
          </button>
          <button className="btn btn-subtle" onClick={() => void handleSave()} disabled={saving || exporting}>
            {saving ? <Loader2 size={15} className="spin" /> : <Save size={15} />}
            {saving ? '保存中…' : savedId ? '更新卡片' : '保存卡片'}
          </button>
          <button
            className="btn btn-primary"
            onClick={() => void handleExport()}
            disabled={saving || exporting}
          >
            {exporting ? <Loader2 size={15} className="spin" /> : <Download size={15} />}
            {exporting ? '生成中…' : '导出 PNG'}
          </button>
        </>
      }
    >
      <div className="card-studio">
        <div className="card-studio-form">
          <div className="card-studio-block">
            <span className="field-label">这是</span>
            <div className="segmented card-type-switch">
              {(['summary', 'plan'] as CardType[]).map((item) => (
                <button
                  key={item}
                  className={type === item ? 'active' : ''}
                  onClick={() => setType(item)}
                >
                  {getCardType(item).label}
                </button>
              ))}
            </div>
            <span className="field-hint">{getCardType(type).hint}</span>
          </div>

          <div className="card-studio-block">
            <span className="field-label">选择标签</span>
            <div className="card-tag-pills">
              {CARD_TAG_INFO.map((item) => (
                <button
                  key={item.tag}
                  className={`card-tag-pill ${tag === item.tag ? 'active' : ''}`}
                  onClick={() => changeTag(item.tag)}
                  style={
                    tag === item.tag
                      ? {
                          backgroundColor: item.accentSoft,
                          color: item.accent,
                          borderColor: item.accent,
                        }
                      : undefined
                  }
                >
                  <span>{item.icon}</span>
                  {item.tag}
                </button>
              ))}
            </div>
            <span className="field-hint">{tagInfo.caption}</span>
          </div>

          <div className="form-grid card-studio-meta">
            <label className="field">
              <span>日期</span>
              <input
                className="input"
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
              />
            </label>
            <label className="field">
              <span>标题（可选）</span>
              <input
                className="input"
                value={title}
                maxLength={30}
                onChange={(event) => setTitle(event.target.value)}
                placeholder={previewCard.title}
              />
            </label>
          </div>

          <div className={`card-form-fields ${tag === '求职' ? 'job' : ''}`}>
            {tagInfo.fields.map((field) =>
              field.type === 'number' ? (
                <label className="field card-field" key={field.key}>
                  <span>{getFieldLabel(field, type)}</span>
                  <input
                    className="input"
                    type="number"
                    min={0}
                    max={9999}
                    step={1}
                    value={fields[field.key] ?? ''}
                    onChange={(event) =>
                      setFields((prev) => ({ ...prev, [field.key]: event.target.value }))
                    }
                    placeholder={field.placeholder}
                  />
                </label>
              ) : field.type === 'text' ? (
                <label className="field card-field" key={field.key}>
                  <span>{getFieldLabel(field, type)}</span>
                  <input
                    className="input"
                    value={fields[field.key] ?? ''}
                    maxLength={field.maxLength ?? 60}
                    onChange={(event) =>
                      setFields((prev) => ({ ...prev, [field.key]: event.target.value }))
                    }
                    placeholder={field.placeholder}
                  />
                </label>
              ) : (
                <label className="field card-field" key={field.key}>
                  <span>{getFieldLabel(field, type)}</span>
                  <textarea
                    className="textarea card-textarea"
                    rows={3}
                    value={fields[field.key] ?? ''}
                    maxLength={field.maxLength ?? 120}
                    onChange={(event) =>
                      setFields((prev) => ({ ...prev, [field.key]: event.target.value }))
                    }
                    placeholder={field.placeholder}
                  />
                  <span className="card-char-count">
                    {(fields[field.key] ?? '').length}/{field.maxLength ?? 120}
                  </span>
                </label>
              ),
            )}
          </div>
        </div>

        <aside className="card-studio-preview">
          <div className="card-preview-label">
            <span>实时预览</span>
            <em>导出的 PNG 为 1080 × 1440</em>
          </div>
          <CardPreview card={previewCard} owner={owner} />
          <p className="card-preview-tip">
            图片只保存在你的设备上。保存后可以在「卡片库」里再次编辑或导出。
          </p>
        </aside>
      </div>
    </Modal>
  )
}
