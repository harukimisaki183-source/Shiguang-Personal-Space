import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { getDesktopBridge } from '../desktop'
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from '../storage'
import type { Settings } from '../types'

interface SettingsContextValue {
  settings: Settings
  updateSettings: (patch: Partial<Settings>) => void
  resetSettings: () => void
}

const SettingsContext = createContext<SettingsContextValue | null>(null)

export function SettingsProvider({
  children,
  initialApiKey = '',
}: {
  children: ReactNode
  initialApiKey?: string
}) {
  const [settings, setSettings] = useState<Settings>(() => {
    const loaded = loadSettings()
    return initialApiKey ? { ...loaded, apiKey: initialApiKey } : loaded
  })
  const lastSavedKey = useRef(initialApiKey)

  useEffect(() => {
    saveSettings(settings)
    document.documentElement.dataset.theme = settings.theme
    const meta = document.querySelector('meta[name="theme-color"]')
    meta?.setAttribute('content', settings.theme === 'dark' ? '#0e1017' : '#4f46e5')

    const desktop = getDesktopBridge()
    if (desktop && settings.apiKey !== lastSavedKey.current) {
      lastSavedKey.current = settings.apiKey
      void desktop.secrets.setApiKey(settings.apiKey).catch(() => {
        // 保存失败时仍保留当前会话内的 Key，用户可再次保存重试
      })
    }
  }, [settings])

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => ({ ...prev, ...patch }))
  }, [])

  const resetSettings = useCallback(() => {
    setSettings({ ...DEFAULT_SETTINGS })
  }, [])

  const value = useMemo(
    () => ({ settings, updateSettings, resetSettings }),
    [settings, updateSettings, resetSettings],
  )

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}

export function useSettings(): SettingsContextValue {
  const context = useContext(SettingsContext)
  if (!context) throw new Error('useSettings 必须在 SettingsProvider 内使用')
  return context
}
