import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  CalendarPlus,
  Download,
  Loader2,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react'
import {
  CARD_TAG_INFO,
  applicationTotal,
  cardDateLabel,
  cardSummary,
  exportCardPng,
  getCardTag,
  getCardType,
} from '../../cards'
import { useConfirm } from '../../contexts/ConfirmContext'
import { useToast } from '../../contexts/ToastContext'
import { deleteCard, listCards } from '../../db'
import type { CardTag, DayCard } from '../../types'
import { Modal } from '../Modal'

interface CardLibraryProps {
  open: boolean
  owner?: string
  onClose: () => void
  onCreate: () => void
  onEdit: (card: DayCard) => void
}

export function CardLibrary({
  open,
  owner,
  onClose,
  onCreate,
  onEdit,
}: CardLibraryProps) {
  const { showToast } = useToast()
  const { confirm } = useConfirm()
  const [filter, setFilter] = useState<CardTag | '全部'>('全部')
  const [exportingId, setExportingId] = useState<string | null>(null)

  const cards = useLiveQuery(() => listCards(), [], []) ?? []

  const filtered = useMemo(
    () => (filter === '全部' ? cards : cards.filter((card) => card.tag === filter)),
    [cards, filter],
  )

  async function handleExport(card: DayCard) {
    if (exportingId) return
    setExportingId(card.id)
    try {
      await exportCardPng(card, owner)
      showToast('卡片图片已导出', 'success')
    } catch (error) {
      showToast(error instanceof Error ? error.message : '导出失败', 'error')
    } finally {
      setExportingId(null)
    }
  }

  async function handleDelete(card: DayCard) {
    const ok = await confirm({
      title: '删除这张卡片？',
      message: `「${card.title}」会被永久删除，无法恢复。`,
      confirmText: '删除',
      danger: true,
    })
    if (!ok) return
    try {
      await deleteCard(card.id)
      showToast('卡片已删除', 'success')
    } catch {
      showToast('删除失败，请稍后再试', 'error')
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="卡片库"
      size="xl"
      className="card-library-modal"
    >
      <div className="card-library-head">
        <div>
          <p>把每天的小进展收进卡片里，随时回顾，也可以导出分享。</p>
          <span>{cards.length} 张卡片保存在本机</span>
        </div>
        <button className="btn btn-primary btn-sm" onClick={onCreate}>
          <CalendarPlus size={15} /> 新建卡片
        </button>
      </div>

      <div className="card-library-filters">
        <button
          className={`chip chip-sm ${filter === '全部' ? 'active' : ''}`}
          onClick={() => setFilter('全部')}
        >
          全部
        </button>
        {CARD_TAG_INFO.map((item) => (
          <button
            key={item.tag}
            className={`chip chip-sm ${filter === item.tag ? 'active' : ''}`}
            onClick={() => setFilter(item.tag)}
          >
            {item.icon} {item.tag}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="card-library-empty">
          <span className="card-library-empty-icon">
            <Plus size={23} />
          </span>
          <h3>{cards.length === 0 ? '还没有卡片' : `还没有「${filter}」标签的卡片`}</h3>
          <p>选一个标签，写下今天完成的事、投递的进度，或者一句想记住的话。</p>
          <button className="btn btn-primary btn-sm" onClick={onCreate}>
            <CalendarPlus size={15} /> 做一张今日卡片
          </button>
        </div>
      ) : (
        <div className="card-library-grid">
          {filtered.map((card) => {
            const tag = getCardTag(card.tag)
            const type = getCardType(card.type)
            return (
              <article
                className="saved-card"
                key={card.id}
                style={
                  {
                    '--card-accent': tag.accent,
                    '--card-soft': tag.accentSoft,
                    '--card-g1': tag.gradient[0],
                    '--card-g2': tag.gradient[1],
                  } as React.CSSProperties
                }
              >
                <div className="saved-card-top">
                  <span className="saved-card-tag">
                    {tag.icon} {card.tag}
                  </span>
                  <span className="saved-card-type">{type.label}</span>
                </div>
                <span className="saved-card-date">{cardDateLabel(card.date)}</span>
                <strong className="saved-card-title">{card.title}</strong>
                <p className="saved-card-summary">{cardSummary(card, 72)}</p>
                {card.tag === '求职' && (
                  <span className="saved-card-total">
                    累计投递 <strong>{applicationTotal(card)}</strong> 份
                  </span>
                )}
                <div className="saved-card-actions">
                  <button
                    className="saved-card-action"
                    onClick={() => void handleExport(card)}
                    disabled={!!exportingId}
                  >
                    {exportingId === card.id ? (
                      <Loader2 size={13} className="spin" />
                    ) : (
                      <Download size={13} />
                    )}
                    导出
                  </button>
                  <button className="saved-card-action" onClick={() => onEdit(card)}>
                    <Pencil size={13} /> 编辑
                  </button>
                  <button
                    className="saved-card-action danger"
                    onClick={() => void handleDelete(card)}
                  >
                    <Trash2 size={13} /> 删除
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </Modal>
  )
}
