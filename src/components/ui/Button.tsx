'use client'

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'quiet'
type Size = 'sm' | 'md' | 'lg'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  /** Renders a spinner and blocks interaction without changing layout width. */
  loading?: boolean
  iconLeft?: ReactNode
  iconRight?: ReactNode
  fullWidth?: boolean
}

/**
 * The single button primitive.
 *
 * Everything used to be a bare `<button className="btn-primary">`, so states
 * such as loading and disabled were reimplemented per screen (or skipped).
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'secondary',
    size = 'md',
    loading = false,
    iconLeft,
    iconRight,
    fullWidth = false,
    className,
    children,
    disabled,
    type = 'button',
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={[
        'ui-btn',
        `ui-btn-${variant}`,
        `ui-btn-${size}`,
        fullWidth ? 'ui-btn-block' : '',
        loading ? 'is-loading' : '',
        className || '',
      ]
        .filter(Boolean)
        .join(' ')}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && <span className="ui-btn-spinner" aria-hidden="true" />}
      {!loading && iconLeft && (
        <span className="ui-btn-icon" aria-hidden="true">
          {iconLeft}
        </span>
      )}
      <span className="ui-btn-label">{children}</span>
      {!loading && iconRight && (
        <span className="ui-btn-icon" aria-hidden="true">
          {iconRight}
        </span>
      )}
    </button>
  )
})

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Required: an icon-only control has no text for assistive tech to read. */
  label: string
  variant?: Variant
  size?: Size
  children: ReactNode
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, variant = 'ghost', size = 'md', className, children, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={['ui-icon-btn', `ui-btn-${variant}`, `ui-btn-${size}`, className || '']
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {children}
    </button>
  )
})
