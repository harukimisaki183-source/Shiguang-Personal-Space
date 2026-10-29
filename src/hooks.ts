import { useEffect, useState } from 'react'
import type { PageKey } from './types'

function readPage(): PageKey {
  const hash = window.location.hash.replace(/^#\/?/, '')
  if (hash === 'chat' || hash === 'assistant') return 'chat'
  if (hash === 'settings') return 'settings'
  return 'blog'
}

export function useHashRoute(): [PageKey, (page: PageKey) => void] {
  const [page, setPage] = useState<PageKey>(readPage)

  useEffect(() => {
    const onHashChange = () => setPage(readPage())
    window.addEventListener('hashchange', onHashChange)
    if (!window.location.hash) {
      window.history.replaceState(null, '', '#/blog')
    }
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  function navigate(next: PageKey) {
    window.location.hash = `/${next}`
    setPage(next)
  }

  return [page, navigate]
}

export function useObjectUrl(blob: Blob | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!blob) {
      setUrl(null)
      return
    }
    const next = URL.createObjectURL(blob)
    setUrl(next)
    return () => URL.revokeObjectURL(next)
  }, [blob])

  return url
}
