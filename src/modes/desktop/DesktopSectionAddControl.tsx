import { useId, useState } from 'react'
import type { FormEvent } from 'react'
import { Check, Plus, X } from 'lucide-react'
import { useTree } from '../../shared'
import { updateDesktopPreferences, useDesktopPreferences } from './preferences'
import { useDesktopMessages } from './i18n'

interface DesktopSectionAddControlProps {
  parentId: string
  parentPath: string[]
  targetTitle: string
  variant?: 'row' | 'page'
}

export default function DesktopSectionAddControl({ parentId, parentPath, targetTitle, variant = 'row' }: DesktopSectionAddControlProps) {
  const messages = useDesktopMessages()
  const { addNode, setPath } = useTree()
  const preferences = useDesktopPreferences()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const inputId = useId()
  const labels = messages.sections
  const compact = variant === 'row'
  const buttonLabel = open ? labels.cancelEdit : `${compact ? labels.addChild : labels.add}: ${targetTitle}`

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    const name = title.trim()
    if (!name) return
    const id = addNode(parentId, name)
    updateDesktopPreferences({ expandedSectionIds: [...new Set([...preferences.expandedSectionIds, ...parentPath])] })
    setPath([...parentPath, id])
    setTitle('')
    setOpen(false)
  }

  return (
    <div className={`desk-section-add-control ${compact ? 'desk-section-add-control-row' : 'desk-section-add-control-page'}`}>
      <button
        type="button"
        className={compact ? 'desk-icon-button desk-tree-action' : 'desk-button'}
        aria-label={buttonLabel}
        aria-expanded={open}
        title={buttonLabel}
        onClick={() => { setOpen(value => !value); if (open) setTitle('') }}
      >
        {open ? <X size={compact ? 16 : 17} aria-hidden="true" /> : <Plus size={compact ? 16 : 17} aria-hidden="true" />}
        {!compact && <span>{labels.add}</span>}
      </button>
      {open && (
        <form className="desk-section-add-form" onSubmit={submit}>
          <label className="desk-visually-hidden" htmlFor={inputId}>{labels.renameInput}</label>
          <input
            id={inputId}
            autoFocus
            type="text"
            value={title}
            onChange={event => setTitle(event.target.value)}
            onKeyDown={event => { if (event.key === 'Escape') { setOpen(false); setTitle('') } }}
            placeholder={labels.placeholder}
            maxLength={80}
          />
          <button type="submit" className="desk-icon-button desk-tree-action" aria-label={labels.create} disabled={!title.trim()}>
            <Check size={16} aria-hidden="true" />
          </button>
          <button type="button" className="desk-icon-button desk-tree-action" aria-label={labels.cancelEdit} onClick={() => { setOpen(false); setTitle('') }}>
            <X size={16} aria-hidden="true" />
          </button>
        </form>
      )}
    </div>
  )
}
