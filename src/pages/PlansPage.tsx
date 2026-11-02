import { useMemo, useRef, useState, type ChangeEvent } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  FolderOpen,
  FolderPlus,
  ImagePlus,
  ListChecks,
  Loader2,
  Plus,
  Trash2,
  X,
} from 'lucide-react'
import { Modal } from '../components/Modal'
import { PlanEditor } from '../components/plans/PlanEditor'
import { useConfirm } from '../contexts/ConfirmContext'
import { useToast } from '../contexts/ToastContext'
import { createPlan, db, deletePlan, listPlans } from '../db'
import { useObjectUrl } from '../hooks'
import type { Plan } from '../types'
import { formatRelativeTime, isImageFile } from '../utils'

const MAX_COVER_BYTES = 25 * 1024 * 1024

interface PlanStats {
  done: number
  total: number
}

interface PlanFolderCardProps {
  plan: Plan
  stats: PlanStats
  onOpen: () => void
  onDelete: () => void
}

function PlanFolderCard({ plan, stats, onOpen, onDelete }: PlanFolderCardProps) {
  const coverUrl = useObjectUrl(plan.cover ?? null)
  const progress = stats.total > 0 ? (stats.done / stats.total) * 100 : 0

  return (
    <article className="plan-folder">
      <button className="plan-folder-open" onClick={onOpen} aria-label={`打开计划表 ${plan.title}`}>
        <span className="plan-folder-cover">
          {coverUrl ? (
            <img src={coverUrl} alt={plan.coverName || `${plan.title}封面`} />
          ) : (
            <span className="plan-folder-fallback">
              <FolderOpen size={26} />
              <em>{plan.title.trim().slice(0, 1) || '拾'}</em>
            </span>
          )}
        </span>
        <span className="plan-folder-info">
          <strong title={plan.title}>{plan.title}</strong>
          <span>
            {stats.total > 0 ? `${stats.done} / ${stats.total} 已完成` : '还没有计划条'}
            <em>· {formatRelativeTime(plan.updatedAt)}</em>
          </span>
          <span className="plan-folder-progress" aria-hidden="true">
            <i style={{ width: `${progress}%` }} />
          </span>
        </span>
      </button>
      <button
        className="plan-folder-delete"
        onClick={onDelete}
        title="删除计划表"
        aria-label={`删除计划表 ${plan.title}`}
      >
        <Trash2 size={14} />
      </button>
    </article>
  )
}

export function PlansPage() {
  const { showToast } = useToast()
  const { confirm } = useConfirm()
  const plans = useLiveQuery(() => listPlans(), [], []) ?? []
  const allItems = useLiveQuery(() => db.planItems.toArray(), [], []) ?? []
  const [activePlanId, setActivePlanId] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [coverFile, setCoverFile] = useState<File | null>(null)
  const [creating, setCreating] = useState(false)
  const coverUrl = useObjectUrl(coverFile)
  const coverInputRef = useRef<HTMLInputElement>(null)

  const stats = useMemo(() => {
    const map = new Map<string, PlanStats>()
    for (const item of allItems) {
      const current = map.get(item.planId) ?? { done: 0, total: 0 }
      current.total += 1
      if (item.checked) current.done += 1
      map.set(item.planId, current)
    }
    return map
  }, [allItems])

  function openCreate() {
    setTitle('')
    setCoverFile(null)
    setCreateOpen(true)
  }

  function closeCreate() {
    if (creating) return
    setCreateOpen(false)
  }

  function handleCoverFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!isImageFile(file)) {
      showToast('封面需要是图片文件', 'error')
      return
    }
    if (file.size > MAX_COVER_BYTES) {
      showToast('封面图片超过 25MB，请换一张小一点的图片', 'error')
      return
    }
    setCoverFile(file)
  }

  async function handleCreate() {
    if (creating) return
    setCreating(true)
    try {
      const plan = await createPlan(title.trim() || '未命名计划', coverFile)
      setCreateOpen(false)
      setActivePlanId(plan.id)
      showToast('计划表已创建', 'success')
    } catch (error) {
      showToast(error instanceof Error ? error.message : '创建计划表失败', 'error')
    } finally {
      setCreating(false)
    }
  }

  async function handleDelete(plan: Plan) {
    const ok = await confirm({
      title: `删除计划表「${plan.title}」？`,
      message: '计划表里的正文、计划条和图片都会一并删除，无法恢复。',
      confirmText: '删除',
      danger: true,
    })
    if (!ok) return
    try {
      await deletePlan(plan.id)
      if (activePlanId === plan.id) setActivePlanId(null)
      showToast('计划表已删除', 'success')
    } catch {
      showToast('删除失败，请稍后再试', 'error')
    }
  }

  if (activePlanId) {
    return <PlanEditor planId={activePlanId} onBack={() => setActivePlanId(null)} />
  }

  return (
    <div className="plans-page">
      <section className="plans-toolbar card">
        <div className="plans-toolbar-title">
          <span className="plans-toolbar-icon">
            <ListChecks size={20} />
          </span>
          <div>
            <h2>我的计划表</h2>
            <p>像整理文件夹一样，把不同目标的计划分开收好。</p>
          </div>
        </div>
        <div className="plans-toolbar-actions">
          <span className="plans-count">{plans.length} 份计划</span>
          <button className="btn btn-primary btn-sm" onClick={openCreate}>
            <FolderPlus size={15} /> 新建计划
          </button>
        </div>
      </section>

      {plans.length === 0 ? (
        <section className="plans-empty card">
          <span className="plans-empty-icon">
            <FolderPlus size={30} />
          </span>
          <h2>先建一份计划表吧</h2>
          <p>
            可以给计划表加一张封面，用标题和正文写清目标，再把要做的事拆成一条条可以打勾的计划。
          </p>
          <button className="btn btn-primary" onClick={openCreate}>
            <Plus size={15} /> 新建第一份计划
          </button>
        </section>
      ) : (
        <div className="plans-grid">
          {plans.map((plan) => (
            <PlanFolderCard
              key={plan.id}
              plan={plan}
              stats={stats.get(plan.id) ?? { done: 0, total: 0 }}
              onOpen={() => setActivePlanId(plan.id)}
              onDelete={() => void handleDelete(plan)}
            />
          ))}
          <button className="plan-folder plan-folder-new" onClick={openCreate}>
            <span className="plan-folder-new-icon">
              <Plus size={22} />
            </span>
            <strong>新建计划表</strong>
            <span>标题、封面和正文都可以稍后修改</span>
          </button>
        </div>
      )}

      <Modal
        open={createOpen}
        onClose={closeCreate}
        title="新建计划表"
        size="md"
        footer={
          <>
            <button className="btn btn-ghost" onClick={closeCreate} disabled={creating}>
              取消
            </button>
            <button className="btn btn-primary" onClick={() => void handleCreate()} disabled={creating}>
              {creating ? <Loader2 size={15} className="spin" /> : <FolderPlus size={15} />}
              {creating ? '创建中…' : '创建并打开'}
            </button>
          </>
        }
      >
        <div className="plan-create">
          <div className="plan-create-cover">
            {coverUrl ? (
              <img src={coverUrl} alt="计划表封面预览" />
            ) : (
              <div className="plan-create-cover-empty">
                <ImagePlus size={24} />
                <span>封面可选</span>
              </div>
            )}
            <div className="plan-create-cover-actions">
              <button
                className="btn btn-subtle btn-sm"
                onClick={() => coverInputRef.current?.click()}
              >
                <ImagePlus size={14} /> {coverFile ? '更换封面' : '选择封面'}
              </button>
              {coverFile && (
                <button className="btn btn-ghost btn-sm" onClick={() => setCoverFile(null)}>
                  <X size={14} /> 移除
                </button>
              )}
              <input
                ref={coverInputRef}
                className="visually-hidden"
                type="file"
                accept="image/*"
                onChange={handleCoverFile}
              />
            </div>
          </div>

          <label className="field">
            <span>计划表标题</span>
            <input
              className="input"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void handleCreate()
              }}
              placeholder="例如：秋招冲刺、AI 应用开发学习计划"
              maxLength={60}
              autoFocus
            />
          </label>
          <p className="field-hint">
            创建后会进入计划编辑页。正文支持三级标题、加粗和文字颜色；计划条可以勾选、展开详情并添加带备注的图片。
          </p>
        </div>
      </Modal>
    </div>
  )
}
