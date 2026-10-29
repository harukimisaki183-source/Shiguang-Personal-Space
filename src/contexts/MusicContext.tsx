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
import { useLiveQuery } from 'dexie-react-hooks'
import { addTracks, db, deleteTrack as deleteTrackFromDb } from '../db'
import { STORAGE_KEYS } from '../storage'
import type { Track } from '../types'
import { clamp } from '../utils'
import { useToast } from './ToastContext'

export type RepeatMode = 'off' | 'all' | 'one'

interface MusicContextValue {
  tracks: Track[]
  current: Track | null
  isPlaying: boolean
  progress: number
  duration: number
  volume: number
  repeat: RepeatMode
  importing: boolean
  drawerOpen: boolean
  setDrawerOpen: (open: boolean) => void
  playTrack: (track: Track) => void
  toggle: () => void
  playNext: () => void
  playPrev: () => void
  seek: (seconds: number) => void
  setVolume: (value: number) => void
  cycleRepeat: () => void
  importFiles: (files: FileList | File[]) => Promise<void>
  removeTrack: (id: string) => Promise<void>
}

const MusicContext = createContext<MusicContextValue | null>(null)

function readStoredVolume(): number {
  try {
    const value = Number(localStorage.getItem(STORAGE_KEYS.volume))
    if (Number.isFinite(value) && value >= 0 && value <= 1) return value
  } catch {
    // ignore
  }
  return 0.7
}

function readStoredTrack(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEYS.lastTrack)
  } catch {
    return null
  }
}

export function MusicProvider({ children }: { children: ReactNode }) {
  const { showToast } = useToast()
  const tracks = useLiveQuery(() => db.tracks.orderBy('createdAt').toArray(), [], []) ?? []
  const [currentId, setCurrentId] = useState<string | null>(readStoredTrack)
  const [isPlaying, setIsPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolumeState] = useState(readStoredVolume)
  const [repeat, setRepeat] = useState<RepeatMode>('all')
  const [importing, setImporting] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const endedRef = useRef<() => void>(() => {})
  const current = currentId ? tracks.find((track) => track.id === currentId) ?? null : null

  const tracksRef = useRef(tracks)
  tracksRef.current = tracks
  const currentIdRef = useRef(currentId)
  currentIdRef.current = currentId
  const repeatRef = useRef(repeat)
  repeatRef.current = repeat
  const volumeRef = useRef(volume)
  volumeRef.current = volume

  const setCurrentTrackId = useCallback((id: string | null) => {
    setCurrentId(id)
    try {
      if (id) localStorage.setItem(STORAGE_KEYS.lastTrack, id)
      else localStorage.removeItem(STORAGE_KEYS.lastTrack)
    } catch {
      // ignore
    }
  }, [])

  const playNext = useCallback(() => {
    const list = tracksRef.current
    if (!list.length) return
    const index = list.findIndex((track) => track.id === currentIdRef.current)
    const next = list[index < 0 ? 0 : (index + 1) % list.length]
    if (!next) return
    setCurrentTrackId(next.id)
    setIsPlaying(true)
  }, [setCurrentTrackId])

  const playPrev = useCallback(() => {
    const audio = audioRef.current
    if (audio && audio.currentTime > 3) {
      audio.currentTime = 0
      setProgress(0)
      return
    }
    const list = tracksRef.current
    if (!list.length) return
    const index = list.findIndex((track) => track.id === currentIdRef.current)
    const prev = list[index <= 0 ? list.length - 1 : index - 1]
    if (!prev) return
    setCurrentTrackId(prev.id)
    setIsPlaying(true)
  }, [setCurrentTrackId])

  const handleEnded = useCallback(() => {
    const audio = audioRef.current
    const list = tracksRef.current
    if (!audio || !list.length) return
    if (repeatRef.current === 'one') {
      audio.currentTime = 0
      void audio.play()
      return
    }
    const index = list.findIndex((track) => track.id === currentIdRef.current)
    if (repeatRef.current === 'off' && index >= list.length - 1) {
      setIsPlaying(false)
      setProgress(audio.duration || 0)
      return
    }
    playNext()
  }, [playNext])

  useEffect(() => {
    endedRef.current = handleEnded
  }, [handleEnded])

  /* 创建唯一的 audio 实例，跨页面、跨路由持续播放 */
  useEffect(() => {
    const audio = new Audio()
    audio.preload = 'metadata'
    audio.volume = volumeRef.current
    audioRef.current = audio

    const onTime = () => setProgress(audio.currentTime || 0)
    const onMeta = () => setDuration(Number.isFinite(audio.duration) ? audio.duration : 0)
    const onPlay = () => setIsPlaying(true)
    const onPause = () => setIsPlaying(false)
    const onEnded = () => endedRef.current()
    const onError = () => {
      setIsPlaying(false)
      showToast('这首音乐无法播放，可能是浏览器不支持的格式', 'error')
    }

    audio.addEventListener('timeupdate', onTime)
    audio.addEventListener('loadedmetadata', onMeta)
    audio.addEventListener('durationchange', onMeta)
    audio.addEventListener('play', onPlay)
    audio.addEventListener('pause', onPause)
    audio.addEventListener('ended', onEnded)
    audio.addEventListener('error', onError)

    return () => {
      audio.pause()
      audio.removeAttribute('src')
      audio.load()
      audio.removeEventListener('timeupdate', onTime)
      audio.removeEventListener('loadedmetadata', onMeta)
      audio.removeEventListener('durationchange', onMeta)
      audio.removeEventListener('play', onPlay)
      audio.removeEventListener('pause', onPause)
      audio.removeEventListener('ended', onEnded)
      audio.removeEventListener('error', onError)
      audioRef.current = null
    }
  }, [showToast])

  /* 当前歌曲变化时换源 */
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    if (!current) {
      audio.pause()
      audio.removeAttribute('src')
      audio.load()
      setProgress(0)
      setDuration(0)
      return
    }
    const url = URL.createObjectURL(current.blob)
    audio.src = url
    audio.load()
    setProgress(0)
    setDuration(current.duration || 0)
    return () => {
      URL.revokeObjectURL(url)
    }
  }, [current?.id])

  /* 播放 / 暂停 */
  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !current) return
    if (isPlaying) {
      audio.play().catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setIsPlaying(false)
        showToast('播放失败，请再点一次播放按钮', 'error')
      })
    } else {
      audio.pause()
    }
  }, [isPlaying, current?.id, showToast])

  /* 音量 */
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume
    try {
      localStorage.setItem(STORAGE_KEYS.volume, String(volume))
    } catch {
      // ignore
    }
  }, [volume])

  /* 当前歌曲被删除或音乐库被整体替换 */
  useEffect(() => {
    if (!currentId) return
    if (tracks.length === 0) {
      setCurrentTrackId(null)
      setIsPlaying(false)
      return
    }
    if (!tracks.some((track) => track.id === currentId)) {
      const audio = audioRef.current
      audio?.pause()
      setCurrentTrackId(tracks[0].id)
      setIsPlaying(false)
    }
  }, [tracks, currentId, setCurrentTrackId])

  /* 系统媒体控制（Windows 媒体浮层 / 媒体键） */
  useEffect(() => {
    if (!('mediaSession' in navigator)) return
    if (!current) {
      navigator.mediaSession.metadata = null
      return
    }
    navigator.mediaSession.metadata = new MediaMetadata({
      title: current.title,
      artist: current.artist,
      album: '拾光音乐库',
    })
    try {
      navigator.mediaSession.setActionHandler('play', () => setIsPlaying(true))
      navigator.mediaSession.setActionHandler('pause', () => setIsPlaying(false))
      navigator.mediaSession.setActionHandler('nexttrack', () => playNext())
      navigator.mediaSession.setActionHandler('previoustrack', () => playPrev())
    } catch {
      // 某些环境不支持这些 action
    }
    return () => {
      try {
        navigator.mediaSession.setActionHandler('play', null)
        navigator.mediaSession.setActionHandler('pause', null)
        navigator.mediaSession.setActionHandler('nexttrack', null)
        navigator.mediaSession.setActionHandler('previoustrack', null)
      } catch {
        // ignore
      }
    }
  }, [current?.id, playNext, playPrev])

  useEffect(() => {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused'
    }
  }, [isPlaying])

  const playTrack = useCallback(
    (track: Track) => {
      const audio = audioRef.current
      if (currentIdRef.current === track.id && audio) {
        setIsPlaying(audio.paused)
        return
      }
      setCurrentTrackId(track.id)
      setIsPlaying(true)
    },
    [setCurrentTrackId],
  )

  const toggle = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return
    if (!currentIdRef.current) {
      const first = tracksRef.current[0]
      if (first) {
        setCurrentTrackId(first.id)
        setIsPlaying(true)
      } else {
        setDrawerOpen(true)
        showToast('先导入一些本地音乐吧', 'info')
      }
      return
    }
    setIsPlaying(audio.paused)
  }, [setCurrentTrackId, showToast])

  const seek = useCallback((seconds: number) => {
    const audio = audioRef.current
    if (!audio) return
    const max = Number.isFinite(audio.duration) ? audio.duration : seconds
    const next = clamp(seconds, 0, max)
    audio.currentTime = next
    setProgress(next)
  }, [])

  const setVolume = useCallback((value: number) => {
    setVolumeState(clamp(value, 0, 1))
  }, [])

  const cycleRepeat = useCallback(() => {
    setRepeat((prev) => (prev === 'off' ? 'all' : prev === 'all' ? 'one' : 'off'))
  }, [])

  const importFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files)
      if (!list.length) return
      if (list.length > 20) {
        showToast('一次最多导入 20 首音乐', 'error')
        return
      }
      setImporting(true)
      try {
        const { added, errors } = await addTracks(list)
        if (added.length) {
          showToast(`已导入 ${added.length} 首音乐`, 'success')
          if (!currentIdRef.current && added[0]) setCurrentTrackId(added[0].id)
        }
        if (errors.length) showToast(errors.slice(0, 2).join('；'), 'error')
      } catch (error) {
        showToast(error instanceof Error ? error.message : '导入音乐失败', 'error')
      } finally {
        setImporting(false)
      }
    },
    [setCurrentTrackId, showToast],
  )

  const removeTrack = useCallback(
    async (id: string) => {
      const list = tracksRef.current
      const index = list.findIndex((track) => track.id === id)
      const wasCurrent = currentIdRef.current === id
      const fallback = list[index + 1] ?? list[index - 1] ?? null
      try {
        await deleteTrackFromDb(id)
        if (wasCurrent) {
          audioRef.current?.pause()
          setCurrentTrackId(fallback?.id ?? null)
          setIsPlaying(false)
        }
        showToast('已从音乐库移除', 'success')
      } catch {
        showToast('移除失败，请稍后再试', 'error')
      }
    },
    [setCurrentTrackId, showToast],
  )

  const value = useMemo<MusicContextValue>(
    () => ({
      tracks,
      current,
      isPlaying,
      progress,
      duration,
      volume,
      repeat,
      importing,
      drawerOpen,
      setDrawerOpen,
      playTrack,
      toggle,
      playNext,
      playPrev,
      seek,
      setVolume,
      cycleRepeat,
      importFiles,
      removeTrack,
    }),
    [
      tracks,
      current,
      isPlaying,
      progress,
      duration,
      volume,
      repeat,
      importing,
      drawerOpen,
      playTrack,
      toggle,
      playNext,
      playPrev,
      seek,
      setVolume,
      cycleRepeat,
      importFiles,
      removeTrack,
    ],
  )

  return <MusicContext.Provider value={value}>{children}</MusicContext.Provider>
}

export function useMusic(): MusicContextValue {
  const context = useContext(MusicContext)
  if (!context) throw new Error('useMusic 必须在 MusicProvider 内使用')
  return context
}
