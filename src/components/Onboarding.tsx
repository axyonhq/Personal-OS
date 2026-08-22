'use client'

import { useState } from 'react'
import { Compass, Flame, Target } from 'lucide-react'
import type { Store } from '../hooks/useStore'
import { todayDateKey } from '../utils/time'
import { Button } from './ui/Button'

const STEPS = 4
const HOUR_CHOICES = [3, 4, 5, 6, 7, 8]

/**
 * First-run setup.
 *
 * New browsers used to boot into a wall of demo data that looked like the
 * product. This wizard writes the user's own identity, target and first habit
 * instead, and can be skipped in one tap.
 */
export function Onboarding({ store }: { store: Store }) {
  const [step, setStep] = useState(0)
  const [identity, setIdentity] = useState(store.state.identityBody)
  const [hours, setHours] = useState(Math.round(store.state.dailyDeepWorkTargetMinutes / 60) || 6)
  const [habit, setHabit] = useState('')
  const [oneThing, setOneThing] = useState('')

  const finish = () => {
    const today = todayDateKey()
    if (habit.trim()) store.addHabit(habit.trim())
    if (oneThing.trim()) store.setOneThing(today, oneThing.trim())
    store.setDailyTargetHours(hours)
    store.completeOnboarding({
      identityBody: identity.trim(),
      identityQuestion: store.state.identityQuestion || 'Is this a decision from the person I am becoming?',
    })
  }

  return (
    <div className="onboard">
      <div className="onboard-card">
        <p className="ui-kicker">
          Step {step + 1} of {STEPS}
        </p>

        {step === 0 && (
          <>
            <span className="onboard-icon" aria-hidden="true">
              <Compass />
            </span>
            <h1 className="onboard-title">This is your command center.</h1>
            <p className="onboard-copy">
              Four short answers. Then the home screen shows your day, not a pile of demo tasks.
            </p>
            <div className="onboard-actions">
              <Button variant="primary" onClick={() => setStep(1)}>
                Set it up
              </Button>
              <Button variant="ghost" onClick={store.skipOnboarding}>
                Skip for now
              </Button>
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <span className="onboard-icon" aria-hidden="true">
              <Target />
            </span>
            <h1 className="onboard-title">Who are you for the next 90 days?</h1>
            <p className="onboard-copy">One sentence is enough. You can change it later.</p>
            <textarea
              className="onboard-input"
              rows={4}
              value={identity}
              onChange={(e) => setIdentity(e.target.value)}
              placeholder="The person who protects deep work and ships."
              autoFocus
            />
            <div className="onboard-actions">
              <Button variant="ghost" onClick={() => setStep(0)}>
                Back
              </Button>
              <Button variant="primary" onClick={() => setStep(2)}>
                Continue
              </Button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <span className="onboard-icon" aria-hidden="true">
              <Flame />
            </span>
            <h1 className="onboard-title">How many hours of deep work a day?</h1>
            <p className="onboard-copy">This is the ring on Today. Start honest. Raise it later.</p>
            <div className="onboard-hours">
              {HOUR_CHOICES.map((h) => (
                <button
                  key={h}
                  type="button"
                  className={`onboard-hour${hours === h ? ' is-on' : ''}`}
                  onClick={() => setHours(h)}
                >
                  {h}h
                </button>
              ))}
            </div>
            <div className="onboard-actions">
              <Button variant="ghost" onClick={() => setStep(1)}>
                Back
              </Button>
              <Button variant="primary" onClick={() => setStep(3)}>
                Continue
              </Button>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <h1 className="onboard-title">One habit. One thing today.</h1>
            <p className="onboard-copy">Tap a habit chip on Today to mark it done. The one thing sits at the top.</p>
            <label className="onboard-field">
              <span className="ui-kicker">First habit</span>
              <input
                className="onboard-input"
                value={habit}
                onChange={(e) => setHabit(e.target.value)}
                placeholder="Train"
                autoFocus
              />
            </label>
            <label className="onboard-field">
              <span className="ui-kicker">Today’s one thing</span>
              <input
                className="onboard-input"
                value={oneThing}
                onChange={(e) => setOneThing(e.target.value)}
                placeholder="Ship the next real piece"
              />
            </label>
            <div className="onboard-actions">
              <Button variant="ghost" onClick={() => setStep(2)}>
                Back
              </Button>
              <Button variant="primary" onClick={finish}>
                Open Command Center
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
