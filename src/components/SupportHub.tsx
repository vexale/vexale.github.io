import { useState } from 'react'
import type { FormEvent } from 'react'
import { Bug, CheckCircle2, Lightbulb, Send } from 'lucide-react'
import { getGoogleIdToken, useGoogleAuth } from '../lib/googleAuth'
import { submitSupportRequest } from '../lib/libraryApi'
import { tr, useLocale } from '../lib/i18n'
import type { SupportCategory } from '../lib/libraryApi'
import { SUPPORT_EMAIL, SUPPORT_EMAIL_HREF } from '../lib/contact'

interface SupportHubProps {
  onRequestAuth: () => void
}

interface FormStatus {
  kind: 'success' | 'error'
  text: string
}

export default function SupportHub({ onRequestAuth }: SupportHubProps) {
  const locale = useLocale()
  const { user } = useGoogleAuth()
  const [category, setCategory] = useState<SupportCategory>('suggestion')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<FormStatus | null>(null)
  const text = (english: string, arabic: string): string => tr(locale, english, arabic)

  const send = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (busy) return
    if (!getGoogleIdToken()) {
      setStatus({ kind: 'error', text: text('Sign in to send your message.', 'سجّل الدخول لإرسال رسالتك.') })
      onRequestAuth()
      return
    }

    setBusy(true)
    setStatus(null)
    try {
      await submitSupportRequest({ category, subject, message, contactEmail: contactEmail || user?.email || '' })
      setStatus({ kind: 'success', text: text('Thank you — your message has been received.', 'شكراً لك — تم استلام رسالتك.') })
      setSubject('')
      setMessage('')
    } catch {
      setStatus({ kind: 'error', text: text('Your message could not be sent. Please try again.', 'تعذّر إرسال رسالتك. حاول مرة أخرى.') })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      <section className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.035] p-3 sm:p-4">
        <div>
          <h3 className="text-sm font-semibold">{text('Send a message', 'أرسل رسالة')}</h3>
          <p className="mt-1 text-xs leading-5 opacity-60">{text('Share an idea or tell us what could work better for you.', 'شاركنا فكرة أو أخبرنا بما يمكن تحسينه من أجلك.')}</p>
        </div>
        <p className="text-xs leading-5 opacity-70">
          {text('For direct support, email ', 'للتواصل المباشر مع الدعم، راسل ')}
          <a href={SUPPORT_EMAIL_HREF} dir="ltr" className="font-medium text-violet-200 underline decoration-violet-200/40 underline-offset-4 hover:text-white">{SUPPORT_EMAIL}</a>
        </p>

        <div role="tablist" aria-label={text('Message type', 'نوع الرسالة')} className="grid grid-cols-2 gap-2">
          <button type="button" role="tab" aria-selected={category === 'suggestion'} onClick={() => { setCategory('suggestion'); setStatus(null) }} className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm transition ${category === 'suggestion' ? 'border-violet-300/50 bg-violet-300/10' : 'border-white/10 bg-white/[0.025] hover:bg-white/10'}`}>
            <Lightbulb size={16} />{text('Suggestion', 'اقتراح')}
          </button>
          <button type="button" role="tab" aria-selected={category === 'issue'} onClick={() => { setCategory('issue'); setStatus(null) }} className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm transition ${category === 'issue' ? 'border-rose-300/50 bg-rose-300/10' : 'border-white/10 bg-white/[0.025] hover:bg-white/10'}`}>
            <Bug size={16} />{text('Bug report / complaint', 'بلاغ عن خلل / شكوى')}
          </button>
        </div>

        <form className="space-y-3" onSubmit={event => { void send(event) }}>
          <label className="block space-y-1.5 text-xs font-medium">
            <span>{text('Subject', 'العنوان')}</span>
            <input required value={subject} onChange={event => setSubject(event.target.value)} maxLength={120} className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm outline-none transition focus:border-violet-300/50" placeholder={text('A short summary', 'ملخص قصير')} />
          </label>
          <label className="block space-y-1.5 text-xs font-medium">
            <span>{text('Message', 'التفاصيل')}</span>
            <textarea required value={message} onChange={event => setMessage(event.target.value)} maxLength={3000} rows={4} dir="auto" className="w-full resize-y rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm leading-6 outline-none transition focus:border-violet-300/50" placeholder={text('Tell us a little more…', 'أخبرنا بمزيد من التفاصيل…')} />
          </label>
          <label className="block space-y-1.5 text-xs font-medium">
            <span>{text('Contact email (optional)', 'بريد للتواصل (اختياري)')}</span>
            <input type="email" value={contactEmail} onChange={event => setContactEmail(event.target.value)} maxLength={254} autoComplete="email" className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm outline-none transition focus:border-violet-300/50" placeholder={user?.email ?? 'name@example.com'} dir="ltr" />
          </label>
          <button type="submit" disabled={busy || !subject.trim() || !message.trim()} className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-950 transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-45" style={{ background: 'var(--accent)' }}>
            <Send size={15} />{busy ? text('Sending…', 'جارٍ الإرسال…') : text('Send message', 'إرسال الرسالة')}
          </button>
        </form>

        {status && <p role={status.kind === 'error' ? 'alert' : 'status'} className={`flex items-start gap-2 rounded-xl border p-3 text-xs leading-5 ${status.kind === 'success' ? 'border-emerald-300/20 bg-emerald-300/10 text-emerald-100' : 'border-rose-300/20 bg-rose-300/10 text-rose-100'}`}>
          {status.kind === 'success' && <CheckCircle2 size={15} className="mt-0.5 shrink-0" />}<span>{status.text}</span>
        </p>}
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">{text('Frequently asked questions', 'الأسئلة الشائعة')}</h3>
        <details className="rounded-xl border border-white/10 bg-white/[0.025] p-3">
          <summary className="cursor-pointer list-none text-sm font-medium marker:hidden">{text('How does live library sharing work?', 'كيف تعمل مشاركة المكتبة المباشرة؟')}</summary>
          <p className="mt-2 text-xs leading-6 opacity-70">{text('Create a live workspace from a section note and share its invitation link. People with that link can view and edit notes for matching section paths; updates appear in connected views.', 'أنشئ مساحة مباشرة من ملاحظات أحد الأقسام وشارك رابط الدعوة. يستطيع من يملك الرابط مشاهدة ملاحظات المسارات المطابقة وتعديلها، وتظهر التغييرات فوراً في الجلسات المتصلة.')}</p>
        </details>
        <details className="rounded-xl border border-white/10 bg-white/[0.025] p-3">
          <summary className="cursor-pointer list-none text-sm font-medium marker:hidden">{text('How is my data protected?', 'كيف تتم حماية بياناتي؟')}</summary>
          <p className="mt-2 text-xs leading-6 opacity-70">{text('Private notes stay in this browser. Cloud support messages and shared notes are sent only when you choose those actions. A live-workspace invitation is a bearer link: anyone who has it can access that shared workspace.', 'تبقى الملاحظات الخاصة في هذا المتصفح. لا تُرسل رسائل الدعم أو الملاحظات المشتركة إلى السحابة إلا عند اختيارك ذلك. رابط مساحة المشاركة هو رابط وصول؛ يستطيع كل من يملكه الوصول إلى تلك المساحة.')}</p>
        </details>
        <details className="rounded-xl border border-white/10 bg-white/[0.025] p-3">
          <summary className="cursor-pointer list-none text-sm font-medium">{text('What can the study assistant do?', 'ما مهام مساعد الدراسة؟')}</summary>
          <p className="mt-2 text-xs leading-6 opacity-70">{text('It can summarize the current section, create review questions, and answer questions using the note text you choose to send. It does not browse your private library or send notes automatically.', 'يمكنه تلخيص القسم الحالي وإنشاء أسئلة للمراجعة والإجابة عن أسئلة بالاستناد إلى نص الملاحظات الذي تختار إرساله. لا يتصفح مكتبتك الخاصة ولا يرسل الملاحظات تلقائياً.')}</p>
        </details>
        <details className="rounded-xl border border-white/10 bg-white/[0.025] p-3">
          <summary className="cursor-pointer list-none text-sm font-medium">{text('Which domains can I organize here?', 'ما المجالات التي يمكن تنظيمها هنا؟')}</summary>
          <p className="mt-2 text-xs leading-6 opacity-70">{text('Create a structure for Quran study, science, languages, exam revision, or any subject that matters to you.', 'أنشئ بنية لدراسة القرآن أو العلوم أو اللغات أو مراجعة الاختبارات أو أي مادة تهمك.')}</p>
        </details>
      </section>
    </div>
  )
}
