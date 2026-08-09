'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { AxyonMark } from './brand/AxyonMark'

type Props = {
  onEnterPersonal: () => void
  onEnterBusiness: () => void
  accountSlot?: ReactNode
}

type Portal = 'axyon' | 'command' | null

export function LayerGate({ onEnterPersonal, onEnterBusiness, accountSlot }: Props) {
  const [ready, setReady] = useState(false)
  const [exiting, setExiting] = useState<Portal>(null)

  useEffect(() => {
    const id = window.requestAnimationFrame(() => setReady(true))
    return () => window.cancelAnimationFrame(id)
  }, [])

  const enter = (portal: Exclude<Portal, null>) => {
    if (exiting) return
    setExiting(portal)
    window.setTimeout(() => {
      if (portal === 'axyon') onEnterBusiness()
      else onEnterPersonal()
    }, 780)
  }

  return (
    <div
      className={`layer-gate bare${ready ? ' is-ready' : ''}${exiting ? ' is-exiting' : ''}${
        exiting === 'axyon' ? ' exit-axyon' : exiting === 'command' ? ' exit-command' : ''
      }`}
    >
      <div className="layer-gate-ambiance" aria-hidden="true">
        <div className="layer-gate-void" />
        <div className="layer-gate-scan" />
        <div className="layer-gate-glow layer-gate-glow-a" />
        <div className="layer-gate-glow layer-gate-glow-b" />
      </div>

      {accountSlot && <div className="layer-gate-account">{accountSlot}</div>}

      <div className="layer-gate-portals">
        <button
          type="button"
          className={`layer-portal portal-axyon${exiting === 'axyon' ? ' is-activating' : ''}`}
          onClick={() => enter('axyon')}
          disabled={!!exiting}
        >
          <span className="layer-portal-beam" aria-hidden="true" />
          <span className="layer-portal-ring" aria-hidden="true" />
          <span className="layer-portal-copy">
            <AxyonMark size={56} className="layer-portal-mark" />
            <span className="layer-portal-kicker">Company</span>
            <span className="layer-portal-name axyon-portal-name">AXYON</span>
            <span className="layer-portal-enter">Enter</span>
          </span>
        </button>

        <button
          type="button"
          className={`layer-portal portal-command${exiting === 'command' ? ' is-activating' : ''}`}
          onClick={() => enter('command')}
          disabled={!!exiting}
        >
          <span className="layer-portal-beam" aria-hidden="true" />
          <span className="layer-portal-ring" aria-hidden="true" />
          <span className="layer-portal-copy">
            <span className="layer-portal-kicker">Personal</span>
            <span className="layer-portal-name">Command Center</span>
            <span className="layer-portal-enter">Enter</span>
          </span>
        </button>
      </div>

      <div className="layer-gate-veil" aria-hidden="true" />
    </div>
  )
}
