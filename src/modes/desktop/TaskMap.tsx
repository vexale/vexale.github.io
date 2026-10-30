import { useMemo } from 'react'
import { AlertCircle, CheckCircle2, Circle, Clock3, FileText, FolderTree } from 'lucide-react'
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

export default function TaskMap({ tasks, children, progress, files, notes, statusLabels, progressLabel }: TaskMapProps) {
  const layout = useMemo(() => {
    const positions: PositionedTask[] = []
    const edges: Array<{ parent: PositionedTask; child: PositionedTask }> = []
    let leafIndex = 0
    let maxDepth = 0
    const place = (task: TaskRecord, depth: number): PositionedTask => {
      maxDepth = Math.max(maxDepth, depth)
      const kids = (children.get(task.id) ?? []).slice().sort((a, b) => a.order - b.order)
      const childPositions = kids.map(child => place(child, depth + 1))
      const y = childPositions.length
        ? childPositions.reduce((sum, child) => sum + child.y, 0) / childPositions.length
        : EDGE + NODE_HEIGHT / 2 + leafIndex++ * LEAF_GAP
      const descendants = childPositions.reduce((acc, child) => ({ done: acc.done + child.done, total: acc.total + child.total }), { done: 0, total: 0 })
      const node: PositionedTask = {
        task,
        x: EDGE + depth * COLUMN_GAP,
        y,
        depth,
        done: task.status === 'done' ? descendants.done + 1 : descendants.done,
        total: descendants.total + 1,
      }
      positions.push(node)
      childPositions.forEach(child => edges.push({ parent: node, child }))
      return node
    }
    ;(children.get(null) ?? []).slice().sort((a, b) => a.order - b.order).forEach(task => place(task, 0))
    const leafCount = Math.max(1, leafIndex)
    const width = EDGE * 2 + (maxDepth + 1) * COLUMN_GAP - (COLUMN_GAP - NODE_WIDTH)
    const height = EDGE * 2 + NODE_HEIGHT + (leafCount - 1) * LEAF_GAP
    return { positions, edges, width, height }
  }, [children])

  const rtl = typeof document !== 'undefined' && document.documentElement.dir === 'rtl'
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
          return <g key={`${parent.task.id}-${child.task.id}`}><path d={d} /><circle cx={dotX} cy={dotY} r="3.5" /></g>
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
        return <article key={task.id} className={`desk-task-map-node is-${task.status}${leaf && (fileChips.length + noteChips.length) ? ' has-attachments' : ''}`} style={{ left: x, top: node.y - NODE_HEIGHT / 2 }} aria-label={`${task.title}, ${statusLabels[task.status]}, ${progressLabel}: ${node.done}/${node.total}`}>
          <div className="desk-task-map-node-main">
            <span className="desk-task-map-status-icon">{statusIcon(task.status)}</span>
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
