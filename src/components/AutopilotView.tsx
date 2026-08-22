'use client'

import { useMemo, useState } from 'react'
import type { Store } from '../hooks/useStore'
import {
  autopilotLockLabel,
  isAutopilotLocked,
  type AutopilotRoutineId,
} from '../utils/autopilotLocks'
import { EveningWindDown } from './autopilot/EveningWindDown'
import { SaturdayDump } from './autopilot/SaturdayDump'
import { SundayAdmin } from './autopilot/SundayAdmin'
import { SundayCenter } from './autopilot/SundayCenter'
import { MissDayRepair } from './MissDayRepair'
import { needsMissDayRepair } from '../utils/dayChecks'
import { WeeklyGoalsPanel } from './WeeklyGoalsPanel'

const ROUTINES: {
  id: AutopilotRoutineId
  kicker: string
  name: string
  desc: string
}[] = [
  {
    id: 'evening',
    kicker: 'Nightly',
    name: 'Evening Wind Down',
    desc: 'Finance → body → calendar → tasks → journal OCR. Close the day on rails.',
  },
  {
    id: 'miss-repair',
    kicker: 'As needed',
    name: 'Miss-day repair',
    desc: 'Streak broke or habits slipped — name it, cut the day, recommit One Thing.',
  },
  {
    id: 'saturday-dump',
    kicker: 'Saturday',
    name: 'Saturday Dump',
    desc: 'Notebook → Sunday-only admin pile. Allocate tomorrow. Two skips = delete.',
  },
  {
    id: 'sunday-admin',
    kicker: 'Sunday',
    name: 'Sunday Admin',
    desc: 'Reply to all → one allocated Sunday task at a time. Full focus. Personal timer on.',
  },
  {
    id: 'sunday-center',
    kicker: 'Sunday',
    name: 'Sunday Center',
    desc: 'Reflect, money, 3 goals linked to Vision, focus, tasks, journal OCR.',
  },
]

export function AutopilotView({
  store,
  onStartPersonalMinimized,
}: {
  store: Store
  onStartPersonalMinimized: (focusNote: string) => void
}) {
  const [windDownOpen, setWindDownOpen] = useState(false)
  const [saturdayOpen, setSaturdayOpen] = useState(false)
  const [adminOpen, setAdminOpen] = useState(false)
  const [sundayOpen, setSundayOpen] = useState(false)
  const [repairOpen, setRepairOpen] = useState(false)

  const repairNeeded = useMemo(() => needsMissDayRepair(store.state), [store.state])

  const openRoutine = (id: AutopilotRoutineId) => {
    if (isAutopilotLocked(store.state, id)) return
    if (id === 'evening') setWindDownOpen(true)
    if (id === 'saturday-dump') setSaturdayOpen(true)
    if (id === 'sunday-admin') setAdminOpen(true)
    if (id === 'sunday-center') setSundayOpen(true)
    if (id === 'miss-repair') setRepairOpen(true)
  }

  return (
    <div className="layout-stack autopilot-view">
      <WeeklyGoalsPanel store={store} />

      {repairNeeded && !isAutopilotLocked(store.state, 'miss-repair') && (
        <section className="miss-repair-banner">
          <div>
            <span className="field-label">Momentum leak</span>
            <p>Yesterday slipped. Run miss-day repair before the slide compounds.</p>
          </div>
          <button type="button" className="btn-primary" onClick={() => setRepairOpen(true)}>
            Repair now
          </button>
        </section>
      )}

      <section className="action-board">
        <header className="action-board-head">
          <h2 className="action-board-title">Autopilot</h2>
          <p className="action-board-copy">
            Set paths. Press play. Once done for the period — locked.
          </p>
        </header>
        <div className="action-board-grid autopilot-five">
          {ROUTINES.map((routine) => {
            const locked = isAutopilotLocked(store.state, routine.id)
            const highlight =
              routine.id === 'miss-repair' && repairNeeded && !locked
            return (
              <button
                key={routine.id}
                type="button"
                className={`action-tile${locked ? ' disabled locked' : ' accent'}${highlight ? ' warn' : ''}`}
                disabled={locked}
                onClick={() => openRoutine(routine.id)}
              >
                <span className="action-tile-kicker">{routine.kicker}</span>
                <span className="action-tile-name">{routine.name}</span>
                <span className="action-tile-desc">
                  {locked ? autopilotLockLabel(routine.id) : routine.desc}
                </span>
                {locked && <span className="tab-soon">Locked</span>}
              </button>
            )
          })}
        </div>
      </section>

      <EveningWindDown
        store={store}
        open={windDownOpen}
        onClose={() => setWindDownOpen(false)}
      />
      <SaturdayDump
        store={store}
        open={saturdayOpen}
        onClose={() => setSaturdayOpen(false)}
      />
      <SundayAdmin
        store={store}
        open={adminOpen}
        onClose={() => setAdminOpen(false)}
        onStartPersonalTimer={onStartPersonalMinimized}
      />
      <SundayCenter
        store={store}
        open={sundayOpen}
        onClose={() => setSundayOpen(false)}
      />
      <MissDayRepair
        store={store}
        open={repairOpen}
        onClose={() => setRepairOpen(false)}
      />
    </div>
  )
}
