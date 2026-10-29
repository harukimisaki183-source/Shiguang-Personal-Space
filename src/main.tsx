import { createRoot } from 'react-dom/client'
import App from './App'
import { StartupError } from './components/StartupError'
import { getDesktopBridge } from './desktop'
import { db } from './db'
import { loadSettings, saveSettings } from './storage'
import './styles.css'

async function resolveApiKey(): Promise<string> {
  const desktop = getDesktopBridge()
  if (!desktop) return ''
  try {
    let key = await desktop.secrets.getApiKey()
    const legacyKey = loadSettings().apiKey
    if (!key && legacyKey) {
      // 从旧版 localStorage 明文 Key 迁移到系统加密存储
      await desktop.secrets.setApiKey(legacyKey)
      saveSettings({ ...loadSettings(), apiKey: '' })
      key = legacyKey
    }
    return key
  } catch {
    return ''
  }
}

async function boot() {
  const container = document.getElementById('root')
  if (!container) throw new Error('找不到 #root 挂载节点')

  const initialSettings = loadSettings()
  document.documentElement.dataset.theme = initialSettings.theme

  try {
    // 先让 Dexie 完成所有 schema 升级，再渲染界面，避免半升级状态下读写。
    await db.open()
    const initialApiKey = await resolveApiKey()
    const root = createRoot(container)
    root.render(<App initialApiKey={initialApiKey} />)

    const desktop = getDesktopBridge()
    if (desktop) {
      requestAnimationFrame(() => desktop.app.notifyReady())
    }
  } catch (error) {
    console.error('启动失败', error)
    const root = createRoot(container)
    root.render(<StartupError error={error} />)
  }
}

void boot()
