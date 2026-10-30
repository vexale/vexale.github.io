import { useMemo, useState } from 'react'
import { AlertCircle, CheckCircle2, ChevronDown, ChevronRight, Circle, Clock3, FileText, FolderTree } from 'lucide-react'
import type { Item } from '../../shared'
import type { TaskRecord, TaskStatus } from './taskStore'

const NODE_WIDTH = 248
const NODE_HEIGHT = 76
const LEAF_GAP = 142
const COLUMN_GAP = 316
const EDGE = 48

interface NoteOption { id: string; title: string }
interface PositionedTask { task: TaskRecord; x: number; y: number; depth: number; done: number; total: number }
interface TaskMapProps {
  tasks: TaskRecord[]
  children: Map<string | null, TaskRecord[]>
  progress: Map<string, number>
  collapsed: Set<string>
  onToggleCollapsed: (id: string) => void
  files: Item[]
  notes: NoteOption[]
  statusLabels: Record<TaskStatus, string>
  progressLabel: string
}

function statusIcon(status: TaskStatus) {
  if (status === 'done') return <CheckCircle2 size={16} aria-hidden="true" />
  if (status === 'doing') return <Clock3 size={16} aria-hidden="true" />
  if (status === 'late') return <AlertCircle size={16} aria-hidden="true" />
  return <Circle size={16} aria-hidden="true" />
}

export default function TaskMap({ tasks, children, progress, collapsed, onToggleCollapsed, files, notes, statusLabels, progressLabel }: TaskMapProps) {
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null)
  const layout = useMemo(() => {
    const positions: PositionedTask[] = []
    const edges: Array<{ parent: PositionedTask; child: PositionedTask }> = []
    const counts = new Map<string, { done: number; total: number }>()
    let leafIndex = 0
    let maxDepth = 0
    const countTree = (task: TaskRecord): { done: number; total: number } => {
      const descendants = (children.get(task.id) ?? []).map(countTree)
      const count = { done: (task.status === 'done' ? 1 : 0) + descendants.reduce((sum, child) => sum + child.done, 0), total: 1 + descendants.reduce((sum, child) => sum + child.total, 0) }
      counts.set(task.id, count)
      return count
    }
    const roots = (children.get(null) ?? []).slice().sort((a, b) => a.order - b.order)
    roots.forEach(countTree)
    const place = (task: TaskRecord, depth: number): PositionedTask => {
      maxDepth = Math.max(maxDepth, depth)
      const kids = collapsed.has(task.id) ? [] : (children.get(task.id) ?? []).slice().sort((a, b) => a.order - b.order)
      const childPositions = kids.map(child => place(child, depth + 1))
      const y = childPositions.length
        ? childPositions.reduce((sum, child) => sum + child.y, 0) / childPositions.length
        : EDGE + NODE_HEIGHT / 2 + leafIndex++ * LEAF_GAP
      const totals = counts.get(task.id) ?? { done: 0, total: 1 }
      const node: PositionedTask = {
        task,
        x: EDGE + depth * COLUMN_GAP,
        y,
        depth,
        done: totals.done,
        total: totals.total,
      }
      positions.push(node)
      childPositions.forEach(child => edges.push({ parent: node, child }))
      return node
    }
    roots.forEach(task => place(task, 0))
    const leafCount = Math.max(1, leafIndex)
    const width = EDGE * 2 + (maxDepth + 1) * COLUMN_GAP - (COLUMN_GAP - NODE_WIDTH)
    const height = EDGE * 2 + NODE_HEIGHT + (leafCount - 1) * LEAF_GAP
    return { positions, edges, width, height }
  }, [children, collapsed])

  const rtl = typeof document !== 'undefined' && document.documentElement.dir === 'rtl'
  const highlightedIds = useMemo(() => {
    const ids = new Set<string>()
    const byId = new Map(tasks.map(task => [task.id, task]))
    let current = activeTaskId ? byId.get(activeTaskId) : undefined
    while (current && !ids.has(current.id)) { ids.add(current.id); current = current.parentId ? byId.get(current.parentId) : undefined }
    return ids
  }, [activeTaskId, tasks])
  const fileById = new Map(files.map(file => [file.id, file.name]))
  const noteById = new Map(notes.map(note => [note.id, note.title]))

  return <div className="desk-task-map-scroll" dir={rtl ? 'rtl' : 'ltr'}>
    <div className="desk-task-map-canvas" style={{ width: layout.width, height: layout.height }}>
      <svg className="desk-task-map-connectors" width={layout.width} height={layout.height} aria-hidden="true">
        {layout.edges.map(({ parent, child }) => {
          const startX = rtl ? layout.width - parent.x - NODE_WIDTH : parent.x + NODE_WIDTH
          const endX = rtl ? layout.width - child.x : child.x
          const curve = (endX - startX) * 0.48
          const control = rtl ? -Math.abs(curve) : Math.abs(curve)
          const d = `M ${startX} ${parent.y} C ${startX + control} ${parent.y}, ${endX - control} ${child.y}, ${endX} ${child.y}`
          const dotX = (startX + endX) / 2
          const dotY = (parent.y + child.y) / 2
          return <g key={`${parent.task.id}-${child.task.id}-${d}`} className={highlightedIds.has(child.task.id) ? 'is-path-active' : ''}>
            <path d={d} pathLength={1} style={{ animationDelay: `${child.depth * 65}ms` }} />
            <circle cx={dotX} cy={dotY} r="3.5" />
          </g>
        })}
      </svg>
      {layout.positions.map(node => {
        const { task } = node
        const x = rtl ? layout.width - node.x - NODE_WIDTH : node.x
        const pct = progress.get(task.id) ?? 0
        const radius = 8
        const circumference = 2 * Math.PI * radius
        const fileChips = task.attachedFileIds.map(id => ({ id, title: fileById.get(id) })).filter((chip): chip is { id: string; title: string } => Boolean(chip.title))
        const noteChips = task.attachedNoteIds.map(id => ({ id, title: noteById.get(id) })).filter((chip): chip is { id: string; title: string } => Boolean(chip.title))
        const leaf = (children.get(task.id) ?? []).length === 0
        const hasChildren = !leaf
        const isCollapsed = collapsed.has(task.id)
        const inActivePath = highlightedIds.has(task.id)
        return <article key={task.id} className={`desk-task-map-node is-${task.status}${leaf && (fileChips.length + noteChips.length) ? ' has-attachments' : ''}${inActivePath ? ' is-path-active' : ''}`} style={{ left: x, top: node.y - NODE_HEIGHT / 2, animationDelay: `${node.depth * 65}ms` }} aria-label={`${task.title}, ${statusLabels[task.status]}, ${progressLabel}: ${node.done}/${node.total}`} aria-expanded={hasChildren ? !isCollapsed : undefined} role={hasChildren ? 'button' : undefined} tabIndex={0} onPointerEnter={() => setActiveTaskId(task.id)} onPointerLeave={() => setActiveTaskId(null)} onFocus={() => setActiveTaskId(task.id)} onBlur={() => setActiveTaskId(null)} onClick={() => hasChildren && onToggleCollapsed(task.id)} onKeyDown={event => { if (hasChildren && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onToggleCollapsed(task.id) } }}>
          <div className="desk-task-map-node-main">
            <span className="desk-task-map-status-icon">{statusIcon(task.status)}</span>
            {hasChildren && <span className="desk-task-map-branch-icon" aria-hidden="true">{isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}</span>}
            {node.depth === 0 && <FolderTree size={15} aria-hidden="true" className="desk-task-map-root-icon" />}
            <strong title={task.title}>{task.title}</strong>
            <span className="desk-task-map-progress" title={`${progressLabel}: ${pct}%`}>
              <svg viewBox="0 0 20 20" aria-hidden="true"><circle className="desk-task-map-ring-track" cx="10" cy="10" r={radius} /><circle className="desk-task-map-ring-value" cx="10" cy="10" r={radius} strokeDasharray={circumference} strokeDashoffset={circumference * (1 - pct / 100)} /></svg>
              <span>{node.done}/{node.total}</span>
            </span>
          </div>
          {leaf && (fileChips.length + noteChips.length > 0) && <div className="desk-task-map-chips">
            {fileChips.map(({ id, title }) => <span className="desk-task-map-chip" key={`file-${id}`} title={title}><FileText size={11} aria-hidden="true" />{title}</span>)}
            {noteChips.map(({ id, title }) => <span className="desk-task-map-chip is-note" key={`note-${id}`} title={title}><FileText size={11} aria-hidden="true" />{title}</span>)}
          </div>}
        </article>
      })}
    </div>
  </div>
}
