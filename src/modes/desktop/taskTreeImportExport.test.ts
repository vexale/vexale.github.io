import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { parseLibraryBackup, serializeLibraryBackup } from '../../lib/libraryBackup'
import type { TaskRecord } from './taskStore'

type TaskStoreModule = typeof import('./taskStore')

const storageValues = new Map<string, string>()
const localStorageMock = {
  getItem: vi.fn((key: string) => storageValues.get(key) ?? null),
  setItem: vi.fn((key: string, value: string) => { storageValues.set(key, value) }),
}

let store: TaskStoreModule

const importedTasks: TaskRecord[] = [
  {
    id: 'root', parentId: null, title: 'Root', status: 'doing', dueDate: null, order: 0,
    attachedFileIds: ['file-1'], attachedNoteIds: [],
  },
  {
    id: 'child', parentId: 'root', title: 'Child', status: 'done', dueDate: '2026-11-01', order: 0,
    attachedFileIds: [], attachedNoteIds: ['note-1'],
  },
]

async function loadStore(): Promise<void> {
  vi.resetModules()
  store = await import('./taskStore')
}

beforeEach(async () => {
  storageValues.clear()
  localStorageMock.getItem.mockClear()
  localStorageMock.setItem.mockClear()
  vi.stubGlobal('localStorage', localStorageMock)
  vi.stubGlobal('window', { addEventListener: vi.fn() })
  await loadStore()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('task tree backup import/export', () => {
  it('round-trips task records through the backup format and persisted store', async () => {
    const exportedText = serializeLibraryBackup({
      format: 'vexale-library',
      version: 2,
      tree: [],
      tasks: importedTasks,
    })
    const backup = parseLibraryBackup(exportedText)

    expect(store.replaceTaskTree(backup.tasks as TaskRecord[])).toBe(true)
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      store.TASK_TREE_KEY,
      JSON.stringify(importedTasks),
    )

    const reloaded = await loadStore()
    const exportedAgain = serializeLibraryBackup({
      format: 'vexale-library',
      version: 2,
      tree: [],
      tasks: reloaded.getTaskTree(),
    })

    expect(parseLibraryBackup(exportedAgain).tasks).toEqual(importedTasks)
  })

  it('returns detached task data so export consumers cannot mutate the store', () => {
    store.replaceTaskTree(importedTasks)
    const exportedTasks = store.getTaskTree()
    exportedTasks[0].attachedFileIds.push('mutated')
    exportedTasks[1].title = 'Mutated'

    expect(store.getTaskTree()).toEqual(importedTasks)
  })
})
