export interface LibraryBackupEnvelope {
  format: 'vexale-library'
  version: number
  exportedAt?: string
  tree: unknown
  notes?: unknown
  files?: unknown
  tasks?: unknown
}

export function parseLibraryBackup(text: string): LibraryBackupEnvelope {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('notObject')
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('notObject')
  const value = parsed as Partial<LibraryBackupEnvelope> & { format?: unknown; version?: unknown }
  if (value.format !== 'vexale-library') throw new Error('format')
  if (!Number.isInteger(value.version) || Number(value.version) < 1) throw new Error('version')
  if (!Array.isArray(value.tree)) throw new Error('tree')
  return value as LibraryBackupEnvelope
}

export function serializeLibraryBackup(payload: LibraryBackupEnvelope): string {
  return JSON.stringify(payload, null, 2)
}
