import type { Settings } from './types'

const SETTINGS_KEY = 'interview-hub:settings:v1'
const LAST_SEEN_KEY = 'interview-hub:last-seen-version'

export const DEFAULT_SETTINGS: Settings = {
  nickname: '小拾',
  avatar: '🌿',
  bio: '记录每一天，也记录成长。',
  theme: 'light',
  demoMode: true,
  baseUrl: 'https://api.deepseek.com/v1',
  apiKey: '',
  model: 'deepseek-chat',
  temperature: 0.7,
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) return { ...DEFAULT_SETTINGS }
    const parsed = JSON.parse(raw) as Partial<Settings>
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      theme: parsed.theme === 'dark' ? 'dark' : 'light',
      temperature:
        typeof parsed.temperature === 'number' && Number.isFinite(parsed.temperature)
          ? Math.min(1.5, Math.max(0, parsed.temperature))
          : DEFAULT_SETTINGS.temperature,
      demoMode: parsed.demoMode !== false,
    }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  } catch {
    // localStorage 不可用时，设置只在本次会话中生效
  }
}

export function getLastSeenVersion(): string | null {
  try {
    return localStorage.getItem(LAST_SEEN_KEY)
  } catch {
    return null
  }
}

export function markVersionSeen(version: string): void {
  try {
    localStorage.setItem(LAST_SEEN_KEY, version)
  } catch {
    // ignore
  }
}

export const STORAGE_KEYS = {
  settings: SETTINGS_KEY,
  lastSeenVersion: LAST_SEEN_KEY,
  seeded: 'interview-hub:seeded',
  lastTrack: 'interview-hub:last-track',
  volume: 'interview-hub:volume',
  theme: 'interview-hub:theme',
} as const
