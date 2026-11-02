import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import {
  ChevronLeft,
  FileCode2,
  FileDown,
  FolderOpen,
  ImagePlus,
  Loader2,
  Plus,
  Trash2,
  X,
} from 'lucide-react'
import { useConfirm } from '../../contexts/ConfirmContext'
import { useToast } from '../../contexts/ToastContext'
import {
  addPlanImage,
  addPlanItem,
  deletePlanImage,
  deletePlanItem,
  getPlan,
  listPlanImages,
  listPlanItems,
  updatePlan,
  updatePlanImage,
  updatePlanItem,
} from '../../db'
import { useObjectUrl } from '../../hooks'
import { exportPlanHtml, exportPlanPng } from '../../planExport'
import type { Plan, PlanImage, PlanItem } from '../../types'
import { compressImage, formatBytes, formatRelativeTime, isImageFile } from '../../utils'
import { PlanImageViewer } from './PlanImageViewer'
import { PlanItemRow } from './PlanItemRow'
import { PlanRichText } from './PlanRichText'

const MAX_COVER_BYTES = 25 * 1024 * 1024
const MAX_IMAGES_PER_ITEM = 12

interface PlanEditorProps {
  planId: string
  onBack: () => void
}

interface ItemTimer {
  timer: number
  patch: Partial<Pick<PlanItem, 'text' | 'details'>>
}

interface ImageTimer {
  timer: number
  caption: string
}

export function PlanEditor({ planId, onBack }: PlanEditorProps) {
  const { showToast } = useToast()
  const { confirm } = useConfirm()
  const [plan, setPlan] = useState<Plan | null>(null)
  const [items, setItems] = useState<PlanItem[]>([])
  const [images, setImages] = useState<PlanImage[]>([])
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState<'png' | 'html' | null>(null)
  const [viewerImage, setViewerImage] = useState<PlanImage | null>(null)

  const coverUrl = useObjectUrl(plan?.cover ?? null)
  const planRef = useRef<Plan | null>(null)
  const planTimer = useRef<number | null>(null)
  const itemTimers = useRef(new Map<string, ItemTimer>())
  const imageTimers = useRef(new Map<string, ImageTimer>())
  const coverInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let alive = true
    setLoading(true)
    Promise.all([getPlan(planId), listPlanItems(planId), listPlanImages(planId)])
      .then(([nextPlan, itemList, imageList]) => {
        if (!alive) return
        setPlan(nextPlan)
        planRef.current = nextPlan
        setItems(itemList)
        setImages(imageList)
        setLoading(false)
      })
      .catch(() => {
        if (!alive) return
        setLoading(false)
        showToast('计划表读取失败，请稍后再试', 'error')
      })
    return () => {
      alive = false
    }
  }, [planId, showToast])

  const flushPending = useCallback(() => {
    if (planTimer.current !== null) {
      window.clearTimeout(planTimer.current)
      planTimer.current = null
      const current = planRef.current
      if (current) {
        void updatePlan(current.id, {
          title: current.title,
          cover: current.cover,
          coverName: current.coverName,
          blocks: current.blocks,
        })
      }
    }
    for (const [itemId, entry] of itemTimers.current) {
      window.clearTimeout(entry.timer)
      void updatePlanItem(itemId, entry.patch)
    }
    itemTimers.current.clear()
    for (const [imageId, entry] of imageTimers.current) {
      window.clearTimeout(entry.timer)
      void updatePlanImage(imageId, { caption: entry.caption })
    }
    imageTimers.current.clear()
  }, [])

  useEffect(() => {
    return () => {
      flushPending()
    }
  }, [flushPending])

  const commitPlan = useCallback((next: Plan) => {
    planRef.current = next
    setPlan(next)
    if (planTimer.current !== null) window.clearTimeout(planTimer.current)
    planTimer.current = window.setTimeout(() => {
      planTimer.current = null
      void updatePlan(next.id, {
        title: next.title,
        cover: next.cover,
        coverName: next.coverName,
        blocks: next.blocks,
      })
    }, 450)
  }, [])

  const imagesByItem = useMemo(() => {
    const map = new Map<string, PlanImage[]>()
    for (const image of images) {
      const list = map.get(image.itemId)
      if (list) list.push(image)
      else map.set(image.itemId, [image])
    }
    return map
  }, [images])

  function patchItem(itemId: string, patch: Partial<Pick<PlanItem, 'text' | 'details'>>) {
    setItems((prev) =>
      prev.map((item) =>
        item.id === itemId ? { ...item, ...patch, updatedAt: Date.now() } : item,
      ),
    )
    const existing = itemTimers.current.get(itemId)
    const merged: Partial<Pick<PlanItem, 'text' | 'details'>> = {
      ...(existing?.patch ?? {}),
      ...patch,
    }
    if (existing) window.clearTimeout(existing.timer)
    const timer = window.setTimeout(() => {
      itemTimers.current.delete(itemId)
      void updatePlanItem(itemId, merged)
    }, 450)
    itemTimers.current.set(itemId, { timer, patch: merged })
  }

  function toggleItem(item: PlanItem) {
    const checked = !item.checked
    setItems((prev) =>
      prev.map((current) =>
        current.id === item.id ? { ...current, checked, updatedAt: Date.now() } : current,
      ),
    )
    void updatePlanItem(item.id, { checked })
  }

  async function addItem() {
    if (!plan) return
    try {
      const item = await addPlanItem(plan.id)
      setItems((prev) => [...prev, item])
    } catch {
      showToast('添加计划条失败，请稍后再试', 'error')
    }
  }

  async function removeItem(item: PlanItem) {
    const ok = await confirm({
      title: '删除这条计划？',
      message: '计划条里的详细内容和图片都会一并删除，无法恢复。',
      confirmText: '删除',
      danger: true,
    })
    if (!ok) return
    const pending = itemTimers.current.get(item.id)
    if (pending) {
      window.clearTimeout(pending.timer)
      itemTimers.current.delete(item.id)
    }
    try {
      await deletePlanItem(item.id)
      setItems((prev) => prev.filter((current) => current.id !== item.id))
      setImages((prev) => prev.filter((image) => image.itemId !== item.id))
      if (viewerImage?.itemId === item.id) setViewerImage(null)
      showToast('计划条已删除', 'success')
    } catch {
      showToast('删除失败，请稍后再试', 'error')
    }
  }

  async function addImages(itemId: string, files: File[]) {
    const existingCount = images.filter((image) => image.itemId === itemId).length
    if (existingCount + files.length > MAX_IMAGES_PER_ITEM) {
      showToast(`每条计划最多添加 ${MAX_IMAGES_PER_ITEM} 张图片`, 'error')
      return
    }
    const added: PlanImage[] = []
    const errors: string[] = []
    for (const file of files) {
      try {
        added.push(await addPlanImage(planId, itemId, file))
      } catch (error) {
        errors.push(error instanceof Error ? error.message : `「${file.name}」添加失败`)
      }
    }
    if (added.length) {
      setImages((prev) => [...prev, ...added])
      showToast(`已添加 ${added.length} 张图片`, 'success')
    }
    if (errors.length) showToast(errors.slice(0, 2).join('；'), 'error')
  }

  function updateCaption(imageId: string, caption: string) {
    setImages((prev) =>
      prev.map((image) =>
        image.id === imageId ? { ...image, caption: caption.slice(0, 160) } : image,
      ),
    )
    const existing = imageTimers.current.get(imageId)
    if (existing) window.clearTimeout(existing.timer)
    const timer = window.setTimeout(() => {
      imageTimers.current.delete(imageId)
      void updatePlanImage(imageId, { caption: caption.slice(0, 160) })
    }, 450)
    imageTimers.current.set(imageId, { timer, caption: caption.slice(0, 160) })
  }

  async function removeImage(image: PlanImage) {
    const ok = await confirm({
      title: '移除这张图片？',
      message: '图片和它的备注会从这条计划里删除，无法恢复。',
      confirmText: '移除',
      danger: true,
    })
    if (!ok) return
    const pending = imageTimers.current.get(image.id)
    if (pending) {
      window.clearTimeout(pending.timer)
      imageTimers.current.delete(image.id)
    }
    try {
      await deletePlanImage(image.id)
      setImages((prev) => prev.filter((current) => current.id !== image.id))
      if (viewerImage?.id === image.id) setViewerImage(null)
      showToast('图片已移除', 'success')
    } catch {
      showToast('移除失败，请稍后再试', 'error')
    }
  }

  async function handleCoverFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !plan) return
    if (!isImageFile(file)) {
      showToast('封面需要是图片文件', 'error')
      return
    }
    if (file.size > MAX_COVER_BYTES) {
      showToast('封面图片超过 25MB，请换一张小一点的图片', 'error')
      return
    }
    try {
      const compressed = await compressImage(file)
      commitPlan({ ...plan, cover: compressed.blob, coverName: file.name })
      showToast('封面已更新，会自动保存', 'success')
    } catch (error) {
      showToast(error instanceof Error ? error.message : '封面处理失败', 'error')
    }
  }

  function removeCover() {
    if (!plan) return
    const { cover: _cover, coverName: _coverName, ...rest } = plan
    commitPlan(rest)
    showToast('封面已移除', 'success')
  }

  function handleBack() {
    flushPending()
    onBack()
  }

  async function handleExportHtml() {
    if (!plan || exporting) return
    setExporting('html')
    try {
      flushPending()
      exportPlanHtml(plan, items)
      showToast('已导出可互动 HTML 文件', 'success')
    } catch (error) {
      showToast(error instanceof Error ? error.message : '导出 HTML 失败', 'error')
    } finally {
      setExporting(null)
    }
  }

  async function handleExportPng() {
    if (!plan || exporting) return
    setExporting('png')
    try {
      flushPending()
      await exportPlanPng(plan, items, images)
      showToast('计划表 PNG 已导出', 'success')
    } catch (error) {
      showToast(error instanceof Error ? error.message : '导出 PNG 失败，请稍后再试', 'error')
    } finally {
      setExporting(null)
    }
  }

  if (loading) {
    return (
      <div className="plan-editor-loading card">
        <Loader2 size={20} className="spin" />
        <span>正在打开计划表…</span>
      </div>
    )
  }

  if (!plan) {
    return (
      <div className="plan-editor-missing card">
        <FolderOpen size={26} />
        <h2>这份计划表不存在了</h2>
        <p>它可能已经被删除。</p>
        <button className="btn btn-primary btn-sm" onClick={onBack}>
          返回计划表
        </button>
      </div>
    )
  }

  const checkedCount = items.filter((item) => item.checked).length
  const imageBytes = images.reduce((sum, image) => sum + image.size, 0)

  return (
    <div className="plan-editor">
      <div className="plan-editor-topbar">
        <button className="btn btn-ghost btn-sm" onClick={handleBack}>
          <ChevronLeft size={15} /> 返回计划表
        </button>
        <div className="plan-editor-actions">
          <span className="plan-autosave">内容会自动保存到本机</span>
          <button
            className="btn btn-subtle btn-sm"
            onClick={() => void handleExportHtml()}
            disabled={!!exporting}
          >
            {exporting === 'html' ? (
              <Loader2 size={15} className="spin" />
            ) : (
              <FileCode2 size={15} />
            )}
            {exporting === 'html' ? '导出中…' : '导出 HTML'}
          </button>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => void handleExportPng()}
            disabled={!!exporting}
          >
            {exporting === 'png' ? (
              <Loader2 size={15} className="spin" />
            ) : (
              <FileDown size={15} />
            )}
            {exporting === 'png' ? '生成中…' : '导出 PNG'}
          </button>
        </div>
      </div>

      <section className="plan-editor-hero card">
        <div className="plan-cover">
          {coverUrl ? (
            <img src={coverUrl} alt={plan.coverName || '计划表封面'} />
          ) : (
            <div className="plan-cover-placeholder">
              <FolderOpen size={28} />
              <span>给这份计划加一张封面</span>
            </div>
          )}
          <div className="plan-cover-actions">
            <button
              className="btn btn-subtle btn-sm"
              onClick={() => coverInputRef.current?.click()}
            >
              <ImagePlus size={14} /> {coverUrl ? '更换封面' : '上传封面'}
            </button>
            {coverUrl && (
              <button className="btn btn-ghost btn-sm" onClick={removeCover}>
                <X size={14} /> 移除
              </button>
            )}
            <input
              ref={coverInputRef}
              className="visually-hidden"
              type="file"
              accept="image/*"
              onChange={(event) => void handleCoverFile(event)}
            />
          </div>
        </div>

        <div className="plan-editor-heading">
          <input
            className="plan-title-input"
            value={plan.title}
            onChange={(event) => commitPlan({ ...plan, title: event.target.value })}
            placeholder="给这份计划表起个名字"
            maxLength={60}
            aria-label="计划表标题"
          />
          <div className="plan-editor-meta">
            <span>{formatRelativeTime(plan.updatedAt)}更新</span>
            <span>{items.length} 条计划</span>
            <span>
              {checkedCount} / {items.length} 已完成
            </span>
            {images.length > 0 && <span>{formatBytes(imageBytes)} 图片</span>}
          </div>
        </div>
      </section>

      <section className="plan-editor-section card">
        <div className="plan-section-head">
          <div>
            <h2>正文</h2>
            <p>用大标题、中标题、小标题组织内容，选中文字可以加粗或换颜色。</p>
          </div>
        </div>
        <PlanRichText
          blocks={plan.blocks}
          onChange={(blocks) => commitPlan({ ...plan, blocks })}
        />
      </section>

      <section className="plan-editor-section card">
        <div className="plan-section-head">
          <div>
            <h2>
              计划条 <em>{checkedCount} / {items.length}</em>
            </h2>
            <p>点左侧圆圈勾选，点右侧三角展开详细内容；图片会显示在计划条末尾。</p>
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => void addItem()}>
            <Plus size={15} /> 添加计划条
          </button>
        </div>

        <div className="plan-items-editor">
          {items.map((item) => (
            <PlanItemRow
              key={item.id}
              item={item}
              images={imagesByItem.get(item.id) ?? []}
              onToggle={() => toggleItem(item)}
              onPatch={(patch) => patchItem(item.id, patch)}
              onDelete={() => void removeItem(item)}
              onAddImages={(files) => addImages(item.id, files)}
              onUpdateCaption={updateCaption}
              onDeleteImage={(imageId) => {
                const image = images.find((current) => current.id === imageId)
                if (image) void removeImage(image)
              }}
              onOpenImage={setViewerImage}
            />
          ))}
          {items.length === 0 && (
            <div className="plan-items-empty">
              <span className="plan-items-empty-icon">
                <Plus size={20} />
              </span>
              <strong>还没有计划条</strong>
              <p>把大目标拆成几条可以打勾的小计划，完成一条就勾掉一条。</p>
              <button className="btn btn-subtle btn-sm" onClick={() => void addItem()}>
                <Plus size={14} /> 添加第一条计划
              </button>
            </div>
          )}
        </div>

        {items.length > 0 && (
          <div className="plan-items-add-row">
            <button className="btn btn-ghost btn-sm" onClick={() => void addItem()}>
              <Plus size={15} /> 继续添加计划条
            </button>
            <span className="muted">
              <Trash2 size={12} /> 删除计划条前会再次确认
            </span>
          </div>
        )}
      </section>

      <PlanImageViewer image={viewerImage} onClose={() => setViewerImage(null)} />
    </div>
  )
}
