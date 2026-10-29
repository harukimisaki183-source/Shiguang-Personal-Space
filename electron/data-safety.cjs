'use strict'

const fs = require('node:fs/promises')
const path = require('node:path')

/**
 * Chromium 把 IndexedDB / localStorage 放在 userData 的固定子目录里。
 * 新版本第一次启动时，先复制这些目录，再让 Dexie 跑数据库迁移。
 * 如果迁移失败，用户可以退出应用，从快照目录手动恢复。
 */
// blob_storage 里存放 Chromium 为大 Blob 外置的数据（图片、视频、音乐）。
// 只复制 IndexedDB 而不复制它，恢复快照后媒体可能只剩引用、打不开。
const STORAGE_DIRS = [
  'IndexedDB',
  'Local Storage',
  'Session Storage',
  'blob_storage',
  'File System',
]
const MAX_SNAPSHOTS = 3
const DATA_STATE_FILE = 'data-state.json'

function snapshotRoot(userData) {
  return path.join(userData, 'backups', 'pre-update')
}

function safeVersion(value) {
  return (
    String(value || 'unknown')
      .replace(/[^0-9A-Za-z._-]/g, '-')
      .slice(0, 40) || 'unknown'
  )
}

async function pathExists(target) {
  try {
    await fs.access(target)
    return true
  } catch {
    return false
  }
}

async function readJson(file) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'))
  } catch {
    return null
  }
}

async function writeJsonAtomic(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true })
  const temp = `${file}.tmp-${process.pid}-${Date.now()}`
  await fs.writeFile(temp, JSON.stringify(value, null, 2), 'utf8')
  await fs.rename(temp, file)
}

async function readDataState(userData) {
  return readJson(path.join(userData, DATA_STATE_FILE))
}

async function writeDataState(userData, value) {
  await writeJsonAtomic(path.join(userData, DATA_STATE_FILE), value)
}

async function listSnapshots(userData) {
  const root = snapshotRoot(userData)
  let entries
  try {
    entries = await fs.readdir(root, { withFileTypes: true })
  } catch {
    return []
  }

  const snapshots = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const dir = path.join(root, entry.name)
    const meta = await readJson(path.join(dir, 'meta.json'))
    if (!meta) continue
    snapshots.push({ ...meta, name: entry.name, path: dir })
  }

  return snapshots.sort((a, b) =>
    String(b.createdAt || '').localeCompare(String(a.createdAt || '')),
  )
}

async function pruneSnapshots(userData, keep = MAX_SNAPSHOTS) {
  const snapshots = await listSnapshots(userData)
  for (const snapshot of snapshots.slice(keep)) {
    try {
      await fs.rm(snapshot.path, { recursive: true, force: true })
    } catch {
      // 清理旧快照失败不影响本次启动
    }
  }
}

/**
 * @param {{ userData: string; fromVersion: string; toVersion: string; log?: (message: string) => void }} options
 */
async function createPreUpdateSnapshot(options) {
  const { userData, fromVersion, toVersion, log } = options
  const existing = (await listSnapshots(userData)).find(
    (item) => item.fromVersion === fromVersion && item.toVersion === toVersion,
  )
  if (existing) return existing

  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const name = `v${safeVersion(fromVersion)}-to-v${safeVersion(toVersion)}-${stamp}`
  const dir = path.join(snapshotRoot(userData), name)
  await fs.mkdir(dir, { recursive: true })

  const copied = []
  for (const dirName of STORAGE_DIRS) {
    const source = path.join(userData, dirName)
    if (!(await pathExists(source))) continue
    try {
      await fs.cp(source, path.join(dir, dirName), {
        recursive: true,
        force: true,
        errorOnExist: false,
      })
      copied.push(dirName)
    } catch (error) {
      log?.(`快照复制失败 ${dirName}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  if (!copied.length) {
    await fs.rm(dir, { recursive: true, force: true })
    return null
  }

  const meta = {
    fromVersion,
    toVersion,
    createdAt: new Date().toISOString(),
    copied,
    note: '拾光在跨版本启动前自动保存的原始数据副本。恢复前请先完全退出应用。',
  }
  await writeJsonAtomic(path.join(dir, 'meta.json'), meta)
  await pruneSnapshots(userData, MAX_SNAPSHOTS)
  return { ...meta, name, path: dir }
}

module.exports = {
  DATA_STATE_FILE,
  MAX_SNAPSHOTS,
  createPreUpdateSnapshot,
  listSnapshots,
  readDataState,
  snapshotRoot,
  writeDataState,
}
