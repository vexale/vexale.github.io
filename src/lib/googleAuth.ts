import { useMemo } from 'react'
import { useAuth, signOutUser, supabase } from './supabase'
import type { AuthResult as SupabaseAuthResult } from './supabase'

const rawGoogleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined
export const GOOGLE_CLIENT_ID = rawGoogleClientId?.trim() ?? ''
export const isGoogleConfigured = /^\d+-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(GOOGLE_CLIENT_ID)

export interface GoogleUser {
  sub: string
  name: string
  email: string
  picture: string
  signedInAt: number
}

export interface AuthResult {
  error: string | null
}

export interface GoogleAuthState {
  user: GoogleUser | null
  loading: boolean
}

function mapUser(user: NonNullable<ReturnType<typeof useAuth>['user']>): GoogleUser {
  const metadata = user.user_metadata
  const name = typeof metadata.full_name === 'string'
    ? metadata.full_name
    : typeof metadata.name === 'string'
      ? metadata.name
      : user.email?.split('@')[0] ?? 'User'
  const picture = typeof metadata.avatar_url === 'string'
    ? metadata.avatar_url
    : typeof metadata.picture === 'string'
      ? metadata.picture
      : ''
  const signedInAt = user.last_sign_in_at ? Date.parse(user.last_sign_in_at) : Date.parse(user.created_at)
  return {
    sub: user.id,
    name,
    email: user.email ?? '',
    picture,
    signedInAt: Number.isFinite(signedInAt) ? signedInAt : 0,
  }
}

export function useGoogleAuth(): GoogleAuthState {
  const auth = useAuth()
  const user = useMemo(() => auth.user ? mapUser(auth.user) : null, [auth.user])
  return { user, loading: auth.loading }
}

export function getGoogleAuthErrorMessage(error: string, locale: 'en' | 'ar'): string {
  const normalized = error.toLowerCase()
  if (normalized.includes('origin') || normalized.includes('origin_mismatch') || normalized.includes('unauthorized domain')) {
    return locale === 'ar'
      ? 'عنوان هذا الموقع غير مسموح به في إعدادات Google OAuth. أضف النطاق الحالي إلى Authorized JavaScript origins.'
      : 'This website origin is not allowed in Google OAuth. Add the current origin to Authorized JavaScript origins.'
  }
  if (normalized.includes('offline') || normalized.includes('failed to fetch') || normalized.includes('network') || normalized.includes('could not load google sign-in')) {
    return locale === 'ar' ? 'لا يوجد اتصال بالإنترنت. أعد الاتصال ثم حاول تسجيل الدخول مجدداً.' : 'You are offline. Reconnect to the internet and try signing in again.'
  }
  if (normalized.includes('paused') || normalized.includes('project is paused') || normalized.includes('project not found') || normalized.includes('service unavailable')) {
    return locale === 'ar' ? 'خادم Supabase غير متاح أو متوقف مؤقتاً. أعد تشغيل المشروع في Supabase ثم حاول مجدداً.' : 'The Supabase project is unavailable or paused. Resume the project in Supabase, then try again.'
  }
  if (normalized.includes('popup_closed') || normalized.includes('popup closed') || normalized.includes('cancel')) {
    return locale === 'ar' ? 'أُلغيت عملية تسجيل الدخول. يمكنك المحاولة مرة أخرى.' : 'Sign-in was cancelled. You can try again.'
  }
  if (normalized.includes('not configured') || normalized.includes('configuration')) {
    return locale === 'ar' ? 'لم يتم إعداد تسجيل الدخول بعد. تحقّق من إعدادات Supabase وGoogle OAuth.' : 'Sign-in is not configured yet. Check the Supabase and Google OAuth settings.'
  }
  return locale === 'ar' ? 'تعذّر إكمال تسجيل الدخول. حاول مرة أخرى.' : 'Sign-in could not finish. Please try again.'
}

interface GsiCredentialResponse { credential?: string }
interface GsiButtonOptions {
  type: 'standard'
  theme: 'outline' | 'filled_blue' | 'filled_black'
  size: 'large' | 'medium' | 'small'
  shape: 'pill' | 'rectangular'
  text: 'signin_with' | 'signup_with' | 'continue_with'
  logo_alignment: 'left' | 'center'
  width: number
  locale: string
}
interface GsiId {
  initialize: (config: { client_id: string; callback: (response: GsiCredentialResponse) => void; ux_mode: 'popup' }) => void
  renderButton: (element: HTMLElement, options: GsiButtonOptions) => void
  disableAutoSelect: () => void
}

type ResultHandler = (result: AuthResult) => void

const GSI_SRC = 'https://accounts.google.com/gsi/client'
let gsiPromise: Promise<GsiId> | null = null
let initializedGsi: GsiId | null = null
let activeResultHandler: ResultHandler | null = null
let activeGoogleIdToken: string | null = null

const getGsi = (): GsiId | undefined =>
  (window as unknown as { google?: { accounts?: { id?: GsiId } } }).google?.accounts?.id

function loadGsi(): Promise<GsiId> {
  const ready = getGsi()
  if (ready) return Promise.resolve(ready)
  if (typeof navigator !== 'undefined' && !navigator.onLine) return Promise.reject(new Error('offline'))
  gsiPromise ??= new Promise<GsiId>((resolve, reject) => {
    const done = (): void => {
      const gsi = getGsi()
      if (gsi) resolve(gsi)
      else { gsiPromise = null; reject(new Error('Unable to initialize Google sign-in.')) }
    }
    const fail = (): void => {
      gsiPromise = null
      reject(new Error('Could not load Google sign-in. Check your connection.'))
    }
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GSI_SRC}"]`)
    const script = existing ?? document.createElement('script')
    script.addEventListener('load', done, { once: true })
    script.addEventListener('error', fail, { once: true })
    if (!existing) {
      script.src = GSI_SRC
      script.async = true
      document.head.appendChild(script)
    }
  })
  return gsiPromise
}

export async function signInWithGoogleCredential(credential: string): Promise<AuthResult> {
  if (!isGoogleConfigured) return { error: 'Google sign-in is not configured.' }
  if (!supabase) return { error: 'Supabase is not configured.' }
  if (typeof navigator !== 'undefined' && !navigator.onLine) return { error: 'offline' }
  try {
    const { error } = await supabase.auth.signInWithIdToken({ provider: 'google', token: credential })
    if (error) return { error: error.message }
    activeGoogleIdToken = credential
    return { error: null }
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Sign-in could not finish.' }
  }
}

export function getGoogleIdToken(): string | null {
  return activeGoogleIdToken
}

export async function renderGoogleButton(
  element: HTMLElement,
  width: number,
  onResult: ResultHandler,
  locale: 'en' | 'ar' = 'en',
): Promise<void> {
  if (!isGoogleConfigured) throw new Error('Google sign-in is not configured.')
  activeResultHandler = onResult
  const gsi = await loadGsi()
  if (initializedGsi !== gsi) {
    gsi.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: response => {
        const handler = activeResultHandler
        if (!handler) return
        if (!response.credential) {
          handler({ error: 'No response from Google.' })
          return
        }
        void signInWithGoogleCredential(response.credential).then(handler)
      },
      ux_mode: 'popup',
    })
    initializedGsi = gsi
  }
  element.replaceChildren()
  gsi.renderButton(element, {
    type: 'standard',
    theme: 'filled_black',
    size: 'large',
    shape: 'pill',
    text: 'continue_with',
    logo_alignment: 'left',
    width,
    locale,
  })
}

export async function signOutGoogle(): Promise<SupabaseAuthResult> {
  activeGoogleIdToken = null
  const result = await signOutUser()
  try { getGsi()?.disableAutoSelect() } catch { /* تجاهل غياب Google Identity Services */ }
  return result
}
