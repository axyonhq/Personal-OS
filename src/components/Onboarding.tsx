'use client'

import { Compass } from 'lucide-react'
import type { Store } from '../hooks/useStore'
import { Button } from './ui/Button'

export function Onboarding({ store }: { store: Store }) {
  return (
    <div className="onboard">
      <div className="onboard-card">
        <span className="onboard-icon" aria-hidden="true">
          <Compass />
        </span>
        <h1 className="onboard-title">This is home.</h1>
        <p className="onboard-copy">
          Vision at the top. Money, tasks, journal, and deep work below. One screen.
        </p>
        <div className="onboard-actions">
          <Button variant="primary" onClick={store.skipOnboarding}>
            Open it
          </Button>
        </div>
      </div>
    </div>
  )
}
