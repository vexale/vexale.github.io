export interface LibraryBackupEnvelope {
  format: 'vexale-library'
  version: number
  exportedAt?: string
  tree: unknown
  notes?: unknown
  files?: unknown
  tasks?: unknown
}

export const MAX_LIBRARY_BACKUP_BYTES = 64 * 1024 * 1024
const MAX_BACKUP_CHARACTERS = MAX_LIBRARY_BACKUP_BYTES
const MAX_TREE_NODES = 5_000
const MAX_TREE_DEPTH = 64
const MAX_NOTE_HTML_CHARACTERS = 5 * 1024 * 1024
const MAX_FILES = 1_000
const MAX_FILE_DATA_CHARACTERS = 16 * 1024 * 1024
const MAX_TOTAL_FILE_DATA_CHARACTERS = 48 * 1024 * 1024
const MAX_TASKS = 200

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function validateTree(value: unknown): boolean {
  if (!Array.isArray(value)) return false
  const stack: Array<{ node: unknown; depth: number }> = value.map(node => ({ node, depth: 1 }))
  const ids = new Set<string>()
  let count = 0
  while (stack.length) {
    const { node, depth } = stack.pop()!
    if (!isRecord(node) || depth > MAX_TREE_DEPTH || ++count > MAX_TREE_NODES) return false
    if (typeof node.id !== 'string' || !node.id || node.id.length > 200 || ids.has(node.id)) return false
    if (typeof node.title !== 'string' || node.title.length > 500 || !Array.isArray(node.children)) return false
    ids.add(node.id)
    for (const child of node.children) stack.push({ node: child, depth: depth + 1 })
  }
  return true
}

function validateNotes(value: unknown): boolean {
  if (value === undefined) return true
  if (!isRecord(value) || Object.keys(value).length > MAX_TREE_NODES) return false
  return Object.entries(value).every(([key, note]) => key.length > 0 && key.length <= 200 && (
    note === null || (isRecord(note) && typeof note.html === 'string' && note.html.length <= MAX_NOTE_HTML_CHARACTERS &&
      (note.updatedAt === undefined || (typeof note.updatedAt === 'number' && Number.isFinite(note.updatedAt) && note.updatedAt >= 0)))
  ))
}

function validateFiles(value: unknown): boolean {
  if (value === undefined) return true
  if (!Array.isArray(value) || value.length > MAX_FILES) return false
  let totalDataCharacters = 0
  for (const file of value) {
    if (!isRecord(file) || typeof file.nodeId !== 'string' || file.nodeId.length > 200 ||
      typeof file.name !== 'string' || !file.name.trim() || file.name.length > 255 ||
      !['image', 'audio', 'doc', 'drawing'].includes(String(file.kind)) || typeof file.data !== 'string' ||
      file.data.length > MAX_FILE_DATA_CHARACTERS || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(file.data) ||
      (file.mimeType !== undefined && (typeof file.mimeType !== 'string' || file.mimeType.length > 127 || !/^[\w.+-]+\/[\w.+-]+$/.test(file.mimeType)))) return false
    totalDataCharacters += file.data.length
    if (totalDataCharacters > MAX_TOTAL_FILE_DATA_CHARACTERS) return false
  }
  return true
}

function validateTasks(value: unknown): boolean {
  if (value === undefined) return true
  if (!Array.isArray(value) || value.length > MAX_TASKS) return false
  return value.every(task => isRecord(task) && typeof task.id === 'string' && task.id.length > 0 && task.id.length <= 200 &&
    (task.parentId === null || (typeof task.parentId === 'string' && task.parentId.length <= 200)) &&
    typeof task.title === 'string' && task.title.length <= 1_000 &&
    ['todo', 'doing', 'done', 'late'].includes(String(task.status)) &&
    (task.dueDate === null || (typeof task.dueDate === 'string' && task.dueDate.length <= 32)) &&
    typeof task.order === 'number' && Number.isFinite(task.order) &&
    Array.isArray(task.attachedFileIds) && task.attachedFileIds.length <= 200 && task.attachedFileIds.every(id => typeof id === 'string' && id.length <= 200) &&
    Array.isArray(task.attachedNoteIds) && task.attachedNoteIds.length <= 200 && task.attachedNoteIds.every(id => typeof id === 'string' && id.length <= 200))
}

export function parseLibraryBackup(text: string): LibraryBackupEnvelope {
  if (text.length > MAX_BACKUP_CHARACTERS) throw new Error('size')
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('notObject')
  }
  if (!isRecord(parsed)) throw new Error('notObject')
  const value = parsed as Partial<LibraryBackupEnvelope> & { format?: unknown; version?: unknown }
  if (value.format !== 'vexale-library') throw new Error('format')
  if (value.version !== 1 && value.version !== 2) throw new Error('version')
  if (!validateTree(value.tree)) throw new Error('tree')
  if (!validateNotes(value.notes)) throw new Error('notes')
  if (!validateFiles(value.files)) throw new Error('files')
  if (!validateTasks(value.tasks)) throw new Error('tasks')
  return value as LibraryBackupEnvelope
}

export function serializeLibraryBackup(payload: LibraryBackupEnvelope): string {
  return JSON.stringify(payload, null, 2)
}
