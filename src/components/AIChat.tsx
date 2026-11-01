import { useEffect, useRef, useState } from 'react'
import { Send } from 'lucide-react'
import { useLibrary, useTree } from '../shared'
import { requestStudyAI } from '../lib/studyAssistant'
import { isSupabaseConfigured } from '../lib/supabase'
import { ACCENT, panel } from './toolkit'
import { useLocale } from '../lib/i18n'

interface Msg { role: 'me' | 'ai'; text: string }
interface AIChatProps { context?: string; nodeTitle?: string; contextLoading?: boolean }

// محادثة المكتبة تستخدم notes-ai الآمنة، مع بحث محلي بديل عند غياب إعداد Supabase.
export default function AIChat({ context, nodeTitle, contextLoading = false }: AIChatProps = {}) {
  const locale = useLocale()
  const { items } = useLibrary()
  const { titleOf } = useTree()
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const end = useRef<HTMLDivElement>(null)

  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }) }, [msgs])

  const send = async (): Promise<void> => {
    const question = q.trim()
    if (!question || busy || contextLoading) return
    setQ('')
    setMsgs(m => [...m, { role: 'me', text: question }])
    setBusy(true)
    try {
      const notes = context === undefined
        ? items.map(i => `${i.name} (${i.kind}, ${titleOf(i.nodeId)})`).join('\n').slice(0, 16_000)
        : context.slice(0, 16_000)
      let answer: string
      if (isSupabaseConfigured) {
        answer = await requestStudyAI({ action: 'answer', nodeTitle: nodeTitle ?? 'Library', notes, question, language: locale })
      } else {
        const words = question.toLocaleLowerCase(locale).split(/\s+/).filter(word => word.length > 1)
        const source = notes.toLocaleLowerCase(locale)
        const excerpts = words.flatMap(word => {
          const index = source.indexOf(word)
          return index < 0 ? [] : [notes.slice(Math.max(0, index - 100), Math.min(notes.length, index + 220))]
        }).slice(0, 3)
        answer = excerpts.length
          ? locale === 'ar' ? `مقاطع مرتبطة في النص المتاح: ${excerpts.join(' … ')}` : `Related excerpts from the available text: ${excerpts.join(' … ')}`
          : locale === 'ar' ? `لم أجد تطابقاً في النص المتاح (${notes.length} حرف).` : `I couldn't find a match in the available text (${notes.length} characters).`
        answer += locale === 'ar' ? '\n\nالمساعد الذكي غير مهيأ؛ تحقّق من إعداد Supabase ونشر وظيفة notes-ai.' : '\n\nAI is not configured. Check Supabase setup and deploy the notes-ai function.'
      }
      setMsgs(m => [...m, { role: 'ai', text: answer }])
    } catch (e) {
      const message = e instanceof Error ? e.message.toLowerCase() : ''
      const response = message.includes('sign in') || message.includes('سجّل الدخول')
        ? locale === 'ar' ? 'سجّل الدخول بحساب Google أو أعد الاتصال لاستخدام مساعد المكتبة.' : 'Sign in or reconnect your Google account to use study chat.'
        : message.includes('supabase') || message.includes('preparing') || message.includes('not configured') || message.includes('تهيئتها')
          ? locale === 'ar' ? 'خدمة الذكاء الاصطناعي غير مهيأة بعد. تحقّق من إعداد Supabase ونشر وظيفة notes-ai.' : 'AI is not configured yet. Check Supabase and deploy notes-ai.'
          : locale === 'ar' ? 'تعذّر الاتصال بمساعد المكتبة. تحقّق من الاتصال وإعداد وظيفة notes-ai ثم أعد المحاولة.' : 'Could not connect to study chat. Check your connection and retry.'
      setMsgs(m => [...m, { role: 'ai', text: response }])
    } finally {
      setBusy(false)
    }
  }

  const placeholder = locale === 'ar' ? 'اكتب سؤالك عن هذا الملف…' : 'Ask about this file…'
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div aria-live="polite" className="min-h-0 flex-1 space-y-2 overflow-y-auto text-sm">
        {!msgs.length && <p className="opacity-60">{locale === 'ar' ? 'اسأل عن الملف المفتوح أو اطلب توضيحاً لمحتواه.' : 'Ask about the open file or request an explanation of its contents.'}</p>}
        {msgs.map((m, i) => (
          <p key={i} className={m.role === 'me' ? `${panel} p-2 opacity-90` : 'whitespace-pre-wrap p-1'} style={m.role === 'ai' ? { color: ACCENT } : undefined}>{m.text}</p>
        ))}
        {contextLoading && <p className="text-xs opacity-60">{locale === 'ar' ? 'جارٍ قراءة الملف…' : 'Reading file text…'}</p>}{busy && <p className="text-xs opacity-60">{locale === 'ar' ? 'جارٍ الكتابة…' : 'Thinking…'}</p>}
        <div ref={end} />
      </div>
      <form onSubmit={event => { event.preventDefault(); void send() }} className="flex shrink-0 gap-2 border-t border-white/10 pt-3">
        <input value={q} onChange={event => setQ(event.target.value)} placeholder={placeholder} aria-label={placeholder} dir="auto" className="min-w-0 flex-1 rounded-lg bg-white/10 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-[#a78bfa]" />
        <button type="submit" aria-label={locale === 'ar' ? 'إرسال' : 'Send'} disabled={busy || contextLoading || !q.trim()} className="rounded-lg px-3 text-black transition active:scale-95 disabled:opacity-60" style={{ background: ACCENT }}><Send size={15} className={locale === 'ar' ? '-scale-x-100' : ''} /></button>
      </form>
    </div>
  )
}