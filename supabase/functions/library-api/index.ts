import { createClient } from 'npm:@supabase/supabase-js@2'
import { createRemoteJWKSet, jwtVerify } from 'npm:jose@6'

const GOOGLE_JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'))
const MAX_BODY_BYTES = 60_000
const MAX_NOTE_BYTES = 50_000
const MAX_TITLE_LENGTH = 160
const MAX_NODE_KEY_LENGTH = 500

interface RequestBody {
  action?: unknown
  category?: unknown
  subject?: unknown
  message?: unknown
  contactEmail?: unknown
  workspaceId?: unknown
  nodeKey?: unknown
  title?: unknown
  html?: unknown
}

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'authorization, apikey, x-client-info, content-type',
      'Access-Control-Max-Age': '600',
      'Vary': 'Origin',
    },
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function readBody(request: Request): Promise<RequestBody> {
  const reader = request.body?.getReader()
  if (!reader) throw new SyntaxError('missing request body')
  const chunks: Uint8Array[] = []
  let total = 0

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue
      total += value.byteLength
      if (total > MAX_BODY_BYTES) {
        await reader.cancel().catch(() => undefined)
        throw new RangeError('request body too large')
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }

  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes))
  if (!isRecord(parsed)) throw new SyntaxError('invalid request body')
  return parsed as RequestBody
}

function getAdminClient() {
  const url = Deno.env.get('SUPABASE_URL')?.trim()
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim()
  if (!url || !serviceKey) throw new Error('The secure database connection is not configured.')
  return createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
}

function getBearerToken(request: Request): string | null {
  const match = (request.headers.get('authorization') ?? '').match(/^Bearer\s+(.+)$/i)
  const token = match?.[1]?.trim() ?? ''
  return token && token.length <= 12_000 ? token : null
}

async function hashValue(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

async function verifyGoogleToken(token: string): Promise<string | null> {
  const clientId = Deno.env.get('GOOGLE_CLIENT_ID')?.trim()
  if (!clientId) return null
  try {
    const { payload } = await jwtVerify(token, GOOGLE_JWKS, {
      algorithms: ['RS256'],
      audience: clientId,
      issuer: ['accounts.google.com', 'https://accounts.google.com'],
      clockTolerance: 5,
    })
    return typeof payload.sub === 'string' && payload.sub ? payload.sub : null
  } catch {
    return null
  }
}

function base64Url(bytes: Uint8Array): string {
  let binary = ''
  bytes.forEach(byte => { binary += String.fromCharCode(byte) })
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function normalizeSharedNote(record: Record<string, unknown>): Record<string, unknown> {
  const updatedAt = typeof record.updated_at === 'string' ? Date.parse(record.updated_at) : Number.NaN
  return {
    nodeKey: record.node_key,
    title: record.title,
    html: record.content_html,
    updatedAt: Number.isFinite(updatedAt) ? updatedAt : Date.now(),
  }
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: jsonResponse({}).headers })
  if (request.method !== 'POST') return jsonResponse({ error: 'This request could not be completed.' }, 405)

  let body: RequestBody
  try {
    body = await readBody(request)
  } catch (error) {
    const status = error instanceof RangeError ? 413 : 400
    return jsonResponse({ error: 'Please review the information and try again.' }, status)
  }

  const token = getBearerToken(request)
  if (!token) return jsonResponse({ error: 'Sign in or open a valid shared-workspace invitation to continue.' }, 401)

  let admin: ReturnType<typeof createClient>
  try {
    admin = getAdminClient()
  } catch {
    return jsonResponse({ error: 'The secure service is being prepared. Please try again soon.' }, 503)
  }

  if (body.action === 'support.submit') {
    const { data: authData, error: authError } = await admin.auth.getUser(token)
    const subjectId = authData.user?.id
    if (authError || !subjectId) return jsonResponse({ error: 'Sign in again to send your message.' }, 401)

    const category = body.category
    const subject = typeof body.subject === 'string' ? body.subject.trim() : ''
    const message = typeof body.message === 'string' ? body.message.trim() : ''
    const contactEmail = typeof body.contactEmail === 'string' ? body.contactEmail.trim() : ''
    if (category !== 'suggestion' && category !== 'issue') {
      return jsonResponse({ error: 'Choose a message type to continue.' }, 400)
    }
    if (!subject || subject.length > 120 || !message || message.length > 3_000 || contactEmail.length > 254) {
      return jsonResponse({ error: 'Please check the subject, message, and contact email.' }, 400)
    }
    if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
      return jsonResponse({ error: 'Enter a valid contact email or leave it blank.' }, 400)
    }

    const { error } = await admin.from('support_requests').insert({
      category,
      subject,
      message,
      contact_email: contactEmail,
      user_subject_hash: await hashValue(subjectId),
    })
    if (error) {
      console.error('Support request could not be saved', error.code ?? 'database error')
      return jsonResponse({ error: 'Your message could not be saved right now. Please try again.' }, 503)
    }
    return jsonResponse({ success: true })
  }

  if (body.action === 'workspace.create') {
    const subjectId = await verifyGoogleToken(token)
    if (!subjectId) return jsonResponse({ error: 'Sign in to create a shared workspace.' }, 401)

    const workspaceId = crypto.randomUUID()
    const tokenBytes = crypto.getRandomValues(new Uint8Array(32))
    const accessToken = base64Url(tokenBytes)
    const { error } = await admin.from('shared_workspaces').insert({
      id: workspaceId,
      access_token_hash: await hashValue(accessToken),
      creator_subject_hash: await hashValue(subjectId),
    })
    if (error) {
      console.error('Shared workspace could not be created', error.code ?? 'database error')
      return jsonResponse({ error: 'The shared workspace could not be created. Please try again.' }, 503)
    }
    return jsonResponse({ workspaceId, accessToken })
  }

  if (body.action === 'note.read' || body.action === 'note.write') {
    const workspaceId = body.workspaceId
    const nodeKey = typeof body.nodeKey === 'string' ? body.nodeKey.trim() : ''
    if (!isUuid(workspaceId) || !nodeKey || nodeKey.length > MAX_NODE_KEY_LENGTH) {
      return jsonResponse({ error: 'The shared workspace or section could not be found.' }, 400)
    }

    const accessTokenHash = await hashValue(token)
    const { data: workspaceRecord, error: workspaceError } = await admin
      .from('shared_workspaces')
      .select('id')
      .eq('id', workspaceId)
      .eq('access_token_hash', accessTokenHash)
      .maybeSingle()
    if (workspaceError || !workspaceRecord) {
      return jsonResponse({ error: 'This sharing link is no longer available.' }, 403)
    }

    if (body.action === 'note.read') {
      const { data, error } = await admin
        .from('shared_notes')
        .select('node_key,title,content_html,updated_at')
        .eq('workspace_id', workspaceId)
        .eq('node_key', nodeKey)
        .maybeSingle()
      if (error) return jsonResponse({ error: 'The shared note could not be loaded.' }, 503)
      return jsonResponse({ note: data ? normalizeSharedNote(data) : null })
    }

    const title = typeof body.title === 'string' ? body.title.trim() : ''
    const html = typeof body.html === 'string' ? body.html : ''
    if (!title || title.length > MAX_TITLE_LENGTH || new TextEncoder().encode(html).byteLength > MAX_NOTE_BYTES) {
      return jsonResponse({ error: 'The note could not be saved. Please review its title and content.' }, 400)
    }

    const { data, error } = await admin
      .from('shared_notes')
      .upsert({ workspace_id: workspaceId, node_key: nodeKey, title, content_html: html, updated_at: new Date().toISOString() }, {
        onConflict: 'workspace_id,node_key',
      })
      .select('node_key,title,content_html,updated_at')
      .single()
    if (error || !data) {
      console.error('Shared note could not be saved', error?.code ?? 'database error')
      return jsonResponse({ error: 'The shared note could not be saved. Please try again.' }, 503)
    }
    return jsonResponse({ note: normalizeSharedNote(data) })
  }

  return jsonResponse({ error: 'Choose a supported library action.' }, 400)
})
