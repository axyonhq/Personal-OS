import { useMemo, useState } from 'react'
import { PROJECT_MAP } from '../data/seed'
import type { Store } from '../hooks/useStore'
import { DEEP_WORK_IDS, type DeepWorkId } from '../types'
import { isAutopilotLocked } from '../utils/autopilotLocks'
import { formatMinutes, todayDateKey } from '../utils/time'
import { AttentionAllocation } from './AttentionAllocation'
import { EveningWindDown } from './autopilot/EveningWindDown'
import { BodyEnergyLog } from './BodyEnergyLog'
import { DailyNotes } from './DailyNotes'
import { IdentityPanel } from './IdentityPanel'
import { MentalRam } from './MentalRam'
import { MissDayRepair } from './MissDayRepair'
import { needsMissDayRepair } from '../utils/dayChecks'
import { NonNegotiables } from './NonNegotiables'
import { PauseAnalytics, SessionAnalytics } from './SessionAnalytics'
import { TimeSummary } from './TimeSummary'
import { WeekIntention } from './WeekIntention'
import { WeeklyGoalsPanel } from './WeeklyGoalsPanel'
import { Modal } from './ui/Modal'

type RitualId = 'morning' | 'week'
type CommandModal = 'identity' | 'mental' | 'habits' | 'analytics' | 'body' | null

const RITUAL_CARDS: {
  id: RitualId | 'evening'
  title: string
  name: string
  desc: string
}[] = [
  {
    id: 'morning',
    title: 'Morning',
    name: 'Morning rituals',
    desc: 'Open when you need the checklist — otherwise stay clear',
  },
  {
    id: 'evening',
    title: 'Evening',
    name: 'Evening Wind Down',
    desc: 'Finance → body → tomorrow → tasks → journal photo into Mentor',
  },
  {
    id: 'week',
    title: 'Week',
    name: 'Week rituals',
    desc: 'Open when you need the checklist — otherwise stay clear',
  },
]

export function DashboardView({
  store,
  onStartProject,
}: {
  store: Store
  onStartProject: (projectId: DeepWorkId) => void
}) {
  const today = todayDateKey()
  const busy = !!store.state.activeTimer
  const [ritualOpen, setRitualOpen] = useState<RitualId | null>(null)
  const [windDownOpen, setWindDownOpen] = useState(false)
  const [commandModal, setCommandModal] = useState<CommandModal>(null)
  const [repairOpen, setRepairOpen] = useState(false)
  const activeRitual = RITUAL_CARDS.find((card) => card.id === ritualOpen)
  const repairNeeded = useMemo(() => needsMissDayRepair(store.state), [store.state])
  const eveningLocked = isAutopilotLocked(store.state, 'evening')

  return (
    <div className="dashboard dashboard-clean">
      <p className="dashboard-lede">Center. Then move.</p>

      <WeeklyGoalsPanel store={store} />

      {repairNeeded && !isAutopilotLocked(store.state, 'miss-repair') && (
        <section className="miss-repair-banner">
          <div>
            <span className="field-label">Momentum leak</span>
            <p>Yesterday slipped. Repair before the day drifts.</p>
          </div>
          <button type="button" className="btn-primary" onClick={() => setRepairOpen(true)}>
            Miss-day repair
          </button>
        </section>
      )}

      <section className="dashboard-section dashboard-timers">
        <h2 className="dashboard-heading">Start deep work</h2>
        <div className="dashboard-timer-grid">
          {DEEP_WORK_IDS.map((id) => {
            const project = PROJECT_MAP[id]
            let logged = store.minutesFor(id, 'day', today)
            if (store.state.activeTimer?.projectId === id) {
              logged += Math.floor(store.liveTimerSeconds / 60)
            }
            const target = store.state.dailyDeepWorkSplit[id]
            const isLive = store.state.activeTimer?.projectId === id
            return (
              <button
                key={id}
                type="button"
                className={`dashboard-timer-btn${isLive ? ' live' : ''}`}
                style={{ ['--project-color' as string]: project.color }}
                disabled={busy && !isLive}
                onClick={() => onStartProject(id)}
              >
                <span className="dashboard-timer-name">{project.name}</span>
                <span className="dashboard-timer-hours">
                  {formatMinutes(logged)}
                  <span className="dashboard-timer-target">
                    {' '}
                    / {formatMinutes(target)}
                  </span>
                </span>
                <span className="dashboard-timer-cta">
                  {isLive ? 'Timer running — open' : 'Start timer'}
                </span>
              </button>
            )
          })}
        </div>
      </section>

      <section className="action-board compact">
        <header className="action-board-head">
          <h2 className="action-board-title">Command surfaces</h2>
          <p className="action-board-copy">
            Identity, mental RAM, habits, and analytics stay out of the way.
          </p>
        </header>
        <div className="action-board-grid autopilot-five">
          <button type="button" className="action-tile compact" onClick={() => setCommandModal('identity')}>
            <span className="action-tile-kicker">90-day</span>
            <span className="action-tile-name">Identity</span>
          </button>
          <button type="button" className="action-tile compact" onClick={() => setCommandModal('mental')}>
            <span className="action-tile-kicker">Mind</span>
            <span className="action-tile-name">Intention & loops</span>
          </button>
          <button type="button" className="action-tile compact" onClick={() => setCommandModal('habits')}>
            <span className="action-tile-kicker">Rituals</span>
            <span className="action-tile-name">Non-negotiables</span>
          </button>
          <button type="button" className="action-tile compact" onClick={() => setCommandModal('body')}>
            <span className="action-tile-kicker">Signal</span>
            <span className="action-tile-name">Body & energy</span>
          </button>
          <button type="button" className="action-tile compact" onClick={() => setCommandModal('analytics')}>
            <span className="action-tile-kicker">Readouts</span>
            <span className="action-tile-name">Time analytics</span>
          </button>
        </div>
      </section>

      <section className="action-board compact">
        <div className="action-board-stack">
          {RITUAL_CARDS.map((card) => {
            const locked = card.id === 'evening' && eveningLocked
            return (
              <button
                key={card.id}
                type="button"
                className={`action-tile compact wide${locked ? ' disabled locked' : ''}${card.id === 'evening' && !locked ? ' accent' : ''}`}
                disabled={locked}
                onClick={() => {
                  if (card.id === 'evening') {
                    if (!locked) setWindDownOpen(true)
                    return
                  }
                  setRitualOpen(card.id)
                }}
              >
                <span className="action-tile-kicker">Operating cadence</span>
                <span className="action-tile-name">{card.name}</span>
                <span className="action-tile-desc">
                  {locked ? 'Done today · locked' : card.desc}
                </span>
                {locked && <span className="tab-soon">Locked</span>}
              </button>
            )
          })}
        </div>
      </section>

      <Modal
        open={ritualOpen !== null}
        onClose={() => setRitualOpen(null)}
        title={activeRitual?.title ?? 'Rituals'}
        size="md"
      >
        {ritualOpen === 'morning' && (
          <ol className="dashboard-list">
            <li>Coffee At Home</li>
            <li>Breathwork</li>
            <li>Water &amp; Salt</li>
            <li>Write identity statement and set intentions</li>
            <li>Straight into deep work</li>
          </ol>
        )}
        {ritualOpen === 'week' && (
          <div className="dashboard-week">
            <div className="dashboard-week-block">
              <span className="dashboard-week-when">Mon–Sun · Midday</span>
              <p>Foot on the fucking gas. Retard mode. Execute.</p>
            </div>
            <div className="dashboard-week-block">
              <span className="dashboard-week-when">Sunday · Afternoon</span>
              <p>Gyroscope. Assess, plan, personal admin, analyse, go deep.</p>
            </div>
            <div className="dashboard-week-block">
              <span className="dashboard-week-when">Sunday · Evening</span>
              <p>Me time. Chill.</p>
            </div>
          </div>
        )}
      </Modal>

      <EveningWindDown
        store={store}
        open={windDownOpen}
        onClose={() => setWindDownOpen(false)}
      />

      <Modal open={commandModal === 'identity'} onClose={() => setCommandModal(null)} title="90-day identity" size="lg">
        <IdentityPanel store={store} />
      </Modal>

      <Modal open={commandModal === 'mental'} onClose={() => setCommandModal(null)} title="Mental OS" size="lg">
        <div className="layout-stack">
          <WeeklyGoalsPanel store={store} />
          <WeekIntention store={store} />
          <MentalRam store={store} />
          <DailyNotes store={store} />
        </div>
      </Modal>

      <Modal open={commandModal === 'habits'} onClose={() => setCommandModal(null)} title="Non-negotiables" size="md">
        <NonNegotiables store={store} />
      </Modal>

      <Modal open={commandModal === 'body'} onClose={() => setCommandModal(null)} title="Body & energy" size="md">
        <BodyEnergyLog store={store} date={today} />
      </Modal>

      <Modal open={commandModal === 'analytics'} onClose={() => setCommandModal(null)} title="Time analytics" size="xl">
        <div className="analytics-stack">
          <div className="grid-2">
            <TimeSummary store={store} />
            <AttentionAllocation store={store} />
          </div>
          <div className="grid-2">
            <SessionAnalytics store={store} />
            <PauseAnalytics store={store} />
          </div>
        </div>
      </Modal>

      <MissDayRepair store={store} open={repairOpen} onClose={() => setRepairOpen(false)} />
    </div>
  )
}
