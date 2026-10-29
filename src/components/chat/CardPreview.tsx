import type { CSSProperties } from 'react'
import {
  applicationTotal,
  cardDateLabel,
  getCardTag,
  getCardType,
  getFieldLabel,
} from '../../cards'
import type { DayCard } from '../../types'

interface CardPreviewProps {
  card: DayCard
  owner?: string
}

export function CardPreview({ card, owner }: CardPreviewProps) {
  const tag = getCardTag(card.tag)
  const type = getCardType(card.type)
  const total = applicationTotal(card)
  const style = {
    '--card-accent': tag.accent,
    '--card-soft': tag.accentSoft,
    '--card-g1': tag.gradient[0],
    '--card-g2': tag.gradient[1],
    '--card-g3': tag.gradient[2],
  } as CSSProperties

  const textFields = tag.fields.filter((field) => field.type !== 'number')
  const filledTextFields = textFields.filter((field) => card.fields[field.key]?.trim())

  return (
    <div className="day-card-frame" style={style}>
      <div className="day-card-sheet">
        <div className="day-card-head">
          <span className="day-card-brand">
            拾光 <em>· DAY CARD</em>
          </span>
          <span className="day-card-chip">
            {tag.icon} {card.tag}
            {type.label}
          </span>
        </div>

        <div className="day-card-date">{cardDateLabel(card.date)}</div>
        <h3 className="day-card-title">{card.title}</h3>
        <p className="day-card-caption">
          {tag.caption} · {type.hint}
        </p>

        {card.tag === '求职' ? (
          <div className="day-card-job">
            <div className="day-card-total">
              <div>
                <span>{card.type === 'plan' ? '计划投递' : '今日投递'}</span>
                <strong>
                  {total}
                  <em>份</em>
                </strong>
              </div>
              <div className="day-card-breakdown">
                {tag.fields.slice(0, 3).map((field) => (
                  <div key={field.key}>
                    <span>{getFieldLabel(field, card.type).replace('目标', '')}</span>
                    <strong>{card.fields[field.key] || '0'}</strong>
                  </div>
                ))}
              </div>
            </div>

            {card.fields.interview && (
              <span className="day-card-interview">
                {getFieldLabel(tag.fields[3], card.type)} · {card.fields.interview}
              </span>
            )}

            <div className="day-card-texts">
              {tag.fields.slice(4).map((field) => (
                <div className="day-card-text" key={field.key}>
                  <span>{getFieldLabel(field, card.type)}</span>
                  <p className={card.fields[field.key]?.trim() ? '' : 'placeholder'}>
                    {card.fields[field.key]?.trim() || '还没填写'}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className={`day-card-fields ${textFields.length >= 4 ? 'dense' : ''}`}>
            {filledTextFields.length === 0 && (
              <p className="day-card-empty">从左边写下一点今天的内容，这张卡片就会完整起来。</p>
            )}
            {filledTextFields.map((field) => (
              <div className="day-card-text" key={field.key}>
                <span>{getFieldLabel(field, card.type)}</span>
                <p>{card.fields[field.key].trim()}</p>
              </div>
            ))}
          </div>
        )}

        <div className="day-card-foot">
          <span>拾光 · 把每一天收好</span>
          {owner && <span>{owner} 的卡片</span>}
        </div>
      </div>
    </div>
  )
}
