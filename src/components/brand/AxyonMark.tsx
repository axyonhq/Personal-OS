'use client'

type Props = {
  size?: number
  className?: string
  /** Show wordmark beside the mark */
  withWordmark?: boolean
}

/** Stylized A mark — chrome left, electric-blue right. */
export function AxyonMark({ size = 28, className = '', withWordmark = false }: Props) {
  return (
    <span className={`axyon-mark-lockup ${className}`.trim()}>
      <svg
        className="axyon-mark"
        width={size}
        height={size}
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="axyonChrome" x1="8" y1="8" x2="40" y2="56" gradientUnits="userSpaceOnUse">
            <stop stopColor="#F4F7FA" />
            <stop offset="0.45" stopColor="#A8B4C4" />
            <stop offset="1" stopColor="#6E7B8C" />
          </linearGradient>
          <linearGradient id="axyonBlue" x1="34" y1="12" x2="56" y2="56" gradientUnits="userSpaceOnUse">
            <stop stopColor="#9AE8FF" />
            <stop offset="0.4" stopColor="#2EC8FF" />
            <stop offset="1" stopColor="#0A7FB8" />
          </linearGradient>
          <filter id="axyonGlow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="2.2" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <path d="M14 50 L28 14 L34.5 14 L20.5 50 Z" fill="url(#axyonChrome)" />
        <path d="M18 33.5 L46 30.5 L47.5 33.2 L19.5 36.2 Z" fill="url(#axyonChrome)" />
        <path
          d="M36 14 L42 14 L52 50 L45.5 50 Z"
          fill="url(#axyonBlue)"
          filter="url(#axyonGlow)"
        />
        <path d="M40.5 28 L48 28 L51.5 42 L44 42 Z" fill="url(#axyonBlue)" opacity="0.85" />
      </svg>
      {withWordmark && <span className="axyon-wordmark">AXYON</span>}
    </span>
  )
}
