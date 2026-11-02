import { useCallback, useEffect, useRef, useState } from 'react'
import { Bold, Palette, Plus, Trash2 } from 'lucide-react'
import { sanitizeRichHtml } from '../../planExport'
import type { PlanBlock, PlanBlockType } from '../../types'
import { uid } from '../../utils'

interface PlanRichTextProps {
  blocks: PlanBlock[]
  onChange: (blocks: PlanBlock[]) => void
}

const BLOCK_TYPES: { type: PlanBlockType; label: string; short: string }[] = [
  { type: 'h1', label: '大标题', short: 'H1' },
  { type: 'h2', label: '中标题', short: 'H2' },
  { type: 'h3', label: '小标题', short: 'H3' },
  { type: 'p', label: '正文', short: '正文' },
]

const COLOR_SWATCHES = [
  '#2f2c27',
  '#b45309',
  '#b91c1c',
  '#15803d',
  '#1d4ed8',
  '#7c3aed',
  '#0f766e',
  '#9d174d',
]

const PLACEHOLDERS: Record<PlanBlockType, string> = {
  h1: '大标题',
  h2: '中标题',
  h3: '小标题',
  p: '写下背景、目标或步骤说明…',
}

interface EditableBlockProps {
  block: PlanBlock
  onChange: (html: string) => void
  onFocus: () => void
  onEnter: () => void
  register: (id: string, element: HTMLDivElement | null) => void
}

function EditableBlock({ block, onChange, onFocus, onEnter, register }: EditableBlockProps) {
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const element = ref.current
    if (!element) return
    if (document.activeElement === element) return
    const safe = sanitizeRichHtml(block.html)
    if (element.innerHTML !== safe) element.innerHTML = safe
  }, [block.html])

  return (
    <div
      ref={(element) => {
        ref.current = element
        register(block.id, element)
      }}
      className={`plan-block plan-block-${block.type}`}
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      data-block-id={block.id}
      data-placeholder={PLACEHOLDERS[block.type]}
      onFocus={onFocus}
      onInput={(event) => onChange(event.currentTarget.innerHTML)}
      onBlur={(event) => {
        const clean = sanitizeRichHtml(event.currentTarget.innerHTML)
        if (clean !== event.currentTarget.innerHTML) {
          event.currentTarget.innerHTML = clean
        }
        onChange(clean)
      }}
      onPaste={(event) => {
        event.preventDefault()
        const text = event.clipboardData.getData('text/plain')
        if (text) document.execCommand('insertText', false, text)
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault()
          onEnter()
        }
      }}
    />
  )
}

export function PlanRichText({ blocks, onChange }: PlanRichTextProps) {
  const editorRef = useRef<HTMLDivElement | null>(null)
  const blockRefs = useRef(new Map<string, HTMLDivElement>())
  const savedRange = useRef<Range | null>(null)
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null)
  const [color, setColor] = useState('#2f2c27')

  const register = useCallback((id: string, element: HTMLDivElement | null) => {
    if (element) blockRefs.current.set(id, element)
    else blockRefs.current.delete(id)
  }, [])

  const rememberSelection = useCallback(() => {
    const selection = window.getSelection()
    if (!selection || !selection.rangeCount) return
    const range = selection.getRangeAt(0)
    if (editorRef.current?.contains(range.commonAncestorContainer)) {
      savedRange.current = range.cloneRange()
    }
  }, [])

  const restoreSelection = useCallback(() => {
    const range = savedRange.current
    if (!range) return false
    const selection = window.getSelection()
    if (!selection) return false
    selection.removeAllRanges()
    selection.addRange(range)
    return true
  }, [])

  function updateBlockHtml(blockId: string, html: string) {
    onChange(blocks.map((block) => (block.id === blockId ? { ...block, html } : block)))
  }

  function focusBlock(blockId: string) {
    const element = blockRefs.current.get(blockId)
    if (!element) return
    element.focus()
    const selection = window.getSelection()
    if (!selection) return
    const range = document.createRange()
    range.selectNodeContents(element)
    range.collapse(false)
    selection.removeAllRanges()
    selection.addRange(range)
  }

  function ensureActiveElement(): HTMLDivElement | null {
    let blockId = activeBlockId
    if (!blockId && blocks.length) blockId = blocks[blocks.length - 1].id
    if (!blockId) return null
    const element = blockRefs.current.get(blockId)
    if (element) return element
    return null
  }

  function runCommand(command: string, value?: string) {
    const element = ensureActiveElement()
    if (!element) return
    if (document.activeElement !== element) element.focus()
    if (!restoreSelection()) {
      const selection = window.getSelection()
      if (selection) {
        const range = document.createRange()
        range.selectNodeContents(element)
        range.collapse(false)
        selection.removeAllRanges()
        selection.addRange(range)
      }
    }
    document.execCommand(command, false, value)
    rememberSelection()
    const blockId = element.dataset.blockId
    if (blockId) updateBlockHtml(blockId, element.innerHTML)
  }

  function applyColor(nextColor: string) {
    setColor(nextColor)
    runCommand('foreColor', nextColor)
  }

  function addBlock(type: PlanBlockType, afterId?: string) {
    const block: PlanBlock = { id: uid(), type, html: '' }
    const index = afterId
      ? blocks.findIndex((item) => item.id === afterId)
      : activeBlockId
        ? blocks.findIndex((item) => item.id === activeBlockId)
        : blocks.length - 1
    const next = [...blocks]
    next.splice(index < 0 ? next.length : index + 1, 0, block)
    onChange(next)
    window.setTimeout(() => focusBlock(block.id), 30)
  }

  function removeBlock(blockId: string) {
    const next = blocks.filter((block) => block.id !== blockId)
    onChange(next.length ? next : [{ id: uid(), type: 'p', html: '' }])
  }

  function changeBlockType(blockId: string, type: PlanBlockType) {
    onChange(blocks.map((block) => (block.id === blockId ? { ...block, type } : block)))
  }

  return (
    <div className="plan-rich" ref={editorRef}>
      <div className="plan-rich-toolbar">
        <div className="plan-rich-add">
          <span>插入</span>
          {BLOCK_TYPES.map((item) => (
            <button
              key={item.type}
              className="chip chip-sm"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => addBlock(item.type)}
              title={`插入${item.label}`}
            >
              <Plus size={12} /> {item.label}
            </button>
          ))}
        </div>
        <div className="plan-rich-format">
          <button
            className="tool-btn"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => runCommand('bold')}
            title="加粗选中文字"
          >
            <Bold size={15} /> 加粗
          </button>
          <label className="plan-color-tool" title="自定义文字颜色">
            <Palette size={15} />
            <span>颜色</span>
            <input
              type="color"
              value={color}
              onMouseDown={rememberSelection}
              onChange={(event) => applyColor(event.target.value)}
              aria-label="自定义文字颜色"
            />
          </label>
          <div className="plan-color-swatches" aria-label="常用颜色">
            {COLOR_SWATCHES.map((swatch) => (
              <button
                key={swatch}
                className={`plan-color-swatch ${color === swatch ? 'active' : ''}`}
                style={{ backgroundColor: swatch }}
                onMouseDown={(event) => {
                  event.preventDefault()
                  rememberSelection()
                }}
                onClick={() => applyColor(swatch)}
                aria-label={`使用颜色 ${swatch}`}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="plan-rich-blocks" onMouseUp={rememberSelection} onKeyUp={rememberSelection}>
        {blocks.map((block) => (
          <div className="plan-block-row" key={block.id}>
            <select
              className="plan-block-type"
              value={block.type}
              onChange={(event) => changeBlockType(block.id, event.target.value as PlanBlockType)}
              aria-label="段落类型"
            >
              {BLOCK_TYPES.map((item) => (
                <option key={item.type} value={item.type}>
                  {item.short}
                </option>
              ))}
            </select>
            <EditableBlock
              block={block}
              onChange={(html) => updateBlockHtml(block.id, html)}
              onFocus={() => setActiveBlockId(block.id)}
              onEnter={() => addBlock('p', block.id)}
              register={register}
            />
            <button
              className="icon-btn icon-btn-sm plan-block-delete"
              onClick={() => removeBlock(block.id)}
              title="删除这一段"
              aria-label="删除这一段"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
