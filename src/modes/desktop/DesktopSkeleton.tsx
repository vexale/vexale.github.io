export default function DesktopSkeleton() {
  return (
    <section className="desk-route-skeleton" aria-busy="true" aria-live="polite">
      <span className="desk-route-skeleton-line is-title" />
      <span className="desk-route-skeleton-line is-copy" />
      <span className="desk-route-skeleton-panel" />
    </section>
  )
}
