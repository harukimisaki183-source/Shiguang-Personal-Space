'use strict'

const { net } = require('electron')

const MAX_ERROR_DETAIL = 400
const MAX_FALLBACK_BODY = 512 * 1024

function normalizeEndpoint(value) {
  let url
  try {
    url = new URL(String(value || '').trim())
  } catch {
    throw new Error('API Base URL 格式不正确')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('API Base URL 需要以 http:// 或 https:// 开头')
  }
  if (url.username || url.password) {
    throw new Error('API Base URL 里不要包含用户名或密码')
  }
  return url.toString()
}

function normalizeRequest(payload, stream) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('请求参数不完整')
  }
  const endpoint = normalizeEndpoint(payload.endpoint)
  const apiKey = typeof payload.apiKey === 'string' ? payload.apiKey.trim() : ''
  const model =
    typeof payload.model === 'string' && payload.model.trim()
      ? payload.model.trim().slice(0, 200)
      : 'deepseek-chat'
  const messages = Array.isArray(payload.messages)
    ? payload.messages
        .filter(
          (item) =>
            item &&
            (item.role === 'user' || item.role === 'assistant' || item.role === 'system') &&
            typeof item.content === 'string',
        )
        .slice(-40)
    : []
  if (!messages.length) throw new Error('没有可发送的对话内容')

  const rawTemperature = Number(payload.temperature)
  const temperature = Number.isFinite(rawTemperature)
    ? Math.min(1.5, Math.max(0, rawTemperature))
    : 0.7

  return { endpoint, apiKey, model, messages, temperature, stream }
}

function requestHeaders(apiKey) {
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'text/event-stream, application/json',
  }
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`
  return headers
}

async function describeHttpError(response) {
  const detail = (await response.text().catch(() => '')).slice(0, MAX_ERROR_DETAIL)
  return new Error(
    `请求失败（HTTP ${response.status}）${detail ? `：${detail}` : ''}。请检查 Base URL、模型名和 API Key。`,
  )
}

function errorMessage(error) {
  if (error instanceof Error && error.message) return error.message
  return String(error || '未知错误')
}

function extractContent(eventText) {
  const data = eventText
    .split(/\r?\n/)
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trim())
    .join('\n')
  if (!data) return { done: false, text: '' }
  if (data === '[DONE]') return { done: true, text: '' }

  try {
    const json = JSON.parse(data)
    const choice = json.choices?.[0]
    const text = choice?.delta?.content ?? choice?.message?.content ?? ''
    return { done: false, text: typeof text === 'string' ? text : '' }
  } catch {
    return { done: false, text: '' }
  }
}

function send(target, payload) {
  if (!target || target.isDestroyed()) return
  target.send('llm:stream', payload)
}

async function runStream({ sender, request, requestId, controller, log }) {
  let reader = null
  let received = false
  let fallbackRaw = ''

  try {
    const response = await net.fetch(request.endpoint, {
      method: 'POST',
      headers: requestHeaders(request.apiKey),
      body: JSON.stringify({
        model: request.model,
        messages: request.messages,
        temperature: request.temperature,
        stream: true,
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      throw await describeHttpError(response)
    }
    if (!response.body) {
      throw new Error('接口没有返回可读取的内容')
    }

    reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      const chunk = decoder.decode(value, { stream: true })
      buffer += chunk.replace(/\r\n/g, '\n')
      if (fallbackRaw.length < MAX_FALLBACK_BODY) {
        fallbackRaw += chunk
      }

      let boundary = buffer.indexOf('\n\n')
      while (boundary !== -1) {
        const eventText = buffer.slice(0, boundary)
        buffer = buffer.slice(boundary + 2)
        const result = extractContent(eventText)
        if (result.done) {
          await reader.cancel().catch(() => {})
          send(sender, { id: requestId, type: 'done' })
          return
        }
        if (result.text) {
          received = true
          send(sender, { id: requestId, type: 'delta', text: result.text })
        }
        boundary = buffer.indexOf('\n\n')
      }
    }

    // 有些兼容服务会忽略 stream=true，直接返回一整段 JSON。
    if (!received && fallbackRaw.trim()) {
      try {
        const json = JSON.parse(fallbackRaw)
        const text = json.choices?.[0]?.message?.content
        if (typeof text === 'string' && text) {
          received = true
          send(sender, { id: requestId, type: 'delta', text })
        }
      } catch {
        // 不是 JSON，可能是服务端心跳
      }
    }

    if (!received) {
      throw new Error('模型没有返回内容。请检查模型名是否正确，或稍后再试。')
    }
    send(sender, { id: requestId, type: 'done' })
  } catch (error) {
    if (controller.signal.aborted) return
    const message = errorMessage(error)
    log?.(`LLM 流式请求失败：${message}`)
    send(sender, { id: requestId, type: 'error', message })
  } finally {
    if (reader) {
      await reader.cancel().catch(() => {})
    }
  }
}

async function testConnection(payload) {
  const request = normalizeRequest(payload, false)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 20_000)

  try {
    const response = await net.fetch(request.endpoint, {
      method: 'POST',
      headers: requestHeaders(request.apiKey),
      body: JSON.stringify({
        model: request.model,
        messages: [{ role: 'user', content: '请只回复：OK' }],
        temperature: 0,
        max_tokens: 10,
        stream: false,
      }),
      signal: controller.signal,
    })
    if (!response.ok) throw await describeHttpError(response)

    const json = await response.json()
    const content = json.choices?.[0]?.message?.content
    return typeof content === 'string' && content.trim()
      ? content.trim()
      : '连接成功，但模型没有返回文本。'
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error('连接超时（20 秒）。请检查网络、Base URL 或代理设置。')
    }
    if (
      error instanceof Error &&
      /(请求失败|API Base URL|没有可发送|请求参数)/.test(error.message)
    ) {
      throw error
    }
    throw new Error(`无法连接接口：${errorMessage(error)}`)
  } finally {
    clearTimeout(timer)
  }
}

/**
 * @param {{
 *   ipcMain: Electron.IpcMain
 *   isTrusted: (event: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent) => boolean
 *   log?: (message: string) => void
 * }} options
 */
function registerLlmIpc(options) {
  const { ipcMain, isTrusted, log } = options
  /** @type {Map<string, { controller: AbortController; senderId: number }>} */
  const active = new Map()

  ipcMain.on('llm:stream:start', (event, payload) => {
    if (!isTrusted(event)) return
    const requestId =
      payload && typeof payload.id === 'string' ? payload.id.slice(0, 100) : ''
    if (!requestId) return

    const previous = active.get(requestId)
    if (previous && previous.senderId === event.sender.id) previous.controller.abort()

    const controller = new AbortController()
    active.set(requestId, { controller, senderId: event.sender.id })

    let request
    try {
      request = normalizeRequest(payload, true)
    } catch (error) {
      send(event.sender, {
        id: requestId,
        type: 'error',
        message: errorMessage(error),
      })
      active.delete(requestId)
      return
    }

    void runStream({
      sender: event.sender,
      request,
      requestId,
      controller,
      log,
    }).finally(() => {
      const current = active.get(requestId)
      if (current?.controller === controller) active.delete(requestId)
    })
  })

  ipcMain.on('llm:stream:cancel', (event, requestId) => {
    if (!isTrusted(event)) return
    const current = active.get(String(requestId || ''))
    if (current && current.senderId === event.sender.id) {
      current.controller.abort()
      active.delete(String(requestId || ''))
    }
  })

  ipcMain.handle('llm:test', async (event, payload) => {
    if (!isTrusted(event)) return { ok: false, message: '未授权的请求来源' }
    try {
      const content = await testConnection(payload)
      return { ok: true, content }
    } catch (error) {
      return { ok: false, message: errorMessage(error) }
    }
  })

  return {
    abortAll() {
      for (const { controller } of active.values()) controller.abort()
      active.clear()
    },
  }
}

module.exports = { registerLlmIpc }
