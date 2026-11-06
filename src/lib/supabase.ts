import { useSyncExternalStore } from 'react'
import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient, User } from '@supabase/supabase-js'

/* ============ أنواع صفوف الجداول (تطابق سكربت SQL) ============ */
export interface Profile {
  id: string
  display_name: string | null
  avatar_url: string | null
  created_at: string
  updated_at: string
}

export interface UserSavedTool {
  id: string
  user_id: string
  tool_id: string
  settings: Record<string, unknown>
  created_at: string
  updated_at: string
}

export type FileKind = 'image' | 'audio' | 'doc' | 'drawing'

export interface UserFile {
  id: string
  user_id: string
  node_id: string
  name: string
  kind: FileKind
  size: number
  storage_path: string
  created_at: string
}

/* ============ إنشاء العميل (مع وضع بديل عند غياب الإعدادات) ============ */
const rawUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const rawKey =
  ((import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ?? '').trim() ||
  ((import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? '').trim()

function clearLegacyLocalSession(): void {
  if (typeof window === 'undefined' || !rawUrl) return
  try {
    const projectRef = new URL(rawUrl).hostname.split('.')[0]
    if (projectRef) {
      window.localStorage.removeItem(`sb-${projectRef}-auth-token`)
      window.localStorage.removeItem(`sb-${projectRef}-auth-token-code-verifier`)
    }
  } catch { /* Ignore malformed configuration or unavailable storage. */ }
}
clearLegacyLocalSession()
function createSafeClient(): SupabaseClient | null {
  if (!rawUrl || !rawKey) return null
  if (!/^https?:\/\//.test(rawUrl)) return null // رابط غير صالح: نتعامل معه كأنه غير مضبوط
  try {
    return createClient(rawUrl, rawKey, {
      auth: { persistSession: true, autoRefreshToken: true, storage: typeof window !== 'undefined' ? window.sessionStorage : undefined },
    })
  } catch {
    return null
  }
}

// null = وضع الزائر (لم تُضبط المفاتيح بعد)، والتطبيق يعمل بدون السحابة
export const supabase: SupabaseClient | null = createSafeClient()
export const isSupabaseConfigured: boolean = supabase !== null

/* ============ متجر الجلسة (مشترك بين كل المكوّنات) ============ */
export interface AuthState {
  user: User | null
  loading: boolean // true أثناء التحقق من الجلسة المحفوظة عند فتح الصفحة
}

let state: AuthState = { user: null, loading: supabase !== null }
const listeners = new Set<() => void>()

function setState(next: AuthState): void {
  state = next // نستبدل الكائن كاملاً حتى يبقى snapshot ثابتاً بين التغييرات
  listeners.forEach(l => l())
}

if (supabase) {
  // استرجاع الجلسة المحفوظة عند فتح الصفحة
  supabase.auth
    .getSession()
    .then(({ data }) => setState({ user: data.session?.user ?? null, loading: false }))
    .catch(() => setState({ user: null, loading: false }))

  // مزامنة تلقائية عند الدخول أو الخروج أو تجديد الجلسة (حتى من تبويب آخر)
  supabase.auth.onAuthStateChange((_event, session) => {
    setState({ user: session?.user ?? null, loading: false })
  })
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}
const getSnapshot = (): AuthState => state

// خطاف يقرأ حالة الجلسة من أي مكوّن دون مزوّد
export function useAuth(): AuthState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

/* ============ دوال المصادقة ============ */
export interface AuthResult {
  error: string | null
  needsConfirmation?: boolean // true إذا كان تأكيد البريد مفعّلاً في المشروع
}

// ترجمة رسائل الأخطاء الشائعة إلى العربية
function translateError(msg: string): string {
  const m = msg.toLowerCase()
  if (m.includes('invalid login credentials')) return 'البريد الإلكتروني أو كلمة المرور غير صحيحة'
  if (m.includes('already registered') || m.includes('already been registered')) return 'هذا البريد مسجّل مسبقاً، سجّل الدخول بدلاً من ذلك'
  if (m.includes('email not confirmed')) return 'لم يتم تأكيد البريد بعد، افتح رسالة التأكيد في بريدك'
  if (m.includes('password should be') || m.includes('weak password')) return 'كلمة المرور ضعيفة أو قصيرة (6 أحرف على الأقل)'
  if (m.includes('rate limit') || m.includes('too many')) return 'محاولات كثيرة، انتظر قليلاً ثم أعد المحاولة'
  if (m.includes('invalid email') || m.includes('unable to validate email')) return 'صيغة البريد الإلكتروني غير صحيحة'
  if (m.includes('failed to fetch') || m.includes('network')) return 'تعذّر الاتصال بالخادم، تحقق من الإنترنت'
  return `حدث خطأ: ${msg}`
}

const errorText = (e: unknown): string => translateError(e instanceof Error ? e.message : String(e))
const NOT_CONFIGURED = 'لم يتم ضبط Supabase بعد. أضف المفاتيح في ملف .env'

export async function signUpWithEmail(email: string, password: string): Promise<AuthResult> {
  if (!supabase) return { error: NOT_CONFIGURED }
  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: window.location.origin },
    })
    if (error) return { error: translateError(error.message) }
    // Supabase يعيد مستخدماً بلا هويات (identities) عندما يكون البريد مسجّلاً مسبقاً
    if (data.user && data.user.identities && data.user.identities.length === 0) {
      return { error: translateError('User already registered') }
    }
    return { error: null, needsConfirmation: data.session === null }
  } catch (e) {
    return { error: errorText(e) }
  }
}

export async function signInWithEmail(email: string, password: string): Promise<AuthResult> {
  if (!supabase) return { error: NOT_CONFIGURED }
  try {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error ? translateError(error.message) : null }
  } catch (e) {
    return { error: errorText(e) }
  }
}

export async function signOutUser(): Promise<AuthResult> {
  if (!supabase) return { error: null }
  try {
    const { error } = await supabase.auth.signOut({ scope: 'local' })
    return { error: error ? translateError(error.message) : null }
  } catch (e) {
    return { error: errorText(e) }
  }
}
