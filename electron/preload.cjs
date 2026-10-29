'use strict'

const { contextBridge, ipcRenderer } = require('electron')

function readArgument(prefix, fallback) {
  const found = process.argv.find((item) => item.startsWith(prefix))
  return found ? found.slice(prefix.length) : fallback
}

function createRequestId() {
  const webCrypto = globalThis.crypto
  if (webCrypto && typeof webCrypto.randomUUID === 'function') {
    return webCrypto.randomUUID()
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

const bridge = {
  isDesktop: true,
  runtime: {
    version: readArgument('--shiguang-version=', '0.0.0'),
    isPackaged: readArgument('--shiguang-packaged=', '0') === '1',
    platform: process.platform,
  },
  app: {
    getInfo: () => ipcRenderer.invoke('app:info'),
    openDataFolder: () => ipcRenderer.invoke('app:open-data-folder'),
    openSnapshotsFolder: () => ipcRenderer.invoke('app:open-snapshots-folder'),
    notifyReady: () => ipcRenderer.send('app:renderer-ready'),
  },
  secrets: {
    getApiKey: () => ipcRenderer.invoke('secrets:get'),
    setApiKey: (key) => ipcRenderer.invoke('secrets:set', key),
    clearApiKey: () => ipcRenderer.invoke('secrets:clear'),
  },
  llm: {
    test: (request) => ipcRenderer.invoke('llm:test', request),
    stream: (request, onEvent) => {
      if (typeof onEvent !== 'function') {
        throw new Error('缺少流式响应回调')
      }
      const id =
        request && typeof request.id === 'string' && request.id
          ? request.id.slice(0, 100)
          : createRequestId()
      let closed = false

      const cleanup = () => {
        if (closed) return
        closed = true
        ipcRenderer.removeListener('llm:stream', listener)
      }

      const listener = (_event, message) => {
        if (!message || message.id !== id) return
        try {
          onEvent(message)
        } finally {
          if (message.type === 'done' || message.type === 'error') cleanup()
        }
      }

      ipcRenderer.on('llm:stream', listener)
      ipcRenderer.send('llm:stream:start', { ...(request || {}), id })

      return () => {
        if (closed) return
        ipcRenderer.send('llm:stream:cancel', id)
        cleanup()
      }
    },
  },
  updates: {
    check: () => ipcRenderer.invoke('updates:check'),
    download: () => ipcRenderer.invoke('updates:download'),
    install: () => ipcRenderer.invoke('updates:install'),
    onStatus: (callback) => {
      if (typeof callback !== 'function') return () => {}
      const listener = (_event, status) => callback(status)
      ipcRenderer.on('updates:status', listener)
      return () => ipcRenderer.removeListener('updates:status', listener)
    },
  },
}

contextBridge.exposeInMainWorld('shiguangDesktop', bridge)
