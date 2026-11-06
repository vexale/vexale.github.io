import { getGoogleIdToken } from './googleAuth'
import { supabase } from './supabase'

export type SupportCategory = 'suggestion' | 'issue'

export interface SupportRequest {
  category: SupportCategory
  subject: string
  message: string
  contactEmail: string
}

export interface SharedWorkspaceCredentials {
  workspaceId: string
  accessToken: string
}

export interface SharedNote {
  nodeKey: string
  title: string
  html: string
  updatedAt: number
}

interface LibraryApiResponse {
  error?: unknown
  workspaceId?: unknown
  accessToken?: unknown
  note?: unknown
}

function getGoogleToken(): string {
  const token = getGoogleIdToken()
  if (!token) throw new Error('Sign in to continue.')
  return token
}

async function getSupabaseAccessToken(): Promise<string> {
  if (!supabase) throw new Error('Supabase is not configured.')
  if (typeof navigator !== 'undefined' && !navigator.onLine) throw new Error('offline')
  const { data, error } = await supabase.auth.getSession()
  if (error || !data.session?.access_token) throw new Error(error?.message ?? 'Sign in to continue.')
  return data.session.access_token
}

async function invokeLibraryApi(
  body: Record<string, unknown>,
  bearerToken: string,
): Promise<LibraryApiResponse> {
  if (!supabase) throw new Error('Cloud features are not connected yet.')

  const { data, error } = await supabase.functions.invoke<LibraryApiResponse>('library-api', {
    body,
    headers: { Authorization: `Bearer ${bearerToken}` },
  })

  if (error) {
    const serverMessage = data && typeof data.error === 'string' ? data.error : ''
    throw new Error(serverMessage || 'We could not complete that request. Please try again.')
  }
  if (!data || (typeof data.error === 'string' && data.error)) {
    throw new Error(typeof data?.error === 'string' ? data.error : 'The service returned an unexpected response.')
  }
  return data
}

export async function submitSupportRequest(request: SupportRequest): Promise<void> {
  await invokeLibraryApi({ action: 'support.submit', ...request }, await getSupabaseAccessToken())
}

export async function createSharedWorkspace(): Promise<SharedWorkspaceCredentials> {
  const data = await invokeLibraryApi({ action: 'workspace.create' }, getGoogleToken())
  if (typeof data.workspaceId !== 'string' || typeof data.accessToken !== 'string') {
    throw new Error('We could not create the shared workspace. Please try again.')
  }
  return { workspaceId: data.workspaceId, accessToken: data.accessToken }
}

export async function readSharedNote(
  workspace: SharedWorkspaceCredentials,
  nodeKey: string,
): Promise<SharedNote | null> {
  const data = await invokeLibraryApi(
    { action: 'note.read', workspaceId: workspace.workspaceId, nodeKey },
    workspace.accessToken,
  )
  if (data.note === null || data.note === undefined) return null
  if (!isSharedNote(data.note)) throw new Error('The shared note could not be read.')
  return data.note
}

export async function writeSharedNote(
  workspace: SharedWorkspaceCredentials,
  note: Omit<SharedNote, 'updatedAt'>,
): Promise<SharedNote> {
  const data = await invokeLibraryApi(
    { action: 'note.write', workspaceId: workspace.workspaceId, ...note },
    workspace.accessToken,
  )
  if (!isSharedNote(data.note)) throw new Error('The shared note could not be saved.')
  return data.note
}

function isSharedNote(value: unknown): value is SharedNote {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  return typeof record.nodeKey === 'string' && typeof record.title === 'string' &&
    typeof record.html === 'string' && typeof record.updatedAt === 'number' && Number.isFinite(record.updatedAt)
}
