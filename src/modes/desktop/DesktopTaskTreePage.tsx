import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import { CalendarDays, Check, ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown, Download, FilePlus2, ListTree, Map as MapIcon, Pencil, Plus, Redo2, Timer, Trash2, Undo2, X } from 'lucide-react'
import { dbGetNote } from '../../db'
import { useLibrary, useTree } from '../../shared'
import type { Item, TNode } from '../../shared'
import { useDesktopMessages } from './i18n'
import { createTask, MAX_TASK_COUNT, redoTaskTree, removeTask, reorderSiblingTasks, undoTaskTree, updateTask, useTaskTreeHistory, useTaskTreeStore } from './taskStore'
import type { TaskRecord, TaskStatus } from './taskStore'
import TaskMap from './TaskMap'
import { requestFocusTimer } from './focusTimerEvents'
import { calculateTaskProgress } from './taskTreeLogic'

interface NoteOption { id: string; title: string }
interface CreateTarget { parentId: string | null; afterId?: string }
type Labels = ReturnType<typeof useDesktopMessages>['taskTree']

function sectionList(nodes: TNode[]): TNode[] { return nodes.flatMap(node => [node, ...sectionList(node.children)]) }
function download(name: string, content: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: mime }))
  const link = document.createElement('a'); link.href = url; link.download = name; link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function InlineTaskForm({ title, placeholder, addLabel, value, onChange, onSubmit, onCancel }: { title: string; placeholder: string; addLabel: string; value: string; onChange: (value: string) => void; onSubmit: () => void; onCancel: () => void }) {
  return <form className="desk-task-inline-form" onSubmit={event => { event.preventDefault(); onSubmit() }}><input autoFocus value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} aria-label={title} maxLength={180} /><button type="submit" className="desk-task-icon" aria-label={addLabel} disabled={!value.trim()}><Check size={15} /></button><button type="button" className="desk-task-icon" aria-label={title} onClick={onCancel}><X size={15} /></button></form>
}

function TaskBranch({ parentId, tasks, children, progress, collapsed, setCollapsed, createTarget, draft, setDraft, submitCreate, cancelCreate, labels, statusLabels, editingId, editValue, setEditValue, beginEdit, saveEdit, cancelEdit, onStatus, onDueDate, onAddChild, onAddSibling, onDelete, onAttach, dragId, setDragId }: {
  parentId: string | null; tasks: TaskRecord[]; children: Map<string | null, TaskRecord[]>; progress: Map<string, number>; collapsed: Set<string>; setCollapsed: (id: string) => void
  createTarget: CreateTarget | null; draft: string; setDraft: (value: string) => void; submitCreate: () => void; cancelCreate: () => void
  labels: Labels; statusLabels: Record<TaskStatus, string>; editingId: string | null; editValue: string; setEditValue: (value: string) => void; beginEdit: (task: TaskRecord) => void; saveEdit: () => void; cancelEdit: () => void
  onStatus: (id: string, status: TaskStatus) => void; onDueDate: (id: string, dueDate: string) => void; onAddChild: (id: string) => void; onAddSibling: (task: TaskRecord) => void; onDelete: (id: string) => void; onAttach: (id: string) => void; dragId: string | null; setDragId: (id: string | null) => void
}) {
  const focusLabel = useDesktopMessages().focusTimer.startForTask
  const siblings = (children.get(parentId) ?? []).slice().sort((a, b) => a.order - b.order)
  return <ul className="desk-task-list" role={parentId === null ? 'tree' : 'group'} aria-label={parentId === null ? labels.tree : undefined} aria-describedby={parentId === null ? 'desk-task-keyboard-help' : undefined}>{siblings.map(task => {
    const kids = children.get(task.id) ?? []
    const isCollapsed = collapsed.has(task.id)
    const pct = progress.get(task.id) ?? 0
    return <li key={task.id} className="desk-task-item" role="treeitem" aria-level={taskDepth(task, tasks)} aria-expanded={kids.length ? !isCollapsed : undefined} data-task-id={task.id} draggable onDragStart={event => { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', task.id); setDragId(task.id) }} onDragEnd={() => setDragId(null)} onDragOver={event => { if (dragId && tasks.find(item => item.id === dragId)?.parentId === task.parentId) event.preventDefault() }} onDrop={event => { event.preventDefault(); if (dragId) reorderSiblingTasks(dragId, task.id); setDragId(null) }}>
      <div className={`desk-task-row ${dragId === task.id ? 'is-dragging' : ''}`} data-status={task.status}>
        {editingId === task.id ? <div className="desk-task-title desk-task-title-edit"><span aria-hidden="true">{kids.length ? (isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />) : <span className="desk-task-leaf" />}</span><input autoFocus value={editValue} aria-label={labels.editTask} onChange={event => setEditValue(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); saveEdit() } if (event.key === 'Escape') cancelEdit() }} /></div> : <button type="button" className="desk-task-title" data-task-focus="true" aria-expanded={kids.length ? !isCollapsed : undefined} onClick={() => kids.length && setCollapsed(task.id)} onDoubleClick={() => beginEdit(task)} title={labels.editHint}>{kids.length ? (isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />) : <span className="desk-task-leaf" aria-hidden="true" />}<span>{task.title}</span></button>}
        {editingId === task.id ? <button type="button" className="desk-task-icon" aria-label={labels.save} onClick={saveEdit}><Check size={15} /></button> : <button type="button" className="desk-task-icon" aria-label={labels.editTask} onClick={() => beginEdit(task)}><Pencil size={14} /></button>}
        {editingId !== task.id && <button type="button" className="desk-task-icon desk-task-focus" aria-label={`${focusLabel}: ${task.title}`} title={focusLabel} onClick={() => requestFocusTimer({ type: 'task', id: task.id, title: task.title })}><Timer size={15} aria-hidden="true" /></button>}
        <span className="desk-task-progress" aria-label={`${labels.progress}: ${pct}%`}>{pct}%</span>
        <select aria-label={`${labels.status}: ${task.title}`} value={task.status} onChange={event => onStatus(task.id, event.target.value as TaskStatus)}>{(['todo', 'doing', 'done', 'late'] as const).map(status => <option key={status} value={status}>{statusLabels[status]}</option>)}</select>
        <label className="desk-task-date"><CalendarDays size={14} aria-hidden="true" /><span className="desk-task-sr-only">{labels.dueDate}</span><input type="date" aria-label={`${labels.dueDate}: ${task.title}`} value={task.dueDate ?? ''} onChange={event => onDueDate(task.id, event.target.value)} /></label>
        <button type="button" className="desk-task-icon" aria-label={`${labels.attach}: ${task.title}`} title={labels.attach} onClick={() => onAttach(task.id)}><FilePlus2 size={15} /><span>{task.attachedFileIds.length + task.attachedNoteIds.length || ''}</span></button>
        <button type="button" className="desk-task-icon" aria-label={`${labels.addChild}: ${task.title}`} title={labels.addChild} onClick={() => onAddChild(task.id)}><Plus size={15} /></button>
        <button type="button" className="desk-task-icon" aria-label={`${labels.addSibling}: ${task.title}`} title={labels.addSibling} onClick={() => onAddSibling(task)}><ListTree size={15} /></button>
        <button type="button" className="desk-task-icon desk-task-delete" aria-label={`${labels.deleteTask}: ${task.title}`} title={labels.deleteTask} onClick={() => onDelete(task.id)}><Trash2 size={15} /></button>
      </div>
      {createTarget?.parentId === task.id && !createTarget.afterId && <InlineTaskForm title={labels.newTask} placeholder={labels.placeholder} addLabel={labels.addTask} value={draft} onChange={setDraft} onSubmit={submitCreate} onCancel={cancelCreate} />}
      {createTarget?.afterId === task.id && <InlineTaskForm title={labels.newTask} placeholder={labels.placeholder} addLabel={labels.addTask} value={draft} onChange={setDraft} onSubmit={submitCreate} onCancel={cancelCreate} />}
      {kids.length > 0 && !isCollapsed && <TaskBranch parentId={task.id} tasks={tasks} children={children} progress={progress} collapsed={collapsed} setCollapsed={setCollapsed} createTarget={createTarget} draft={draft} setDraft={setDraft} submitCreate={submitCreate} cancelCreate={cancelCreate} labels={labels} statusLabels={statusLabels} editingId={editingId} editValue={editValue} setEditValue={setEditValue} beginEdit={beginEdit} saveEdit={saveEdit} cancelEdit={cancelEdit} onStatus={onStatus} onDueDate={onDueDate} onAddChild={onAddChild} onAddSibling={onAddSibling} onDelete={onDelete} onAttach={onAttach} dragId={dragId} setDragId={setDragId} />}
    </li>
  })}</ul>
}
function taskDepth(task: TaskRecord, tasks: TaskRecord[]): number { let depth = 1, parentId = task.parentId; while (parentId) { depth += 1; parentId = tasks.find(item => item.id === parentId)?.parentId ?? null } return depth }

function AttachmentPicker({ task, files, notes, labels, onClose }: { task: TaskRecord; files: Item[]; notes: NoteOption[]; labels: Labels; onClose: () => void }) {
  return <div className="desk-task-modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}><section className="desk-task-attachment-modal" role="dialog" aria-modal="true" aria-label={labels.attachments}><header><h2>{labels.attachments}</h2><button type="button" className="desk-task-icon" aria-label={labels.close} onClick={onClose}><X size={17} /></button></header><div className="desk-task-attachment-columns"><fieldset><legend>{labels.files}</legend>{files.length ? files.map(file => <label key={file.id}><input type="checkbox" checked={task.attachedFileIds.includes(file.id)} onChange={event => updateTask(task.id, { attachedFileIds: event.target.checked ? [...new Set([...task.attachedFileIds, file.id])] : task.attachedFileIds.filter(id => id !== file.id) })} /><span>{file.name}</span></label>) : <p>{labels.noFiles}</p>}</fieldset><fieldset><legend>{labels.notes}</legend>{notes.length ? notes.map(note => <label key={note.id}><input type="checkbox" checked={task.attachedNoteIds.includes(note.id)} onChange={event => updateTask(task.id, { attachedNoteIds: event.target.checked ? [...new Set([...task.attachedNoteIds, note.id])] : task.attachedNoteIds.filter(id => id !== note.id) })} /><span>{note.title}</span></label>) : <p>{labels.noNotes}</p>}</fieldset></div><footer><button type="button" className="desk-button desk-button-primary" onClick={onClose}>{labels.done}</button></footer></section></div>
}

export default function DesktopTaskTreePage() {
  const messages = useDesktopMessages()
  const labels = messages.taskTree
  const tasks = useTaskTreeStore()
  const taskHistory = useTaskTreeHistory()
  const { items } = useLibrary()
  const { tree } = useTree()
  const [notes, setNotes] = useState<NoteOption[]>([])
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set())
  const [createTarget, setCreateTarget] = useState<CreateTarget | null>(null)
  const [draft, setDraft] = useState('')
  const [rootDraft, setRootDraft] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [attachmentTaskId, setAttachmentTaskId] = useState<string | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [activeView, setActiveView] = useState<'outline' | 'map'>('outline')
  const [taskLimitReached, setTaskLimitReached] = useState(false)
  const treeRef = useRef<HTMLDivElement>(null)
  const sections = useMemo(() => sectionList(tree), [tree])
  const children = useMemo(() => { const map = new Map<string | null, TaskRecord[]>(); for (const task of tasks) map.set(task.parentId, [...(map.get(task.parentId) ?? []), task]); return map }, [tasks])
  const progress = useMemo(() => calculateTaskProgress(tasks), [tasks])
  const statusLabels = labels.statuses
  const attachmentTask = attachmentTaskId ? tasks.find(task => task.id === attachmentTaskId) : undefined

  useEffect(() => { let cancelled = false; void Promise.all(sections.map(async section => { try { const note = await dbGetNote(section.id); return note?.html?.trim() ? { id: section.id, title: section.title } : null } catch { return null } })).then(rows => { if (!cancelled) setNotes(rows.filter((note): note is NoteOption => Boolean(note))) }); return () => { cancelled = true } }, [sections])
  const createTaskWithLimit = (parentId: string | null, title: string, afterId?: string): string | null => { const id = createTask(parentId, title, afterId); setTaskLimitReached(!id); return id }
  const startCreate = (target: CreateTarget): void => { setCreateTarget(target); setDraft('') }
  const submitCreate = (): void => { if (!createTarget || !draft.trim()) return; if (!createTaskWithLimit(createTarget.parentId, draft, createTarget.afterId)) return; setCreateTarget(null); setDraft('') }
  const submitRoot = (event: FormEvent<HTMLFormElement>): void => { event.preventDefault(); if (!rootDraft.trim()) return; if (createTaskWithLimit(null, rootDraft)) setRootDraft('') }
  const beginEdit = (task: TaskRecord): void => { setEditingId(task.id); setEditValue(task.title) }
  const saveEdit = (): void => { if (editingId && editValue.trim()) updateTask(editingId, { title: editValue.trim() }); setEditingId(null); setEditValue('') }
  const cancelEdit = (): void => { setEditingId(null); setEditValue('') }
  const setTaskCollapsed = (id: string): void => setCollapsed(value => { const next = new Set(value); next.has(id) ? next.delete(id) : next.add(id); return next })
  const handleDelete = (id: string): void => { if (window.confirm(labels.deleteConfirm)) removeTask(id) }
  const expandAll = (expand: boolean): void => setCollapsed(expand ? new Set() : new Set(tasks.filter(task => (children.get(task.id) ?? []).length).map(task => task.id)))
  const exportJson = (): void => download('task-tree.json', JSON.stringify(tasks, null, 2), 'application/json')
  const exportMarkdown = (): void => {
    const lines: string[] = []
    const write = (parentId: string | null, depth: number): void => { for (const task of (children.get(parentId) ?? []).slice().sort((a, b) => a.order - b.order)) { const due = task.dueDate ? ` — ${labels.dueDate}: ${task.dueDate}` : ''; lines.push(`${'  '.repeat(depth)}- [${task.status === 'done' ? 'x' : ' '}] ${task.title} (${statusLabels[task.status]})${due}`); write(task.id, depth + 1) } }
    write(null, 0); download('task-tree.md', lines.join('\n'), 'text/markdown;charset=utf-8')
  }
  const handleTreeKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const target = event.target as HTMLElement
    if (/^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName)) return
    const focused = target.closest<HTMLElement>('[data-task-focus]')
    if (!focused) return
    const visible = Array.from(treeRef.current?.querySelectorAll<HTMLElement>('[data-task-focus]') ?? [])
    const index = visible.indexOf(focused)
    const item = focused.closest<HTMLElement>('[role="treeitem"]')
    if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown') && item?.dataset.taskId) {
      const siblings = Array.from(item.parentElement?.querySelectorAll<HTMLElement>(':scope > [role="treeitem"]') ?? [])
      const siblingIndex = siblings.indexOf(item)
      if (event.key === 'ArrowUp' && siblingIndex > 0) { event.preventDefault(); reorderSiblingTasks(item.dataset.taskId, siblings[siblingIndex - 1].dataset.taskId ?? '') }
      else if (event.key === 'ArrowDown' && siblingIndex < siblings.length - 1) { event.preventDefault(); reorderSiblingTasks(item.dataset.taskId, siblings[siblingIndex + 1].dataset.taskId ?? '', 'after') }
      return
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); visible[Math.max(0, Math.min(visible.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)))]?.focus(); return }
    const isRtl = (focused.closest<HTMLElement>('[dir]')?.dir || document.documentElement.dir) === 'rtl'
    const expandKey = isRtl ? 'ArrowLeft' : 'ArrowRight'
    const collapseKey = isRtl ? 'ArrowRight' : 'ArrowLeft'
    if (event.key === expandKey && item?.getAttribute('aria-expanded') === 'false') { event.preventDefault(); if (item.dataset.taskId) setTaskCollapsed(item.dataset.taskId) }
    else if (event.key === expandKey && item?.getAttribute('aria-expanded') === 'true') { event.preventDefault(); item.querySelector<HTMLElement>(':scope > ul [data-task-focus]')?.focus() }
    else if (event.key === collapseKey && item?.getAttribute('aria-expanded') === 'true') { event.preventDefault(); if (item.dataset.taskId) setTaskCollapsed(item.dataset.taskId) }
    else if (event.key === collapseKey) { event.preventDefault(); item?.parentElement?.closest<HTMLElement>('[role="treeitem"]')?.querySelector<HTMLElement>('[data-task-focus]')?.focus() }
  }

  return <section className="desk-task-page" aria-label={messages.pages.tasks.title}>
    <div className="desk-task-toolbar"><form className="desk-task-root-form" onSubmit={submitRoot}><input value={rootDraft} onChange={event => setRootDraft(event.target.value)} placeholder={labels.placeholder} aria-label={labels.newTask} maxLength={180} /><button type="submit" className="desk-button desk-button-primary" disabled={!rootDraft.trim()}><Plus size={16} />{labels.addTask}</button></form><div className="desk-task-toolbar-actions"><button type="button" className="desk-button" onClick={() => undoTaskTree()} disabled={!taskHistory.canUndo}><Undo2 size={15} />{labels.undo}</button><button type="button" className="desk-button" onClick={() => redoTaskTree()} disabled={!taskHistory.canRedo}><Redo2 size={15} />{labels.redo}</button><button type="button" className="desk-button" onClick={() => expandAll(true)}><ChevronsUpDown size={15} />{labels.expandAll}</button><button type="button" className="desk-button" onClick={() => expandAll(false)}><ChevronsDownUp size={15} />{labels.collapseAll}</button><button type="button" className="desk-button" onClick={exportJson}><Download size={15} />{labels.exportJson}</button><button type="button" className="desk-button" onClick={exportMarkdown}><Download size={15} />{labels.exportMarkdown}</button></div></div>
    <div className="desk-task-views" role="tablist" aria-label={labels.views}>
      <button type="button" role="tab" aria-selected={activeView === 'outline'} className={activeView === 'outline' ? 'is-active' : ''} onClick={() => setActiveView('outline')}><ListTree size={15} />{labels.outlineView}</button>
      <button type="button" role="tab" aria-selected={activeView === 'map'} className={activeView === 'map' ? 'is-active' : ''} onClick={() => setActiveView('map')}><MapIcon size={15} />{labels.mapView}</button>
    </div>
    {activeView === 'outline' && <p id="desk-task-keyboard-help" className="desk-task-keyboard-hint">{labels.keyboardHelp}</p>}
    {taskLimitReached && tasks.length >= MAX_TASK_COUNT && <p className="desk-task-limit-warning" role="alert">{labels.taskLimitReached}</p>}
    {tasks.length === 0 && <div className="desk-task-empty"><ListTree size={24} /><strong>{labels.emptyTitle}</strong><p>{labels.emptyText}</p></div>}
    {activeView === 'outline' ? <div className="desk-task-tree-wrap" ref={treeRef} onKeyDown={handleTreeKeyDown}>
      <TaskBranch parentId={null} tasks={tasks} children={children} progress={progress} collapsed={collapsed} setCollapsed={setTaskCollapsed} createTarget={createTarget} draft={draft} setDraft={setDraft} submitCreate={submitCreate} cancelCreate={() => setCreateTarget(null)} labels={labels} statusLabels={statusLabels} editingId={editingId} editValue={editValue} setEditValue={setEditValue} beginEdit={beginEdit} saveEdit={saveEdit} cancelEdit={cancelEdit} onStatus={(id, status) => updateTask(id, { status })} onDueDate={(id, dueDate) => updateTask(id, { dueDate: dueDate || null })} onAddChild={id => startCreate({ parentId: id })} onAddSibling={task => startCreate({ parentId: task.parentId, afterId: task.id })} onDelete={handleDelete} onAttach={setAttachmentTaskId} dragId={dragId} setDragId={setDragId} />
    </div> : tasks.length > 0 && <TaskMap tasks={tasks} children={children} progress={progress} collapsed={collapsed} onToggleCollapsed={setTaskCollapsed} files={items} notes={notes} labels={labels} onAddTask={createTaskWithLimit} onLimitReached={() => setTaskLimitReached(true)} />}
    {attachmentTask && <AttachmentPicker task={attachmentTask} files={items} notes={notes} labels={labels} onClose={() => setAttachmentTaskId(null)} />}
  </section>
}
