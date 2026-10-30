import { useRef, useState } from 'react'
import { BookOpen, CalendarDays, Check, ChevronLeft, ChevronRight, FileText, GraduationCap, Languages, Monitor, Palette, Sparkles } from 'lucide-react'
import type { CSSProperties } from 'react'
import type { LucideIcon } from 'lucide-react'
import { setLocale, useLocale } from '../lib/i18n'
import type { Locale } from '../lib/i18n'
import { updateSettings, useSettings } from '../lib/settings'
import type { ThemeId } from '../lib/settings'
import { useTree } from '../shared'
import { updateDesktopPreferences, useDesktopPreferences } from '../modes/desktop/preferences'
import type { DesktopTheme } from '../modes/desktop/preferences'
import { DESKTOP_THEME_COLORS, DESKTOP_THEMES } from '../modes/desktop/themeCatalog'
import { createTask, MAX_TASK_COUNT, useTaskTreeStore } from '../modes/desktop/taskStore'
import { countStarterTasks, FIRST_RUN_COPY, SETUP_TEMPLATES, SPACE_THEME_CHOICES } from './firstRunCatalog'
import type { SetupMode, SetupTemplateId, StarterTask } from './firstRunCatalog'
import './FirstRunSetup.css'

const STEPS: readonly LucideIcon[] = [Languages, Monitor, Palette, BookOpen]
type SetupStep = 0 | 1 | 2 | 3
const TEMPLATE_ICONS: Record<SetupTemplateId, LucideIcon> = {
  semester: CalendarDays,
  'exam-week': FileText,
  graduation: GraduationCap,
  blank: Sparkles,
}

interface FirstRunSetupProps {
  initialMode: SetupMode
  onComplete: (mode: SetupMode) => void
  onSkip: () => void
}

function addTaskBranch(seed: StarterTask, parentId: string | null, locale: Locale): boolean {
  const id = createTask(parentId, seed.title[locale])
  if (!id) return false
  for (const child of seed.children ?? []) if (!addTaskBranch(child, id, locale)) return false
  return true
}

export default function FirstRunSetup({ initialMode, onComplete, onSkip }: FirstRunSetupProps) {
  const locale = useLocale()
  const copy = FIRST_RUN_COPY[locale]
  const settings = useSettings()
  const desktopPreferences = useDesktopPreferences()
  const { addNode } = useTree()
  const tasks = useTaskTreeStore()
  const [step, setStep] = useState<SetupStep>(0)
  const [mode, setMode] = useState<SetupMode>(initialMode)
  const [spaceTheme, setSpaceTheme] = useState<ThemeId>(settings.theme)
  const [officeTheme, setOfficeTheme] = useState<DesktopTheme>(desktopPreferences.theme)
  const [templateId, setTemplateId] = useState<SetupTemplateId>('blank')
  const [error, setError] = useState('')
  const submitted = useRef(false)
  const stepNames = [copy.languageStep, copy.modeStep, copy.themeStep, copy.templateStep]
  const themes = mode === 'space'
    ? SPACE_THEME_CHOICES.map(theme => ({ id: theme.id, title: theme.title[locale], swatch: theme.swatch }))
    : DESKTOP_THEMES.map(theme => ({ id: theme.id, title: messagesThemeName(theme.labelKey, locale), swatch: DESKTOP_THEME_COLORS[theme.id][2] ?? '#5b4fe0' }))
  const activeTheme = mode === 'space' ? spaceTheme : officeTheme
  const template = SETUP_TEMPLATES.find(item => item.id === templateId) ?? SETUP_TEMPLATES[SETUP_TEMPLATES.length - 1]!
  const templateTaskCount = countStarterTasks(template.tasks)
  const stepTitle = step === 0 ? copy.languageTitle : step === 1 ? copy.modeTitle : step === 2 ? copy.themeTitle : copy.templateTitle
  const stepDescription = step === 0
    ? copy.languageDescription
    : step === 1
      ? copy.modeDescription
      : step === 2
        ? mode === 'space' ? copy.spaceThemeDescription : copy.officeThemeDescription
        : copy.templateDescription

  const chooseMode = (nextMode: SetupMode): void => {
    setMode(nextMode)
    setError('')
  }
  const selectTheme = (id: string): void => {
    if (mode === 'space') setSpaceTheme(id as ThemeId)
    else setOfficeTheme(id as DesktopTheme)
  }
  const finish = (): void => {
    if (submitted.current) return
    if (tasks.length + templateTaskCount > MAX_TASK_COUNT) { setError(copy.taskLimit); return }
    submitted.current = true
    setError('')
    if (mode === 'space') updateSettings({ theme: spaceTheme })
    else updateDesktopPreferences({ theme: officeTheme })
    if (template.id !== 'blank') {
      template.sections.forEach(section => addNode(null, section[locale]))
      for (const seed of template.tasks) addTaskBranch(seed, null, locale)
    }
    onComplete(mode)
  }

  const iconForStep = (index: number): LucideIcon => STEPS[index] ?? Languages

  return <main className="first-run-setup" lang={locale} dir={locale === 'ar' ? 'rtl' : 'ltr'}>
    <div className="first-run-setup-shell">
      <aside className="first-run-setup-rail" aria-label={copy.eyebrow}>
        <div className="first-run-setup-brand"><span className="first-run-setup-brand-mark" aria-hidden="true">V</span><div><p className="first-run-setup-brand-name">Vexale</p><p className="first-run-setup-brand-copy">{copy.eyebrow}</p></div></div>
        <ol className="first-run-setup-steps" aria-label={copy.title}>{stepNames.map((name, index) => { const Icon = iconForStep(index); return <li key={name} className="first-run-setup-step" aria-current={step === index ? 'step' : undefined}><span className="first-run-setup-step-number">{step > index ? <Check size={13} aria-hidden="true" /> : index + 1}</span><span>{name}</span><Icon size={15} aria-hidden="true" /></li> })}</ol>
        <p className="first-run-setup-rail-note">{copy.description}</p>
      </aside>

      <section className="first-run-setup-main" aria-labelledby="first-run-setup-title">
        <div className="first-run-setup-topline"><p className="first-run-setup-eyebrow">{copy.eyebrow}</p><button type="button" className="first-run-setup-skip" onClick={onSkip}>{copy.skip}</button></div>
        <header className="first-run-setup-heading"><h1 id="first-run-setup-title">{copy.title}</h1><p>{copy.description}</p></header>
        <div className="first-run-setup-panel" aria-live="polite">
          <div className="first-run-setup-heading"><h2>{stepTitle}</h2><p>{stepDescription}</p></div>

          {step === 0 && <div className="first-run-setup-choice-grid first-run-setup-language-grid" role="group" aria-label={copy.languageTitle}>
            <button type="button" className="first-run-setup-choice" aria-pressed={locale === 'en'} onClick={() => setLocale('en')}><span className="first-run-setup-choice-icon"><Languages size={19} aria-hidden="true" /></span><span className="first-run-setup-choice-copy"><strong>{copy.english}</strong><small>English</small></span></button>
            <button type="button" className="first-run-setup-choice" aria-pressed={locale === 'ar'} onClick={() => setLocale('ar')}><span className="first-run-setup-choice-icon"><Languages size={19} aria-hidden="true" /></span><span className="first-run-setup-choice-copy"><strong>{copy.arabic}</strong><small lang="ar" dir="rtl">العربية</small></span></button>
          </div>}

          {step === 1 && <div className="first-run-setup-choice-grid" role="group" aria-label={copy.modeTitle}>
            <button type="button" className="first-run-setup-choice" aria-pressed={mode === 'space'} onClick={() => chooseMode('space')}><span className="first-run-setup-choice-icon"><Sparkles size={19} aria-hidden="true" /></span><span className="first-run-setup-choice-copy"><strong>{copy.spaceTitle}</strong><small>{copy.spaceDescription}</small></span></button>
            <button type="button" className="first-run-setup-choice" aria-pressed={mode === 'office'} onClick={() => chooseMode('office')}><span className="first-run-setup-choice-icon"><Monitor size={19} aria-hidden="true" /></span><span className="first-run-setup-choice-copy"><strong>{copy.officeTitle}</strong><small>{copy.officeDescription}</small></span></button>
          </div>}

          {step === 2 && <div className="first-run-setup-theme-grid" role="group" aria-label={copy.themeTitle}>{themes.map(theme => <button key={theme.id} type="button" className="first-run-setup-theme" aria-pressed={activeTheme === theme.id} onClick={() => selectTheme(theme.id)}><span className="first-run-setup-theme-swatch" style={{ '--setup-theme-swatch': theme.swatch } as CSSProperties} /><span>{theme.title}</span></button>)}</div>}

          {step === 3 && <div className="first-run-setup-template-grid" role="group" aria-label={copy.templateTitle}>{SETUP_TEMPLATES.map(item => { const Icon = TEMPLATE_ICONS[item.id]; const selected = templateId === item.id; return <button key={item.id} type="button" className="first-run-setup-template" aria-pressed={selected} onClick={() => { setTemplateId(item.id); setError('') }}><span className="first-run-setup-template-heading"><Icon size={18} aria-hidden="true" /><strong>{item.title[locale]}</strong></span><p>{item.description[locale]}</p><small>{item.sections.length} {copy.sectionsLabel} · {countStarterTasks(item.tasks)} {copy.tasksLabel}</small></button> })}</div>}
          {error && <p className="first-run-setup-error" role="alert">{error}</p>}
        </div>

        <footer className="first-run-setup-footer"><p className="first-run-setup-step-count">{copy.stepOf} {step + 1} {copy.of} 4</p><div className="first-run-setup-actions">{step > 0 && <button type="button" className="first-run-setup-button" onClick={() => { setStep(value => (value - 1) as SetupStep); setError('') }}><ChevronLeft size={16} aria-hidden="true" />{copy.back}</button>}{step < 3 ? <button type="button" className="first-run-setup-button first-run-setup-button-primary" onClick={() => setStep(value => (value + 1) as SetupStep)}>{copy.next}<ChevronRight size={16} aria-hidden="true" /></button> : <button type="button" className="first-run-setup-button first-run-setup-button-primary" onClick={finish}>{copy.finish}<Check size={16} aria-hidden="true" /></button>}</div></footer>
      </section>
    </div>
  </main>
}

function messagesThemeName(key: string, locale: Locale): string {
  const names: Record<string, { en: string; ar: string }> = {
    calmViolet: { en: 'Calm Violet', ar: 'بنفسجي هادئ' },
    charcoal: { en: 'Charcoal', ar: 'فحمي' },
    midnightBlue: { en: 'Midnight Blue', ar: 'أزرق منتصف الليل' },
    forest: { en: 'Forest', ar: 'غابة' },
    sandDark: { en: 'Sand Dark', ar: 'رملي داكن' },
    roseDusk: { en: 'Rose Dusk', ar: 'وردي الغسق' },
    softLight: { en: 'Soft Light', ar: 'ضوء ناعم' },
  }
  return names[key]?.[locale] ?? key
}
