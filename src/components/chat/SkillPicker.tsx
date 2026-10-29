import { useState } from 'react'
import { Check, Loader2, Pencil, Plus, Sparkles, Trash2 } from 'lucide-react'
import { useConfirm } from '../../contexts/ConfirmContext'
import { useToast } from '../../contexts/ToastContext'
import { deleteCustomSkill } from '../../db'
import { SKILL_GROUPS } from '../../skills'
import type { Skill, SkillGroup } from '../../types'
import { Modal } from '../Modal'

interface SkillPickerProps {
  open: boolean
  skills: Skill[]
  currentSkillId: string
  onClose: () => void
  onSelect: (skill: Skill) => void
  onCreate: () => void
  onEdit: (skill: Skill) => void
}

const GROUP_HINTS: Record<SkillGroup, string> = {
  面试辅助: '面试是其中一项能力，选择一个角度开始练习',
  通用: '没有特定目标时，从这里开始',
  记录: '把今天整理成一张可以留下的卡片',
  我的技能: '你创建的提示词技能，会按你的设定回答',
}

export function SkillPicker({
  open,
  skills,
  currentSkillId,
  onClose,
  onSelect,
  onCreate,
  onEdit,
}: SkillPickerProps) {
  const { showToast } = useToast()
  const { confirm } = useConfirm()
  const [deletingId, setDeletingId] = useState<string | null>(null)

  async function handleDelete(skill: Skill) {
    const ok = await confirm({
      title: `删除技能「${skill.name}」？`,
      message: '使用这个技能的对话会回到通用助手，已有消息不会丢失。',
      confirmText: '删除技能',
      danger: true,
    })
    if (!ok) return
    setDeletingId(skill.id)
    try {
      await deleteCustomSkill(skill.id)
      showToast('自定义技能已删除', 'success')
    } catch {
      showToast('删除失败，请稍后再试', 'error')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="技能库" size="lg" className="skill-picker-modal">
      <div className="skill-picker-head">
        <div>
          <h3>
            <Sparkles size={17} /> 选择这次对话要用到的能力
          </h3>
          <p>内置技能可以直接使用；也可以把常用提示词保存成自己的技能。</p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={onCreate}>
          <Plus size={15} /> 新建技能
        </button>
      </div>

      <div className="skill-groups">
        {SKILL_GROUPS.map((group) => {
          const groupSkills = skills.filter((skill) => skill.group === group)
          if (group === '我的技能') {
            return (
              <section className="skill-group" key={group}>
                <div className="skill-group-head">
                  <strong>{group}</strong>
                  <span>{groupSkills.length}</span>
                  <em>{GROUP_HINTS[group]}</em>
                </div>
                {groupSkills.length === 0 ? (
                  <button className="skill-empty-add" onClick={onCreate}>
                    <span>
                      <Plus size={18} />
                    </span>
                    <div>
                      <strong>创建你的第一个技能</strong>
                      <small>例如「周报助手」「模拟 HR 面」「英语陪练」</small>
                    </div>
                  </button>
                ) : (
                  <div className="skill-list">
                    {groupSkills.map((skill) => (
                      <div className="skill-lib-item" key={skill.id}>
                        <button
                          className={`skill-lib-main ${
                            currentSkillId === skill.id ? 'active' : ''
                          }`}
                          onClick={() => onSelect(skill)}
                        >
                          <span className="skill-icon">{skill.icon}</span>
                          <span className="skill-lib-text">
                            <strong>{skill.name}</strong>
                            <small>{skill.description || '没有填写说明'}</small>
                          </span>
                          {currentSkillId === skill.id && (
                            <span className="skill-current">
                              <Check size={13} /> 当前
                            </span>
                          )}
                        </button>
                        <div className="skill-lib-actions">
                          <button
                            className="icon-btn icon-btn-sm"
                            onClick={() => onEdit(skill)}
                            title="编辑技能"
                            aria-label="编辑技能"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            className="icon-btn icon-btn-sm danger-hover"
                            onClick={() => void handleDelete(skill)}
                            disabled={deletingId === skill.id}
                            title="删除技能"
                            aria-label="删除技能"
                          >
                            {deletingId === skill.id ? (
                              <Loader2 size={14} className="spin" />
                            ) : (
                              <Trash2 size={14} />
                            )}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )
          }

          if (!groupSkills.length) return null
          return (
            <section className="skill-group" key={group}>
              <div className="skill-group-head">
                <strong>{group}</strong>
                <span>{groupSkills.length}</span>
                <em>{GROUP_HINTS[group]}</em>
              </div>
              <div className="skill-list">
                {groupSkills.map((skill) => (
                  <button
                    className={`skill-lib-item skill-lib-main ${
                      currentSkillId === skill.id ? 'active' : ''
                    }`}
                    key={skill.id}
                    onClick={() => onSelect(skill)}
                  >
                    <span className="skill-icon">{skill.icon}</span>
                    <span className="skill-lib-text">
                      <strong>
                        {skill.name}
                        {skill.kind === 'card' && <em className="skill-kind-tag">卡片</em>}
                      </strong>
                      <small>{skill.description}</small>
                    </span>
                    {skill.kind === 'card' ? (
                      <span className="skill-open-tag">打开</span>
                    ) : currentSkillId === skill.id ? (
                      <span className="skill-current">
                        <Check size={13} /> 当前
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>
            </section>
          )
        })}
      </div>
    </Modal>
  )
}
