import { useEffect, useState } from 'react'
import { Loader2, Save, Sparkles, WandSparkles } from 'lucide-react'
import { useToast } from '../../contexts/ToastContext'
import { createCustomSkill, updateCustomSkill } from '../../db'
import type { Skill } from '../../types'
import { Modal } from '../Modal'

interface SkillEditorModalProps {
  open: boolean
  skill: Skill | null
  onClose: () => void
  onSaved: (skill: Skill) => void
}

const ICON_CHOICES = ['🧩', '✍️', '🎯', '🧠', '📚', '💡', '🗣️', '🌱', '📊', '🧪', '🎨', '🤝']

export function SkillEditorModal({ open, skill, onClose, onSaved }: SkillEditorModalProps) {
  const { showToast } = useToast()
  const [icon, setIcon] = useState('🧩')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [systemPrompt, setSystemPrompt] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setIcon(skill?.icon || '🧩')
    setName(skill?.name || '')
    setDescription(skill?.description || '')
    setSystemPrompt(skill?.systemPrompt || '')
  }, [open, skill?.id])

  function insertTemplate() {
    if (systemPrompt.trim()) return
    const skillName = name.trim() || '我的专属助手'
    setSystemPrompt(
      `你是「${skillName}」，一个专注于帮助用户完成特定任务的 AI 助手。

你的工作方式：
1. 先确认用户这次想要的具体结果；
2. 如果缺少关键背景，先问 1–2 个最重要的问题；
3. 用中文给出清晰、可执行的回答；
4. 不确定的信息不要编造，明确说明假设。

回答时尽量使用短段落和清晰的层次，避免空话。`,
    )
  }

  async function save() {
    if (saving) return
    setSaving(true)
    try {
      const input = { icon, name, description, systemPrompt }
      const saved = skill
        ? await updateCustomSkill(skill.id, input)
        : await createCustomSkill(input)
      showToast(skill ? '技能已更新' : '技能已创建', 'success')
      onSaved(saved)
    } catch (error) {
      showToast(error instanceof Error ? error.message : '保存失败，请稍后再试', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={skill ? '编辑自定义技能' : '新建自定义技能'}
      size="md"
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose} disabled={saving}>
            取消
          </button>
          <button className="btn btn-primary" onClick={() => void save()} disabled={saving}>
            {saving ? <Loader2 size={16} className="spin" /> : <Save size={16} />}
            {saving ? '保存中…' : '保存并使用'}
          </button>
        </>
      }
    >
      <div className="skill-editor">
        <div className="skill-editor-top">
          <div className="field skill-icon-field">
            <span>图标</span>
            <input
              className="input skill-icon-input"
              value={icon}
              maxLength={4}
              onChange={(event) => setIcon(event.target.value)}
              aria-label="技能图标"
            />
          </div>
          <label className="field">
            <span>技能名称</span>
            <input
              className="input"
              value={name}
              maxLength={20}
              onChange={(event) => setName(event.target.value)}
              placeholder="例如：周报助手"
              autoFocus
            />
          </label>
        </div>

        <div className="skill-emoji-row">
          {ICON_CHOICES.map((item) => (
            <button
              key={item}
              className={`skill-emoji ${icon === item ? 'active' : ''}`}
              onClick={() => setIcon(item)}
              aria-label={`使用图标 ${item}`}
            >
              {item}
            </button>
          ))}
        </div>

        <label className="field">
          <span>一句话说明</span>
          <input
            className="input"
            value={description}
            maxLength={80}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="这个技能能帮你做什么？"
          />
        </label>

        <label className="field">
          <span className="field-label-with-action">
            系统提示词
            <button className="link-btn" onClick={insertTemplate} disabled={!!systemPrompt.trim()}>
              <WandSparkles size={13} /> 插入模板
            </button>
          </span>
          <textarea
            className="textarea skill-prompt-input"
            rows={9}
            value={systemPrompt}
            maxLength={6000}
            onChange={(event) => setSystemPrompt(event.target.value)}
            placeholder="告诉 AI 它是谁、要完成什么、应该怎么回答…"
          />
          <span className="field-hint">
            提示词只保存在本机，会和每次对话一起发送给你配置的模型接口。
          </span>
        </label>

        <div className="skill-editor-note">
          <Sparkles size={15} />
          <span>小技巧：写清楚「角色、目标、输出格式、不要做什么」，效果通常会更稳定。</span>
        </div>
      </div>
    </Modal>
  )
}
