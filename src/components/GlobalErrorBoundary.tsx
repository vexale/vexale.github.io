import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { Download, RefreshCw, ShieldAlert } from 'lucide-react'
import { exportEmergencyBackup } from '../lib/emergencyExport'
import './GlobalErrorBoundary.css'

interface Props { children: ReactNode }
interface State { error: Error | null; exporting: boolean; exportStatus: string }

export default class GlobalErrorBoundary extends Component<Props, State> {
  state: State = { error: null, exporting: false, exportStatus: '' }

  static getDerivedStateFromError(error: Error): State {
    return { error, exporting: false, exportStatus: '' }
  }

  componentDidCatch(_error: Error, _info: ErrorInfo): void {
    // لا نكتب إلى console: هذه الحالة تُعرض للمستخدم مباشرةً.
  }

  exportData = async (): Promise<void> => {
    this.setState({ exporting: true, exportStatus: '' })
    try {
      await exportEmergencyBackup()
      this.setState({ exporting: false, exportStatus: 'تم تجهيز نسخة الطوارئ.' })
    } catch {
      this.setState({ exporting: false, exportStatus: 'تعذّر تجهيز النسخة. حاول مرة أخرى.' })
    }
  }

  render() {
    if (!this.state.error) return this.props.children
    const arabic = typeof document !== 'undefined' && document.documentElement.lang === 'ar'
    const title = arabic ? 'حدث عطل غير متوقع' : 'Something went wrong'
    const body = arabic ? 'تعذّر تحميل مساحة العمل، لكن بياناتك المحلية لم تُحذف. يمكنك تصدير نسخة احتياطية قبل إعادة المحاولة.' : 'The workspace could not load, but your local data has not been deleted. Export a backup before trying again.'
    const exportLabel = arabic ? 'تصدير بياناتي' : 'Export my data'
    const retryLabel = arabic ? 'إعادة تحميل مساحة العمل' : 'Reload workspace'
    const status = this.state.exportStatus || (arabic ? 'يمكنك الاحتفاظ بنسخة من بياناتك قبل المتابعة.' : 'You can keep a copy of your data before continuing.')
    return (
      <main className="global-error-screen" role="alert" dir={arabic ? 'rtl' : 'ltr'}>
        <section className="global-error-card" aria-labelledby="global-error-title">
          <ShieldAlert size={34} aria-hidden="true" />
          <h1 id="global-error-title">{title}</h1>
          <p>{body}</p>
          <div className="global-error-actions">
            <button type="button" className="desk-button desk-button-primary" disabled={this.state.exporting} onClick={() => void this.exportData()}><Download size={16} aria-hidden="true" />{this.state.exporting ? (arabic ? 'جارٍ التصدير…' : 'Exporting…') : exportLabel}</button>
            <button type="button" className="desk-button" onClick={() => window.location.reload()}><RefreshCw size={16} aria-hidden="true" />{retryLabel}</button>
          </div>
          <p className="global-error-status" aria-live="polite">{status}</p>
        </section>
      </main>
    )
  }
}
