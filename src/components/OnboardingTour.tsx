import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, ArrowRight, X } from 'lucide-react'
import { tr, useLocale } from '../lib/i18n'

const TOUR_STORAGE_KEY = 'atelier-onboarding-v1'

interface TourStep {
  selector: string
  fallback: string
  title: { en: string; ar: string }
  description: { en: string; ar: string }
}

interface TourGeometry {
  left: number
  top: number
  width: number
  height: number
  tooltipLeft: number
  tooltipTop: number
  lineX1: number
  lineY1: number
  lineX2: number
  lineY2: number
}

const STEPS: readonly TourStep[] = [
  {
    selector: '[data-tour="tree-categories"]',
    fallback: '[data-tour="tree-categories"]',
    title: { en: 'Your category tree', ar: 'شجرة الأقسام' },
    description: {
      en: 'Organize Quran study, science, languages, revision, or any subject you choose.',
      ar: 'نظّم أقساماً لدراسة القرآن والعلوم واللغات والمراجعة أو أي مادة تختارها.',
    },
  },
  {
    selector: '[data-tour="note-canvas"]',
    fallback: '[data-tour="tree-categories"]',
    title: { en: 'A flexible note canvas', ar: 'مساحة ملاحظات مرنة' },
    description: {
      en: 'Open a category to write rich notes, add color accents, and arrange content in two or three columns.',
      ar: 'افتح قسماً لكتابة ملاحظات منسقة وإضافة ألوان وترتيب المحتوى في عمودين أو ثلاثة.',
    },
  },
  {
    selector: '[data-tour="ai-assistant"]',
    fallback: '[data-tour="tree-categories"]',
    title: { en: 'Your study companion', ar: 'رفيق الدراسة' },
    description: {
      en: 'Inside a section, ask for a summary, a review quiz, or an answer based on the notes you choose.',
      ar: 'داخل القسم، اطلب ملخصاً أو اختبار مراجعة أو إجابة مستندة إلى الملاحظات التي تختارها.',
    },
  },
  {
    selector: '[data-tour="settings"]',
    fallback: '[data-tour="settings"]',
    title: { en: 'Make it yours', ar: 'خصّص تجربتك' },
    description: {
      en: 'Choose a visual theme, tune your tools, switch languages, and open the support hub from Settings.',
      ar: 'اختر سمة بصرية واضبط الأدوات وبدّل اللغة وافتح مركز الدعم من الإعدادات.',
    },
  },
  {
    selector: '[data-tour="account"]',
    fallback: '[data-tour="account"]',
    title: { en: 'Your account', ar: 'حسابك' },
    description: {
      en: 'Sign in with Google when you want to create a shared workspace or send a support message.',
      ar: 'سجّل الدخول بحساب Google عندما تريد إنشاء مساحة مشتركة أو إرسال رسالة دعم.',
    },
  },
]

function wasCompleted(): boolean {
  try {
    return window.localStorage.getItem(TOUR_STORAGE_KEY) === 'completed'
  } catch {
    return false
  }
}

function saveCompletion(): void {
  try {
    window.localStorage.setItem(TOUR_STORAGE_KEY, 'completed')
  } catch {
    // يبقى الإكمال محفوظاً في حالة المكوّن لهذه الجلسة.
  }
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

export default function OnboardingTour() {
  const locale = useLocale()
  const [visible, setVisible] = useState(() => typeof window !== 'undefined' && !wasCompleted())
  const [stepIndex, setStepIndex] = useState(0)
  const [geometry, setGeometry] = useState<TourGeometry | null>(null)
  const step = STEPS[stepIndex]
  const isLastStep = stepIndex === STEPS.length - 1

  const finish = useCallback(() => {
    saveCompletion()
    setVisible(false)
  }, [])

  const updateGeometry = useCallback(() => {
    if (!visible || typeof window === 'undefined') return
    const target = document.querySelector<HTMLElement>(step.selector) ?? document.querySelector<HTMLElement>(step.fallback)
    if (!target) {
      setGeometry(null)
      return
    }

    const rect = target.getBoundingClientRect()
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight
    const tooltipWidth = Math.min(368, Math.max(250, viewportWidth - 32))
    const tooltipHeight = 218
    const placeBelow = rect.bottom + tooltipHeight + 26 <= viewportHeight
    const tooltipTop = placeBelow ? rect.bottom + 16 : Math.max(16, rect.top - tooltipHeight - 16)
    const tooltipLeft = clamp(rect.left + rect.width / 2 - tooltipWidth / 2, 16, viewportWidth - tooltipWidth - 16)
    const lineX1 = rect.left + rect.width / 2
    const lineY1 = placeBelow ? rect.bottom : rect.top
    const lineX2 = tooltipLeft + tooltipWidth / 2
    const lineY2 = placeBelow ? tooltipTop : tooltipTop + tooltipHeight

    setGeometry({
      left: Math.max(4, rect.left - 5),
      top: Math.max(4, rect.top - 5),
      width: rect.width + 10,
      height: rect.height + 10,
      tooltipLeft,
      tooltipTop,
      lineX1,
      lineY1,
      lineX2,
      lineY2,
    })
  }, [step.fallback, step.selector, visible])

  useEffect(() => {
    if (!visible) return undefined
    const timer = window.setTimeout(updateGeometry, 100)
    const observer = new MutationObserver(updateGeometry)
    observer.observe(document.body, { childList: true, subtree: true, attributes: true })
    window.addEventListener('resize', updateGeometry)
    window.addEventListener('scroll', updateGeometry, true)
    return () => {
      window.clearTimeout(timer)
      observer.disconnect()
      window.removeEventListener('resize', updateGeometry)
      window.removeEventListener('scroll', updateGeometry, true)
    }
  }, [stepIndex, updateGeometry, visible])

  useEffect(() => {
    if (!visible) return undefined
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') finish()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [finish, visible])

  if (!visible || !step) return null

  const next = (): void => {
    if (isLastStep) finish()
    else setStepIndex(index => index + 1)
  }

  const PreviousIcon = locale === 'ar' ? ArrowRight : ArrowLeft
  const NextIcon = locale === 'ar' ? ArrowLeft : ArrowRight

  return (
    <div className="pointer-events-none fixed inset-0 z-[4000]" aria-live="polite">
      {geometry && (
        <>
          <svg className="pointer-events-none fixed inset-0 h-full w-full" aria-hidden="true">
            <line x1={geometry.lineX1} y1={geometry.lineY1} x2={geometry.lineX2} y2={geometry.lineY2} stroke="rgba(221,199,255,.8)" strokeWidth="1.5" strokeDasharray="4 5" />
            <circle cx={geometry.lineX1} cy={geometry.lineY1} r="3" fill="#e8d7ff" />
          </svg>
          <div
            aria-hidden="true"
            className="pointer-events-none fixed rounded-xl border-2 border-violet-200/90 transition-all duration-200"
            style={{
              left: geometry.left,
              top: geometry.top,
              width: geometry.width,
              height: geometry.height,
              boxShadow: '0 0 0 9999px rgba(3, 5, 14, .76), 0 0 28px rgba(191, 156, 255, .42)',
            }}
          />
          <section
            role="dialog"
            aria-modal="false"
            aria-labelledby="tour-step-title"
            className="pointer-events-auto fixed w-[min(368px,calc(100vw-32px))] rounded-2xl border border-violet-200/20 bg-[#11121c]/95 p-4 shadow-2xl shadow-black/50 backdrop-blur-xl"
            style={{ left: geometry.tooltipLeft, top: geometry.tooltipTop }}
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-violet-200/70">
                  {tr(locale, `Guide ${stepIndex + 1} of ${STEPS.length}`, `دليل ${stepIndex + 1} من ${STEPS.length}`)}
                </p>
                <h2 id="tour-step-title" className="mt-1 text-base font-semibold text-white">{step.title[locale]}</h2>
              </div>
              <button
                type="button"
                onClick={finish}
                className="flex shrink-0 items-center gap-1 rounded-lg border border-rose-200/20 bg-rose-200/10 px-2.5 py-1.5 text-xs font-semibold text-rose-100 transition hover:bg-rose-200/20"
              >
                <X size={13} />{tr(locale, 'Skip tour', 'تخطَّ الجولة')}
              </button>
            </div>
            <p className="text-sm leading-6 text-white/75">{step.description[locale]}</p>
            <div className="mt-4 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setStepIndex(index => Math.max(0, index - 1))}
                disabled={stepIndex === 0}
                className="flex items-center gap-1 rounded-lg px-2.5 py-2 text-xs text-white/65 transition hover:bg-white/10 disabled:invisible"
              >
                <PreviousIcon size={14} />{tr(locale, 'Back', 'السابق')}
              </button>
              <button
                type="button"
                onClick={next}
                className="flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-semibold text-slate-950 transition active:scale-95"
                style={{ background: 'var(--accent)' }}
              >
                {tr(locale, isLastStep ? 'Finish' : 'Next', isLastStep ? 'إنهاء' : 'التالي')}<NextIcon size={14} />
              </button>
            </div>
          </section>
        </>
      )}
      {!geometry && (
        <div className="pointer-events-auto fixed inset-x-4 top-4 flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-[#11121c]/95 p-3 text-sm shadow-xl">
          <span>{step.title[locale]}</span>
          <button type="button" onClick={finish} className="flex items-center gap-1 rounded-lg bg-rose-200/10 px-3 py-2 text-xs text-rose-100">
            <X size={13} />{tr(locale, 'Skip tour', 'تخطَّ الجولة')}
          </button>
        </div>
      )}
    </div>
  )
}
