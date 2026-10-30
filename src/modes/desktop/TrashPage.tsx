import { useEffect, useState } from 'react'
import { Clock3, RotateCcw, Trash2 } from 'lucide-react'
import { useLocale } from '../../lib/i18n'
import { useDesktopMessages } from './i18n'
import { useLibrary, useTree } from '../../shared'
import { daysLeft, emptyTrash, removeFromTrash, useTrash } from '../../lib/trash'

export default function TrashPage() {
  const locale = useLocale()
  const messages = useDesktopMessages().workspacePages
  const { entries, error } = useTrash()
  const { restoreNode } = useTree()
  const { add } = useLibrary()
  const [now, setNow] = useState(() => Date.now())
  const [status, setStatus] = useState('')

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  const restore = (entry: typeof entries[number]): void => {
    const result = restoreNode(entry.node, entry.parentId, entry.index)
    if (result === 'conflict') { setStatus(messages.trashRestoreConflict); return }
    entry.files.forEach(file => add({ nodeId: file.nodeId, name: file.name, kind: file.kind, url: URL.createObjectURL(file.file), size: file.size, file: file.file }))
    void removeFromTrash(entry.id)
    setStatus(result === 'root' ? messages.trashRestoreRoot : messages.trashRestoreDone)
  }

  const deleteEntry = (id: string): void => {
    if (!window.confirm(messages.trashDeleteConfirm)) return
    void removeFromTrash(id)
  }

  const clear = (): void => {
    if (!entries.length || !window.confirm(messages.trashEmptyConfirm)) return
    void emptyTrash()
  }

  return <section className="desk-trash-page" aria-label={messages.trashEmpty}>
    {error && <p className="desk-inline-error" role="alert">{error}</p>}
    {status && <p className="desk-inline-status" role="status">{status}</p>}
    <div className="desk-trash-toolbar"><span>{entries.length}</span><button type="button" className="desk-button desk-danger-button" disabled={!entries.length} onClick={clear}><Trash2 size={16} />{messages.trashEmptyAction}</button></div>
    {entries.length ? <ul className="desk-trash-list">{entries.map(entry => <li key={entry.id} className="desk-trash-card">
      <div><h2>{entry.title}</h2><p><Clock3 size={14} />{messages.trashDeletedAt} {new Intl.DateTimeFormat(locale === 'ar' ? 'ar-IQ' : 'en', { dateStyle: 'medium' }).format(entry.deletedAt)} · {daysLeft(entry, now)} {messages.trashDaysLeft}</p></div>
      <div className="desk-trash-actions"><button type="button" className="desk-button desk-button-primary" onClick={() => restore(entry)}><RotateCcw size={16} />{messages.trashRestore}</button><button type="button" className="desk-button desk-danger-button" onClick={() => deleteEntry(entry.id)}><Trash2 size={16} />{messages.trashDelete}</button></div>
    </li>)}</ul> : <p className="desk-section-empty">{messages.trashEmpty}</p>}
  </section>
}
