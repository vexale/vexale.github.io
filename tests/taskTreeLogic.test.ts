import { describe, expect, it } from 'vitest'
import type { TaskRecord } from '../src/modes/desktop/taskStore'
import { calculateTaskProgress, reorderSiblingTaskTree, reparentTaskTree } from '../src/modes/desktop/taskTreeLogic'

const task = (id: string, parentId: string | null, status: TaskRecord['status'], order: number): TaskRecord => ({
  id, parentId, title: id, status, dueDate: null, order, attachedFileIds: [], attachedNoteIds: [],
})

describe('task tree logic', () => {
  it('rolls leaf progress up through nested parents', () => {
    const tasks = [
      task('root', null, 'todo', 0),
      task('done', 'root', 'done', 0),
      task('branch', 'root', 'todo', 1),
      task('nested-done', 'branch', 'done', 0),
      task('nested-todo', 'branch', 'todo', 1),
    ]
    const progress = calculateTaskProgress(tasks)
    expect(progress.get('nested-done')).toBe(100)
    expect(progress.get('nested-todo')).toBe(0)
    expect(progress.get('branch')).toBe(50)
    expect(progress.get('root')).toBe(75)
  })

  it('reparents a task, normalizes both sibling lists, and blocks cycles', () => {
    const tasks = [task('a', null, 'todo', 0), task('b', null, 'todo', 1), task('child', 'a', 'done', 0), task('existing', 'b', 'todo', 0)]
    const result = reparentTaskTree(tasks, 'child', 'b')
    expect(result.changed).toBe(true)
    expect(result.tasks.find(item => item.id === 'child')).toMatchObject({ parentId: 'b', order: 1 })
    expect(result.tasks.find(item => item.id === 'existing')?.order).toBe(0)
    expect(reparentTaskTree(result.tasks, 'b', 'child').changed).toBe(false)
  })

  it('reorders siblings before and after a target without changing other branches', () => {
    const tasks = [task('a', null, 'todo', 0), task('b', null, 'todo', 1), task('c', null, 'todo', 2), task('other', 'a', 'todo', 0)]
    const before = reorderSiblingTaskTree(tasks, 'c', 'a', 'before')
    expect(before.filter(item => item.parentId === null).sort((a, b) => a.order - b.order).map(item => item.id)).toEqual(['c', 'a', 'b'])
    const after = reorderSiblingTaskTree(before, 'c', 'b', 'after')
    expect(after.filter(item => item.parentId === null).sort((a, b) => a.order - b.order).map(item => item.id)).toEqual(['a', 'b', 'c'])
    expect(after.find(item => item.id === 'other')?.parentId).toBe('a')
  })
})
