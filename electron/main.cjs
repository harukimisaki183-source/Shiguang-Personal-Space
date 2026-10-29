'use strict'

const fs = require('node:fs')
const fsp = require('node:fs/promises')
const path = require('node:path')
const {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  protocol,
  session,
  shell,
} = require('electron')
const { autoUpdater } = require('electron-updater')
const {
  createPreUpdateSnapshot,
  listSnapshots,
  readDataState,
  snapshotRoot,
  writeDataState,
} = require('./data-safety.cjs')
const { registerLlmIpc } = require('./llm-proxy.cjs')
const { clearApiKey, encryptionAvailable, readApiKey, writeApiKey } = require('./secrets.cjs')

const APP_ID = 'com.harukimisaki.shiguang'
const APP_ORIGIN = 'app://shiguang'
// 重要：自定义协议的主机名决定了 IndexedDB/localStorage 的 origin。
// 发布后不要改这里的 scheme 或 host，否则老版本的数据会“消失”。
const APP_SCHEME = 'app'
const APP_HOST = 'shiguang'
const DIST_DIR = path.join(__dirname, '..', 'dist')
const ICON_PATH = path.join(__dirname, '..', 'build', 'icon.png')
const isDev = !app.isPackaged
const devUrl = process.env.VITE_DEV_SERVER_URL || ''

// 开发版和安装版使用不同目录，避免开发时的测试内容混进正式数据。
const APP_USER_DATA =
  process.env.SHIGUANG_USER_DATA ||
  path.join(app.getPath('appData'), isDev ? 'Shiguang Dev' : 'Shiguang')
app.setPath('userData', APP_USER_DATA)
app.setName('拾光')
app.setAppUserModelId(APP_ID)

protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
])

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
  "form-action 'none'",
].join('; ')

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8',
}

let mainWindow = null
let logFile = ''
let dataStateBefore = null
let startupSnapshot = null
let rendererReady = false
let llm = null
let updateListenersReady = false

function log(message) {
  const line = `[${new Date().toISOString()}] ${message}\n`
  process.stdout.write(line)
  if (!logFile) return
  try {
    fs.mkdirSync(path.dirname(logFile), { recursive: true })
    if (fs.existsSync(logFile) && fs.statSync(logFile).size > 2 * 1024 * 1024) {
      fs.renameSync(logFile, `${logFile}.old`)
    }
    fs.appendFileSync(logFile, line, 'utf8')
  } catch {
    // 日志写入失败不应影响应用
  }
}

function logError(scope, error) {
  const detail = error instanceof Error ? `${error.message}\n${error.stack || ''}` : String(error)
  log(`[ERROR] ${scope}: ${detail}`)
}

function isTrustedFrameUrl(value) {
  try {
    const url = new URL(String(value || ''))
    if (url.protocol === `${APP_SCHEME}:` && url.hostname === APP_HOST) return true
    if (devUrl) {
      const dev = new URL(devUrl)
      return url.origin === dev.origin
    }
  } catch {
    // 无效 URL 一律视为不可信
  }
  return false
}

function isTrusted(event) {
  const frameUrl = event?.senderFrame?.url || event?.sender?.getURL?.() || ''
  return isTrustedFrameUrl(frameUrl)
}

function sendUpdate(payload) {
  if (!mainWindow || mainWindow.isDestroyed()) return
  mainWindow.webContents.send('updates:status', payload)
}

function updateErrorMessage(error) {
  const message = error instanceof Error ? error.message : String(error)
  logError('升级检查', error)
  if (/404|not found|latest\.yml|release/i.test(message)) {
    return '还没有找到可用的新版本发布记录。可以稍后再试，或到 GitHub Releases 手动下载。'
  }
  if (/ENOTFOUND|ECONN|ETIMEDOUT|net::/i.test(message)) {
    return '网络连接失败，暂时无法检查更新。请检查网络后再试。'
  }
  return '检查更新失败。可以稍后再试，或到 GitHub Releases 手动下载新版本。'
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#f6f5f3',
    title: '拾光',
    icon: fs.existsSync(ICON_PATH) ? ICON_PATH : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: isDev,
      spellcheck: false,
      backgroundThrottling: false,
      additionalArguments: [
        `--shiguang-version=${app.getVersion()}`,
        `--shiguang-packaged=${app.isPackaged ? '1' : '0'}`,
      ],
    },
  })

  if (isDev) {
    Menu.setApplicationMenu(null)
    mainWindow.webContents.on('before-input-event', (_event, input) => {
      if (input.type === 'keyDown' && input.key === 'F12') {
        mainWindow?.webContents.toggleDevTools()
      }
    })
  } else {
    Menu.setApplicationMenu(null)
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.on('closed', () => {
    llm?.abortAll()
    mainWindow = null
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (isTrustedFrameUrl(url)) return
    event.preventDefault()
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
  })

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    logError('渲染进程退出', new Error(`${details.reason} (${details.exitCode})`))
  })

  mainWindow.webContents.on('did-fail-load', (_event, code, description, url) => {
    if (code === -3) return // 用户主动中止
    logError('页面加载失败', new Error(`${description} (${code}) ${url}`))
    if (!mainWindow || mainWindow.isDestroyed()) return
    dialog.showErrorBox(
      '拾光没能打开界面',
      `页面加载失败：${description}（${code}）\n\n可以尝试重新安装，或检查应用文件是否完整。`,
    )
  })

  if (isDev && devUrl) {
    await mainWindow.loadURL(devUrl)
  } else {
    await mainWindow.loadURL(`${APP_ORIGIN}/index.html`)
  }
}

async function registerAppProtocol() {
  protocol.handle(APP_SCHEME, async (request) => {
    try {
      const url = new URL(request.url)
      if (url.hostname !== APP_HOST) {
        return new Response('Not found', { status: 404 })
      }

      let pathname
      try {
        pathname = decodeURIComponent(url.pathname)
      } catch {
        return new Response('Bad request', { status: 400 })
      }
      if (pathname === '/' || pathname === '') pathname = '/index.html'

      const root = path.resolve(DIST_DIR)
      const relative = pathname.replace(/^[/\\]+/, '')
      let filePath = path.resolve(root, relative)
      let relation = path.relative(root, filePath)
      if (relation.startsWith('..') || path.isAbsolute(relation)) {
        return new Response('Forbidden', { status: 403 })
      }

      let info = null
      try {
        info = await fsp.stat(filePath)
      } catch {
        info = null
      }
      if (!info || !info.isFile()) {
        if (!path.extname(relative)) {
          filePath = path.join(root, 'index.html')
          relation = path.relative(root, filePath)
        } else {
          return new Response('Not found', { status: 404 })
        }
      }

      const body = request.method === 'HEAD' ? null : await fsp.readFile(filePath)
      const headers = new Headers({
        'Content-Type':
          MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
        'Content-Security-Policy': CONTENT_SECURITY_POLICY,
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
        'Cache-Control': relation.includes(`${path.sep}assets${path.sep}`)
          ? 'public, max-age=31536000, immutable'
          : 'no-cache',
      })
      return new Response(body, { status: 200, headers })
    } catch (error) {
      logError('读取界面文件', error)
      return new Response('Internal error', { status: 500 })
    }
  })
}

function configureSession() {
  const ses = session.defaultSession

  const allowedPermissions = new Set(['clipboard-sanitized-write', 'fullscreen'])
  ses.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(allowedPermissions.has(permission))
  })
  ses.setPermissionCheckHandler((_webContents, permission) => {
    return allowedPermissions.has(permission)
  })

  ses.on('will-download', (_event, item) => {
    const filename = item.getFilename() || 'download'
    try {
      item.setSaveDialogOptions({
        title: '保存文件',
        defaultPath: path.join(app.getPath('downloads'), filename),
      })
    } catch (error) {
      logError('设置下载路径', error)
    }
  })
}

function registerAppIpc() {
  ipcMain.handle('app:info', async (event) => {
    if (!isTrusted(event)) throw new Error('未授权的请求来源')
    return {
      version: app.getVersion(),
      isPackaged: app.isPackaged,
      platform: process.platform,
      userDataDir: APP_USER_DATA,
      snapshotsDir: snapshotRoot(APP_USER_DATA),
      snapshots: await listSnapshots(APP_USER_DATA),
      startupSnapshot: startupSnapshot
        ? {
            name: startupSnapshot.name,
            path: startupSnapshot.path,
            createdAt: startupSnapshot.createdAt,
          }
        : null,
      secretEncryptionAvailable: encryptionAvailable(),
      logFile,
      dataState: await readDataState(APP_USER_DATA),
      isDev,
    }
  })

  ipcMain.handle('app:open-data-folder', async (event) => {
    if (!isTrusted(event)) throw new Error('未授权的请求来源')
    await fsp.mkdir(APP_USER_DATA, { recursive: true })
    const error = await shell.openPath(APP_USER_DATA)
    return error ? { ok: false, message: error } : { ok: true }
  })

  ipcMain.handle('app:open-snapshots-folder', async (event) => {
    if (!isTrusted(event)) throw new Error('未授权的请求来源')
    const dir = snapshotRoot(APP_USER_DATA)
    await fsp.mkdir(dir, { recursive: true })
    const error = await shell.openPath(dir)
    return error ? { ok: false, message: error } : { ok: true }
  })

  ipcMain.on('app:renderer-ready', async (event) => {
    if (!isTrusted(event) || rendererReady) return
    rendererReady = true
    const now = new Date().toISOString()
    try {
      await writeDataState(APP_USER_DATA, {
        ...(dataStateBefore || {}),
        version: app.getVersion(),
        previousVersion: dataStateBefore?.version || null,
        lastRunAt: now,
        lastSuccessfulRunAt: now,
        lastSnapshot: startupSnapshot?.name || dataStateBefore?.lastSnapshot || null,
      })
      log(`渲染层就绪，数据版本标记为 ${app.getVersion()}`)
    } catch (error) {
      logError('写入数据版本标记', error)
    }
  })

  ipcMain.handle('secrets:get', async (event) => {
    if (!isTrusted(event)) throw new Error('未授权的请求来源')
    return readApiKey(APP_USER_DATA)
  })

  ipcMain.handle('secrets:set', async (event, key) => {
    if (!isTrusted(event)) throw new Error('未授权的请求来源')
    if (typeof key !== 'string') throw new Error('API Key 格式不正确')
    return writeApiKey(APP_USER_DATA, key)
  })

  ipcMain.handle('secrets:clear', async (event) => {
    if (!isTrusted(event)) throw new Error('未授权的请求来源')
    return clearApiKey(APP_USER_DATA)
  })

  ipcMain.handle('updates:check', async (event) => {
    if (!isTrusted(event)) return { ok: false, message: '未授权的请求来源' }
    if (!app.isPackaged) {
      return { ok: false, status: 'dev', message: '开发模式不会连接更新服务器。' }
    }
    try {
      await autoUpdater.checkForUpdates()
      return { ok: true }
    } catch (error) {
      return { ok: false, status: 'error', message: updateErrorMessage(error) }
    }
  })

  ipcMain.handle('updates:download', async (event) => {
    if (!isTrusted(event)) return { ok: false, message: '未授权的请求来源' }
    if (!app.isPackaged) return { ok: false, message: '开发模式不能下载更新。' }
    try {
      await autoUpdater.downloadUpdate()
      return { ok: true }
    } catch (error) {
      return { ok: false, message: updateErrorMessage(error) }
    }
  })

  ipcMain.handle('updates:install', (event) => {
    if (!isTrusted(event)) return { ok: false, message: '未授权的请求来源' }
    if (!app.isPackaged) return { ok: false, message: '开发模式不能安装更新。' }
    setImmediate(() => {
      try {
        autoUpdater.quitAndInstall(false, true)
      } catch (error) {
        logError('安装更新', error)
      }
    })
    return { ok: true }
  })
}

function setupAutoUpdater() {
  if (updateListenersReady) return
  updateListenersReady = true
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.allowPrerelease = false

  autoUpdater.on('checking-for-update', () => {
    sendUpdate({ type: 'checking', message: '正在检查更新…' })
  })
  autoUpdater.on('update-available', (info) => {
    sendUpdate({
      type: 'available',
      version: info.version,
      releaseName: info.releaseName,
      message: `发现新版本 v${info.version}`,
    })
  })
  autoUpdater.on('update-not-available', (info) => {
    sendUpdate({
      type: 'not-available',
      version: info.version,
      message: '已经是最新版本。',
    })
  })
  autoUpdater.on('download-progress', (progress) => {
    sendUpdate({
      type: 'progress',
      percent: Math.max(0, Math.min(100, progress.percent || 0)),
      message: `正在下载更新… ${Math.round(progress.percent || 0)}%`,
    })
  })
  autoUpdater.on('update-downloaded', (info) => {
    sendUpdate({
      type: 'downloaded',
      version: info.version,
      message: `新版本 v${info.version} 已下载，重启后安装。`,
    })
  })
  autoUpdater.on('error', (error) => {
    logError('自动更新', error)
    sendUpdate({
      type: 'error',
      message: updateErrorMessage(error),
    })
  })
}

async function bootstrap() {
  await fsp.mkdir(APP_USER_DATA, { recursive: true })
  logFile = path.join(APP_USER_DATA, 'logs', 'main.log')
  log(`启动拾光 ${app.getVersion()}，数据目录：${APP_USER_DATA}`)

  dataStateBefore = await readDataState(APP_USER_DATA)
  const currentVersion = app.getVersion()
  const previousVersion = dataStateBefore?.version
  if (previousVersion && previousVersion !== currentVersion) {
    try {
      startupSnapshot = await createPreUpdateSnapshot({
        userData: APP_USER_DATA,
        fromVersion: previousVersion,
        toVersion: currentVersion,
        log,
      })
      if (startupSnapshot) {
        log(`已创建升级前数据快照：${startupSnapshot.name}`)
      } else {
        log('没有需要快照的本地存储目录')
      }
    } catch (error) {
      logError('创建升级前数据快照', error)
    }
  }

  configureSession()
  await registerAppProtocol()
  registerAppIpc()
  llm = registerLlmIpc({ ipcMain, isTrusted, log: logError })
  setupAutoUpdater()
  await createWindow()
}

const gotSingleInstanceLock = app.requestSingleInstanceLock()
if (!gotSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  })

  app.on('before-quit', () => {
    llm?.abortAll()
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow()
    }
  })

  app
    .whenReady()
    .then(bootstrap)
    .catch((error) => {
      logError('应用启动', error)
      dialog.showErrorBox(
        '拾光启动失败',
        `${error instanceof Error ? error.message : String(error)}\n\n数据目录：${APP_USER_DATA}`,
      )
      app.quit()
    })
}
