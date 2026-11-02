import { useRef, useState, type ChangeEvent } from 'react'
import {
  ArrowUpDown,
  ChevronDown,
  ChevronUp,
  Music2,
  Pause,
  Play,
  RotateCcw,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import { useConfirm } from '../contexts/ConfirmContext'
import { useMusic, type RepeatMode } from '../contexts/MusicContext'
import { formatDuration } from '../utils'

export function MusicDrawer() {
  const {
    tracks,
    current,
    isPlaying,
    drawerOpen,
    importing,
    repeat,
    setDrawerOpen,
    playTrack,
    toggle,
    importFiles,
    removeTrack,
    setRepeat,
    moveTrack,
    resetOrder,
  } = useMusic()
  const { confirm } = useConfirm()
  const inputRef = useRef<HTMLInputElement>(null)
  const [reorderMode, setReorderMode] = useState(false)

  if (!drawerOpen) return null

  async function handleFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = event.target.files
    if (!files?.length) return
    await importFiles(files)
    event.target.value = ''
  }

  async function handleRemove(id: string, title: string) {
    const ok = await confirm({
      title: '移除这首音乐？',
      message: `「${title}」只会从拾光的音乐库中移除，不会删除你电脑上的原文件。`,
      confirmText: '移除',
      danger: true,
    })
    if (ok) await removeTrack(id)
  }

  return (
    <>
      <div className="drawer-backdrop" onClick={() => setDrawerOpen(false)} />
      <aside className="music-drawer" aria-label="音乐库">
        <div className="drawer-head">
          <div>
            <h2>音乐库</h2>
            <p>{tracks.length} 首 · 保存在本地</p>
          </div>
          <button className="icon-btn" onClick={() => setDrawerOpen(false)} aria-label="关闭音乐库">
            <X size={18} />
          </button>
        </div>

        <div className="drawer-toolbar">
          <label className={`btn btn-primary btn-sm ${importing ? 'disabled' : ''}`}>
            <Upload size={15} />
            {importing ? '正在读取…' : '导入音乐'}
            <input
              ref={inputRef}
              type="file"
              accept="audio/*"
              multiple
              hidden
              disabled={importing}
              onChange={handleFiles}
            />
          </label>
          <span className="muted">MP3 / FLAC / WAV / M4A 等</span>
        </div>

        <div className="drawer-playback">
          <label className="drawer-mode">
            <span>播放模式</span>
            <select
              value={repeat}
              onChange={(event) => setRepeat(event.target.value as RepeatMode)}
              aria-label="播放模式"
            >
              <option value="off">顺序播放</option>
              <option value="all">列表循环</option>
              <option value="one">单曲循环</option>
            </select>
          </label>
          <button
            className={`btn btn-ghost btn-sm ${reorderMode ? 'active' : ''}`}
            onClick={() => setReorderMode((prev) => !prev)}
          >
            <ArrowUpDown size={14} />
            {reorderMode ? '完成排序' : '调整顺序'}
          </button>
          {reorderMode && (
            <button className="btn btn-ghost btn-sm" onClick={resetOrder}>
              <RotateCcw size={14} /> 默认顺序
            </button>
          )}
        </div>
        {reorderMode && (
          <p className="drawer-reorder-hint">
            用 ↑ ↓ 调整播放顺序，调整后会立即保存；当前播放不会中断。
          </p>
        )}

        <div className="track-list">
          {tracks.length === 0 ? (
            <div className="drawer-empty">
              <div className="empty-icon small">
                <Music2 size={22} />
              </div>
              <strong>音乐库还是空的</strong>
              <span>导入你电脑里的音乐文件，它们只保存在当前浏览器。</span>
            </div>
          ) : (
            tracks.map((track, index) => {
              const active = current?.id === track.id
              return (
                <div
                  className={`track-row ${active ? 'active' : ''}`}
                  key={track.id}
                  onClick={() => {
                    if (active) toggle()
                    else playTrack(track)
                  }}
                >
                  <button
                    className="track-play"
                    onClick={(event) => {
                      event.stopPropagation()
                      if (active) toggle()
                      else playTrack(track)
                    }}
                    aria-label={active && isPlaying ? '暂停' : '播放'}
                  >
                    {active && isPlaying ? <Pause size={15} /> : <Play size={15} />}
                  </button>
                  <div className="track-info">
                    <strong title={track.title}>{track.title}</strong>
                    <span>
                      {track.artist} · {formatDuration(track.duration)}
                    </span>
                  </div>
                  {active && isPlaying && (
                    <span className="track-bars" aria-hidden="true">
                      <i />
                      <i />
                      <i />
                    </span>
                  )}
                  {reorderMode && (
                    <div className="track-order-actions" onClick={(event) => event.stopPropagation()}>
                      <button
                        className="icon-btn icon-btn-xs"
                        onClick={() => moveTrack(track.id, -1)}
                        disabled={index === 0}
                        aria-label="上移这首音乐"
                        title="上移"
                      >
                        <ChevronUp size={14} />
                      </button>
                      <button
                        className="icon-btn icon-btn-xs"
                        onClick={() => moveTrack(track.id, 1)}
                        disabled={index === tracks.length - 1}
                        aria-label="下移这首音乐"
                        title="下移"
                      >
                        <ChevronDown size={14} />
                      </button>
                    </div>
                  )}
                  <button
                    className="icon-btn danger-hover"
                    onClick={(event) => {
                      event.stopPropagation()
                      void handleRemove(track.id, track.title)
                    }}
                    aria-label="移除音乐"
                    title="移除"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              )
            })
          )}
        </div>

        <div className="drawer-note">
          网页版关闭浏览器后音乐就会停止；桌面版目前关闭窗口也会退出，托盘常驻还在计划中。
        </div>
      </aside>
    </>
  )
}
