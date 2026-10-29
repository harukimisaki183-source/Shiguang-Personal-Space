import { useRef, type ChangeEvent } from 'react'
import { Music2, Pause, Play, Trash2, Upload, X } from 'lucide-react'
import { useConfirm } from '../contexts/ConfirmContext'
import { useMusic } from '../contexts/MusicContext'
import { formatDuration } from '../utils'

export function MusicDrawer() {
  const {
    tracks,
    current,
    isPlaying,
    drawerOpen,
    importing,
    setDrawerOpen,
    playTrack,
    toggle,
    importFiles,
    removeTrack,
  } = useMusic()
  const { confirm } = useConfirm()
  const inputRef = useRef<HTMLInputElement>(null)

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
            tracks.map((track) => {
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
          网页版关闭浏览器后音乐就会停止。打包成桌面版后，可以通过托盘常驻后台播放。
        </div>
      </aside>
    </>
  )
}
