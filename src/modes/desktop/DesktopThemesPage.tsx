import { useState } from 'react'
import type { ChangeEvent, CSSProperties, KeyboardEvent } from 'react'
import { Check } from 'lucide-react'
import { ACCENT_CATALOG, hasAccessibleWhiteContrast } from './accentCatalog'
import { DESKTOP_THEMES } from './themeCatalog'
import { updateDesktopPreferences, useDesktopPreferences } from './preferences'
import { useDesktopMessages } from './i18n'

interface SwatchStyle extends CSSProperties {
  '--desk-swatch-color': string
}

export default function DesktopThemesPage() {
  const messages = useDesktopMessages()
  const preferences = useDesktopPreferences()
  const [feedback, setFeedback] = useState('')
  const labels = messages.themes
  const selectedAccentIndex = ACCENT_CATALOG.findIndex(accent => preferences.accentColor?.toLowerCase() === accent.hex)

  const selectCustomAccent = (event: ChangeEvent<HTMLInputElement>): void => {
    const hex = event.currentTarget.value.toLowerCase()
    if (!hasAccessibleWhiteContrast(hex)) {
      setFeedback(labels.contrastError)
      return
    }
    updateDesktopPreferences({ accentColor: hex })
    setFeedback(labels.accentSaved)
  }

  const handleAccentKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number): void => {
    const isRtl = event.currentTarget.closest('.desk-app')?.getAttribute('dir') === 'rtl'
    const forward = event.key === 'ArrowDown' || (event.key === 'ArrowRight' && !isRtl) || (event.key === 'ArrowLeft' && isRtl)
    const backward = event.key === 'ArrowUp' || (event.key === 'ArrowLeft' && !isRtl) || (event.key === 'ArrowRight' && isRtl)
    const nextIndex = event.key === 'Home' ? 0
      : event.key === 'End' ? ACCENT_CATALOG.length - 1
        : forward ? (index + 1) % ACCENT_CATALOG.length
          : backward ? (index - 1 + ACCENT_CATALOG.length) % ACCENT_CATALOG.length
            : null
    if (nextIndex === null) return
    event.preventDefault()
    const options = event.currentTarget.closest('[role="radiogroup"]')?.querySelectorAll<HTMLButtonElement>('[role="radio"]')
    const next = options?.[nextIndex]
    next?.focus()
    next?.click()
  }

  return (
    <section className="desk-themes-settings" aria-labelledby="desk-themes-title">
      <header className="desk-themes-heading">
        <h2 id="desk-themes-title">{labels.title}</h2>
        <p>{labels.description}</p>
      </header>

      <div className="desk-theme-grid" role="group" aria-label={labels.title}>
        {DESKTOP_THEMES.map(theme => {
          const themeName = labels.names[theme.labelKey]
          const selected = preferences.theme === theme.id
          return (
            <button
              key={theme.id}
              type="button"
              className="desk-theme-card"
              aria-label={`${themeName} · ${selected ? labels.selected : labels.chooseTheme}`}
              aria-pressed={selected}
              onClick={() => updateDesktopPreferences({ theme: theme.id })}
            >
              <span className="desk-theme-preview" data-theme={theme.id} aria-hidden="true">
                <span className="desk-theme-band desk-theme-band-bg" />
                <span className="desk-theme-band desk-theme-band-surface" />
                <span className="desk-theme-band desk-theme-band-accent" />
              </span>
              <span className="desk-theme-card-label">
                <span>{themeName}</span>
                {selected && <span className="desk-theme-selected"><Check size={14} aria-hidden="true" />{labels.selected}</span>}
              </span>
            </button>
          )
        })}
      </div>

      <section className="desk-accent-settings" aria-labelledby="desk-accent-title">
        <header className="desk-themes-heading">
          <h3 id="desk-accent-title">{labels.accentTitle}</h3>
          <p>{labels.accentDescription}</p>
        </header>
        <div className="desk-accent-grid" role="radiogroup" aria-label={labels.accentTitle}>
          {ACCENT_CATALOG.map(accent => {
            const selected = preferences.accentColor?.toLowerCase() === accent.hex
            return (
              <button
                key={accent.id}
                type="button"
                className="desk-accent-option"
                role="radio"
                aria-checked={selected}
                aria-label={labels.accents[accent.id]}
                tabIndex={selected || (selectedAccentIndex === -1 && accent.id === ACCENT_CATALOG[0].id) ? 0 : -1}
                onKeyDown={event => handleAccentKeyDown(event, ACCENT_CATALOG.findIndex(option => option.id === accent.id))}
                onClick={() => { updateDesktopPreferences({ accentColor: accent.hex }); setFeedback(labels.accentSaved) }}
              >
                <span className="desk-accent-swatch" style={{ '--desk-swatch-color': accent.hex } as SwatchStyle} aria-hidden="true" />
                <span>{labels.accents[accent.id]}</span>
              </button>
            )
          })}
        </div>
        <div className="desk-custom-accent-row">
          <label className="desk-custom-accent-label" htmlFor="desk-custom-accent">{labels.customAccent}</label>
          <input
            id="desk-custom-accent"
            type="color"
            value={preferences.accentColor ?? ACCENT_CATALOG[0].hex}
            aria-describedby="desk-accent-contrast-help"
            onChange={selectCustomAccent}
          />
          <button
            type="button"
            className="desk-button"
            disabled={preferences.accentColor === null}
            onClick={() => { updateDesktopPreferences({ accentColor: null }); setFeedback(labels.accentReset) }}
          >
            {labels.useThemeAccent}
          </button>
        </div>
        <p id="desk-accent-contrast-help" className="desk-accent-help">{labels.contrastHelp}</p>
        {feedback && <p className="desk-accent-feedback" role="status" aria-live="polite">{feedback}</p>}
      </section>
    </section>
  )
}
