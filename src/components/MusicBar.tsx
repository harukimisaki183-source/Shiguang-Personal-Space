import { useRef, type ChangeEvent } from 'react'
import {
  ListMusic,
  Music2,
  Pause,
  Play,
  Repeat,
  Repeat1,
  SkipBack,
  SkipForward,
  Upload,
  Volume2,
  VolumeX,
} from 'lucide-react'
import { useMusic } from '../contexts/MusicContext'
import { formatDuration } from '../utils'

export function MusicBar() {
  const {
    current,
    tracks,
    isPlaying,
    progress,
    duration,
    volume,
    repeat,
    importing,
    setDrawerOpen,
    importFiles,
    toggle,
    playNext,
    playPrev,
    seek,
    setVolume,
    cycleRepeat,
  } = useMusic()
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = event.target.files
    if (!files?.length) return
    await importFiles(files)
    event.target.value = ''
  }

  const max = duration || current?.duration || 0.1
  const playTime = Math.min(progress, max)

  if (!current) {
    return (
      <div className="music-bar music-bar-empty">
        <div className="music-track">
          <div className="music-cover placeholder">
            <Music2 size={20} />
          </div>
          <div className="music-meta">
            <strong>拾光音乐库</strong>
            <span>{tracks.length ? `${tracks.length} 首音乐，打开音乐库开始播放` : '导入本地音乐，边工作边听'}</span>
          </div>
        </div>
        <div className="music-empty-hint">音乐不会离开这台设备</div>
        <div className="music-actions">
          <button className="btn btn-subtle btn-sm" onClick={() => setDrawerOpen(true)}>
            <ListMusic size={15} />
            音乐库
          </button>
          <label className={`btn btn-primary btn-sm ${importing ? 'disabled' : ''}`}>
            <Upload size={15} />
            {importing ? '导入中…' : '导入音乐'}
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
        </div>
      </div>
    )
  }

  return (
    <div className="music-bar">
      <div className="music-track">
        <div className={`music-cover ${isPlaying ? 'playing' : ''}`}>
          <Music2 size={19} />
        </div>
        <div className="music-meta">
          <strong title={current.title}>{current.title}</strong>
          <span title={current.artist}>{current.artist}</span>
        </div>
      </div>

      <div className="music-center">
        <div className="music-controls">
          <button className="icon-btn music-icon" onClick={playPrev} aria-label="上一首" title="上一首">
            <SkipBack size={17} />
          </button>
          <button className="music-play" onClick={toggle} aria-label={isPlaying ? '暂停' : '播放'}>
            {isPlaying ? <Pause size={18} /> : <Play size={18} />}
          </button>
          <button className="icon-btn music-icon" onClick={playNext} aria-label="下一首" title="下一首">
            <SkipForward size={17} />
          </button>
        </div>
        <div className="music-progress">
          <span>{formatDuration(playTime)}</span>
          <input
            type="range"
            min={0}
            max={max}
            step={0.1}
            value={playTime}
            onChange={(event) => seek(Number(event.target.value))}
            aria-label="播放进度"
            style={{ '--range-progress': `${max ? (playTime / max) * 100 : 0}%` } as React.CSSProperties}
          />
          <span>{formatDuration(duration || current.duration)}</span>
        </div>
      </div>

      <div className="music-actions">
        <button
          className={`icon-btn music-icon ${repeat !== 'off' ? 'active' : ''}`}
          onClick={cycleRepeat}
          title={repeat === 'off' ? '不循环' : repeat === 'all' ? '列表循环' : '单曲循环'}
          aria-label="切换循环模式"
        >
          {repeat === 'one' ? <Repeat1 size={17} /> : <Repeat size={17} />}
        </button>
        <button
          className="icon-btn music-icon"
          onClick={() => setVolume(volume > 0 ? 0 : 0.7)}
          title={volume > 0 ? '静音' : '恢复音量'}
          aria-label={volume > 0 ? '静音' : '恢复音量'}
        >
          {volume > 0 ? <Volume2 size={17} /> : <VolumeX size={17} />}
        </button>
        <input
          className="volume-range"
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          onChange={(event) => setVolume(Number(event.target.value))}
          aria-label="音量"
          style={{ '--range-progress': `${volume * 100}%` } as React.CSSProperties}
        />
        <button
          className="icon-btn music-icon"
          onClick={() => setDrawerOpen(true)}
          title="打开音乐库"
          aria-label="打开音乐库"
        >
          <ListMusic size={18} />
        </button>
      </div>
    </div>
  )
}
