import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { LogOut, X } from 'lucide-react'
import { getGoogleIdToken, isGoogleConfigured, renderGoogleButton, signOutGoogle, useGoogleAuth } from '../lib/googleAuth'
import { tr, useLocale } from '../lib/i18n'
import { sfx } from '../shared'

interface Props {
  open: boolean
  onClose: () => void
}

function localizeAuthError(error: string, locale: 'en' | 'ar'): string {
  void error
  return locale === 'en' ? 'Sign-in could not finish. Please try again.' : 'لم يكتمل تسجيل الدخول. حاول مرة أخرى.'
}

export default function AuthModal({ open, onClose }: Props) {
  const locale = useLocale()
  const { user } = useGoogleAuth()
  const activeUser = user && getGoogleIdToken() ? user : null
  const buttonRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  const [error, setError] = useState('')
  const [ready, setReady] = useState(false)
  const [brokenPicture, setBrokenPicture] = useState<string | null>(null)
  const text = (english: string, arabic: string): string => tr(locale, english, arabic)

  useEffect(() => { closeRef.current = onClose }, [onClose])

  useEffect(() => {
    if (!open || activeUser || !isGoogleConfigured || !buttonRef.current) return undefined
    let cancelled = false
    setError('')
    setReady(false)
    renderGoogleButton(buttonRef.current, 300, result => {
      if (cancelled) return
      if (result.error) {
        setError(localizeAuthError(result.error, locale))
        return
      }
      sfx.success()
      closeRef.current()
    }, locale)
      .then(() => { if (!cancelled) setReady(true) })
      .catch((reason: unknown) => {
        if (!cancelled) setError(localizeAuthError(reason instanceof Error ? reason.message : 'Unexpected sign-in error.', locale))
      })
    return () => { cancelled = true }
  }, [activeUser, locale, open])

  useEffect(() => {
    if (!open) return undefined
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') { sfx.close(); closeRef.current() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const close = (): void => { sfx.close(); onClose() }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="auth-modal"
          className="fixed inset-0 z-[2000] flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={event => { if (event.target === event.currentTarget) close() }}
        >
          <div className="ui-modal-backdrop absolute inset-0" aria-hidden="true" />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={text('Account', 'الحساب')}
            className="glass-strong ui-modal relative w-full max-w-sm overflow-hidden rounded-2xl border border-white/10 shadow-2xl"
            initial={{ opacity: 0, y: 14, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.18 }}
            onMouseDown={event => event.stopPropagation()}
          >
            <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-24 opacity-25" style={{ background: 'radial-gradient(ellipse at top, var(--accent), transparent 70%)' }} />
            <div className="relative space-y-4 p-5">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold" style={{ color: 'var(--accent)' }}>{activeUser ? text('Your account', 'حسابك') : user ? text('Reconnect your account', 'أعد ربط حسابك') : text('Sign in', 'تسجيل الدخول')}</h2>
                <button type="button" aria-label={text('Close', 'إغلاق')} onClick={close} className="flex h-8 w-8 items-center justify-center rounded-lg transition hover:bg-white/10"><X size={18} /></button>
              </div>

              {activeUser ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3">
                    {activeUser.picture && activeUser.picture !== brokenPicture ? (
                      <img src={activeUser.picture} alt="" referrerPolicy="no-referrer" onError={() => setBrokenPicture(activeUser.picture)} className="h-12 w-12 shrink-0 rounded-full object-cover" style={{ boxShadow: '0 0 0 2px var(--accent)' }} />
                    ) : (
                      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-lg font-bold text-black" style={{ background: 'var(--accent)' }}>{(activeUser.name[0] ?? '?').toUpperCase()}</span>
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{activeUser.name}</p>
                      <p className="truncate text-xs opacity-70" dir="ltr">{activeUser.email}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => { signOutGoogle(); sfx.close(); onClose() }}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-white/10 px-3 py-2.5 text-sm transition hover:bg-white/20 active:scale-[0.99]"
                  >
                    <LogOut size={14} />{text('Sign out', 'تسجيل الخروج')}
                  </button>
                </div>
              ) : !isGoogleConfigured ? (
                <div className="space-y-2 text-sm">
                  <p className="text-white/80">{text('Google sign-in is not configured yet. You can continue using the library as a guest.', 'تسجيل الدخول بحساب Google غير مفعّل بعد. يمكنك متابعة استخدام المكتبة كزائر.')}</p>
                  <ol className="list-decimal space-y-1.5 ps-5 text-xs leading-5 opacity-75">
                    <li>{text('Create a Web application OAuth client in Google Cloud Console.', 'أنشئ OAuth Client من نوع Web في Google Cloud Console.')}</li>
                    <li>{text('Add http://localhost:5173 to Authorized JavaScript origins.', 'أضف http://localhost:5173 إلى Authorized JavaScript origins.')}</li>
                    <li>{text('Set VITE_GOOGLE_CLIENT_ID in the project-root .env file.', 'ضع VITE_GOOGLE_CLIENT_ID في ملف .env بجذر المشروع.')}</li>
                    <li>{text('Restart Vite after saving the environment file.', 'أعد تشغيل Vite بعد حفظ ملف البيئة.')}</li>
                  </ol>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-sm opacity-75">{user
                    ? text('Reconnect with Google to continue using your account across cloud features.', 'أعد الاتصال بحساب Google لمتابعة استخدام الميزات السحابية.')
                    : text('Sign in to create a shared workspace or send a support message.', 'سجّل الدخول لإنشاء مساحة مشتركة أو إرسال رسالة دعم.')}</p>
                  <div className="relative flex min-h-11 items-center justify-center">
                    <div ref={buttonRef} />
                    {!ready && !error && <span className="absolute text-xs opacity-55">{text('Loading Google sign-in…', 'جارٍ تحميل تسجيل الدخول بحساب Google…')}</span>}
                  </div>
                  {error && <p role="alert" className="rounded-xl border border-white/10 bg-white/[0.04] p-3 text-sm opacity-80">{error}</p>}
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
