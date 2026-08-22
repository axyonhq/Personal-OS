'use client'

import type { Store } from '../hooks/useStore'
import type { DailyBodyLog } from '../types'

const ENERGY: { value: 1 | 2 | 3 | 4 | 5; label: string }[] = [
  { value: 1, label: '1' },
  { value: 2, label: '2' },
  { value: 3, label: '3' },
  { value: 4, label: '4' },
  { value: 5, label: '5' },
]

export function BodyEnergyLog({
  store,
  date,
  compact = false,
}: {
  store: Store
  date: string
  compact?: boolean
}) {
  const log: DailyBodyLog = store.state.bodyLogs?.[date] ?? {
    sleepHours: null,
    energy: null,
    trained: false,
  }

  const ready = log.energy != null && log.sleepHours != null

  return (
    <div className={`body-energy-log${compact ? ' compact' : ''}`}>
      {!compact && (
        <p className="body-energy-copy">
          Body signal for Mentor — sleep, energy, training. This is how weapon days get decoded.
        </p>
      )}

      <div className="body-energy-grid">
        <label className="field">
          <span className="field-label">Sleep (hours)</span>
          <input
            type="number"
            min={0}
            max={16}
            step={0.5}
            value={log.sleepHours ?? ''}
            onChange={(e) => {
              const v = e.target.value
              store.setBodyLog(date, {
                sleepHours: v === '' ? null : Math.max(0, Math.min(16, Number(v))),
              })
            }}
            placeholder="7.5"
          />
        </label>

        <div className="field">
          <span className="field-label">Energy 1–5</span>
          <div className="body-energy-scale" role="radiogroup" aria-label="Energy">
            {ENERGY.map((e) => (
              <button
                key={e.value}
                type="button"
                role="radio"
                aria-checked={log.energy === e.value}
                className={`body-energy-chip${log.energy === e.value ? ' selected' : ''}`}
                onClick={() => store.setBodyLog(date, { energy: e.value })}
              >
                {e.label}
              </button>
            ))}
          </div>
        </div>

        <label className="body-energy-train">
          <input
            type="checkbox"
            checked={log.trained}
            onChange={(e) => store.setBodyLog(date, { trained: e.target.checked })}
          />
          <span>Trained today</span>
        </label>
      </div>

      {log.trained && (
        <label className="field">
          <span className="field-label">Train note (optional)</span>
          <input
            value={log.trainNote || ''}
            onChange={(e) => store.setBodyLog(date, { trainNote: e.target.value })}
            placeholder="Lift / run / sauna…"
          />
        </label>
      )}

      <label className="field">
        <span className="field-label">One-line body note (optional)</span>
        <input
          value={log.note || ''}
          onChange={(e) => store.setBodyLog(date, { note: e.target.value })}
          placeholder="Sore, wired, flat, tapered…"
        />
      </label>

      <p className={`body-energy-ready${ready ? ' ok' : ''}`}>
        {ready ? 'Body log locked enough for Mentor.' : 'Set sleep + energy to complete this signal.'}
      </p>
    </div>
  )
}
