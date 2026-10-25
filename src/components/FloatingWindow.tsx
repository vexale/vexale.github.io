import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent as RPointerEvent, ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import { ChevronUp, Maximize2, Minimize2, Minus, X } from 'lucide-react'
import { sfx } from '../shared'
import { useSettings } from '../lib/settings'
import { ACCENT } from './toolkit'

/* ============ الأنواع ============ */
export interface WinRect {
  x: number // المسافة من يسار الشاشة (بكسل)
  y: number // المسافة من أعلى الشاشة
  w: number // العرض
  h: number // الارتفاع
}

interface Props {
  title: string
  icon?: ReactNode
  initial: WinRect                          // الموضع والحجم عند الفتح (يُستخدم مرة واحدة)
  minimized: boolean                        // الحالة يملكها الأب لتُستعاد عند النقر على أيقونة الأداة
  onMinimizeChange: (m: boolean) => void
  onClose: () => void
  onFocus: () => void                       // يرفع النافذة فوق غيرها
  zIndex: number
  children: ReactNode
}

const MIN_W = 280
const MIN_H = 180

// يحافظ على ظهور النافذة كاملةً داخل مساحة العرض مع ترك هامش آمن حولها
function clampRect(r: WinRect): WinRect {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const availableWidth = Math.max(1, vw - 16)
  const availableHeight = Math.max(1, vh - 72)
  const w = Math.min(Math.max(r.w, Math.min(MIN_W, availableWidth)), availableWidth)
  const h = Math.min(Math.max(r.h, Math.min(MIN_H, availableHeight)), availableHeight)
  const x = Math.min(Math.max(r.x, 8), Math.max(8, vw - w - 8))
  const y = Math.min(Math.max(r.y, 64), Math.max(64, vh - h - 8))
  return { x, y, w, h }
}

interface Gesture {
  px: number // موضع المؤشر عند البداية
  py: number
  r: WinRect // حالة النافذة عند البداية
}

export default function FloatingWindow({ title, icon, initial, minimized, onMinimizeChange, onClose, onFocus, zIndex, children }: Props) {
  const { windowStyle } = useSettings()
  const solid = windowStyle === 'solid'
  const [rect, setRect] = useState<WinRect>(() => clampRect(initial))
  const [maximized, setMaximized] = useState<boolean>(() => window.innerWidth < 640)
  const dragRef = useRef<Gesture | null>(null)
  const resizeRef = useRef<Gesture | null>(null)
  const rectFrameRef = useRef<number | null>(null)
  const pendingRectRef = useRef<WinRect | null>(null)

  const scheduleRect = (nextRect: WinRect): void => {
    pendingRectRef.current = nextRect
    if (rectFrameRef.current !== null) return
    rectFrameRef.current = window.requestAnimationFrame(() => {
      rectFrameRef.current = null
      const pendingRect = pendingRectRef.current
      pendingRectRef.current = null
      if (pendingRect) setRect(clampRect(pendingRect))
    })
  }

  // عند تغيّر حجم المتصفح نعيد النافذة إلى داخل الشاشة
  useEffect(() => {
    const onResize = (): void => setRect(r => clampRect(r))
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      if (rectFrameRef.current !== null) window.cancelAnimationFrame(rectFrameRef.current)
      rectFrameRef.current = null
      pendingRectRef.current = null
    }
  }, [])

  /* ---------- السحب من شريط العنوان ---------- */
  const startDrag = (e: RPointerEvent<HTMLDivElement>): void => {
    if (maximized) return
    if ((e.target as HTMLElement).closest('button')) return // لا نسحب عند النقر على الأزرار
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = { px: e.clientX, py: e.clientY, r: rect }
  }
  const moveDrag = (e: RPointerEvent<HTMLDivElement>): void => {
    const d = dragRef.current
    if (!d) return
    scheduleRect({ ...d.r, x: d.r.x + e.clientX - d.px, y: d.r.y + e.clientY - d.py })
  }
  const endDrag = (): void => { dragRef.current = null }

  /* ---------- التحجيم من مقبض الزاوية ---------- */
  const startResize = (e: RPointerEvent<HTMLDivElement>): void => {
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    resizeRef.current = { px: e.clientX, py: e.clientY, r: rect }
  }
  const moveResize = (e: RPointerEvent<HTMLDivElement>): void => {
    const d = resizeRef.current
    if (!d) return
    scheduleRect({ ...d.r, w: d.r.w + e.clientX - d.px, h: d.r.h + e.clientY - d.py })
  }
  const endResize = (): void => { resizeRef.current = null }

  const toggleMax = (): void => { sfx.click(); setMaximized(m => !m) }

  const frame: CSSProperties = maximized
    ? { left: 8, top: 64, width: 'calc(100vw - 16px)', height: minimized ? 'auto' : 'calc(100dvh - 72px)' }
    : { left: rect.x, top: rect.y, width: rect.w, height: minimized ? 'auto' : rect.h }

  // الوضع العاتم: خلفية داكنة معتمة تحجب أي تشويش، مع إبقاء الحدود والظل كما هما
  const solidStyle: CSSProperties = solid
    ? { background: '#0d1117', backdropFilter: 'none', WebkitBackdropFilter: 'none' }
    : {}

  const ctl = 'flex h-7 w-7 items-center justify-center rounded-md transition hover:bg-white/15 active:scale-90'

  // نرسم في document.body حتى لا تتأثر النافذة بأي عنصر أب (تحويلات أو تمرير)
  return createPortal(
    <motion.div
      role="dialog"
      aria-label={title}
      dir="rtl"
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.18 }}
      onPointerDown={onFocus}
      className="glass-strong ui-floating-window fixed flex min-w-0 flex-col overflow-hidden rounded-xl"
      style={{ ...frame, ...solidStyle, zIndex }}
    >
      {/* شريط العنوان: مقبض السحب */}
      <div
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDoubleClick={toggleMax}
        className={`flex shrink-0 touch-none select-none items-center justify-between gap-2 border-b border-white/10 px-3 py-1.5 ${
          maximized ? '' : 'cursor-grab active:cursor-grabbing'
        }`}
      >
        <h2 className="flex min-w-0 items-center gap-2 text-sm font-semibold" style={{ color: ACCENT }}>
          {icon}
          <span className="truncate">{title}</span>
        </h2>
        <div className="flex shrink-0 items-center gap-1">
          <button
            className={ctl}
            aria-label={minimized ? 'استعادة' : 'تصغير'}
            title={minimized ? 'استعادة' : 'تصغير'}
            onClick={() => { sfx.click(); onMinimizeChange(!minimized) }}
          >
            {minimized ? <ChevronUp size={15} /> : <Minus size={15} />}
          </button>
          <button
            className={ctl}
            aria-label={maximized ? 'استعادة الحجم' : 'تكبير'}
            title={maximized ? 'استعادة الحجم' : 'تكبير'}
            onClick={toggleMax}
          >
            {maximized ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
          <button
            className={`${ctl} hover:!bg-red-500/40`}
            aria-label="إغلاق"
            title="إغلاق"
            onClick={() => { sfx.close(); onClose() }}
          >
            <X size={15} />
          </button>
        </div>
      </div>

      {/* المحتوى: يبقى مُركَّباً أثناء التصغير حتى لا تضيع حالة الأداة */}
      <div className={minimized ? 'hidden' : 'min-h-0 min-w-0 flex-1 overflow-auto p-3'}>{children}</div>

      {/* مقبض التحجيم (الزاوية السفلية اليمنى) */}
      {!maximized && !minimized && (
        <div
          aria-label="تغيير الحجم"
          onPointerDown={startResize}
          onPointerMove={moveResize}
          onPointerUp={endResize}
          onPointerCancel={endResize}
          className="absolute bottom-0 right-0 z-10 flex h-11 w-11 cursor-nwse-resize touch-none items-end justify-end p-2 sm:h-5 sm:w-5 sm:p-0.5"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
            <path d="M11 1 1 11M11 6 6 11" stroke="rgba(255,255,255,.45)" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </div>
      )}
    </motion.div>,
    document.body,
  )
}
