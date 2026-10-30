import { useSyncExternalStore } from 'react'
import { reorderSiblingTaskTree, reparentTaskTree } from './taskTreeLogic'

export type TaskStatus = 'todo' | 'doing' | 'done' | 'late'
export const MAX_TASK_COUNT = 200
export interface TaskRecord {
  id: string
  parentId: string | null
  title: string
  status: TaskStatus
  dueDate: string | null
  order: number
  attachedFileIds: string[]
  attachedNoteIds: string[]
}
export const TASK_TREE_KEY = 'vexale-task-tree-v1'
export interface TaskHistoryState { canUndo: boolean; canRedo: boolean }

function validTask(value: unknown): value is TaskRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const item = value as Record<string, unknown>
  return typeof item.id === 'string' && (item.parentId === null || typeof item.parentId === 'string') && typeof item.title === 'string' &&
    ['todo', 'doing', 'done', 'late'].includes(String(item.status)) && (typeof item.dueDate === 'string' || item.dueDate === null) && Number.isFinite(item.order) &&
    Array.isArray(item.attachedFileIds) && item.attachedFileIds.every(id => typeof id === 'string') && Array.isArray(item.attachedNoteIds) && item.attachedNoteIds.every(id => typeof id === 'string')
}
function load(): TaskRecord[] {
  if (typeof window === 'undefined') return []
  try { const value: unknown = JSON.parse(localStorage.getItem(TASK_TREE_KEY) ?? '[]'); return Array.isArray(value) ? value.filter(validTask) : [] } catch { return [] }
}
let tasks = load()
const listeners = new Set<() => void>()
const subscribe = (listener: () => void): (() => void) => { listeners.add(listener); return () => listeners.delete(listener) }
const snapshot = (): TaskRecord[] => tasks
const EMPTY_TASKS: TaskRecord[] = []
const undoStack: TaskRecord[][] = []
const redoStack: TaskRecord[][] = []
const EMPTY_HISTORY: TaskHistoryState = { canUndo: false, canRedo: false }
let historySnapshot: TaskHistoryState = EMPTY_HISTORY
function publish(): void {
  historySnapshot = { canUndo: undoStack.length > 0, canRedo: redoStack.length > 0 }
  listeners.forEach(listener => listener())
}
function commit(next: TaskRecord[]): void {
  if (next === tasks) return
  undoStack.push(tasks)
  if (undoStack.length > 100) undoStack.shift()
  redoStack.length = 0
  tasks = next
  try { localStorage.setItem(TASK_TREE_KEY, JSON.stringify(tasks)) } catch { /* keep this session's edits if storage is unavailable */ }
  publish()
}
if (typeof window !== 'undefined') window.addEventListener('storage', event => { if (event.key === TASK_TREE_KEY) { tasks = load(); undoStack.length = 0; redoStack.length = 0; publish() } })
export function useTaskTreeStore(): TaskRecord[] { return useSyncExternalStore(subscribe, snapshot, () => EMPTY_TASKS) }
export function useTaskTreeHistory(): TaskHistoryState { return useSyncExternalStore(subscribe, () => historySnapshot, () => EMPTY_HISTORY) }
export function getTaskTree(): TaskRecord[] { return tasks.map(task => ({ ...task, attachedFileIds: [...task.attachedFileIds], attachedNoteIds: [...task.attachedNoteIds] })) }
export function replaceTaskTree(next: TaskRecord[]): boolean {
  if (next.length > MAX_TASK_COUNT) return false
  commit(next.map(task => ({ ...task, attachedFileIds: [...task.attachedFileIds], attachedNoteIds: [...task.attachedNoteIds] })))
  return true
}
export function undoTaskTree(): void {
  const previous = undoStack.pop()
  if (!previous) return
  redoStack.push(tasks); tasks = previous
  try { localStorage.setItem(TASK_TREE_KEY, JSON.stringify(tasks)) } catch { /* keep this session's edits if storage is unavailable */ }
  publish()
}
export function redoTaskTree(): void {
  const next = redoStack.pop()
  if (!next) return
  undoStack.push(tasks); tasks = next
  try { localStorage.setItem(TASK_TREE_KEY, JSON.stringify(tasks)) } catch { /* keep this session's edits if storage is unavailable */ }
  publish()
}
export function createTask(parentId: string | null, title: string, afterId?: string): string | null {
  if (tasks.length >= MAX_TASK_COUNT) return null
  const siblings = tasks.filter(task => task.parentId === parentId).sort((a, b) => a.order - b.order)
  const insertAt = afterId ? Math.max(0, siblings.findIndex(task => task.id === afterId) + 1) : siblings.length
  const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `task-${Date.now()}-${Math.random().toString(36).slice(2)}`
  const nextSiblings = [...siblings.slice(0, insertAt), { id, parentId, title: title.trim(), status: 'todo' as const, dueDate: null, order: insertAt, attachedFileIds: [], attachedNoteIds: [] }, ...siblings.slice(insertAt)]
  const orderMap = new Map(nextSiblings.map((task, index) => [task.id, index]))
  commit([...tasks.filter(task => task.parentId !== parentId), ...nextSiblings.map(task => ({ ...task, order: orderMap.get(task.id) ?? task.order }))])
  return id
}
export function updateTask(id: string, patch: Partial<Pick<TaskRecord, 'title' | 'status' | 'dueDate' | 'attachedFileIds' | 'attachedNoteIds'>>): void {
  commit(tasks.map(task => task.id === id ? { ...task, ...patch } : task))
}
export function removeTask(id: string): void {
  const ids = new Set<string>([id]); let changed = true
  while (changed) { changed = false; for (const task of tasks) if (task.parentId && ids.has(task.parentId) && !ids.has(task.id)) { ids.add(task.id); changed = true } }
  if (!tasks.some(task => ids.has(task.id))) return
  commit(tasks.filter(task => !ids.has(task.id)))
}
export function reparentTask(sourceId: string, parentId: string): boolean {
  const result = reparentTaskTree(tasks, sourceId, parentId)
  if (!result.changed) return false
  commit(result.tasks)
  return true
}
export function reorderSiblingTasks(sourceId: string, targetId: string, position: 'before' | 'after' = 'before'): void {
  const next = reorderSiblingTaskTree(tasks, sourceId, targetId, position)
  if (next !== tasks) commit(next)
}
