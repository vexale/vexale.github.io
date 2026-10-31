import type { TNode } from '../shared'
import type { TaskRecord, TaskStatus } from '../modes/desktop/taskStore'

export type ExportLocale = 'en' | 'ar'
export type ExportFile = { nodeId: string; name: string }

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? character)
}

function plainTextFromHtml(html: string): string {
  const document = new DOMParser().parseFromString(html, 'text/html')
  const read = (node: Node): string => {
    if (node.nodeType === 3) return node.nodeValue ?? ''
    if (node.nodeType !== 1) return ''
    const element = node as HTMLElement
    if (element.tagName === 'BR') return '\n'
    const content = Array.from(element.childNodes, read).join('')
    return /^(P|DIV|LI|H[1-6]|BLOCKQUOTE|PRE)$/.test(element.tagName) ? `${content}\n\n` : content
  }
  return read(document.body).replace(/[\t ]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

export function sectionToMarkdown(root: TNode, notes: Record<string, string>, files: ExportFile[], filesLabel = 'Files'): string {
  const lines: string[] = []
  const append = (node: TNode, depth: number): void => {
    lines.push(`${'#'.repeat(Math.min(depth + 1, 6))} ${node.title}`)
    const note = notes[node.id] ? plainTextFromHtml(notes[node.id]) : ''
    if (note) lines.push(note)
    const attachedFiles = files.filter(file => file.nodeId === node.id)
    if (attachedFiles.length) lines.push(`${filesLabel}\n${attachedFiles.map(file => `- ${file.name}`).join('\n')}`)
    node.children.forEach(child => append(child, depth + 1))
  }
  append(root, 0)
  return lines.join('\n\n')
}

function sectionPrintNode(node: TNode, depth: number, notes: Record<string, string>, files: ExportFile[], filesLabel: string): string {
  const level = Math.min(depth + 1, 6)
  const title = escapeHtml(node.title)
  const heading = depth === 0 ? '' : `<h${level}>${title}</h${level}>`
  const note = notes[node.id] ? plainTextFromHtml(notes[node.id]) : ''
  const noteHtml = note ? note.split(/\n{2,}/).map(paragraph => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>`).join('') : ''
  const attachedFiles = files.filter(file => file.nodeId === node.id)
  const filesHtml = attachedFiles.length
    ? `<p><strong>${escapeHtml(filesLabel)}</strong></p><ul class="file-list">${attachedFiles.map(file => `<li>${escapeHtml(file.name)}</li>`).join('')}</ul>`
    : ''
  const children = node.children.map(child => sectionPrintNode(child, depth + 1, notes, files, filesLabel)).join('')
  return `<section class="section-block">${heading}${noteHtml}${filesHtml}${children}</section>`
}

export function sectionToPrintHtml(root: TNode, notes: Record<string, string>, files: ExportFile[], filesLabel = 'Files'): string {
  return sectionPrintNode(root, 0, notes, files, filesLabel)
}

export function createStandaloneHtml(title: string, content: string, locale: ExportLocale): string {
  const direction = locale === 'ar' ? 'rtl' : 'ltr'
  return `<!doctype html><html lang="${locale}" dir="${direction}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>
    :root { color-scheme: light; } * { box-sizing: border-box; } body { max-width: 920px; margin: 0 auto; padding: 32px 22px; color: #202124; background: #fff; font-family: system-ui, "Noto Sans Arabic", sans-serif; line-height: 1.65; overflow-wrap: anywhere; } h1 { margin: 0 0 26px; padding-block-end: 12px; border-bottom: 2px solid #d7d9df; font-size: 2rem; line-height: 1.25; } h2, h3, h4, h5, h6 { margin-block: 1.2em .4em; line-height: 1.35; } p { white-space: pre-wrap; } .section-block { margin-block: 14px; } .file-list, .task-list { margin: 6px 0 14px; padding-inline-start: 1.5em; } .file-list li, .task-list li { margin-block: 4px; } .task-row { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px 10px; } .task-check { width: 1.2em; text-align: center; } .task-status, .task-due { color: #5f6368; font-size: .9em; } @media (max-width: 600px) { body { padding: 22px 15px; } h1 { font-size: 1.65rem; } }
  </style></head><body><main><h1>${escapeHtml(title)}</h1>${content}</main></body></html>`
}

export function taskTreeToMarkdown(tasks: TaskRecord[], statusLabels: Record<TaskStatus, string>, dueDateLabel: string): string {
  const lines: string[] = []
  const append = (parentId: string | null, depth: number): void => {
    const siblings = tasks.filter(task => task.parentId === parentId).sort((a, b) => a.order - b.order)
    for (const task of siblings) {
      const due = task.dueDate ? ` — ${dueDateLabel}: ${task.dueDate}` : ''
      lines.push(`${'  '.repeat(depth)}- [${task.status === 'done' ? 'x' : ' '}] ${task.title} (${statusLabels[task.status]})${due}`)
      append(task.id, depth + 1)
    }
  }
  append(null, 0)
  return lines.join('\n')
}

export function taskTreeToPrintHtml(tasks: TaskRecord[], statusLabels: Record<TaskStatus, string>, dueDateLabel: string): string {
  const render = (parentId: string | null): string => {
    const siblings = tasks.filter(task => task.parentId === parentId).sort((a, b) => a.order - b.order)
    if (!siblings.length) return ''
    return `<ul class="task-list">${siblings.map(task => {
      const due = task.dueDate ? `<span class="task-due">${escapeHtml(dueDateLabel)}: ${escapeHtml(task.dueDate)}</span>` : ''
      return `<li><div class="task-row"><span class="task-check">${task.status === 'done' ? '✓' : '○'}</span><strong>${escapeHtml(task.title)}</strong><span class="task-status">${escapeHtml(statusLabels[task.status])}</span>${due}</div>${render(task.id)}</li>`
    }).join('')}</ul>`
  }
  return render(null)
}

export function createPrintWindow(): Window | null {
  const printWindow = window.open('', '_blank')
  if (printWindow) printWindow.opener = null
  return printWindow
}

export function renderPrintView(printWindow: Window, title: string, content: string, locale: ExportLocale): void {
  let printed = false
  const print = (): void => {
    if (printed || printWindow.closed) return
    printed = true
    printWindow.focus()
    printWindow.print()
  }
  printWindow.addEventListener('load', print, { once: true })
  printWindow.document.open()
  printWindow.document.write(`<!doctype html><html lang="${locale}" dir="${locale === 'ar' ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>
    @page { margin: 18mm; }
    * { box-sizing: border-box; }
    html { background: #fff; color: #171717; font-family: Arial, "Noto Sans Arabic", sans-serif; }
    body { max-width: 900px; margin: 0 auto; padding: 22px; font-size: 12pt; line-height: 1.6; overflow-wrap: anywhere; }
    h1 { margin: 0 0 22px; padding-block-end: 10px; border-bottom: 2px solid #333; font-size: 25pt; line-height: 1.25; }
    h2, h3, h4, h5, h6 { margin: 1.1em 0 .4em; font-size: 16pt; break-after: avoid; }
    p { margin: .4em 0 .8em; white-space: pre-wrap; }
    .section-block { margin-block: 12px; }
    .file-list, .task-list { margin: 5px 0 10px; padding-inline-start: 1.5em; }
    .file-list li, .task-list li { margin-block: 4px; }
    .task-row { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px 10px; }
    .task-check { width: 1.2em; text-align: center; }
    .task-status, .task-due { color: #444; font-size: 10pt; }
    @media screen { body { margin: 24px auto; } }
    @media print { body { max-width: none; padding: 0; } }
  </style></head><body><main><h1>${escapeHtml(title)}</h1>${content}</main></body></html>`)
  printWindow.document.close()
  printWindow.setTimeout(print, 300)
}

export function openPrintView(title: string, content: string, locale: ExportLocale): boolean {
  const printWindow = createPrintWindow()
  if (!printWindow) return false
  renderPrintView(printWindow, title, content, locale)
  return true
}

export function downloadTextFile(name: string, content: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: mime }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '')
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}
