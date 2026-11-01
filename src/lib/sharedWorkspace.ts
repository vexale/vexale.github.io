import { useSyncExternalStore } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import type { SharedNote, SharedWorkspaceCredentials } from './libraryApi'
import { supabase } from './supabase'

const STORAGE_KEY = 'atelier-shared-workspace-v1'
const listeners = new Set<() => void>()
const noteListeners = new Set<(update: SharedNoteUpdate) => void>()

export type SharedWorkspace = SharedWorkspaceCredentials
export interface SharedNoteUpdate { nodeKey: string; updatedAt: number }

function isWorkspace(value: unknown): value is SharedWorkspace {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  return typeof record.workspaceId === 'string' && typeof record.accessToken === 'string' &&
    /^[0-9a-f-]{36}$/i.test(record.workspaceId) && record.accessToken.length >= 32
}

function readWorkspace(): SharedWorkspace | null {
  try {
    const legacy = window.localStorage.getItem(STORAGE_KEY)
    if (legacy) window.localStorage.removeItem(STORAGE_KEY)
    const raw = window.sessionStorage.getItem(STORAGE_KEY) ?? legacy
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (!isWorkspace(parsed)) return null
    if (!window.sessionStorage.getItem(STORAGE_KEY)) window.sessionStorage.setItem(STORAGE_KEY, raw)
    return parsed
  } catch {
    return null
  }
}

let workspace: SharedWorkspace | null = typeof window === 'undefined' ? null : readWorkspace()
let channel: RealtimeChannel | null = null
let channelWorkspaceId = ''
let channelReady: Promise<RealtimeChannel> | null = null

function emit(): void {
  listeners.forEach(listener => listener())
}

function stopChannel(): void {
  if (channel && supabase) void supabase.removeChannel(channel)
  channel = null
  channelWorkspaceId = ''
  channelReady = null
}

function setWorkspace(next: SharedWorkspace | null): void {
  if (workspace?.workspaceId !== next?.workspaceId || workspace?.accessToken !== next?.accessToken) {
    stopChannel()
  }
  workspace = next
  try {
    window.localStorage.removeItem(STORAGE_KEY)
    if (next) window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    else window.sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    // تظل المشاركة متاحة في الجلسة الحالية حتى إن تعذر التخزين المحلي.
  }
  emit()
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', event => {
    if (event.key !== STORAGE_KEY || event.storageArea !== window.sessionStorage) return
    stopChannel()
    workspace = readWorkspace()
    emit()
  })
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const getSnapshot = (): SharedWorkspace | null => workspace

export function useSharedWorkspace(): SharedWorkspace | null {
  return useSyncExternalStore(subscribe, getSnapshot, () => null)
}

export function activateWorkspace(next: SharedWorkspace): void {
  if (isWorkspace(next)) setWorkspace(next)
}

export function leaveSharedWorkspace(): void {
  setWorkspace(null)
}

export function activateWorkspaceFromInvite(): void {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  const workspaceId = url.searchParams.get('workspace') ?? ''
  const params = new URLSearchParams(url.hash.replace(/^#/, ''))
  const accessToken = params.get('access') ?? ''
  const invitation: SharedWorkspace = { workspaceId, accessToken }
  if (!isWorkspace(invitation)) return

  setWorkspace(invitation)
  url.searchParams.delete('workspace')
  url.hash = ''
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}`)
}

export function createWorkspaceInvite(workspaceValue: SharedWorkspace): string {
  const url = new URL(window.location.href)
  url.searchParams.set('workspace', workspaceValue.workspaceId)
  url.hash = new URLSearchParams({ access: workspaceValue.accessToken }).toString()
  return url.toString()
}

function ensureChannel(workspaceValue: SharedWorkspace): Promise<RealtimeChannel> {
  if (!supabase) return Promise.reject(new Error('Realtime is not configured.'))
  if (channel && channelWorkspaceId === workspaceValue.workspaceId && channelReady) return channelReady

  stopChannel()
  const nextChannel = supabase.channel(`library-live:${workspaceValue.workspaceId}`, {
    config: { broadcast: { ack: true, self: false } },
  })
  nextChannel.on('broadcast', { event: 'note-updated' }, event => {
    const note = event.payload
    if (!isSharedNoteUpdate(note)) return
    noteListeners.forEach(listener => listener(note))
  })

  channel = nextChannel
  channelWorkspaceId = workspaceValue.workspaceId
  channelReady = new Promise<RealtimeChannel>((resolve, reject) => {
    nextChannel.subscribe(status => {
      if (status === 'SUBSCRIBED') resolve(nextChannel)
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        reject(new Error('Realtime connection is unavailable.'))
      }
    })
  })
  return channelReady
}

export function subscribeToSharedNotes(listener: (update: SharedNoteUpdate) => void): () => void {
  const currentWorkspace = workspace
  if (!currentWorkspace || !supabase) return () => undefined

  noteListeners.add(listener)
  void ensureChannel(currentWorkspace).catch(() => undefined)
  return () => {
    noteListeners.delete(listener)
    if (noteListeners.size === 0) stopChannel()
  }
}

export async function broadcastSharedNote(note: SharedNote): Promise<void> {
  const currentWorkspace = workspace
  if (!currentWorkspace) return
  const activeChannel = await ensureChannel(currentWorkspace)
  const result = await activeChannel.send({ type: 'broadcast', event: 'note-updated', payload: { nodeKey: note.nodeKey, updatedAt: note.updatedAt } })
  if (result !== 'ok') throw new Error('The live update could not be sent.')
}

function isSharedNoteUpdate(value: unknown): value is SharedNoteUpdate {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  return typeof record.nodeKey === 'string' && record.nodeKey.length > 0 && record.nodeKey.length <= 500 &&
    typeof record.updatedAt === 'number' && Number.isFinite(record.updatedAt)
}