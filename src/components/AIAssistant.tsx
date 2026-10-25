import { useState } from 'react'
import { Bot, Search, Send, X } from 'lucide-react'
import { sfx, useLibrary, useTree } from '../shared'
import { tr, useLocale } from '../lib/i18n'
import { useSettings } from '../lib/settings'

export default function AIAssistant() {
  const locale = useLocale()
  const { items } = useLibrary()
  const { accent: color, titleOf } = useTree()
  const { viewMode } = useSettings()
  const [open, setOpen] = useState(false)
  const [question, setQuestion] = useState('')
  const [log, setLog] = useState<{ role: 'user' | 'assistant'; text: string }[]>([])
  const text = (english: string, arabic: string): string => tr(locale, english, arabic)

  const searchLibrary = (): void => {
    const query = question.trim()
    if (!query) return
    setQuestion('')
    sfx.click()
    setLog(current => [...current, { role: 'user', text: query }])

    const words = query.toLocaleLowerCase(locale).split(/\s+/).filter(word => word.length > 1)
    const matches = items.filter(item =>
      words.some(word => `${item.name} ${item.kind} ${titleOf(item.nodeId)}`.toLocaleLowerCase(locale).includes(word)),
    )
    const answer = matches.length
      ? text(
        `Found ${matches.length} matching file(s): ${matches.map(item => `${item.name} (${titleOf(item.nodeId)})`).join(', ')}.`,
        `عُثر على ${matches.length} ملف مطابق: ${matches.map(item => `${item.name} (${titleOf(item.nodeId)})`).join('، ')}.`,
      )
      : text(`No matching files. Your library contains ${items.length} file(s).`, `لم يُعثر على ملفات مطابقة. تحتوي مكتبتك على ${items.length} ملف.`)
    setLog(current => [...current, { role: 'assistant', text: answer }])
  }

  return (
    <div className={`fixed bottom-4 z-20 ${viewMode === 'compact' ? 'end-4' : 'start-4'}`}>
      {open ? (
        <section aria-label={text('Quick library search', 'بحث سريع في المكتبة')} className="glass-strong ui-modal ui-quick-search flex h-96 w-80 max-w-[90vw] flex-col shadow-xl">
          <header className="flex items-center justify-between border-b border-white/10 p-3">
            <b className="flex items-center gap-2"><Search size={15} style={{ color }} />{text('Quick library search', 'بحث سريع في المكتبة')}</b>
            <button type="button" aria-label={text('Close search', 'إغلاق البحث')} onClick={() => { setOpen(false); sfx.close() }}><X size={16} /></button>
          </header>
          <div aria-live="polite" className="flex-1 space-y-2 overflow-y-auto p-3 text-sm">
            {!log.length && <p className="opacity-60">{text('Search file names, types, or section titles.', 'ابحث في أسماء الملفات أو أنواعها أو عناوين الأقسام.')}</p>}
            {log.map((message, index) => (
              <p key={`${message.role}-${index}`} dir="auto" className={message.role === 'user' ? 'opacity-75' : ''} style={message.role === 'assistant' ? { color } : undefined}>{message.text}</p>
            ))}
          </div>
          <form onSubmit={event => { event.preventDefault(); searchLibrary() }} className="flex gap-2 border-t border-white/10 p-2">
            <input
              value={question}
              onChange={event => setQuestion(event.target.value)}
              placeholder={text('Search your library…', 'ابحث في مكتبتك…')}
              aria-label={text('Search your library', 'ابحث في مكتبتك')}
              dir="auto"
              className="min-w-0 flex-1 rounded bg-white/10 px-2 py-1 text-sm outline-none"
            />
            <button type="submit" aria-label={text('Search', 'بحث')} disabled={!question.trim()} className="disabled:opacity-40"><Send size={16} /></button>
          </form>
        </section>
      ) : (
        <button
          type="button"
          aria-label={text('Open library search', 'فتح البحث في المكتبة')}
          title={text('Quick library search', 'بحث سريع في المكتبة')}
          onClick={() => { setOpen(true); sfx.open() }}
          className="rounded-full p-3 text-black shadow-lg transition hover:scale-105 active:scale-95"
          style={{ background: color }}
        >
          <Bot />
        </button>
      )}
    </div>
  )
}
