import { describe, expect, it } from 'vitest'
import { parseLibraryBackup, serializeLibraryBackup } from '../src/lib/libraryBackup'

describe('library backup envelope', () => {
  it('round-trips a supported export payload', () => {
    const payload = {
      format: 'vexale-library' as const,
      version: 2,
      exportedAt: '2026-10-31T00:00:00.000Z',
      tree: [{ id: 'root', title: 'Root', children: [] }],
      notes: { root: { html: '<p>Hello</p>', updatedAt: 1 } },
      files: [],
      tasks: [],
    }
    expect(parseLibraryBackup(serializeLibraryBackup(payload))).toEqual(payload)
  })

  it('rejects invalid JSON, format, version, and tree payloads', () => {
    expect(() => parseLibraryBackup('{')).toThrow('notObject')
    expect(() => parseLibraryBackup(JSON.stringify({ format: 'other', version: 2, tree: [] }))).toThrow('format')
    expect(() => parseLibraryBackup(JSON.stringify({ format: 'vexale-library', version: 0, tree: [] }))).toThrow('version')
    expect(() => parseLibraryBackup(JSON.stringify({ format: 'vexale-library', version: 2, tree: {} }))).toThrow('tree')
  })
})
