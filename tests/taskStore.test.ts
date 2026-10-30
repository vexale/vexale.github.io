import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as TaskStore from '../src/modes/desktop/taskStore'

type StoreModule = typeof TaskStore
let store: StoreModule

beforeEach(async () => {
  vi.resetModules()
  store = await import('../src/modes/desktop/taskStore')
})

describe('task store', () => {
  it('creates, updates, exports, and removes a task subtree', () => {
    const root = store.createTask(null, 'Root')
    expect(root).toBeTruthy()
    const child = store.createTask(root, 'Child')
    expect(child).toBeTruthy()
    store.updateTask(child!, { status: 'done', title: 'Updated child' })
    expect(store.getTaskTree()).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: root, parentId: null, title: 'Root' }),
      expect.objectContaining({ id: child, parentId: root, title: 'Updated child', status: 'done' }),
    ]))
    store.removeTask(root!)
    expect(store.getTaskTree()).toHaveLength(0)
  })

  it('reparents and reorders through the public store API', () => {
    const first = store.createTask(null, 'First')
    const second = store.createTask(null, 'Second')
    const child = store.createTask(first, 'Child')
    expect(store.reparentTask(child!, second!)).toBe(true)
    expect(store.getTaskTree().find(task => task.id === child)?.parentId).toBe(second)
    store.reorderSiblingTasks(second!, first!, 'before')
    const roots = store.getTaskTree().filter(task => task.parentId === null).sort((a, b) => a.order - b.order)
    expect(roots.map(task => task.id)).toEqual([second, first])
  })
})
