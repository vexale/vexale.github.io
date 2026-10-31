import tesseractWorkerUrl from 'tesseract.js/dist/worker.min.js?url'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

export type OcrPhase = 'engine' | 'language' | 'render' | 'recognize'

export interface OcrProgress {
  phase: OcrPhase
  progress: number
  page?: number
  pages?: number
}

function withAbort<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new DOMException('OCR cancelled', 'AbortError'))
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      signal.removeEventListener('abort', onAbort)
      reject(new DOMException('OCR cancelled', 'AbortError'))
    }
    signal.addEventListener('abort', onAbort, { once: true })
    work.then(
      value => { signal.removeEventListener('abort', onAbort); resolve(value) },
      error => { signal.removeEventListener('abort', onAbort); reject(error) },
    )
  })
}

export async function extractLocalOcr(
  file: File,
  onProgress: (progress: OcrProgress) => void,
  signal: AbortSignal,
): Promise<string> {
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
  const { createWorker } = await import('tesseract.js')
  let page = 1
  let pages = 1
  let activeRenderCancel: (() => void) | undefined
  let activePdfDestroy: (() => void) | undefined
  let workerTerminated = false

  const worker = await createWorker('ara', 1, {
    workerPath: tesseractWorkerUrl,
    workerBlobURL: false,
    logger: ({ progress, status }) => {
      if (signal.aborted) return
      const phase: OcrPhase = status.includes('traineddata') || status.includes('language')
        ? 'language'
        : status.includes('recognizing')
          ? 'recognize'
          : 'engine'
      const fraction = Math.max(0, Math.min(1, progress || 0))
      const overall = phase === 'recognize'
        ? 0.1 + 0.9 * ((page - 1 + fraction) / pages)
        : Math.min(0.1, fraction * 0.1)
      onProgress({ phase, progress: overall, page, pages })
    },
  })

  const terminateWorker = async () => {
    if (workerTerminated) return
    workerTerminated = true
    await worker.terminate()
  }
  const onAbort = () => {
    activeRenderCancel?.()
    activePdfDestroy?.()
    void terminateWorker()
  }
  signal.addEventListener('abort', onAbort, { once: true })

  try {
    if (signal.aborted) throw new DOMException('OCR cancelled', 'AbortError')

    if (!isPdf) {
      const result = await withAbort(worker.recognize(file), signal)
      if (signal.aborted) throw new DOMException('OCR cancelled', 'AbortError')
      return result.data.text.trim()
    }

    const pdfjs = await import('pdfjs-dist')
    if (signal.aborted) throw new DOMException('OCR cancelled', 'AbortError')
    pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl
    const bytes = await withAbort(file.arrayBuffer(), signal)
    const loadingTask = pdfjs.getDocument({ data: new Uint8Array(bytes) })
    let destroyPromise: Promise<void> | undefined
    const destroyLoadingTask = () => (destroyPromise ??= loadingTask.destroy())
    activePdfDestroy = () => { void destroyLoadingTask() }

    try {
      const document = await withAbort(loadingTask.promise, signal)
      pages = document.numPages
      const text: string[] = []

      for (page = 1; page <= pages; page += 1) {
        if (signal.aborted) throw new DOMException('OCR cancelled', 'AbortError')
        onProgress({ phase: 'render', progress: 0.1 + 0.9 * ((page - 1) / pages), page, pages })

        const pdfPage = await withAbort(document.getPage(page), signal)
        if (signal.aborted) throw new DOMException('OCR cancelled', 'AbortError')
        const baseViewport = pdfPage.getViewport({ scale: 1 })
        const scale = Math.min(1.6, 4096 / Math.max(baseViewport.width, baseViewport.height))
        const viewport = pdfPage.getViewport({ scale })
        const canvas = window.document.createElement('canvas')
        canvas.width = Math.ceil(viewport.width)
        canvas.height = Math.ceil(viewport.height)
        const context = canvas.getContext('2d', { willReadFrequently: true })
        if (!context) throw new Error('Canvas is unavailable')

        const renderTask = pdfPage.render({ canvasContext: context, viewport })
        activeRenderCancel = () => renderTask.cancel()
        await withAbort(renderTask.promise, signal)
        activeRenderCancel = undefined
        if (signal.aborted) throw new DOMException('OCR cancelled', 'AbortError')

        const result = await withAbort(worker.recognize(canvas), signal)
        text.push(result.data.text.trim())
        canvas.width = 0
        canvas.height = 0
        pdfPage.cleanup()
        onProgress({ phase: 'recognize', progress: 0.1 + 0.9 * (page / pages), page, pages })
      }

      return text.filter(Boolean).join('\n\n')
    } finally {
      activeRenderCancel = undefined
      activePdfDestroy = undefined
      await destroyLoadingTask()
    }
  } finally {
    signal.removeEventListener('abort', onAbort)
    activeRenderCancel?.()
    await terminateWorker()
  }
}
