import { useEffect, useMemo, useState } from 'react'
import {
  addDays,
  addMonths,
  format,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
} from 'date-fns'
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { dateKey, formatMonthTitle, parseDateKey } from '../../utils'

interface CalendarPanelProps {
  selectedDate: string | null
  onSelectDate: (key: string | null) => void
  counts: Record<string, number>
}

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日']

export function CalendarPanel({ selectedDate, onSelectDate, counts }: CalendarPanelProps) {
  const [visibleMonth, setVisibleMonth] = useState(() =>
    startOfMonth(selectedDate ? parseDateKey(selectedDate) : new Date()),
  )

  useEffect(() => {
    if (!selectedDate) return
    const target = startOfMonth(parseDateKey(selectedDate))
    setVisibleMonth((prev) => (isSameMonth(prev, target) ? prev : target))
  }, [selectedDate])

  const days = useMemo(() => {
    const gridStart = startOfWeek(startOfMonth(visibleMonth), { weekStartsOn: 1 })
    return Array.from({ length: 42 }, (_, index) => addDays(gridStart, index))
  }, [visibleMonth])

  const monthCount = useMemo(() => {
    const prefix = format(visibleMonth, 'yyyy-MM')
    return Object.entries(counts).reduce(
      (sum, [key, value]) => (key.startsWith(prefix) ? sum + value : sum),
      0,
    )
  }, [counts, visibleMonth])

  const selectedLabel = selectedDate
    ? new Intl.DateTimeFormat('zh-CN', {
        month: 'long',
        day: 'numeric',
        weekday: 'long',
      }).format(parseDateKey(selectedDate))
    : null

  function goToday() {
    const now = new Date()
    setVisibleMonth(startOfMonth(now))
    onSelectDate(dateKey(now))
  }

  return (
    <div className="side-panel calendar-panel card">
      <div className="calendar-head">
        <div className="panel-title">
          <CalendarDays size={16} />
          <span>日历</span>
        </div>
        <div className="calendar-nav">
          <button
            className="icon-btn icon-btn-xs"
            onClick={() => setVisibleMonth((prev) => addMonths(prev, -1))}
            aria-label="上个月"
          >
            <ChevronLeft size={15} />
          </button>
          <span>{formatMonthTitle(visibleMonth)}</span>
          <button
            className="icon-btn icon-btn-xs"
            onClick={() => setVisibleMonth((prev) => addMonths(prev, 1))}
            aria-label="下个月"
          >
            <ChevronRight size={15} />
          </button>
        </div>
      </div>

      <div className="calendar-summary">
        <span>
          本月 <strong>{monthCount}</strong> 条记录
        </span>
        <button className="link-btn" onClick={goToday}>
          回到今天
        </button>
      </div>

      <div className="calendar-grid">
        {WEEKDAYS.map((day) => (
          <span className="cal-weekday" key={day}>
            {day}
          </span>
        ))}
        {days.map((day) => {
          const key = dateKey(day)
          const count = counts[key] ?? 0
          const inMonth = isSameMonth(day, visibleMonth)
          const selected = selectedDate === key
          return (
            <button
              key={key}
              className={[
                'cal-day',
                inMonth ? '' : 'out',
                isToday(day) ? 'today' : '',
                selected ? 'selected' : '',
                count ? 'has-notes' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => onSelectDate(selected ? null : key)}
              title={count ? `${count} 条记录` : undefined}
            >
              <span>{day.getDate()}</span>
              {count > 0 && <i className="cal-dot" />}
            </button>
          )
        })}
      </div>

      <div className="calendar-foot">
        <span className="calendar-legend">
          <i className="cal-dot" /> 有记录
        </span>
        {selectedDate ? (
          <button className="link-btn" onClick={() => onSelectDate(null)}>
            <X size={13} /> 查看全部
          </button>
        ) : (
          <span className="muted">点击日期筛选</span>
        )}
      </div>

      {selectedLabel && (
        <div className="selected-date-banner">
          <CalendarDays size={14} />
          正在查看 {selectedLabel}
        </div>
      )}
    </div>
  )
}
