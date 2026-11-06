import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { AlertTriangle, Bug, Check, CheckCircle2, Lightbulb, Moon, Send, UserRound } from 'lucide-react'
import { content as legalContent, LAST_UPDATED } from '../../lib/legalContent'
import { isAnalyticsEnabled, setAnalyticsConsent } from '../../lib/analytics'
import { getGoogleAuthErrorMessage, useGoogleAuth, renderGoogleButton, signOutGoogle } from '../../lib/googleAuth'
import { submitSupportRequest } from '../../lib/libraryApi'
import { dbClearCurrentUserData } from '../../db'
import { clearCurrentLocalStorageData, getLocalDataOwner } from '../../lib/localData'
import { clearCurrentTrash } from '../../lib/trash'
import { SUPPORT_EMAIL } from '../../lib/contact'
import { useLocale, setLocale } from '../../lib/i18n'
import { useDesktopMessages } from './i18n'
import { updateDesktopPreferences, useDesktopPreferences } from './preferences'
import type { DesktopPage } from './types'
import TrashPage from './TrashPage'
import { DESKTOP_THEME_COLORS as THEME_COLORS } from './themeCatalog'
import ReviewPage from './ReviewPage'
import CalendarPage from './CalendarPage'

const DesktopToolsPage = lazy(() => import('./DesktopToolsPage'))
const DesktopTaskTreePage = lazy(() => import('./DesktopTaskTreePage'))

export function DesktopPageContent({ page, onSwitchToSpace, onOpenPrivacy }: { page: DesktopPage; onSwitchToSpace: () => void; onOpenPrivacy: () => void }) {
  const m = useDesktopMessages()
  const locale = useLocale()
  const prefs = useDesktopPreferences()
  const [status, setStatus] = useState('')
  const { user, loading } = useGoogleAuth()
  const authRef = useRef<HTMLDivElement>(null)
  const t = m.workspacePages
  const [workspaceMode, setWorkspaceMode] = useState<'office' | 'space'>('office')

  useEffect(() => {
    if (page === 'account' && !user && !loading && authRef.current) {
      void renderGoogleButton(authRef.current, 240, result => setStatus(result.error ? getGoogleAuthErrorMessage(result.error, locale) : t.signedIn), locale)
        .catch(reason => setStatus(getGoogleAuthErrorMessage(reason instanceof Error ? reason.message : t.authUnavailable, locale)))
    }
  }, [page, user, loading, locale, t.authUnavailable, t.signedIn])

  if (page === 'themes') return <section className="desk-theme-grid" aria-label={m.pages.themes.title}>{Object.keys(THEME_COLORS).map(id => {
    const [bg, surface, accent] = THEME_COLORS[id as keyof typeof THEME_COLORS]
    return <button type="button" key={id} className="desk-theme-option" aria-pressed={prefs.theme === id} onClick={() => updateDesktopPreferences({ theme: id as typeof prefs.theme })}>
      <span className="desk-theme-preview" style={{ background: bg }}><i style={{ background: surface }} /><b style={{ background: accent }} /></span>
      <span>{t.themes[id as keyof typeof t.themes]}</span>{prefs.theme === id && <Check size={16} aria-hidden="true" />}
    </button>
  })}</section>

  if (page === 'settings') return <section className="desk-settings-list" aria-label={m.pages.settings.title}>
    <label>{t.language}<select value={locale} onChange={e => setLocale(e.target.value as 'en' | 'ar')}><option value="en">{m.language.names.en}</option><option value="ar">{m.language.names.ar}</option></select></label>
    <label>{t.workspaceMode}<select value={workspaceMode} onChange={e => { const next = e.target.value as 'office' | 'space'; setWorkspaceMode(next); if (next === 'space') onSwitchToSpace() }}><option value="office">{m.mode.office}</option><option value="space">{m.mode.space}</option></select></label>
    <label>{t.sidebarPosition}<select value={prefs.sidebarPosition} onChange={e => updateDesktopPreferences({ sidebarPosition: e.target.value as typeof prefs.sidebarPosition })}>{(['auto', 'right', 'left'] as const).map(x => <option key={x} value={x}>{t.positions[x]}</option>)}</select></label>
    <label>{t.font}<select value={prefs.font} onChange={e => updateDesktopPreferences({ font: e.target.value as typeof prefs.font })}><option value="instrument">{t.fontNames.instrument}</option><option value="noto">{t.fontNames.noto}</option><option value="system">{t.fontNames.system}</option></select></label>
    <label>{t.fontSize} <output>{prefs.fontSize}px</output><input type="range" min="12" max="20" value={prefs.fontSize} onChange={e => updateDesktopPreferences({ fontSize: Number(e.target.value) })} /></label>
    <label>{t.lineHeight} <output>{prefs.lineHeight.toFixed(1)}</output><input type="range" min="1.2" max="2" step="0.1" value={prefs.lineHeight} onChange={e => updateDesktopPreferences({ lineHeight: Number(e.target.value) })} /></label>
    <label>{t.contentWidth}<select value={prefs.contentWidth} onChange={e => updateDesktopPreferences({ contentWidth: e.target.value as typeof prefs.contentWidth })}>{(['narrow', 'comfortable', 'wide'] as const).map(x => <option key={x} value={x}>{t.widths[x]}</option>)}</select></label>
    <label>{t.density}<select value={prefs.density} onChange={e => updateDesktopPreferences({ density: e.target.value as typeof prefs.density })}>{(['comfortable', 'compact', 'spacious'] as const).map(x => <option key={x} value={x}>{t.densities[x]}</option>)}</select></label>
    <label className="desk-setting-check"><input type="checkbox" checked={prefs.reduceMotion} onChange={e => updateDesktopPreferences({ reduceMotion: e.target.checked })} />{t.reduceMotion}<Moon size={16} aria-hidden="true" /></label>
    <div className="desk-live-preview"><strong>{t.preview}</strong><div className="desk-preview-sample" style={{ fontFamily: prefs.font === 'noto' ? "'Noto Kufi Arabic', 'Instrument Sans', system-ui, sans-serif" : prefs.font === 'system' ? "system-ui, 'Noto Kufi Arabic', sans-serif" : "'Instrument Sans', 'Noto Kufi Arabic', system-ui, sans-serif", fontSize: prefs.fontSize, lineHeight: prefs.lineHeight, maxWidth: prefs.contentWidth === 'narrow' ? '42ch' : prefs.contentWidth === 'wide' ? '72ch' : '58ch' }}><h3>{t.preview}</h3><p>{t.previewText}</p></div><small>{t.widths[prefs.contentWidth]} · {prefs.fontSize}px · {prefs.lineHeight.toFixed(1)}</small></div>
  </section>

  if (page === 'account') return <section className="desk-account-layout">
    <div className="desk-account-profile">{user?.picture ? <img src={user.picture} alt="" /> : <UserRound size={30} aria-hidden="true" />}<div><strong>{user?.name ?? t.signedOut}</strong><span>{user?.email ?? t.signInPrompt}</span></div>{user ? <button type="button" className="desk-button" onClick={signOutGoogle}>{t.signOut}</button> : <div className="desk-google-signin" ref={authRef} aria-label={t.signInGoogle} />}</div>
    <div className="desk-account-actions">
      <button type="button" className="desk-button" disabled aria-disabled="true">{t.comingSoon}</button>
    </div>
    <DeleteLocalData t={t} />
    {status && <p className="desk-inline-status" role="status">{status}</p>}
  </section>

  if (page === 'tasks') return <Suspense fallback={<RouteSkeleton label={m.pages.tasks.title} />}><DesktopTaskTreePage /></Suspense>
  if (page === 'review') return <ReviewPage />
  if (page === 'calendar') return <CalendarPage />
  if (page === 'trash') return <TrashPage />
  if (page === 'tools') return <Suspense fallback={<RouteSkeleton label={m.pages.tools.title} />}><DesktopToolsPage /></Suspense>
  if (page === 'support') return <SupportPage onOpenPrivacy={onOpenPrivacy} />
  if (page === 'privacy') return <PrivacyPage />
  return <section className="desk-tools-page"><p>{t.toolsDescription}</p><button type="button" className="desk-button desk-button-primary" onClick={onSwitchToSpace}>{t.openTools}</button></section>
}

function RouteSkeleton({ label }: { label: string }) {
  return <section className="desk-route-skeleton" aria-busy="true" aria-label={label}><span className="desk-route-skeleton-line is-title" /><span className="desk-route-skeleton-line is-copy" /><span className="desk-route-skeleton-panel" /></section>
}

function DeleteLocalData({ t }: { t: ReturnType<typeof useDesktopMessages>['workspacePages'] }) {
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState('')
  const [failure, setFailure] = useState('')
  const phrase = t.deletePhrase
  const erase = async (): Promise<void> => {
    if (typed !== phrase) return
    const owner = getLocalDataOwner()
    try {
      await Promise.all([dbClearCurrentUserData(owner), clearCurrentTrash(owner)])
      clearCurrentLocalStorageData(owner)
      await signOutGoogle()
      window.location.reload()
    } catch {
      setFailure(t.deleteFailed)
    }
  }
  return <section className="desk-danger-zone"><h2><AlertTriangle size={18} />{t.dangerZone}</h2><p>{t.deleteWarning}</p>
    {!open ? <button type="button" className="desk-button desk-danger-button" onClick={() => { setFailure(''); setOpen(true) }}>{t.deleteLocal}</button> : <div className="desk-confirm-delete"><label>{t.typeToConfirm}<input value={typed} onChange={e => setTyped(e.target.value)} autoComplete="off" /></label><button type="button" className="desk-button desk-danger-button" disabled={typed !== phrase} onClick={() => void erase()}>{t.confirmDelete}</button><button type="button" className="desk-button" onClick={() => { setOpen(false); setTyped(''); setFailure('') }}>{t.cancel}</button></div>}
    {failure && <p role="alert" className="desk-inline-status">{failure}</p>}
  </section>
}

type SupportStatus = { kind: 'success' | 'error'; text: string }

function SupportPage({ onOpenPrivacy }: { onOpenPrivacy: () => void }) {
  const m = useDesktopMessages()
  const locale = useLocale()
  const { user } = useGoogleAuth()
  const t = m.workspacePages
  const [category, setCategory] = useState<'suggestion' | 'issue'>('suggestion')
  const [title, setTitle] = useState('')
  const [details, setDetails] = useState('')
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<SupportStatus | null>(null)
  const text = (english: string, arabic: string): string => locale === 'ar' ? arabic : english
  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (busy) return
    if (!user) { setStatus({ kind: 'error', text: t.signInToSend }); return }
    setBusy(true); setStatus(null)
    try { await submitSupportRequest({ category, subject: title, message: details, contactEmail: email || user?.email || '' }); setStatus({ kind: 'success', text: t.messageSent }); setTitle(''); setDetails('') }
    catch { setStatus({ kind: 'error', text: t.messageFailed }) } finally { setBusy(false) }
  }
  return <section className="desk-support-page">
    <section className="desk-support-card"><header><h2>{text('Send a message', 'أرسل رسالة')}</h2><p>{text('Share an idea or tell us what could work better for you.', 'شاركنا فكرة أو أخبرنا بما يمكن تحسينه من أجلك.')}</p></header>
      <p className="desk-support-direct">{t.contactSupportPrefix}<span dir="ltr">{SUPPORT_EMAIL}</span></p>
      <div className="desk-choice-row" role="tablist" aria-label={text('Message type', 'نوع الرسالة')}><button type="button" role="tab" aria-selected={category === 'suggestion'} className="desk-button" onClick={() => { setCategory('suggestion'); setStatus(null) }}><Lightbulb size={16} />{t.suggestion}</button><button type="button" role="tab" aria-selected={category === 'issue'} className="desk-button" onClick={() => { setCategory('issue'); setStatus(null) }}><Bug size={16} />{text('Bug report / complaint', 'بلاغ عن خلل / شكوى')}</button></div>
      <form onSubmit={event => void submit(event)}><label>{t.title}<input required value={title} onChange={event => setTitle(event.target.value)} maxLength={120} placeholder={text('A short summary', 'ملخص قصير')} /></label><label>{t.details}<textarea required value={details} onChange={event => setDetails(event.target.value)} maxLength={3000} rows={4} dir="auto" placeholder={text('Tell us a little more…', 'أخبرنا بمزيد من التفاصيل…')} /></label><label>{t.optionalEmail}<input type="email" value={email} onChange={event => setEmail(event.target.value)} maxLength={254} autoComplete="email" placeholder={user?.email ?? 'name@example.com'} dir="ltr" /></label><button type="submit" className="desk-button desk-button-primary" disabled={busy || !title.trim() || !details.trim()}><Send size={16} />{busy ? t.sending : t.send}</button></form>
      {status && <p role={status.kind === 'error' ? 'alert' : 'status'} className={`desk-support-status desk-support-status-${status.kind}`}>{status.kind === 'success' && <CheckCircle2 size={16} />}{status.text}</p>}
    </section>
    <section className="desk-support-faq"><h2>{text('Frequently asked questions', 'الأسئلة الشائعة')}</h2><details><summary>{text('How does live library sharing work?', 'كيف تعمل مشاركة المكتبة المباشرة؟')}</summary><p>{text('Create a live workspace from a section note and share its invitation link. People with that link can view and edit notes for matching section paths; updates appear in connected views.', 'أنشئ مساحة مباشرة من ملاحظات أحد الأقسام وشارك رابط الدعوة. يستطيع من يملك الرابط مشاهدة ملاحظات المسارات المطابقة وتعديلها، وتظهر التغييرات فوراً في الجلسات المتصلة.')}</p></details><details><summary>{text('How is my data protected?', 'كيف تتم حماية بياناتي؟')}</summary><p>{text('Private notes stay in this browser. Cloud support messages and shared notes are sent only when you choose those actions. A live-workspace invitation is a bearer link: anyone who has it can access that shared workspace.', 'تبقى الملاحظات الخاصة في هذا المتصفح. لا تُرسل رسائل الدعم أو الملاحظات المشتركة إلى السحابة إلا عند اختيارك ذلك. رابط مساحة المشاركة هو رابط وصول؛ يستطيع كل من يملكه الوصول إلى تلك المساحة.')}</p></details><details><summary>{text('What can the AI assistant do?', 'ما مهام المساعد الذكي؟')}</summary><p>{text('It can summarize the current section, generate questions, and answer questions using the note text you choose to send. It does not browse your private library or send notes automatically.', 'يمكنه تلخيص القسم الحالي وإنشاء أسئلة والإجابة عن أسئلة بالاستناد إلى نص الملاحظات الذي تختار إرساله. لا يتصفح مكتبتك الخاصة ولا يرسل الملاحظات تلقائياً.')}</p></details><details><summary>{text('Which domains can I organize here?', 'ما المجالات التي يمكن تنظيمها هنا؟')}</summary><p>{text('Create a structure for personal projects, creative work, reading, routines, or anything that matters to you.', 'أنشئ بنية للمشاريع الشخصية أو الأعمال الإبداعية أو القراءة أو الروتين أو أي شيء يهمك.')}</p></details></section>
    <section className="desk-support-legal"><h2>{text('Legal information', 'المعلومات القانونية')}</h2><div><button type="button" className="desk-button" onClick={onOpenPrivacy}>{t.privacyTab}</button><button type="button" className="desk-button" onClick={onOpenPrivacy}>{t.termsTab}</button></div></section>
  </section>
}

function PrivacyPage() {
  const m = useDesktopMessages()
  const t = m.workspacePages
  const locale = useLocale()
  const [doc, setDoc] = useState<'privacy' | 'terms'>('privacy')
  const [analytics, setAnalytics] = useState(isAnalyticsEnabled)
  const document = legalContent[doc]
  return <section className="desk-legal-page"><div className="desk-choice-row" role="tablist" aria-label={t.legalTabs}><button type="button" role="tab" aria-selected={doc === 'privacy'} className="desk-button" onClick={() => setDoc('privacy')}>{t.privacyTab}</button><button type="button" role="tab" aria-selected={doc === 'terms'} className="desk-button" onClick={() => setDoc('terms')}>{t.termsTab}</button></div><p className="desk-legal-summary">{document.summary[locale]}</p><p className="desk-legal-date">{t.lastUpdated}: {LAST_UPDATED[locale]}</p><nav aria-label={t.contents}><strong>{t.contents}</strong><ol>{document.sections.map((section, i) => <li key={i}><a href={`#legal-${doc}-${i}`}>{section.heading[locale]}</a></li>)}</ol></nav><div>{document.sections.map((section, i) => <article id={`legal-${doc}-${i}`} key={i}><h2>{section.heading[locale]}</h2>{section.paragraphs.map((paragraph, p) => <p key={p}>{paragraph[locale]}</p>)}</article>)}</div><aside className="desk-privacy-controls"><label><input type="checkbox" checked={analytics} onChange={e => { const enabled = e.target.checked; setAnalyticsConsent(enabled); setAnalytics(enabled) }} />{t.analyticsToggle}</label><h2>{t.aiSharingTitle}</h2><p>{t.aiSharingBody}</p></aside></section>
}
