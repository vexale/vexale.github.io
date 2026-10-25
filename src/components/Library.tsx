import { useState } from 'react'
import { Download, Eye, FileText, Music, Trash2 } from 'lucide-react'
import { sfx, useLibrary } from '../shared'
import { tr, useLocale } from '../lib/i18n'

type Filter = 'all' | 'image' | 'audio' | 'doc'
const FILTERS: readonly { id: Filter; label: { en: string; ar: string } }[] = [
  { id: 'all', label: { en: 'All', ar: 'الكل' } },
  { id: 'image', label: { en: 'Images', ar: 'صور' } },
  { id: 'audio', label: { en: 'Audio', ar: 'صوت' } },
  { id: 'doc', label: { en: 'Documents', ar: 'مستندات' } },
]

const formatSize = (size: number): string => size > 1_048_576 ? `${(size / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(size / 1024))} KB`

interface Props {
  nodeId: string
  color: string
}

export default function Library({ nodeId, color }: Props) {
  const locale = useLocale()
  const { items, remove } = useLibrary()
  const [filter, setFilter] = useState<Filter>('all')
  const mine = items.filter(item => item.nodeId === nodeId)
  const shown = mine.filter(item => filter === 'all' ? true : filter === 'image' ? item.kind === 'image' || item.kind === 'drawing' : item.kind === filter)
  const text = (english: string, arabic: string): string => tr(locale, english, arabic)

  if (!mine.length) return <p className="py-2 text-sm opacity-60">{text('No files in this section yet. Upload a file or save a sketch.', 'لا توجد ملفات في هذا الفرع بعد. ارفع ملفاً أو احفظ رسمة.')}</p>

  return (
    <div className="space-y-2">
      <div role="group" aria-label={text('Filter files', 'تصفية الملفات')} className="flex flex-wrap gap-1.5">
        {FILTERS.map(filterOption => (
          <button
            key={filterOption.id}
            type="button"
            onClick={() => { setFilter(filterOption.id); sfx.click() }}
            aria-pressed={filter === filterOption.id}
            className="rounded-full px-3 py-0.5 text-xs"
            style={filter === filterOption.id ? { background: color, color: '#111' } : { background: 'rgba(255,255,255,.1)' }}
          >
            {filterOption.label[locale]}
          </button>
        ))}
      </div>
      {!shown.length && <p className="text-sm opacity-60">{text('No files match this filter.', 'لا توجد ملفات من هذا النوع.')}</p>}
      <ul className="ui-library-grid grid grid-cols-2 gap-3 sm:grid-cols-3">
        {shown.map(item => (
          <li key={item.id} className="ui-card group relative rounded-lg p-2 text-xs">
            {item.kind === 'image' || item.kind === 'drawing' ? (
              <img src={item.url} alt={item.name} className="h-24 w-full rounded object-cover" />
            ) : item.kind === 'audio' ? (
              <div className="flex h-24 flex-col justify-center gap-1">
                <Music size={18} style={{ color }} />
                <audio controls src={item.url} className="w-full" aria-label={text(`Play ${item.name}`, `تشغيل ${item.name}`)} />
              </div>
            ) : (
              <div className="flex h-24 items-center justify-center"><FileText size={28} style={{ color }} /></div>
            )}
            <p className="mt-1 truncate" title={item.name}>{item.name}</p>
            <div className="mt-1 flex items-center justify-between opacity-80">
              <span>{formatSize(item.size)}</span>
              <span className="flex gap-2">
                <a href={item.url} target="_blank" rel="noopener noreferrer" aria-label={text(`Preview ${item.name}`, `معاينة ${item.name}`)} title={text('Preview', 'معاينة')} onClick={() => sfx.click()}><Eye size={14} /></a>
                <a href={item.url} download={item.name} aria-label={text(`Download ${item.name}`, `تنزيل ${item.name}`)} title={text('Download', 'تنزيل')} onClick={() => sfx.click()}><Download size={14} /></a>
              </span>
            </div>
            <button
              type="button"
              aria-label={text(`Remove ${item.name}`, `حذف ${item.name}`)}
              onClick={() => { remove(item.id); sfx.click() }}
              className="absolute start-1 top-1 rounded bg-black/60 p-1 opacity-0 group-hover:opacity-100 focus:opacity-100"
            >
              <Trash2 size={12} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
