'use client'

import type { ReactNode } from 'react'

/** Panel surface with an optional header row and trailing action slot. */
export function Card({
  title,
  kicker,
  action,
  children,
  className,
  padded = true,
  as: Tag = 'section',
}: {
  title?: ReactNode
  kicker?: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
  padded?: boolean
  as?: 'section' | 'div' | 'article'
}) {
  return (
    <Tag className={['ui-card', padded ? '' : 'ui-card-flush', className || ''].filter(Boolean).join(' ')}>
      {(title || action || kicker) && (
        <header className="ui-card-head">
          <div className="ui-card-heading">
            {kicker && <span className="ui-kicker">{kicker}</span>}
            {title && <h3 className="ui-card-title">{title}</h3>}
          </div>
          {action && <div className="ui-card-action">{action}</div>}
        </header>
      )}
      <div className="ui-card-body">{children}</div>
    </Tag>
  )
}

/** A single headline number with its label and optional trend/footnote. */
export function Stat({
  label,
  value,
  sub,
  tone = 'default',
  icon,
}: {
  label: ReactNode
  value: ReactNode
  sub?: ReactNode
  tone?: 'default' | 'accent' | 'warn' | 'danger' | 'muted'
  icon?: ReactNode
}) {
  return (
    <div className={`ui-stat ui-stat-${tone}`}>
      <div className="ui-stat-top">
        {icon && (
          <span className="ui-stat-icon" aria-hidden="true">
            {icon}
          </span>
        )}
        <span className="ui-stat-label">{label}</span>
      </div>
      <span className="ui-stat-value">{value}</span>
      {sub && <span className="ui-stat-sub">{sub}</span>}
    </div>
  )
}

export function Badge({
  children,
  tone = 'default',
  dot = false,
}: {
  children: ReactNode
  tone?: 'default' | 'accent' | 'warn' | 'danger' | 'success' | 'muted'
  dot?: boolean
}) {
  return (
    <span className={`ui-badge ui-badge-${tone}`}>
      {dot && <span className="ui-badge-dot" aria-hidden="true" />}
      {children}
    </span>
  )
}

/**
 * Shown while data loads. Real skeletons stop the layout jumping, which the
 * previous text-only "LOADING" state did not.
 */
export function Skeleton({
  width,
  height = '1rem',
  radius = 'var(--radius-sm)',
  className,
}: {
  width?: string
  height?: string
  radius?: string
  className?: string
}) {
  return (
    <span
      className={['ui-skeleton', className || ''].filter(Boolean).join(' ')}
      style={{ width, height, borderRadius: radius }}
      aria-hidden="true"
    />
  )
}

/** Consistent zero-data state: says what is missing and what to do about it. */
export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon?: ReactNode
  title: string
  body?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="ui-empty">
      {icon && (
        <span className="ui-empty-icon" aria-hidden="true">
          {icon}
        </span>
      )}
      <p className="ui-empty-title">{title}</p>
      {body && <p className="ui-empty-body">{body}</p>}
      {action && <div className="ui-empty-action">{action}</div>}
    </div>
  )
}
