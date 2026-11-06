import { describe, expect, it } from 'vitest'
import { mergeGuestRecords, mergeRecordSets, type SyncRecord } from '../src/lib/sync/merge'

const row = (id: string, updatedAt: number, deviceId: string, deleted = false, data: string = id): SyncRecord<string> => ({ kind: 'note', id, updatedAt, deviceId, deleted, data })

describe('sync record merging', () => {
  it('unions guest records into the account without dropping account-only records', () => {
    const result = mergeGuestRecords([row('guest', 1, 'a')], [row('account', 1, 'b')])
    expect(result.map(record => record.id).sort()).toEqual(['account', 'guest'])
  })

  it('lets a later tombstone win so deleted records do not resurrect', () => {
    const result = mergeRecordSets([row('x', 1, 'a')], [row('x', 2, 'a', true)])
    expect(result).toEqual([row('x', 2, 'a', true)])
  })

  it('uses lexicographically higher device id when timestamps tie', () => {
    const result = mergeRecordSets([row('x', 4, 'device-a')], [row('x', 4, 'device-z', false, 'new')])
    expect(result).toEqual([row('x', 4, 'device-z', false, 'new')])
  })
})
