export type DesktopChatRole = 'system' | 'user' | 'assistant'

export interface DesktopLlmMessage {
  role: DesktopChatRole
  content: string
}

export interface DesktopLlmRequest {
  id?: string
  endpoint: string
  apiKey: string
  model: string
  messages: DesktopLlmMessage[]
  temperature: number
}

export interface DesktopStreamEvent {
  id: string
  type: 'delta' | 'done' | 'error'
  text?: string
  message?: string
}

export interface DesktopTestResult {
  ok: boolean
  content?: string
  message?: string
}

export interface DesktopUpdateResult {
  ok: boolean
  status?: 'dev' | 'error' | string
  message?: string
}

export interface DesktopUpdateStatus {
  type: 'checking' | 'available' | 'not-available' | 'progress' | 'downloaded' | 'error'
  version?: string
  releaseName?: string
  percent?: number
  message?: string
}

export interface DesktopSnapshot {
  name: string
  path: string
  fromVersion: string
  toVersion: string
  createdAt: string
  copied: string[]
}

export interface DesktopInfo {
  version: string
  isPackaged: boolean
  platform: string
  userDataDir: string
  snapshotsDir: string
  snapshots: DesktopSnapshot[]
  startupSnapshot: Pick<DesktopSnapshot, 'name' | 'path' | 'createdAt'> | null
  secretEncryptionAvailable: boolean
  logFile: string
  dataState: {
    version?: string
    previousVersion?: string | null
    lastRunAt?: string
    lastSuccessfulRunAt?: string
    lastSnapshot?: string | null
  } | null
  isDev: boolean
}

export interface DesktopBridge {
  isDesktop: true
  runtime: {
    version: string
    isPackaged: boolean
    platform: string
  }
  app: {
    getInfo: () => Promise<DesktopInfo>
    openDataFolder: () => Promise<{ ok: boolean; message?: string }>
    openSnapshotsFolder: () => Promise<{ ok: boolean; message?: string }>
    notifyReady: () => void
  }
  secrets: {
    getApiKey: () => Promise<string>
    setApiKey: (key: string) => Promise<{ encrypted: boolean; cleared?: boolean }>
    clearApiKey: () => Promise<{ cleared: boolean }>
  }
  llm: {
    test: (request: DesktopLlmRequest) => Promise<DesktopTestResult>
    stream: (
      request: DesktopLlmRequest,
      onEvent: (event: DesktopStreamEvent) => void,
    ) => () => void
  }
  updates: {
    check: () => Promise<DesktopUpdateResult>
    download: () => Promise<DesktopUpdateResult>
    install: () => Promise<DesktopUpdateResult>
    onStatus: (callback: (status: DesktopUpdateStatus) => void) => () => void
  }
}

declare global {
  interface Window {
    shiguangDesktop?: DesktopBridge
  }
}

export const isDesktopApp =
  typeof window !== 'undefined' && Boolean(window.shiguangDesktop?.isDesktop)

export function getDesktopBridge(): DesktopBridge | undefined {
  return typeof window === 'undefined' ? undefined : window.shiguangDesktop
}
