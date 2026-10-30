import { dbGetAll, dbGetNote } from '../db'
import { getTaskTree } from '../modes/desktop/taskStore'

function readTree(): unknown {
  try {
    const raw = localStorage.getItem('atelier-tree-v1')
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function flattenIds(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.flatMap(item => {
    if (!item || typeof item !== 'object') return []
    const node = item as { id?: unknown; children?: unknown }
    return [...(typeof node.id === 'string' ? [node.id] : []), ...flattenIds(node.children)]
  })
}

async function toBase64(file: Blob): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  let binary = ''
  const chunkSize = 0x8000
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length)))
  }
  return btoa(binary)
}

function download(name: string, data: Blob): void {
  const url = URL.createObjectURL(data)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

export async function exportEmergencyBackup(): Promise<void> {
  const tree = readTree()
  const notes = await Promise.all(flattenIds(tree).map(async id => [id, await dbGetNote(id)] as const))
  const records = await dbGetAll()
  const files = await Promise.all(records.map(async record => ({
    ...record,
    file: undefined,
    mimeType: record.file.type,
    data: await toBase64(record.file),
  })))
  const payload = {
    format: 'vexale-library',
    version: 2,
    exportedAt: new Date().toISOString(),
    tree,
    notes: Object.fromEntries(notes),
    files,
    tasks: getTaskTree(),
  }
  download('vexale-emergency-backup.json', new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }))
}
