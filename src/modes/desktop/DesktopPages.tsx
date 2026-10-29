import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import { AlertTriangle, Bug, Check, Download, FileText, Lightbulb, Moon, Send, Upload, UserRound } from 'lucide-react'
import { dbGetAll, dbGetNote, dbPutNote } from '../../db'
import { content as legalContent, LAST_UPDATED } from '../../lib/legalContent'
import { createSharedWorkspace } from '../../lib/libraryApi'
import { activateWorkspace, createWorkspaceInvite, leaveSharedWorkspace, useSharedWorkspace } from '../../lib/sharedWorkspace'
import { useGoogleAuth, getGoogleIdToken, renderGoogleButton, signOutGoogle } from '../../lib/googleAuth'
import { submitSupportRequest } from '../../lib/libraryApi'
import { SUPPORT_EMAIL, SUPPORT_EMAIL_HREF } from '../../lib/contact'
import { useLocale, setLocale } from '../../lib/i18n'
import { useLibrary, useTree } from '../../shared'
import { useDesktopMessages } from './i18n'
import { updateDesktopPreferences, useDesktopPreferences } from './preferences'
import type { DesktopPage } from './types'

const THEME_COLORS: Record<string, [string, string, string]> = {
  'calm-violet': ['#15171c', '#1a1c23', '#5b4fe0'], charcoal: ['#151515', '#1c1c1c', '#786c5c'],
  'midnight-blue': ['#121821', '#18212c', '#506f8c'], forest: ['#131915', '#1a211c', '#477650'],
  'sand-dark': ['#1a1814', '#211e19', '#88662f'], 'rose-dusk': ['#1b171a', '#241f23', '#91566f'],
  'soft-light': ['#f2f1f7', '#e9e8f0', '#5142c6'],
}

function download(name: string, data: Blob): void {
  const url = URL.createObjectURL(data)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  URL.revokeObjectURL(url)
}

function toBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '')
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

function flatten(nodes: ReturnType<typeof useTree>['tree']): Array<{ id: string; title: string }> {
  return nodes.flatMap(node => [{ id: node.id, title: node.title }, ...flatten(node.children)])
}

function nodeDepth(nodes: ReturnType<typeof useTree>['tree'], targetId: string, depth = 0): number | undefined {
  for (const node of nodes) {
    if (node.id === targetId) return depth
    const childDepth = nodeDepth(node.children, targetId, depth + 1)
    if (childDepth !== undefined) return childDepth
  }
  return undefined
}

export function DesktopPageContent({ page, onSwitchToSpace }: { page: DesktopPage; onSwitchToSpace: () => void }) {
  const m = useDesktopMessages()
  const locale = useLocale()
  const prefs = useDesktopPreferences()
  const [busy, setBusy] = useState(false)
  const [shareBusy, setShareBusy] = useState(false)
  const [shareLink, setShareLink] = useState('')
  const [status, setStatus] = useState('')
  const { user } = useGoogleAuth()
  const sharedWorkspace = useSharedWorkspace()
  const { tree, addNode } = useTree()
  const { items, add } = useLibrary()
  const fileRef = useRef<HTMLInputElement>(null)
  const authRef = useRef<HTMLDivElement>(null)
  const t = m.workspacePages
  const [workspaceMode, setWorkspaceMode] = useState<'office' | 'space'>('office')

  useEffect(() => {
    if (page === 'account' && !user && authRef.current) {
      void renderGoogleButton(authRef.current, 240, result => setStatus(result.error ?? t.signedIn), locale)
        .catch(() => setStatus(t.authUnavailable))
    }
  }, [page, user, locale, t.authUnavailable, t.signedIn])

  const createOrCopyShareLink = async (): Promise<void> => {
    if (!getGoogleIdToken()) { setStatus(t.shareSignIn); return }
    setShareBusy(true); setStatus('')
    try {
      let activeWorkspace = sharedWorkspace
      if (!activeWorkspace) { activeWorkspace = await createSharedWorkspace(); activateWorkspace(activeWorkspace) }
      const link = createWorkspaceInvite(activeWorkspace)
      setShareLink(link)
      try { await navigator.clipboard.writeText(link); setStatus(t.shareCopied) } catch { setStatus(t.shareReady) }
    } catch { setStatus(t.shareFailed) } finally { setShareBusy(false) }
  }

  const exportLibrary = async (format: 'json' | 'markdown' | 'backup'): Promise<void> => {
    setBusy(true); setStatus('')
    try {
      const records = await dbGetAll()
      const nodes = flatten(tree)
      const notes = await Promise.all(nodes.map(async node => [node.id, await dbGetNote(node.id)] as const))
      if (format === 'markdown') {
        const body = nodes.map(node => {
          const note = notes.find(([id]) => id === node.id)?.[1]
          const depth = nodeDepth(tree, node.id) ?? 0
          const text = note?.html ? new DOMParser().parseFromString(note.html, 'text/html').body.textContent ?? '' : ''
          return `${'#'.repeat(Math.min(depth + 1, 6))} ${node.title}${text ? `\n\n${text}` : ''}`
        }).join('\n\n')
        download('vexale-library.md', new Blob([body], { type: 'text/markdown;charset=utf-8' }))
      } else {
        const blobs = await Promise.all(records.map(async record => ({ ...record, file: undefined, mimeType: record.file.type, data: await toBase64(record.file) })))
        const payload = { format: 'vexale-library', version: 1, exportedAt: new Date().toISOString(), tree, notes: Object.fromEntries(notes), files: blobs }
        download(format === 'backup' ? 'vexale-backup.json' : 'vexale-library.json', new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }))
      }
      setStatus(t.exportDone)
    } catch { setStatus(t.exportFailed) } finally { setBusy(false) }
  }

  const importLibrary = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setBusy(true); setStatus('')
    try {
      const parsed: unknown = JSON.parse(await file.text())
      if (!parsed || typeof parsed !== 'object' || (parsed as { format?: string }).format !== 'vexale-library') throw new Error('invalid')
      const pack = parsed as { tree?: Array<{ id?: string; title?: string; children?: Array<{ id?: string; title?: string; children?: unknown[] }> }>; notes?: Record<string, { html?: string; updatedAt?: number } | null>; files?: Array<{ nodeId: string; name: string; kind: 'image' | 'audio' | 'doc' | 'drawing'; data: string; mimeType?: string }> }
      const idMap = new Map<string, string>()
      const copyNodes = (nodes: typeof pack.tree, parentId: string | null): void => {
        for (const node of nodes ?? []) {
          if (typeof node.title !== 'string' || !node.title.trim()) continue
          const id = addNode(parentId, node.title.trim())
          if (typeof node.id === 'string') idMap.set(node.id, id)
          copyNodes(node.children as typeof pack.tree, id)
        }
      }
      copyNodes(pack.tree, null)
      for (const [sourceId, note] of Object.entries(pack.notes ?? {})) if (note?.html) await dbPutNote({ nodeId: idMap.get(sourceId) ?? sourceId, html: note.html, updatedAt: note.updatedAt ?? Date.now() })
      for (const fileRecord of pack.files ?? []) {
        if (!fileRecord.data || typeof fileRecord.name !== 'string' || !/^[A-Za-z0-9+/=]+$/.test(fileRecord.data)) continue
        const mimeType = typeof fileRecord.mimeType === 'string' && /^[\w.+-]+\/[\w.+-]+$/.test(fileRecord.mimeType) ? fileRecord.mimeType : 'application/octet-stream'
        const blob = await (await fetch(`data:${mimeType};base64,${fileRecord.data}`)).blob()
        const imported = new File([blob], fileRecord.name, { type: blob.type })
        const kind = ['image', 'audio', 'doc', 'drawing'].includes(fileRecord.kind) ? fileRecord.kind : 'doc'
        add({ nodeId: idMap.get(fileRecord.nodeId) ?? fileRecord.nodeId, name: imported.name, kind, url: URL.createObjectURL(imported), size: imported.size, file: imported })
      }
      setStatus(t.importDone)
    } catch { setStatus(t.importFailed) } finally { setBusy(false) }
  }

  if (page === 'themes') return <section className="desk-theme-grid" aria-label={m.pages.themes.title}>{Object.keys(THEME_COLORS).map(id => {
    const [bg, surface, accent] = THEME_COLORS[id]
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
    <div className="desk-live-preview"><strong>{t.preview}</strong><p>{t.previewText}</p></div>
  </section>

  if (page === 'account') return <section className="desk-account-layout">
    <div className="desk-account-profile">{user?.picture ? <img src={user.picture} alt="" /> : <UserRound size={30} aria-hidden="true" />}<div><strong>{user?.name ?? t.signedOut}</strong><span>{user?.email ?? t.signInPrompt}</span></div>{user ? <button type="button" className="desk-button" onClick={signOutGoogle}>{t.signOut}</button> : <div className="desk-google-signin" ref={authRef} aria-label={t.signInGoogle} />}</div>
    <div className="desk-account-actions">
      <button type="button" className="desk-button" disabled={busy} onClick={() => void exportLibrary('json')}><Download size={16} />{t.exportJson}</button>
      <button type="button" className="desk-button" disabled={busy} onClick={() => void exportLibrary('markdown')}><FileText size={16} />{t.exportMarkdown}</button>
      <button type="button" className="desk-button" disabled={busy} onClick={() => void exportLibrary('backup')}><Download size={16} />{t.downloadBackup}</button>
      <button type="button" className="desk-button" disabled={busy} onClick={() => fileRef.current?.click()}><Upload size={16} />{t.import}</button>
      <button type="button" className="desk-button" disabled={shareBusy} onClick={() => void createOrCopyShareLink()}>{shareBusy ? t.sharing : t.shareLink}</button>
      <input ref={fileRef} hidden type="file" accept="application/json,.json" onChange={e => void importLibrary(e)} />
    </div>
    {shareLink && <p className="desk-share-link" dir="ltr"><a href={shareLink}>{shareLink}</a></p>}
    <DeleteLocalData t={t} />
    {status && <p className="desk-inline-status" role="status">{status}</p>}
  </section>

  if (page === 'support') return <SupportPage />
  if (page === 'privacy') return <PrivacyPage />
  return <section className="desk-tools-page"><p>{t.toolsDescription}</p><button type="button" className="desk-button desk-button-primary" onClick={onSwitchToSpace}>{t.openTools}</button></section>
}

function DeleteLocalData({ t }: { t: ReturnType<typeof useDesktopMessages>['workspacePages'] }) {
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState('')
  const phrase = t.deletePhrase
  const erase = (): void => {
    if (typed !== phrase) return
    for (const key of ['atelier-tree-v1', 'atelier-path-v1', 'vexale-office-preferences-v1', 'atelier-google-auth-v1', 'vexale-anonymous-analytics']) localStorage.removeItem(key)
    leaveSharedWorkspace()
    signOutGoogle()
    const request = indexedDB.deleteDatabase('atelier-library')
    request.onsuccess = request.onerror = request.onblocked = () => window.location.reload()
  }
  return <section className="desk-danger-zone"><h2><AlertTriangle size={18} />{t.dangerZone}</h2><p>{t.deleteWarning}</p>
    {!open ? <button type="button" className="desk-button desk-danger-button" onClick={() => setOpen(true)}>{t.deleteLocal}</button> : <div className="desk-confirm-delete"><label>{t.typeToConfirm}<input value={typed} onChange={e => setTyped(e.target.value)} autoComplete="off" /></label><button type="button" className="desk-button desk-danger-button" disabled={typed !== phrase} onClick={erase}>{t.confirmDelete}</button><button type="button" className="desk-button" onClick={() => { setOpen(false); setTyped('') }}>{t.cancel}</button></div>}
  </section>
}

function SupportPage() {
  const m = useDesktopMessages()
  const { user } = useGoogleAuth()
  const t = m.workspacePages
  const [category, setCategory] = useState<'suggestion' | 'issue'>('suggestion')
  const [title, setTitle] = useState('')
  const [details, setDetails] = useState('')
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (!getGoogleIdToken()) { setStatus(t.signInToSend); return }
    setBusy(true); setStatus('')
    try { await submitSupportRequest({ category, subject: title, message: details, contactEmail: email || user?.email || '' }); setStatus(t.messageSent); setTitle(''); setDetails('') }
    catch { setStatus(t.messageFailed) } finally { setBusy(false) }
  }
  return <section className="desk-form-page"><p>{t.supportIntro} {t.contactSupportPrefix}<a href={SUPPORT_EMAIL_HREF} dir="ltr">{SUPPORT_EMAIL}</a></p>
    <aside className="desk-support-notes"><div><strong>{t.notes.title}</strong><p>{t.notes.placeholder}</p></div><span className="desk-count-pill">{t.notes.saved}</span></aside>
    <div className="desk-choice-row"><button type="button" className="desk-button" aria-pressed={category === 'suggestion'} onClick={() => setCategory('suggestion')}><Lightbulb size={16} />{t.suggestion}</button><button type="button" className="desk-button" aria-pressed={category === 'issue'} onClick={() => setCategory('issue')}><Bug size={16} />{t.bugReport}</button></div>
    <form onSubmit={e => void submit(e)}><label>{t.title}<input required maxLength={120} value={title} onChange={e => setTitle(e.target.value)} /></label><label>{t.details}<textarea required rows={5} maxLength={3000} value={details} onChange={e => setDetails(e.target.value)} dir="auto" /></label><label>{t.optionalEmail}<input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder={user?.email} dir="ltr" /></label><button className="desk-button desk-button-primary" disabled={busy || !title.trim() || !details.trim()}><Send size={16} />{busy ? t.sending : t.send}</button></form>{status && <p role="status">{status}</p>}
  </section>
}

function PrivacyPage() {
  const m = useDesktopMessages()
  const t = m.workspacePages
  const locale = useLocale()
  const [doc, setDoc] = useState<'privacy' | 'terms'>('privacy')
  const [analytics, setAnalytics] = useState(() => localStorage.getItem('vexale-anonymous-analytics') === 'true')
  const document = legalContent[doc]
  return <section className="desk-legal-page"><div className="desk-choice-row" role="tablist" aria-label={t.legalTabs}><button type="button" role="tab" aria-selected={doc === 'privacy'} className="desk-button" onClick={() => setDoc('privacy')}>{t.privacyTab}</button><button type="button" role="tab" aria-selected={doc === 'terms'} className="desk-button" onClick={() => setDoc('terms')}>{t.termsTab}</button></div><p className="desk-legal-summary">{document.summary[locale]}</p><p className="desk-legal-date">{t.lastUpdated}: {LAST_UPDATED[locale]}</p><nav aria-label={t.contents}><strong>{t.contents}</strong><ol>{document.sections.map((section, i) => <li key={i}><a href={`#legal-${doc}-${i}`}>{section.heading[locale]}</a></li>)}</ol></nav><div>{document.sections.map((section, i) => <article id={`legal-${doc}-${i}`} key={i}><h2>{section.heading[locale]}</h2>{section.paragraphs.map((paragraph, p) => <p key={p}>{paragraph[locale]}</p>)}</article>)}</div><aside className="desk-privacy-controls"><label><input type="checkbox" checked={analytics} onChange={e => { setAnalytics(e.target.checked); localStorage.setItem('vexale-anonymous-analytics', String(e.target.checked)) }} />{t.analyticsToggle}</label><h2>{t.aiSharingTitle}</h2><p>{t.aiSharingBody}</p></aside></section>
}
