import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertCircle, CheckCircle2, ChevronDown, ChevronRight, Circle, Clock3, FileText, FolderTree, Maximize2, Search, X, ZoomIn, ZoomOut } from 'lucide-react'
import type { FormEvent, KeyboardEvent, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from 'react'
import type { Item } from '../../shared'
import { MAX_TASK_COUNT, redoTaskTree, removeTask, reparentTask, undoTaskTree, updateTask } from './taskStore'
import type { TaskRecord, TaskStatus } from './taskStore'

const NODE_WIDTH = 248
const NODE_HEIGHT = 76
const LEAF_GAP = 142
const COLUMN_GAP = 316
const EDGE = 48
const MIN_ZOOM = 0.04
const MAX_ZOOM = 2.4
const OVERSCAN = 360

interface NoteOption { id: string; title: string }
interface PositionedTask { task: TaskRecord; x: number; y: number; depth: number; done: number; total: number }
interface TaskMapLabels {
  statuses: Record<TaskStatus, string>
  progress: string
  newTask: string
  editTask: string
  deleteTask: string
  deleteConfirm: string
  searchTasks: string
  searchPlaceholder: string
  searchNoResults: string
  fitToScreen: string
  zoomIn: string
  zoomOut: string
  selectedTask: string
  taskCount: string
  taskLimitReached: string
  collapseTask: string
  expandTask: string
  contextMenu: string
  mapKeyboardHelp: string
  addSibling: string
  addChild: string
}
interface TaskMapProps {
  tasks: TaskRecord[]
  children: Map<string | null, TaskRecord[]>
  progress: Map<string, number>
  collapsed: Set<string>
  onToggleCollapsed: (id: string) => void
  files: Item[]
  notes: NoteOption[]
  labels: TaskMapLabels
  onAddTask: (parentId: string | null, title: string, afterId?: string) => string | null
  onLimitReached: () => void
}
type Point = { x: number; y: number }
type Gesture = { kind: 'pan'; pointerId: number; clientX: number; clientY: number; panX: number; panY: number } | { kind: 'pinch'; startDistance: number; startZoom: number; worldX: number; worldY: number }
interface ContextMenuState { taskId: string; x: number; y: number }

function statusIcon(status: TaskStatus) {
  if (status === 'done') return <CheckCircle2 size={16} aria-hidden="true" />
  if (status === 'doing') return <Clock3 size={16} aria-hidden="true" />
  if (status === 'late') return <AlertCircle size={16} aria-hidden="true" />
  return <Circle size={16} aria-hidden="true" />
}
function clamp(value: number, min: number, max: number): number { return Math.max(min, Math.min(max, value)) }
function distance(a: Point, b: Point): number { return Math.hypot(a.x - b.x, a.y - b.y) }

export default function TaskMap({ tasks, children, progress, collapsed, onToggleCollapsed, files, notes, labels, onAddTask, onLimitReached }: TaskMapProps) {
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null)
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [searchValue, setSearchValue] = useState('')
  const [searchError, setSearchError] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState<Point>({ x: EDGE, y: EDGE })
  const [viewportSize, setViewportSize] = useState<Point>({ x: 0, y: 0 })
  const [pendingCenterId, setPendingCenterId] = useState<string | null>(null)
  const [pendingFocusId, setPendingFocusId] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [dropTargetId, setDropTargetId] = useState<string | null>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const nodeRefs = useRef(new Map<string, HTMLElement>())
  const pointers = useRef(new Map<number, Point>())
  const gesture = useRef<Gesture | null>(null)
  const didInitialFit = useRef(false)

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
      const y = childPositions.length ? childPositions.reduce((sum, child) => sum + child.y, 0) / childPositions.length : EDGE + NODE_HEIGHT / 2 + leafIndex++ * LEAF_GAP
      const totals = counts.get(task.id) ?? { done: 0, total: 1 }
      const node: PositionedTask = { task, x: EDGE + depth * COLUMN_GAP, y, depth, done: totals.done, total: totals.total }
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
  const fileById = new Map(files.map(file => [file.id, file.name]))
  const noteById = new Map(notes.map(note => [note.id, note.title]))
  const tasksById = useMemo(() => new Map(tasks.map(task => [task.id, task])), [tasks])
  const highlightedIds = useMemo(() => {
    const ids = new Set<string>()
    let current = activeTaskId ? tasksById.get(activeTaskId) : undefined
    while (current && !ids.has(current.id)) { ids.add(current.id); current = current.parentId ? tasksById.get(current.parentId) : undefined }
    return ids
  }, [activeTaskId, tasksById])
  const visibleNodes = useMemo(() => {
    if (!viewportSize.x || !viewportSize.y) return layout.positions
    return layout.positions.filter(node => {
      const left = (rtl ? layout.width - node.x - NODE_WIDTH : node.x) * zoom + pan.x
      const top = (node.y - NODE_HEIGHT / 2) * zoom + pan.y
      const margin = OVERSCAN
      return left < viewportSize.x + margin && left + NODE_WIDTH * zoom > -margin && top < viewportSize.y + margin && top + NODE_HEIGHT * zoom > -margin
    })
  }, [layout, pan, rtl, viewportSize, zoom])
  const visibleIds = useMemo(() => new Set(visibleNodes.map(node => node.task.id)), [visibleNodes])
  const visibleEdges = useMemo(() => layout.edges.filter(edge => visibleIds.has(edge.parent.task.id) || visibleIds.has(edge.child.task.id)), [layout, visibleIds])
  const selectedTask = selectedTaskId ? tasksById.get(selectedTaskId) : undefined

  const fitToScreen = (): void => {
    if (!viewportSize.x || !viewportSize.y) return
    const nextZoom = clamp(Math.min((viewportSize.x - EDGE * 2) / layout.width, (viewportSize.y - EDGE * 2) / layout.height), MIN_ZOOM, 1.4)
    setZoom(nextZoom)
    setPan({ x: (viewportSize.x - layout.width * nextZoom) / 2, y: (viewportSize.y - layout.height * nextZoom) / 2 })
  }
  const zoomAround = (requestedZoom: number, point: Point): void => {
    const nextZoom = clamp(requestedZoom, MIN_ZOOM, MAX_ZOOM)
    const worldX = (point.x - pan.x) / zoom, worldY = (point.y - pan.y) / zoom
    setZoom(nextZoom); setPan({ x: point.x - worldX * nextZoom, y: point.y - worldY * nextZoom })
  }
  const focusTask = (task: TaskRecord): void => {
    setSelectedTaskId(task.id); setPendingFocusId(task.id)
    if (visibleIds.has(task.id)) nodeRefs.current.get(task.id)?.focus()
  }
  useEffect(() => {
    const element = viewportRef.current
    if (!element) return
    const update = (): void => setViewportSize({ x: element.clientWidth, y: element.clientHeight })
    update()
    if (typeof ResizeObserver !== 'undefined') { const observer = new ResizeObserver(update); observer.observe(element); return () => observer.disconnect() }
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])
  useEffect(() => { if (!didInitialFit.current && viewportSize.x && viewportSize.y) { didInitialFit.current = true; fitToScreen() } }, [viewportSize.x, viewportSize.y, layout.width, layout.height])
  useEffect(() => {
    if (!pendingCenterId || !viewportSize.x || !viewportSize.y) return
    const node = layout.positions.find(item => item.task.id === pendingCenterId)
    if (!node) return
    const x = rtl ? layout.width - node.x - NODE_WIDTH : node.x
    setPan({ x: viewportSize.x / 2 - (x + NODE_WIDTH / 2) * zoom, y: viewportSize.y / 2 - node.y * zoom })
    setSelectedTaskId(node.task.id)
    setPendingFocusId(node.task.id)
    setPendingCenterId(null)
  }, [layout, pendingCenterId, rtl, viewportSize, zoom])
  useEffect(() => {
    if (!pendingFocusId || !viewportSize.x || !viewportSize.y) return
    if (visibleIds.has(pendingFocusId)) {
      if (nodeRefs.current.has(pendingFocusId)) { nodeRefs.current.get(pendingFocusId)?.focus(); setPendingFocusId(null) }
      return
    }
    const node = layout.positions.find(item => item.task.id === pendingFocusId)
    if (!node) return
    const x = rtl ? layout.width - node.x - NODE_WIDTH : node.x
    const nextPan = { x: viewportSize.x / 2 - (x + NODE_WIDTH / 2) * zoom, y: viewportSize.y / 2 - node.y * zoom }
    if (Math.abs(pan.x - nextPan.x) > 1 || Math.abs(pan.y - nextPan.y) > 1) setPan(nextPan)
  }, [layout, pan, pendingFocusId, rtl, viewportSize, visibleIds, zoom])

  const makeTask = (parentId: string | null, afterId?: string): void => {
    const id = onAddTask(parentId, labels.newTask, afterId)
    if (!id) { onLimitReached(); return }
    if (parentId && collapsed.has(parentId)) onToggleCollapsed(parentId)
    setSelectedTaskId(id); setEditingId(id); setEditValue(labels.newTask); setContextMenu(null)
  }
  const beginRename = (task: TaskRecord): void => { setEditingId(task.id); setEditValue(task.title); setContextMenu(null) }
  const saveRename = (): void => {
    if (editingId && editValue.trim()) updateTask(editingId, { title: editValue.trim() })
    setEditingId(null); setEditValue('')
  }
  const cancelRename = (): void => { setEditingId(null); setEditValue('') }
  const findTask = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    const query = searchValue.trim().toLocaleLowerCase()
    const found = tasks.find(task => task.title.toLocaleLowerCase().includes(query))
    if (!query) { setSearchError(false); return }
    if (!found) { setSearchError(true); return }
    setSearchError(false); setPendingCenterId(found.id); setSelectedTaskId(found.id)
    let parentId = found.parentId
    while (parentId) { if (collapsed.has(parentId)) onToggleCollapsed(parentId); parentId = tasksById.get(parentId)?.parentId ?? null }
  }
  const openContextMenu = (task: TaskRecord, clientX: number, clientY: number): void => {
    setSelectedTaskId(task.id)
    const rect = viewportRef.current?.getBoundingClientRect()
    if (rect) setContextMenu({ taskId: task.id, x: clientX - rect.left, y: clientY - rect.top })
  }
  const showContextMenu = (event: ReactMouseEvent<HTMLElement>, task: TaskRecord): void => {
    event.preventDefault(); event.stopPropagation(); openContextMenu(task, event.clientX, event.clientY)
  }
  const onWheel = (event: ReactWheelEvent<HTMLDivElement>): void => {
    if ((event.target as HTMLElement).closest('input,button,.desk-task-map-context-menu')) return
    event.preventDefault()
    const rect = event.currentTarget.getBoundingClientRect()
    const point = { x: event.clientX - rect.left, y: event.clientY - rect.top }
    zoomAround(zoom * Math.exp(-event.deltaY * 0.001), point)
  }
  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0 || (event.target as HTMLElement).closest('.desk-task-map-node,button,input,.desk-task-map-context-menu')) return
    const rect = event.currentTarget.getBoundingClientRect()
    pointers.current.set(event.pointerId, { x: event.clientX - rect.left, y: event.clientY - rect.top })
    event.currentTarget.setPointerCapture(event.pointerId)
    const points = [...pointers.current.values()]
    if (points.length >= 2) {
      const mid = { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 }
      gesture.current = { kind: 'pinch', startDistance: distance(points[0], points[1]), startZoom: zoom, worldX: (mid.x - pan.x) / zoom, worldY: (mid.y - pan.y) / zoom }
    } else gesture.current = { kind: 'pan', pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, panX: pan.x, panY: pan.y }
  }
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (!pointers.current.has(event.pointerId)) return
    const rect = event.currentTarget.getBoundingClientRect()
    pointers.current.set(event.pointerId, { x: event.clientX - rect.left, y: event.clientY - rect.top })
    const current = gesture.current
    if (!current) return
    if (current.kind === 'pinch' && pointers.current.size >= 2) {
      const points = [...pointers.current.values()]
      const mid = { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 }
      const nextZoom = clamp(current.startZoom * distance(points[0], points[1]) / current.startDistance, MIN_ZOOM, MAX_ZOOM)
      setZoom(nextZoom); setPan({ x: mid.x - current.worldX * nextZoom, y: mid.y - current.worldY * nextZoom })
    } else if (current.kind === 'pan') setPan({ x: current.panX + event.clientX - current.clientX, y: current.panY + event.clientY - current.clientY })
  }
  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>): void => {
    pointers.current.delete(event.pointerId)
    if (pointers.current.size === 1) {
      const [pointerId, point] = [...pointers.current.entries()][0]
      gesture.current = { kind: 'pan', pointerId, clientX: point.x + (viewportRef.current?.getBoundingClientRect().left ?? 0), clientY: point.y + (viewportRef.current?.getBoundingClientRect().top ?? 0), panX: pan.x, panY: pan.y }
    } else gesture.current = null
  }
  const handleSearch = findTask
  const handleNodeKeyDown = (event: KeyboardEvent<HTMLElement>, task: TaskRecord): void => {
    const targetElement = event.target as HTMLElement
    if (targetElement.tagName === 'BUTTON') return
    if (targetElement.tagName === 'INPUT') { if (event.key === 'Enter') { event.preventDefault(); saveRename() } if (event.key === 'Escape') { event.preventDefault(); cancelRename() } return }
    if (event.key === 'Enter') { event.preventDefault(); makeTask(task.parentId, task.id); return }
    if (event.key === 'Tab' && !event.shiftKey) { event.preventDefault(); makeTask(task.id); return }
    if (event.key === 'F2') { event.preventDefault(); beginRename(task); return }
    if (event.key === 'Delete') { event.preventDefault(); if (window.confirm(labels.deleteConfirm)) { removeTask(task.id); setSelectedTaskId(null) } return }
    if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) { event.preventDefault(); const rect = (event.currentTarget as HTMLElement).getBoundingClientRect(); openContextMenu(task, rect.left + rect.width / 2, rect.top + rect.height / 2); return }
    const isRtl = ((event.currentTarget as HTMLElement).closest('[dir]')?.getAttribute('dir') || document.documentElement.dir) === 'rtl'
    const childKey = isRtl ? 'ArrowLeft' : 'ArrowRight', parentKey = isRtl ? 'ArrowRight' : 'ArrowLeft'
    let target: TaskRecord | undefined
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      const siblings = (children.get(task.parentId) ?? []).slice().sort((a, b) => a.order - b.order)
      const index = siblings.findIndex(item => item.id === task.id)
      target = siblings[index + (event.key === 'ArrowUp' ? -1 : 1)]
    } else if (event.key === childKey) {
      const kids = (children.get(task.id) ?? []).slice().sort((a, b) => a.order - b.order)
      if (kids.length && collapsed.has(task.id)) { event.preventDefault(); onToggleCollapsed(task.id); setPendingFocusId(kids[0].id); return }
      target = kids[0]
    } else if (event.key === parentKey) {
      if ((children.get(task.id) ?? []).length && !collapsed.has(task.id)) { event.preventDefault(); onToggleCollapsed(task.id); return }
      target = task.parentId ? tasksById.get(task.parentId) : undefined
    }
    if (target) { event.preventDefault(); focusTask(target) }
  }
  const menuTask = contextMenu ? tasksById.get(contextMenu.taskId) : undefined
  const menuPosition = contextMenu ? { left: clamp(contextMenu.x, 8, Math.max(8, viewportSize.x - 205)), top: clamp(contextMenu.y, 8, Math.max(8, viewportSize.y - 190)) } : undefined

  return <section className="desk-task-map">
    <div className="desk-task-map-toolbar">
      <form className="desk-task-map-search" onSubmit={handleSearch} role="search">
        <input aria-label={labels.searchTasks} value={searchValue} onChange={event => { setSearchValue(event.target.value); setSearchError(false) }} placeholder={labels.searchPlaceholder} />
        <button type="submit" aria-label={labels.searchTasks}><Search size={15} /></button>
        {searchValue && <button type="button" aria-label={labels.searchTasks} onClick={() => { setSearchValue(''); setSearchError(false) }}><X size={14} /></button>}
      </form>
      <div className="desk-task-map-controls">
        <span className="desk-task-map-count">{tasks.length}/{MAX_TASK_COUNT} {labels.taskCount}</span>
        <button type="button" className="desk-task-map-control" title={labels.zoomOut} aria-label={labels.zoomOut} onClick={() => zoomAround(zoom / 1.2, { x: viewportSize.x / 2, y: viewportSize.y / 2 })}><ZoomOut size={15} /></button>
        <span className="desk-task-map-zoom-level">{Math.round(zoom * 100)}%</span>
        <button type="button" className="desk-task-map-control" title={labels.zoomIn} aria-label={labels.zoomIn} onClick={() => zoomAround(zoom * 1.2, { x: viewportSize.x / 2, y: viewportSize.y / 2 })}><ZoomIn size={15} /></button>
        <button type="button" className="desk-task-map-control" title={labels.fitToScreen} aria-label={labels.fitToScreen} onClick={fitToScreen}><Maximize2 size={15} /></button>
      </div>
    </div>
    {searchError && <p className="desk-task-map-search-error" role="status">{labels.searchNoResults}</p>}
    <p className="desk-task-map-help">{labels.mapKeyboardHelp}</p>
    {selectedTask && <p className="desk-task-map-selection"><span>{labels.selectedTask}:</span> {selectedTask.title}</p>}
    <div className="desk-task-map-scroll" dir={rtl ? 'rtl' : 'ltr'} ref={viewportRef} onWheel={onWheel} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onKeyDown={event => { const target = event.target as HTMLElement; if (/^(INPUT|TEXTAREA)$/.test(target.tagName)) return; if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? redoTaskTree() : undoTaskTree() } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') { event.preventDefault(); redoTaskTree() } else if (event.key === 'Escape') setContextMenu(null) }} onPointerDownCapture={event => { if (!(event.target as HTMLElement).closest('.desk-task-map-context-menu')) setContextMenu(null) }}>
      <div className="desk-task-map-canvas" role="tree" aria-label={labels.mapView} style={{ width: layout.width, height: layout.height, transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}>
        <svg className="desk-task-map-connectors" width={layout.width} height={layout.height} aria-hidden="true">
          {visibleEdges.map(({ parent, child }) => {
            const startX = rtl ? layout.width - parent.x - NODE_WIDTH : parent.x + NODE_WIDTH
            const endX = rtl ? layout.width - child.x : child.x
            const curve = (endX - startX) * 0.48
            const control = rtl ? -Math.abs(curve) : Math.abs(curve)
            const d = `M ${startX} ${parent.y} C ${startX + control} ${parent.y}, ${endX - control} ${child.y}, ${endX} ${child.y}`
            const dotX = (startX + endX) / 2, dotY = (parent.y + child.y) / 2
            return <g key={`${parent.task.id}-${child.task.id}-${d}`} className={highlightedIds.has(child.task.id) ? 'is-path-active' : ''}><path d={d} pathLength={1} style={{ animationDelay: `${child.depth * 55}ms` }} /><circle cx={dotX} cy={dotY} r="3.5" /></g>
          })}
        </svg>
        {visibleNodes.map(node => {
          const { task } = node
          const x = rtl ? layout.width - node.x - NODE_WIDTH : node.x
          const pct = progress.get(task.id) ?? 0
          const radius = 8, circumference = 2 * Math.PI * radius
          const fileChips = task.attachedFileIds.map(id => ({ id, title: fileById.get(id) })).filter((chip): chip is { id: string; title: string } => Boolean(chip.title))
          const noteChips = task.attachedNoteIds.map(id => ({ id, title: noteById.get(id) })).filter((chip): chip is { id: string; title: string } => Boolean(chip.title))
          const leaf = (children.get(task.id) ?? []).length === 0, hasChildren = !leaf, isCollapsed = collapsed.has(task.id)
          const inActivePath = highlightedIds.has(task.id)
          return <article key={task.id} ref={element => { if (element) nodeRefs.current.set(task.id, element); else nodeRefs.current.delete(task.id) }} role="treeitem" aria-level={node.depth + 1} draggable className={`desk-task-map-node is-${task.status}${selectedTaskId === task.id ? ' is-selected' : ''}${draggedId === task.id ? ' is-dragged' : ''}${inActivePath ? ' is-path-active' : ''}${dropTargetId === task.id ? ' is-drop-target' : ''}${leaf && fileChips.length + noteChips.length ? ' has-attachments' : ''}`} style={{ left: x, top: node.y - NODE_HEIGHT / 2, animationDelay: `${node.depth * 55}ms` }} aria-label={`${task.title}, ${labels.statuses[task.status]}, ${labels.progress}: ${node.done}/${node.total}`} aria-selected={selectedTaskId === task.id} aria-expanded={hasChildren ? !isCollapsed : undefined} tabIndex={selectedTaskId ? selectedTaskId === task.id ? 0 : -1 : node.depth === 0 ? 0 : -1} onPointerEnter={() => setActiveTaskId(task.id)} onPointerLeave={() => setActiveTaskId(null)} onFocus={() => { setActiveTaskId(task.id); setSelectedTaskId(task.id) }} onBlur={() => setActiveTaskId(null)} onClick={() => { setSelectedTaskId(task.id); setContextMenu(null) }} onDoubleClick={() => beginRename(task)} onContextMenu={event => showContextMenu(event, task)} onKeyDown={event => handleNodeKeyDown(event, task)} onDragStart={event => { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', task.id); setDraggedId(task.id) }} onDragEnd={() => { setDraggedId(null); setDropTargetId(null) }} onDragOver={event => { if (draggedId && draggedId !== task.id) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setDropTargetId(task.id) } }} onDragLeave={() => setDropTargetId(null)} onDrop={event => { event.preventDefault(); const sourceId = event.dataTransfer.getData('text/plain'); if (sourceId && reparentTask(sourceId, task.id)) { if (collapsed.has(task.id)) onToggleCollapsed(task.id); setSelectedTaskId(sourceId); setPendingFocusId(sourceId) } setDropTargetId(null); setDraggedId(null) }}>
            <div className="desk-task-map-node-main">
              <span className="desk-task-map-status-icon">{statusIcon(task.status)}</span>
              {hasChildren && <button type="button" className="desk-task-map-branch-icon" aria-label={isCollapsed ? labels.expandTask : labels.collapseTask} aria-expanded={!isCollapsed} onClick={event => { event.stopPropagation(); onToggleCollapsed(task.id) }}>{isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}</button>}
              {node.depth === 0 && <FolderTree size={15} aria-hidden="true" className="desk-task-map-root-icon" />}
              {editingId === task.id ? <input className="desk-task-map-rename" autoFocus value={editValue} aria-label={labels.editTask} onClick={event => event.stopPropagation()} onChange={event => setEditValue(event.target.value)} onBlur={saveRename} onKeyDown={event => { event.stopPropagation(); if (event.key === 'Enter') { event.preventDefault(); saveRename() } if (event.key === 'Escape') { event.preventDefault(); cancelRename() } }} /> : <strong title={task.title}>{task.title}</strong>}
              <span className="desk-task-map-progress" title={`${labels.progress}: ${pct}%`}><svg viewBox="0 0 20 20" aria-hidden="true"><circle className="desk-task-map-ring-track" cx="10" cy="10" r={radius} /><circle className="desk-task-map-ring-value" cx="10" cy="10" r={radius} strokeDasharray={circumference} strokeDashoffset={circumference * (1 - pct / 100)} /></svg><span>{node.done}/{node.total}</span></span>
            </div>
            {leaf && (fileChips.length + noteChips.length > 0) && <div className="desk-task-map-chips">{fileChips.map(({ id, title }) => <span className="desk-task-map-chip" key={`file-${id}`} title={title}><FileText size={11} aria-hidden="true" />{title}</span>)}{noteChips.map(({ id, title }) => <span className="desk-task-map-chip is-note" key={`note-${id}`} title={title}><FileText size={11} aria-hidden="true" />{title}</span>)}</div>}
          </article>
        })}
      </div>
      {contextMenu && menuTask && <div className="desk-task-map-context-menu" role="menu" aria-label={labels.contextMenu} style={menuPosition} onPointerDown={event => event.stopPropagation()} onKeyDown={event => { if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return; event.preventDefault(); const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]')); const index = items.indexOf(event.target as HTMLButtonElement); items[(index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus() }}>
        <button type="button" role="menuitem" autoFocus onClick={() => beginRename(menuTask)}>{labels.editTask}</button>
        <button type="button" role="menuitem" onClick={() => makeTask(menuTask.parentId, menuTask.id)}>{labels.addSibling}</button>
        <button type="button" role="menuitem" onClick={() => makeTask(menuTask.id)}>{labels.addChild}</button>
        <button type="button" role="menuitem" className="is-danger" onClick={() => { if (window.confirm(labels.deleteConfirm)) { removeTask(menuTask.id); setSelectedTaskId(null) } setContextMenu(null) }}>{labels.deleteTask}</button>
      </div>}
    </div>
  </section>
}
