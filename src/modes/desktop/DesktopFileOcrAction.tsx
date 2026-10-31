import { useEffect, useRef, useState } from 'react'
import { FileText } from 'lucide-react'
import { dbPutOcr } from '../../db'
import type { Item } from '../../shared'
import { useDesktopMessages } from './i18n'
import type { OcrProgress } from '../../lib/localOcr'

interface Props {
  item: Item
  busyItemId: string | null
  saved: boolean
  onSaved: (id: string, text: string) => void
  onBusyChange: (id: string | null) => void
}

type ResultState = 'idle' | 'running' | 'saved' | 'empty' | 'cancelled' | 'failed'

export default function DesktopFileOcrAction({ item, busyItemId, saved, onSaved, onBusyChange }: Props) {
  const messages = useDesktopMessages().files
  const isPdf = item.file?.type === 'application/pdf' || item.name.toLowerCase().endsWith('.pdf')
  const isSupported = Boolean(item.file) && (item.kind === 'image' || isPdf)
  const [resultState, setResultState] = useState<ResultState>('idle')
  const [progress, setProgress] = useState<OcrProgress | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const isRunning = busyItemId === item.id
  const anotherFileBusy = busyItemId !== null && !isRunning

  useEffect(() => () => abortRef.current?.abort(), [])

  if (!isSupported) return null

  const run = async () => {
    const file = item.file
    if (!file || busyItemId !== null) return
    const controller = new AbortController()
    abortRef.current = controller
    onBusyChange(item.id)
    setResultState('running')
    setProgress({ phase: 'engine', progress: 0 })

    try {
      const { extractLocalOcr } = await import('../../lib/localOcr')
      const text = await extractLocalOcr(file, setProgress, controller.signal)
      if (text) {
        await dbPutOcr(item.id, text)
        onSaved(item.id, text)
      }
      setResultState(text ? 'saved' : 'empty')
    } catch {
      setResultState(controller.signal.aborted ? 'cancelled' : 'failed')
    } finally {
      abortRef.current = null
      setProgress(null)
      onBusyChange(null)
    }
  }

  const cancel = () => abortRef.current?.abort()
  const pageLabel = progress?.page && progress.pages
    ? messages.ocrPage.replace('{page}', String(progress.page)).replace('{pages}', String(progress.pages))
    : ''
  const progressLabel = progress?.phase === 'language'
    ? messages.ocrLoadingLanguage
    : progress?.phase === 'render'
      ? `${messages.ocrRendering} ${pageLabel}`
      : progress?.phase === 'recognize' && (progress.pages ?? 1) > 1
        ? `${messages.ocrRecognizing} ${pageLabel}`
        : progress?.phase === 'recognize'
          ? messages.ocrRecognizing
          : messages.ocrPreparing
  const statusText = resultState === 'saved' || (resultState === 'idle' && saved)
    ? messages.ocrSaved
    : resultState === 'empty'
      ? messages.ocrNoText
      : resultState === 'cancelled'
        ? messages.ocrCancelled
        : resultState === 'failed'
          ? messages.ocrFailed
          : ''

  return (
    <div className="desk-file-ocr" aria-busy={isRunning}>
      <button
        type="button"
        className="desk-button desk-file-ocr-button"
        disabled={anotherFileBusy}
        aria-label={`${isRunning ? messages.ocrCancel : saved ? messages.ocrAgain : messages.ocrAction}: ${item.name}`}
        onClick={isRunning ? cancel : () => { void run() }}
      >
        <FileText size={15} aria-hidden="true" />
        <span>{isRunning ? messages.ocrCancel : saved ? messages.ocrAgain : messages.ocrAction}</span>
      </button>
      {isRunning && progress && (
        <div className="desk-file-ocr-progress" role="status">
          <progress value={Math.round(progress.progress * 100)} max="100" aria-label={progressLabel} />
          <span>{progressLabel} {Math.round(progress.progress * 100)}%</span>
        </div>
      )}
      {statusText && !isRunning && <p className="desk-file-ocr-status" role="status">{statusText}</p>}
    </div>
  )
}
