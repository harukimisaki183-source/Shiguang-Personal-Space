import type { Plan, PlanImage, PlanItem } from './types'
import { blobToDataUrl, dataUrlToBlob, downloadBlob } from './utils'

const ALLOWED_TAGS = new Set([
  'B',
  'STRONG',
  'I',
  'EM',
  'U',
  'S',
  'SPAN',
  'FONT',
  'BR',
  'DIV',
  'P',
  'UL',
  'OL',
  'LI',
])

const FORBIDDEN_TAGS = new Set([
  'SCRIPT',
  'STYLE',
  'IFRAME',
  'OBJECT',
  'EMBED',
  'LINK',
  'META',
  'IMG',
  'SVG',
  'VIDEO',
  'AUDIO',
  'FORM',
  'INPUT',
  'BUTTON',
  'TEXTAREA',
  'SELECT',
])

const ALLOWED_STYLE_PROPS = new Set([
  'color',
  'background-color',
  'font-weight',
  'font-style',
  'text-decoration',
  'text-decoration-line',
])

const COLOR_VALUE = /^[#a-zA-Z0-9(),.%\s-]+$/

function cleanStyle(style: string): string {
  const result: string[] = []
  for (const part of style.split(';')) {
    const [rawName, ...rest] = part.split(':')
    const name = rawName.trim().toLowerCase()
    const value = rest.join(':').trim()
    if (!name || !value) continue
    if (!ALLOWED_STYLE_PROPS.has(name)) continue
    if (/url\s*\(|expression\s*\(|var\s*\(/i.test(value)) continue
    if (!COLOR_VALUE.test(value)) continue
    result.push(`${name}: ${value}`)
  }
  return result.join('; ')
}

function sanitizeNode(node: Node): Node | DocumentFragment | null {
  if (node.nodeType === Node.TEXT_NODE) {
    return document.createTextNode(node.textContent ?? '')
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return null

  const element = node as HTMLElement
  const tag = element.tagName
  if (FORBIDDEN_TAGS.has(tag)) return null

  const children = document.createDocumentFragment()
  if (!ALLOWED_TAGS.has(tag)) {
    for (const child of Array.from(element.childNodes)) {
      const cleaned = sanitizeNode(child)
      if (cleaned) children.appendChild(cleaned)
    }
    return children
  }

  const clone = document.createElement(tag.toLowerCase())
  for (const attribute of Array.from(element.attributes)) {
    const name = attribute.name.toLowerCase()
    if (name === 'style') {
      const safe = cleanStyle(attribute.value)
      if (safe) clone.setAttribute('style', safe)
      continue
    }
    if (tag === 'FONT' && name === 'color') {
      const value = attribute.value.trim()
      if (COLOR_VALUE.test(value)) clone.setAttribute('color', value)
    }
  }

  for (const child of Array.from(element.childNodes)) {
    const cleaned = sanitizeNode(child)
    if (cleaned) clone.appendChild(cleaned)
  }
  return clone
}

/** 只保留加粗、颜色、换行等有限格式，避免导出的 HTML 带入脚本或外部资源。 */
export function sanitizeRichHtml(html: string): string {
  if (!html) return ''
  const template = document.createElement('template')
  template.innerHTML = html
  const output = document.createElement('div')
  for (const child of Array.from(template.content.childNodes)) {
    const cleaned = sanitizeNode(child)
    if (cleaned) output.appendChild(cleaned)
  }
  return output.innerHTML
}

export function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[character] ?? character,
  )
}

function escapeAttr(value: string): string {
  return escapeHtml(value)
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function planFileName(plan: Plan, extension: string): string {
  const safe =
    plan.title
      .replace(/[\\/:*?"<>|]/g, '')
      .trim()
      .slice(0, 30) || '计划表'
  return `拾光-${safe}.${extension}`
}

function blocksToHtml(plan: Plan): string {
  return plan.blocks
    .map((block) => {
      const content = sanitizeRichHtml(block.html)
      if (!content.trim()) return ''
      return `<section class="plan-doc-block plan-doc-${block.type}">${content}</section>`
    })
    .join('')
}

function detailsToHtml(details: string): string {
  return escapeHtml(details).replace(/\n/g, '<br>')
}

function baseDocumentStyles(): string {
  return `
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 48px 20px 72px;
      color: #2f2c27;
      background: #f4f1ea;
      font-family: "Microsoft YaHei", "PingFang SC", "Hiragino Sans GB", -apple-system, sans-serif;
      line-height: 1.7;
    }
    .plan-page { width: min(860px, 100%); margin: 0 auto; }
    .plan-brand {
      display: flex; align-items: center; justify-content: space-between;
      color: #8c8272; font-size: 13px; letter-spacing: 2px;
    }
    .plan-brand strong { color: #7c5a2e; font-size: 16px; letter-spacing: 3px; }
    .plan-title {
      margin: 26px 0 8px;
      color: #29261f;
      font-size: 42px;
      line-height: 1.25;
      letter-spacing: -0.5px;
    }
    .plan-meta { margin: 0 0 30px; color: #8c8272; font-size: 14px; }
    .plan-doc-block { margin: 0 0 14px; overflow-wrap: anywhere; }
    .plan-doc-h1 { margin-top: 36px; font-size: 29px; line-height: 1.4; color: #29261f; }
    .plan-doc-h2 { margin-top: 30px; font-size: 23px; line-height: 1.45; color: #3a362e; }
    .plan-doc-h3 { margin-top: 24px; font-size: 18px; line-height: 1.5; color: #4a453b; }
    .plan-doc-p { font-size: 16px; color: #4a453b; }
    .plan-doc-block strong, .plan-doc-block b { font-weight: 700; }
    .plan-items { margin-top: 34px; display: flex; flex-direction: column; gap: 12px; }
    .plan-item {
      padding: 16px 18px;
      border: 1px solid #e6e0d4;
      border-radius: 14px;
      background: rgba(255, 255, 255, 0.7);
      break-inside: avoid;
    }
    .plan-item.done { background: rgba(235, 242, 234, 0.7); }
    .plan-item-head { display: flex; align-items: flex-start; gap: 12px; }
    .plan-check {
      display: inline-flex; align-items: center; justify-content: center;
      width: 22px; height: 22px; flex: 0 0 auto; margin-top: 1px;
      border: 1.5px solid #b9ad98; border-radius: 7px;
      color: #fff; background: #fff; font-size: 14px; font-weight: 700;
    }
    .plan-item.done .plan-check { border-color: #4f8b5d; background: #4f8b5d; }
    .plan-item-text { font-size: 16px; color: #3a362e; overflow-wrap: anywhere; }
    .plan-item.done .plan-item-text { color: #8b9488; text-decoration: line-through; }
    .plan-item-details { margin: 10px 0 0 34px; color: #6d6558; font-size: 14px; }
    .plan-item-images {
      display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
      gap: 10px; margin: 12px 0 0 34px;
    }
    .plan-item-images figure { margin: 0; }
    .plan-item-images img {
      display: block; width: 100%; height: 130px; object-fit: cover;
      border-radius: 10px; background: #eee7da;
    }
    .plan-item-images figcaption {
      margin-top: 5px; color: #8c8272; font-size: 12px; line-height: 1.5;
      overflow-wrap: anywhere;
    }
    .plan-footer {
      margin-top: 40px; padding-top: 16px; border-top: 1px solid #ddd5c7;
      color: #a19889; font-size: 12px; display: flex; justify-content: space-between;
    }
  `
}

export function buildPlanInteractiveHtml(plan: Plan, items: PlanItem[]): string {
  const bodyHtml = blocksToHtml(plan)
  const doneCount = items.filter((item) => item.checked).length
  const storageKey = JSON.stringify(`shiguang-plan:${plan.id}:checks`)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')

  const itemsHtml = items
    .map((item) => {
      const hasDetails = Boolean(item.details.trim())
      return `
        <section class="plan-item${item.checked ? ' done' : ''}">
          <div class="plan-item-head">
            <label class="plan-item-check">
              <input type="checkbox" data-item="${escapeAttr(item.id)}"${item.checked ? ' checked' : ''} />
              <span class="plan-item-text">${escapeHtml(item.text || '未命名计划条')}</span>
            </label>
            ${
              hasDetails
                ? `<button class="plan-toggle" type="button" aria-expanded="false" aria-label="展开详情"><span>▸</span></button>`
                : ''
            }
          </div>
          ${
            hasDetails
              ? `<div class="plan-item-details" hidden>${detailsToHtml(item.details)}</div>`
              : ''
          }
        </section>`
    })
    .join('')

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${escapeHtml(plan.title)} · 拾光计划表</title>
<style>
  ${baseDocumentStyles()}
  .plan-item-check {
    display: flex; align-items: flex-start; gap: 12px;
    flex: 1; min-width: 0; cursor: pointer; user-select: none;
  }
  .plan-item-check input {
    width: 20px; height: 20px; flex: 0 0 auto; margin: 2px 0 0;
    accent-color: #4f8b5d; cursor: pointer;
  }
  .plan-item-check input:checked + .plan-item-text {
    color: #8b9488; text-decoration: line-through;
  }
  .plan-toggle {
    flex: 0 0 auto; width: 28px; height: 28px; margin-left: 8px;
    border: 0; border-radius: 8px; background: transparent;
    color: #8c8272; font-size: 17px; cursor: pointer;
  }
  .plan-toggle:hover { background: #f0ebe1; }
  .plan-toggle span { display: inline-block; transition: transform .16s ease; }
  .plan-toggle.open span { transform: rotate(90deg); }
  .plan-item-details { white-space: normal; }
  .plan-empty {
    margin-top: 30px; padding: 22px; border: 1px dashed #d8d0c2; border-radius: 14px;
    color: #8c8272; text-align: center; font-size: 14px;
  }
  @media (max-width: 640px) {
    body { padding: 28px 14px 48px; }
    .plan-title { font-size: 30px; }
    .plan-item-images { grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); }
  }
</style>
</head>
<body>
  <main class="plan-page">
    <div class="plan-brand"><strong>拾光 · PLAN</strong><span>${doneCount} / ${items.length} 已完成</span></div>
    <h1 class="plan-title">${escapeHtml(plan.title)}</h1>
    <p class="plan-meta">${formatDate(plan.updatedAt)} · 共 ${items.length} 条计划</p>
    ${bodyHtml}
    ${
      items.length
        ? `<div class="plan-items">${itemsHtml}</div>`
        : `<div class="plan-empty">这份计划还没有添加计划条。</div>`
    }
    <div class="plan-footer"><span>拾光 · 把想做的事收好</span><span>勾选状态会保存在当前浏览器</span></div>
  </main>
  <script>
    (function () {
      var storageKey = ${storageKey};
      function readState() {
        try {
          var raw = localStorage.getItem(storageKey);
          return raw ? JSON.parse(raw) : {};
        } catch (error) {
          return {};
        }
      }
      function writeState(state) {
        try { localStorage.setItem(storageKey, JSON.stringify(state)); } catch (error) {}
      }
      var state = readState();
      document.querySelectorAll('input[data-item]').forEach(function (input) {
        var id = input.getAttribute('data-item');
        if (typeof state[id] === 'boolean') input.checked = state[id];
        var row = input.closest('.plan-item');
        if (row) row.classList.toggle('done', input.checked);
        input.addEventListener('change', function () {
          var next = readState();
          next[id] = input.checked;
          writeState(next);
          if (row) row.classList.toggle('done', input.checked);
        });
      });
      document.querySelectorAll('.plan-toggle').forEach(function (button) {
        button.addEventListener('click', function () {
          var row = button.closest('.plan-item');
          var details = row ? row.querySelector('.plan-item-details') : null;
          if (!details) return;
          var open = details.hasAttribute('hidden');
          if (open) details.removeAttribute('hidden');
          else details.setAttribute('hidden', '');
          button.classList.toggle('open', open);
          button.setAttribute('aria-expanded', String(open));
        });
      });
    })();
  </script>
</body>
</html>`
}

export function exportPlanHtml(plan: Plan, items: PlanItem[]): void {
  const html = buildPlanInteractiveHtml(plan, items)
  downloadBlob(new Blob([html], { type: 'text/html;charset=utf-8' }), planFileName(plan, 'html'))
}

interface PrintAssets {
  coverDataUrl?: string
  imageDataUrls: Record<string, string>
}

function buildPrintHtml(
  plan: Plan,
  items: PlanItem[],
  imagesByItem: Map<string, PlanImage[]>,
  assets: PrintAssets,
): string {
  const doneCount = items.filter((item) => item.checked).length
  const bodyHtml = blocksToHtml(plan)

  const itemsHtml = items
    .map((item) => {
      const images = imagesByItem.get(item.id) ?? []
      const imagesHtml = images
        .map((image) => {
          const dataUrl = assets.imageDataUrls[image.id]
          if (!dataUrl) return ''
          return `<figure><img src="${dataUrl}" alt="${escapeAttr(image.caption || image.name)}" /><figcaption>${escapeHtml(image.caption)}</figcaption></figure>`
        })
        .join('')
      return `
        <section class="plan-item${item.checked ? ' done' : ''}">
          <div class="plan-item-head">
            <span class="plan-check">${item.checked ? '✓' : ''}</span>
            <span class="plan-item-text">${escapeHtml(item.text || '未命名计划条')}</span>
          </div>
          ${item.details.trim() ? `<div class="plan-item-details">${detailsToHtml(item.details)}</div>` : ''}
          ${imagesHtml ? `<div class="plan-item-images">${imagesHtml}</div>` : ''}
        </section>`
    })
    .join('')

  return `<div class="plan-print-inner">
    ${
      assets.coverDataUrl
        ? `<div class="plan-print-cover"><img src="${assets.coverDataUrl}" alt="" /></div>`
        : ''
    }
    <div class="plan-brand"><strong>拾光 · PLAN</strong><span>${doneCount} / ${items.length} 已完成</span></div>
    <h1 class="plan-title">${escapeHtml(plan.title)}</h1>
    <p class="plan-meta">${formatDate(plan.updatedAt)} · 共 ${items.length} 条计划</p>
    ${bodyHtml}
    ${
      items.length
        ? `<div class="plan-items">${itemsHtml}</div>`
        : `<div class="plan-empty">这份计划还没有添加计划条。</div>`
    }
    <div class="plan-footer"><span>拾光 · 把想做的事收好</span><span>PNG 由拾光在本地生成</span></div>
  </div>`
}

async function waitForImages(root: HTMLElement): Promise<void> {
  const images = Array.from(root.querySelectorAll('img'))
  await Promise.all(
    images.map((image) =>
      image.complete
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            image.addEventListener('load', () => resolve(), { once: true })
            image.addEventListener('error', () => resolve(), { once: true })
          }),
    ),
  )
}

export async function exportPlanPng(
  plan: Plan,
  items: PlanItem[],
  images: PlanImage[],
): Promise<void> {
  const imagesByItem = new Map<string, PlanImage[]>()
  for (const image of images) {
    const list = imagesByItem.get(image.itemId)
    if (list) list.push(image)
    else imagesByItem.set(image.itemId, [image])
  }

  const assets: PrintAssets = { imageDataUrls: {} }
  if (plan.cover) assets.coverDataUrl = await blobToDataUrl(plan.cover)
  for (const image of images) {
    assets.imageDataUrls[image.id] = await blobToDataUrl(image.blob)
  }

  const wrapper = document.createElement('div')
  wrapper.className = 'plan-print-view'
  wrapper.innerHTML = buildPrintHtml(plan, items, imagesByItem, assets)
  document.body.appendChild(wrapper)
  try {
    await waitForImages(wrapper)
    await document.fonts?.ready.catch(() => undefined)
    const height = Math.max(wrapper.scrollHeight, 1)
    const pixelRatio = height > 7000 ? 1 : 2
    const { toPng } = await import('html-to-image')
    const dataUrl = await toPng(wrapper, {
      pixelRatio,
      backgroundColor: '#f4f1ea',
      cacheBust: true,
    })
    downloadBlob(dataUrlToBlob(dataUrl), planFileName(plan, 'png'))
  } finally {
    wrapper.remove()
  }
}
