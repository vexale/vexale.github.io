export interface SyncRecord<T = unknown> {
  kind: string
  id: string
  data: T
  updatedAt: number
  deleted: boolean
  deviceId: string
}

export function compareSyncRecords<T>(a: SyncRecord<T>, b: SyncRecord<T>): number {
  if (a.updatedAt !== b.updatedAt) return a.updatedAt - b.updatedAt
  return a.deviceId.localeCompare(b.deviceId)
}

export function mergeSyncRecords<T>(a: SyncRecord<T> | undefined, b: SyncRecord<T>): SyncRecord<T> {
  return !a || compareSyncRecords(a, b) < 0 ? b : a
}

export function mergeRecordSets<T>(...sets: SyncRecord<T>[][]): SyncRecord<T>[] {
  const merged = new Map<string, SyncRecord<T>>()
  for (const record of sets.flat()) {
    const key = `${record.kind}\u0000${record.id}`
    merged.set(key, mergeSyncRecords(merged.get(key), record))
  }
  return [...merged.values()]
}

/** Guest records are copied into an account; the source namespace is never mutated. */
export function mergeGuestRecords<T>(guest: SyncRecord<T>[], account: SyncRecord<T>[]): SyncRecord<T>[] {
  return mergeRecordSets(account, guest)
}
