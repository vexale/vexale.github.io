import { useRef, useState } from 'react'
import type JSZip from 'jszip'
import { dbPutNote } from '../../db'
import { useLibrary, useTree } from '../../shared'
import { useLocale } from '../../lib/i18n'

const MAX_ZIP_BYTES = 100 * 1024 * 1024
const MAX_UNCOMPRESSED_BYTES = 250 * 1024 * 1024
const MAX_ENTRIES = 3000
const MAX_CSV_ROWS = 300
const MAX_CSV_COLUMNS = 30

type Locale = 'en' | 'ar'
type SectionPlan = { key: string; parentKey: string | null; title: string; depth: number }
type NotePlan = { sectionKey: string; html: string }
type AttachmentPlan = { archiveName: string; sectionKey: string; name: string; extension: string }
type ImportPlan = { sections: SectionPlan[]; notes: NotePlan[]; attachments: AttachmentPlan[]; warnings: string[]; decodedBytes: number }

const COPY = {
  en: {
    title: 'Import from Notion', select: 'Choose Notion ZIP', description: 'Select a Notion “Export as Markdown & CSV” ZIP. It is processed only in this browser and is never uploaded.',
    preview: 'Import preview', file: 'Selected archive', sections: 'Sections to add', notes: 'Notes to add', csv: 'CSV tables', attachments: 'Attachments', warnings: 'Warnings', add: 'Add to my library', adding: 'Adding…', processing: 'Reading ZIP…', cancel: 'Cancel', ready: 'Import added to your library.',
    empty: 'The archive contains no supported Markdown, CSV, or attachment files.', invalid: 'Could not read this ZIP. Choose a valid Notion Markdown & CSV export.', tooLarge: 'The ZIP exceeds the 100 MB import limit.', expandedTooLarge: 'The expanded archive exceeds the 250 MB safety limit.', tooMany: 'The archive contains too many entries to preview safely.', noFile: 'Select a ZIP file first.', partial: 'Some items could not be added. Existing library items were not replaced; review the library and try the remaining files again.',
    filesKept: 'Sections and files are added as new items; existing library content is never replaced.',
    warningSkipped: 'Unsafe or system archive paths were skipped.', warningUnknown: 'Some file types are imported as documents.', warningTruncated: 'A CSV was limited to 300 rows and 30 columns.', warningRelativeLinks: 'Relative page or attachment links remain as text; external links are preserved.', warningSize: 'A very large archive entry was skipped.',
  },
  ar: {
    title: 'استيراد من Notion', select: 'اختيار ملف ZIP من Notion', description: 'اختر ملف ZIP الناتج عن «تصدير بصيغة Markdown وCSV». تتم معالجته داخل هذا المتصفح فقط ولا يُرفع إلى أي مكان.',
    preview: 'معاينة الاستيراد', file: 'الملف المحدد', sections: 'الأقسام التي ستُضاف', notes: 'الملاحظات التي ستُضاف', csv: 'جداول CSV', attachments: 'المرفقات', warnings: 'تنبيهات', add: 'إضافة إلى مكتبتي', adding: 'جارٍ الإضافة…', processing: 'جارٍ قراءة ZIP…', cancel: 'إلغاء', ready: 'أُضيف الاستيراد إلى مكتبتك.',
    empty: 'لا يحتوي الأرشيف على ملفات Markdown أو CSV أو مرفقات مدعومة.', invalid: 'تعذرت قراءة ملف ZIP. اختر ملف تصدير صالحاً من Notion بصيغة Markdown وCSV.', tooLarge: 'يتجاوز ملف ZIP حد الاستيراد البالغ 100 ميغابايت.', expandedTooLarge: 'يتجاوز المحتوى بعد فك ضغطه حد الأمان البالغ 250 ميغابايت.', tooMany: 'يحتوي الأرشيف على عدد كبير جداً من الملفات لمعاينته بأمان.', noFile: 'اختر ملف ZIP أولاً.', partial: 'تعذرت إضافة بعض العناصر. لم تُستبدل عناصر المكتبة الحالية؛ راجع المكتبة ثم أعد محاولة إضافة الملفات المتبقية.',
    filesKept: 'تُضاف الأقسام والملفات كعناصر جديدة؛ ولا يُستبدل أي محتوى موجود في المكتبة.',
    warningSkipped: 'تم تخطي المسارات غير الآمنة أو ملفات النظام داخل الأرشيف.', warningUnknown: 'سيتم استيراد بعض أنواع الملفات كمستندات.', warningTruncated: 'تم تحديد جدول CSV بحد أقصى 300 صف و30 عموداً.', warningRelativeLinks: 'ستظهر روابط الصفحات أو المرفقات النسبية كنص؛ وتُحفظ الروابط الخارجية.', warningSize: 'تم تخطي عنصر كبير جداً داخل الأرشيف.',
  },
} satisfies Record<Locale, Record<string, string>>

function escapeHtml(value: string): string {
  const replacements: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
  return value.replace(/[&<>"']/g, character => replacements[character] ?? character)
}

function safeExternalUrl(value: string): string | null {
  const href = value.trim()
  return /^(https?:\/\/|mailto:|tel:|#)/i.test(href) ? href : null
}

function inlineMarkdown(value: string): string {
  const protectedParts: string[] = []
  const protect = (html: string): string => `\u0000${protectedParts.push(html) - 1}\u0000`
  let html = escapeHtml(value)
  html = html.replace(/`([^`]+)`/g, (_match, code: string) => protect(`<code>${code}</code>`))
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_match, label: string) => escapeHtml(label || 'Image attachment'))
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label: string, destination: string) => {
    const href = safeExternalUrl(destination)
    return href ? protect(`<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${label}</a>`) : label
  })
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/__([^_]+)__/g, '<strong>$1</strong>')
  html = html.replace(/~~([^~]+)~~/g, '<s>$1</s>').replace(/\*([^*]+)\*/g, '<em>$1</em>').replace(/_([^_]+)_/g, '<em>$1</em>')
  return html.replace(/\u0000(\d+)\u0000/g, (_match, index: string) => protectedParts[Number(index)] ?? '')
}

function splitMarkdownRow(line: string): string[] {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map(cell => cell.trim().replace(/\\\|/g, '|'))
}

function renderTable(rows: string[][]): string {
  if (!rows.length) return ''
  const headings = rows[0] ?? []
  const body = rows.slice(1)
  return `<table><thead><tr>${headings.map(cell => `<th>${inlineMarkdown(cell)}</th>`).join('')}</tr></thead><tbody>${body.map(row => `<tr>${headings.map((_cell, index) => `<td>${inlineMarkdown(row[index] ?? '')}</td>`).join('')}</tr>`).join('')}</tbody></table>`
}

function listEntry(line: string): { indent: number; ordered: boolean; text: string } | null {
  const match = line.match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/)
  if (!match) return null
  return { indent: match[1].replace(/\t/g, '    ').length, ordered: /^\d/.test(match[2]), text: match[3] }
}

function renderListBlock(lines: string[], start: number, checklistLabel: string): { html: string; next: number } {
  const first = listEntry(lines[start] ?? '')
  if (!first) return { html: '', next: start + 1 }
  const consume = (index: number, indent: number, ordered: boolean): { html: string; next: number } => {
    const items: string[] = []
    while (index < lines.length) {
      const entry = listEntry(lines[index] ?? '')
      if (!entry || entry.indent < indent) break
      if (entry.indent > indent) {
        const nested = consume(index, entry.indent, entry.ordered)
        if (items.length) items[items.length - 1] = items[items.length - 1].replace('</li>', `${nested.html}</li>`)
        index = nested.next
        continue
      }
      if (entry.ordered !== ordered) break
      const checkbox = entry.text.match(/^\[([ xX])\]\s*(.*)$/)
      if (checkbox) {
        const checked = checkbox[1].toLowerCase() === 'x'
        items.push(`<li><span class="desk-note-checkbox" contenteditable="false" role="checkbox" aria-label="${escapeHtml(checklistLabel)}" aria-checked="${checked}" tabindex="0">${checked ? '☑' : '☐'}</span> ${inlineMarkdown(checkbox[2])}</li>`)
      } else items.push(`<li>${inlineMarkdown(entry.text)}</li>`)
      index += 1
    }
    const tag = ordered ? 'ol' : 'ul'
    return { html: `<${tag}>${items.join('')}</${tag}>`, next: index }
  }
  return consume(start, first.indent, first.ordered)
}

function markdownToHtml(markdown: string, locale: Locale): { html: string; hasRelativeLinks: boolean } {
  const lines = markdown.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n')
  const blocks: string[] = []
  const hasRelativeLinks = /\]\((?!https?:\/\/|mailto:|tel:|#)[^)]+\)/i.test(markdown)
  const isTableLine = (line: string): boolean => line.includes('|')
  const isTableDivider = (line: string): boolean => {
    const cells = splitMarkdownRow(line)
    return cells.length > 0 && cells.every(cell => /^:?-{3,}:?$/.test(cell))
  }
  const isListLine = (line: string): boolean => /^\s*(?:[-*+]\s+|\d+[.)]\s+)/.test(line)
  const isBlockStart = (line: string): boolean => /^(\s{0,3}#{1,6}\s|\s{0,3}>|\s{0,3}```|\s{0,3}(?:[-*_]\s*){3,}$)/.test(line) || isListLine(line) || isTableLine(line)

  for (let i = 0; i < lines.length;) {
    const line = lines[i] ?? ''
    if (!line.trim()) { i += 1; continue }

    if (/^\s*```/.test(line)) {
      const code: string[] = []
      i += 1
      while (i < lines.length && !/^\s*```/.test(lines[i] ?? '')) code.push(lines[i++] ?? '')
      if (i < lines.length) i += 1
      blocks.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`)
      continue
    }

    const heading = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/)
    if (heading) {
      const level = Math.min(4, Math.max(2, heading[1].length + 1))
      blocks.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`)
      i += 1
      continue
    }

    if (/^\s{0,3}(?:[-*_]\s*){3,}$/.test(line)) { blocks.push('<hr>'); i += 1; continue }

    if (isTableLine(line) && i + 1 < lines.length && isTableDivider(lines[i + 1] ?? '')) {
      const rows: string[][] = [splitMarkdownRow(line)]
      i += 2
      while (i < lines.length && isTableLine(lines[i] ?? '')) rows.push(splitMarkdownRow(lines[i++] ?? ''))
      blocks.push(renderTable(rows))
      continue
    }

    if (/^\s{0,3}>/.test(line)) {
      const quote: string[] = []
      while (i < lines.length && /^\s{0,3}>/.test(lines[i] ?? '')) quote.push((lines[i++] ?? '').replace(/^\s{0,3}>\s?/, ''))
      blocks.push(`<blockquote><p>${quote.map(inlineMarkdown).join('<br>')}</p></blockquote>`)
      continue
    }

    if (isListLine(line)) {
      const list = renderListBlock(lines, i, locale === 'ar' ? 'عنصر قائمة' : 'Checklist item')
      blocks.push(list.html)
      i = list.next
      continue
    }

    const paragraph = [line]
    i += 1
    while (i < lines.length && (lines[i] ?? '').trim() && !isBlockStart(lines[i] ?? '')) paragraph.push(lines[i++] ?? '')
    blocks.push(`<p>${paragraph.map(inlineMarkdown).join('<br>')}</p>`)
  }
  return { html: blocks.join(''), hasRelativeLinks }
}

function parseCsv(source: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  const text = source.replace(/^\uFEFF/, '')
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i] ?? ''
    if (quoted && char === '"' && text[i + 1] === '"') { cell += '"'; i += 1 }
    else if (char === '"') quoted = !quoted
    else if (!quoted && char === ',') { row.push(cell); cell = '' }
    else if (!quoted && (char === '\n' || char === '\r')) {
      if (char === '\r' && text[i + 1] === '\n') i += 1
      row.push(cell); cell = ''
      if (row.some(value => value.length > 0)) rows.push(row)
      row = []
    } else cell += char
  }
  row.push(cell)
  if (row.some(value => value.length > 0)) rows.push(row)
  return rows
}

function csvToHtml(source: string): { html: string; truncated: boolean } {
  const allRows = parseCsv(source)
  const truncated = allRows.length > MAX_CSV_ROWS || allRows.some(row => row.length > MAX_CSV_COLUMNS)
  const rows = allRows.slice(0, MAX_CSV_ROWS).map(row => row.slice(0, MAX_CSV_COLUMNS))
  return { html: renderTable(rows), truncated }
}

function normalizePath(path: string): string | null {
  const normalized = path.replace(/\\/g, '/').normalize('NFC')
  if (!normalized || normalized.startsWith('/') || /^[A-Za-z]:/.test(normalized)) return null
  const segments = normalized.split('/').filter(Boolean)
  if (segments.some(segment => segment === '.' || segment === '..')) return null
  return segments.join('/')
}

function parentPath(path: string): string {
  const index = path.lastIndexOf('/')
  return index < 0 ? '' : path.slice(0, index)
}

function fileName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1).replace(/[\u0000-\u001f\u007f]/g, ' ').trim()
}

function displayTitle(name: string, stripExtension = true): string {
  const safeName = name.replace(/[\u0000-\u001f\u007f]/g, ' ').trim() || 'Imported item'
  const withoutExtension = stripExtension ? safeName.replace(/\.[^.]+$/, '') : safeName
  return withoutExtension.replace(/\s+[\da-f]{8}-[\da-f-]{27,}$/i, '').replace(/\s+[\da-f]{32}$/i, '').trim() || safeName
}

function uncompressedSize(entry: JSZip.JSZipObject): number {
  const data = (entry as JSZip.JSZipObject & { _data?: { uncompressedSize?: unknown } })._data
  return typeof data?.uncompressedSize === 'number' ? data.uncompressedSize : 0
}

function mimeTypeFor(extension: string): string {
  const known: Record<string, string> = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
    pdf: 'application/pdf', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', ogg: 'audio/ogg', mp4: 'video/mp4', txt: 'text/plain',
  }
  return known[extension] ?? 'application/octet-stream'
}

function fileKind(extension: string): 'image' | 'audio' | 'doc' {
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(extension)) return 'image'
  if (['mp3', 'wav', 'm4a', 'ogg'].includes(extension)) return 'audio'
  return 'doc'
}

function isSystemPath(path: string): boolean {
  return path.split('/').some(part => part === '__MACOSX' || part === '.DS_Store' || part === 'Thumbs.db' || part.startsWith('._'))
}

async function loadZip(file: File): Promise<JSZip> {
  const { default: JSZipModule } = await import('jszip')
  return JSZipModule.loadAsync(await file.arrayBuffer())
}

async function buildPlan(file: File, locale: Locale): Promise<ImportPlan> {
  if (file.size > MAX_ZIP_BYTES) throw new Error('zip-too-large')
  const zip = await loadZip(file)
  const entries = Object.values(zip.files)
  if (entries.length > MAX_ENTRIES) throw new Error('too-many-entries')

  const warnings: string[] = []
  const sections = new Map<string, SectionPlan>()
  const folderPaths = new Set<string>()
  const notes: NotePlan[] = []
  const usedNoteSections = new Set<string>()
  const attachments: AttachmentPlan[] = []
  let skippedUnsafe = false
  let skippedLarge = false
  let unknownTypes = false
  let truncatedCsv = false
  let hasRelativeLinks = false
  let totalEstimatedSize = 0
  let decodedBytes = 0

  const cleanEntries: Array<{ entry: JSZip.JSZipObject; path: string }> = []
  for (const entry of entries) {
    const path = normalizePath(entry.name)
    if (!path || (entry.unsafeOriginalName && !normalizePath(entry.unsafeOriginalName)) || isSystemPath(path)) { skippedUnsafe = true; continue }
    const size = uncompressedSize(entry)
    if (size && totalEstimatedSize + size > MAX_UNCOMPRESSED_BYTES) { skippedLarge = true; continue }
    totalEstimatedSize += size
    cleanEntries.push({ entry, path })
    if (entry.dir) folderPaths.add(path.replace(/\/$/, ''))
    const directory = entry.dir ? path.replace(/\/$/, '') : parentPath(path)
    const parts = directory.split('/').filter(Boolean)
    for (let index = 1; index <= parts.length; index += 1) folderPaths.add(parts.slice(0, index).join('/'))
  }

  const sortedFolders = [...folderPaths].filter(Boolean).sort((a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b))
  for (const folder of sortedFolders) {
    const parent = parentPath(folder)
    const title = displayTitle(fileName(folder), false)
    sections.set(`dir:${folder}`, { key: `dir:${folder}`, parentKey: parent ? `dir:${parent}` : null, title, depth: folder.split('/').length })
  }

  for (const { entry, path } of cleanEntries) {
    if (entry.dir) continue
    const name = fileName(path)
    const extension = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1).toLocaleLowerCase('en') : ''
    const parent = parentPath(path)
    const parentKey = parent ? `dir:${parent}` : null

    if (extension === 'md') {
      const title = displayTitle(name)
      const parentTitle = parent ? displayTitle(fileName(parent), false) : ''
      const rootFolder = !parent ? sortedFolders.find(folder => !folder.includes('/') && displayTitle(fileName(folder), false).localeCompare(title, 'en', { sensitivity: 'base' }) === 0) : undefined
      let sectionKey = parent && title.localeCompare(parentTitle, 'en', { sensitivity: 'base' }) === 0 ? `dir:${parent}` : rootFolder ? `dir:${rootFolder}` : `page:${path}`
      if (usedNoteSections.has(sectionKey)) sectionKey = `page:${path}`
      if (!sections.has(sectionKey)) sections.set(sectionKey, { key: sectionKey, parentKey, title, depth: parent ? parent.split('/').length + 1 : 1 })
      const markdown = await entry.async('text')
      decodedBytes += new TextEncoder().encode(markdown).byteLength
      if (decodedBytes > MAX_UNCOMPRESSED_BYTES) throw new Error('expanded-too-large')
      const converted = markdownToHtml(markdown, locale)
      notes.push({ sectionKey, html: converted.html })
      usedNoteSections.add(sectionKey)
      hasRelativeLinks ||= converted.hasRelativeLinks
      continue
    }

    if (extension === 'csv') {
      const sectionKey = `csv:${path}`
      sections.set(sectionKey, { key: sectionKey, parentKey, title: displayTitle(name), depth: parent ? parent.split('/').length + 1 : 1 })
      const csv = await entry.async('text')
      decodedBytes += new TextEncoder().encode(csv).byteLength
      if (decodedBytes > MAX_UNCOMPRESSED_BYTES) throw new Error('expanded-too-large')
      const converted = csvToHtml(csv)
      notes.push({ sectionKey, html: converted.html })
      truncatedCsv ||= converted.truncated
      continue
    }

    const sectionKey = parentKey ?? 'generated:attachments'
    if (!sections.has(sectionKey)) sections.set(sectionKey, { key: sectionKey, parentKey: null, title: locale === 'ar' ? 'مرفقات Notion' : 'Notion attachments', depth: 1 })
    if (!['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'mp3', 'wav', 'm4a', 'ogg', 'mp4', 'txt'].includes(extension)) unknownTypes = true
    attachments.push({ archiveName: entry.name, sectionKey, name, extension })
  }

  if (skippedUnsafe) warnings.push(COPY[locale].warningSkipped)
  if (skippedLarge) warnings.push(COPY[locale].warningSize)
  if (unknownTypes) warnings.push(COPY[locale].warningUnknown)
  if (truncatedCsv) warnings.push(COPY[locale].warningTruncated)
  if (hasRelativeLinks) warnings.push(COPY[locale].warningRelativeLinks)
  if (!sections.size || (!notes.length && !attachments.length)) throw new Error('empty')

  return { sections: [...sections.values()].sort((a, b) => a.depth - b.depth || a.key.localeCompare(b.key)), notes, attachments, warnings, decodedBytes }
}

export default function NotionImport() {
  const locale = useLocale()
  const t = COPY[locale]
  const { addNode } = useTree()
  const { add } = useLibrary()
  const inputRef = useRef<HTMLInputElement>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [plan, setPlan] = useState<ImportPlan | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')

  const chooseFile = async (file: File | undefined): Promise<void> => {
    setError(''); setStatus(''); setPlan(null); setSelectedFile(null)
    if (!file) return
    setBusy(true)
    try {
      const nextPlan = await buildPlan(file, locale)
      setSelectedFile(file)
      setPlan(nextPlan)
    } catch (reason) {
      const code = reason instanceof Error ? reason.message : ''
      setError(code === 'zip-too-large' ? t.tooLarge : code === 'expanded-too-large' ? t.expandedTooLarge : code === 'too-many-entries' ? t.tooMany : code === 'empty' ? t.empty : t.invalid)
    } finally { setBusy(false) }
  }

  const addToLibrary = async (): Promise<void> => {
    if (!plan || !selectedFile || busy) return
    setBusy(true); setError(''); setStatus('')
    let createdCount = 0
    try {
      const zip = await loadZip(selectedFile)
      const stagedAttachments: Array<{ attachment: AttachmentPlan; blob: Blob }> = []
      let totalBytes = plan.decodedBytes
      for (const attachment of plan.attachments) {
        const entry = zip.file(attachment.archiveName)
        if (!entry) continue
        const blob = await entry.async('blob')
        totalBytes += blob.size
        if (totalBytes > MAX_UNCOMPRESSED_BYTES) throw new Error('expanded-too-large')
        stagedAttachments.push({ attachment, blob })
      }

      const sectionIds = new Map<string, string>()
      for (const section of plan.sections) {
        const parentId = section.parentKey ? sectionIds.get(section.parentKey) ?? null : null
        const id = addNode(parentId, section.title, false)
        sectionIds.set(section.key, id)
        createdCount += 1
      }
      for (const note of plan.notes) {
        const nodeId = sectionIds.get(note.sectionKey)
        if (!nodeId) continue
        await dbPutNote({ nodeId, html: note.html, updatedAt: Date.now() })
        createdCount += 1
      }

      for (const { attachment, blob } of stagedAttachments) {
        const nodeId = sectionIds.get(attachment.sectionKey)
        if (!nodeId) continue
        const file = new File([blob], attachment.name, { type: mimeTypeFor(attachment.extension) })
        add({ nodeId, name: file.name, kind: fileKind(attachment.extension), size: file.size, file, url: URL.createObjectURL(file) })
        createdCount += 1
      }
      setStatus(`${t.ready} (${createdCount})`)
      setPlan(null)
      setSelectedFile(null)
    } catch (reason) {
      setError(reason instanceof Error && reason.message === 'expanded-too-large' ? t.expandedTooLarge : t.partial)
    } finally { setBusy(false) }
  }

  return <section className="desk-notion-import" aria-labelledby="notion-import-title">
    <header><h2 id="notion-import-title">{t.title}</h2><p>{t.description}</p></header>
    <input ref={inputRef} hidden type="file" accept=".zip,application/zip" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; void chooseFile(file) }} />
    <button type="button" className="desk-button" disabled={busy} onClick={() => inputRef.current?.click()}>{busy ? (plan ? t.adding : t.processing) : t.select}</button>
    {error && <p className="desk-notion-import-error" role="alert">{error}</p>}
    {status && <p className="desk-notion-import-status" role="status">{status}</p>}
    {plan && selectedFile && <div className="desk-notion-import-preview" dir={locale === 'ar' ? 'rtl' : 'ltr'}>
      <h3>{t.preview}</h3>
      <p><strong>{t.file}:</strong> <span dir="auto">{selectedFile.name}</span></p>
      <dl>
        <div><dt>{t.sections}</dt><dd>{plan.sections.length}</dd></div>
        <div><dt>{t.notes}</dt><dd>{plan.notes.length}</dd></div>
        <div><dt>{t.csv}</dt><dd>{plan.notes.filter(note => plan.sections.find(section => section.key === note.sectionKey)?.key.startsWith('csv:')).length}</dd></div>
        <div><dt>{t.attachments}</dt><dd>{plan.attachments.length}</dd></div>
      </dl>
      <p className="desk-notion-import-additive">{t.filesKept}</p>
      {plan.warnings.length > 0 && <div className="desk-notion-import-warnings"><strong>{t.warnings}</strong><ul>{plan.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul></div>}
      <div className="desk-notion-import-actions">
        <button type="button" className="desk-button desk-button-primary" disabled={busy} onClick={() => void addToLibrary()}>{busy ? t.adding : t.add}</button>
        <button type="button" className="desk-button" disabled={busy} onClick={() => { setPlan(null); setSelectedFile(null); setError('') }}>{t.cancel}</button>
      </div>
    </div>}
  </section>
}
