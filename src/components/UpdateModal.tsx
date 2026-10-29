import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Bug, ShieldCheck, Sparkles, Wrench, X } from 'lucide-react'
import { APP_VERSION, CHANGELOG } from '../changelog'

interface UpdateModalProps {
  open: boolean
  firstRun: boolean
  onClose: () => void
}

export function UpdateModal({ open, firstRun, onClose }: UpdateModalProps) {
  useEffect(() => {
    if (!open) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !firstRun) onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open, firstRun, onClose])

  if (!open) return null
  const entry = CHANGELOG[0]

  return createPortal(
    <div
      className="update-backdrop"
      onMouseDown={(event) => {
        if (!firstRun && event.target === event.currentTarget) onClose()
      }}
    >
      <div className="update-card" role="dialog" aria-modal="true" aria-label="更新公告">
        <div className="update-hero">
          <div className="update-orb update-orb-1" />
          <div className="update-orb update-orb-2" />
          <div className="update-orb update-orb-3" />
          {!firstRun && (
            <button className="update-close" onClick={onClose} aria-label="关闭更新公告">
              <X size={18} />
            </button>
          )}
          <div className="update-logo">拾</div>
          <div className="update-badge">
            v{APP_VERSION} · {entry.date}
          </div>
          <h2>{firstRun ? '欢迎来到拾光' : entry.title}</h2>
          <p>{entry.summary}</p>
        </div>

        <div className="update-content">
          <div className="update-highlights">
            {entry.highlights.map((item) => (
              <div className="update-highlight" key={item.title}>
                <span className="update-highlight-icon">{item.icon}</span>
                <div>
                  <strong>{item.title}</strong>
                  <span>{item.text}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="update-sections">
            <section>
              <h3>
                <Sparkles size={16} /> 新增
              </h3>
              <ul>
                {entry.added.map((text) => (
                  <li key={text}>{text}</li>
                ))}
              </ul>
            </section>
            <section>
              <h3>
                <Wrench size={16} /> 优化
              </h3>
              <ul>
                {entry.improved.map((text) => (
                  <li key={text}>{text}</li>
                ))}
              </ul>
            </section>
            <section>
              <h3>
                <Bug size={16} /> 修复
              </h3>
              <ul>
                {entry.fixed.map((text) => (
                  <li key={text}>{text}</li>
                ))}
              </ul>
            </section>
          </div>

          <div className="update-privacy">
            <ShieldCheck size={17} />
            <span>这是 Web 原型版：数据只保存在当前浏览器，不会上传到服务器。请定期在「设置」中导出备份。</span>
          </div>
        </div>

        <div className="update-foot">
          <span className="muted">当前版本 v{APP_VERSION}</span>
          <button className="btn btn-primary btn-lg" onClick={onClose}>
            {firstRun ? '开始使用' : '知道了'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
