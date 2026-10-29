'use strict'

const fs = require('node:fs/promises')
const path = require('node:path')
const { safeStorage } = require('electron')

const SECRET_FILE = path.join('secure', 'api-key.bin')
const MAX_SECRET_LENGTH = 20_000

function secretPath(userData) {
  return path.join(userData, SECRET_FILE)
}

function encryptionAvailable() {
  try {
    return safeStorage.isEncryptionAvailable()
  } catch {
    return false
  }
}

async function readApiKey(userData) {
  let buffer
  try {
    buffer = await fs.readFile(secretPath(userData))
  } catch {
    return ''
  }
  if (!buffer.length) return ''

  const mode = buffer[0]
  const payload = buffer.subarray(1)
  try {
    // mode 1：safeStorage（Windows 下由 DPAPI 加密）
    if (mode === 1) {
      if (!encryptionAvailable()) return ''
      return safeStorage.decryptString(payload)
    }
    // mode 0：系统加密不可用时的降级明文存储
    if (mode === 0) return payload.toString('utf8')
  } catch {
    return ''
  }
  return ''
}

async function writeApiKey(userData, key) {
  const file = secretPath(userData)
  const value = typeof key === 'string' ? key.trim() : ''
  if (!value) {
    await fs.rm(file, { force: true }).catch(() => {})
    return { encrypted: encryptionAvailable(), cleared: true }
  }
  if (value.length > MAX_SECRET_LENGTH) {
    throw new Error('API Key 太长，请检查是否粘贴了多余内容')
  }

  await fs.mkdir(path.dirname(file), { recursive: true })
  const encrypted = encryptionAvailable()
  const payload = encrypted ? safeStorage.encryptString(value) : Buffer.from(value, 'utf8')
  const buffer = Buffer.concat([Buffer.from([encrypted ? 1 : 0]), payload])
  const temp = `${file}.tmp-${process.pid}`
  await fs.writeFile(temp, buffer, { mode: 0o600 })
  await fs.rename(temp, file)
  return { encrypted, cleared: false }
}

async function clearApiKey(userData) {
  await fs.rm(secretPath(userData), { force: true }).catch(() => {})
  return { cleared: true }
}

module.exports = {
  clearApiKey,
  encryptionAvailable,
  readApiKey,
  writeApiKey,
}
