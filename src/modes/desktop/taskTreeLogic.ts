import type { TaskRecord } from './taskStore'

export type ReorderPosition = 'before' | 'after'

function childrenOf(tasks: TaskRecord[]): Map<string | null, TaskRecord[]> {
  const children = new Map<string | null, TaskRecord[]>()
  for (const task of tasks) children.set(task.parentId, [...(children.get(task.parentId) ?? []), task])
  return children
}

export function calculateTaskProgress(tasks: TaskRecord[]): Map<string, number> {
  const children = childrenOf(tasks)
  const result = new Map<string, number>()
  const calculate = (task: TaskRecord): number => {
    const childrenTasks = children.get(task.id) ?? []
    const value = childrenTasks.length
      ? Math.round(childrenTasks.reduce((sum, child) => sum + calculate(child), 0) / childrenTasks.length)
      : task.status === 'done' ? 100 : 0
    result.set(task.id, value)
    return value
  }
  tasks.filter(task => task.parentId === null).forEach(calculate)
  return result
}

export function reparentTaskTree(tasks: TaskRecord[], sourceId: string, parentId: string): { tasks: TaskRecord[]; changed: boolean } {
  const source = tasks.find(task => task.id === sourceId)
  const parent = tasks.find(task => task.id === parentId)
  if (!source || !parent || source.id === parent.id || source.parentId === parent.id) return { tasks, changed: false }
  let ancestor: TaskRecord | undefined = parent
  while (ancestor) {
    if (ancestor.id === source.id) return { tasks, changed: false }
    ancestor = ancestor.parentId ? tasks.find(task => task.id === ancestor?.parentId) : undefined
  }
  const oldSiblings = tasks.filter(task => task.parentId === source.parentId && task.id !== source.id).sort((a, b) => a.order - b.order)
  const newSiblings = [...tasks.filter(task => task.parentId === parentId && task.id !== source.id).sort((a, b) => a.order - b.order), source]
  const oldOrders = new Map(oldSiblings.map((task, index) => [task.id, index]))
  const newOrders = new Map(newSiblings.map((task, index) => [task.id, index]))
  return {
    changed: true,
    tasks: tasks.map(task => {
      if (task.id === source.id) return { ...task, parentId, order: newOrders.get(task.id) ?? 0 }
      if (oldOrders.has(task.id)) return { ...task, order: oldOrders.get(task.id)! }
      if (newOrders.has(task.id)) return { ...task, order: newOrders.get(task.id)! }
      return task
    }),
  }
}

export function reorderSiblingTaskTree(tasks: TaskRecord[], sourceId: string, targetId: string, position: ReorderPosition = 'before'): TaskRecord[] {
  const source = tasks.find(task => task.id === sourceId)
  const target = tasks.find(task => task.id === targetId)
  if (!source || !target || source.id === target.id || source.parentId !== target.parentId) return tasks
  const siblings = tasks.filter(task => task.parentId === source.parentId).sort((a, b) => a.order - b.order)
  const from = siblings.findIndex(task => task.id === sourceId)
  const to = siblings.findIndex(task => task.id === targetId)
  const [moved] = siblings.splice(from, 1)
  siblings.splice(to + (position === 'after' ? 1 : 0), 0, moved)
  const orderMap = new Map(siblings.map((task, index) => [task.id, index]))
  return tasks.map(task => orderMap.has(task.id) ? { ...task, order: orderMap.get(task.id)! } : task)
}
