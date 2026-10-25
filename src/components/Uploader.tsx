import { useRef, useState } from 'react'
import { UploadCloud } from 'lucide-react'
import { sfx, useLibrary } from '../shared'
import type { Item } from '../shared'
import { tr, useLocale } from '../lib/i18n'

const kindOf = (file: File): Item['kind'] =>
  file.type.startsWith('image/') ? 'image' : file.type.startsWith('audio/') ? 'audio' : 'doc'

interface Props {
  nodeId: string
  color: string
}

export default function Uploader({ nodeId, color }: Props) {
  const locale = useLocale()
  const { add } = useLibrary()
  const [over, setOver] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const text = (english: string, arabic: string): string => tr(locale, english, arabic)

  const take = (files: FileList | null): void => {
    if (!files?.length) return
    Array.from(files).forEach(file => add({ nodeId, name: file.name, kind: kindOf(file), url: URL.createObjectURL(file), size: file.size, file }))
    sfx.success()
  }

  return (
    <div
      onDragOver={event => { event.preventDefault(); setOver(true) }}
      onDragLeave={() => setOver(false)}
      onDrop={event => { event.preventDefault(); setOver(false); take(event.dataTransfer.files) }}
      onClick={() => input.current?.click()}
      role="button"
      tabIndex={0}
      aria-label={text('Upload files to this section', 'رفع ملفات إلى هذا القسم')}
      onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); input.current?.click() } }}
      className="ui-upload-zone flex cursor-pointer flex-col items-center gap-1 border-2 border-dashed p-4 text-sm transition-colors"
      style={{ borderColor: color, background: over ? color + '33' : 'transparent' }}
    >
      <UploadCloud style={{ color }} />
      <span>{text('Drop images, audio, or documents here, or click to browse.', 'اسحب الصور أو الصوتيات أو المستندات إلى هنا، أو انقر للاختيار.')}</span>
      <input ref={input} type="file" multiple hidden onChange={event => { take(event.target.files); event.target.value = '' }} />
    </div>
  )
}
