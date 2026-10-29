import { FolderOpen, History, RefreshCw, TriangleAlert } from 'lucide-react'
import { getDesktopBridge } from '../desktop'

export function StartupError({ error }: { error: unknown }) {
  const desktop = getDesktopBridge()
  const message = error instanceof Error ? error.message : String(error)

  return (
    <div className="startup-error">
      <div className="startup-error-card">
        <span className="startup-error-icon">
          <TriangleAlert size={28} />
        </span>
        <h1>拾光没能打开本地数据</h1>
        <p>
          这通常是数据库升级或本机存储出现问题。先不要清空浏览器数据、重装或删除应用数据目录，
          旧内容也许仍然可以恢复。
        </p>
        <pre>{message}</pre>
        <div className="startup-error-actions">
          <button className="btn btn-primary" onClick={() => window.location.reload()}>
            <RefreshCw size={16} /> 重新载入
          </button>
          {desktop && (
            <>
              <button
                className="btn btn-subtle"
                onClick={() => void desktop.app.openDataFolder()}
              >
                <FolderOpen size={16} /> 打开数据目录
              </button>
              <button
                className="btn btn-subtle"
                onClick={() => void desktop.app.openSnapshotsFolder()}
              >
                <History size={16} /> 打开升级快照
              </button>
            </>
          )}
        </div>
        <p className="startup-error-hint">
          {desktop
            ? '桌面版每次跨版本启动前都会自动复制一份旧数据快照。恢复前请完全退出拾光。'
            : '如果问题持续出现，请检查浏览器是否禁用了 IndexedDB，或换一个浏览器试试。'}
        </p>
      </div>
    </div>
  )
}
