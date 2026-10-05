import type { ReactNode } from 'react'
import { DataError } from '../data/load.ts'

/** Placeholder while a page's data loads. Static on purpose: no shimmer. */
export function PageLoading({ label = 'Loading stats…' }: { label?: string }) {
  return (
    <div className="state state--loading" role="status">
      <span className="sr-only">{label}</span>
      <div className="skeleton" aria-hidden="true">
        <span className="skeleton__bar skeleton__bar--title" />
        <span className="skeleton__bar" />
        <span className="skeleton__bar" />
        <span className="skeleton__bar skeleton__bar--short" />
      </div>
    </div>
  )
}

export function ErrorState({ error, retry }: { error: Error; retry: () => void }) {
  const message =
    error instanceof DataError ? error.message : 'Something went wrong while drawing this page. Trying again usually helps.'
  return (
    <div className="state state--error" role="alert">
      <p className="state__title">Couldn’t load the stats</p>
      <p>{message}</p>
      <button type="button" className="button" onClick={retry}>
        Try again
      </button>
    </div>
  )
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="state state--empty">
      <p className="state__title">{title}</p>
      {children}
    </div>
  )
}
