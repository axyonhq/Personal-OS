'use client'

import {
  Activity,
  BrainCircuit,
  CalendarClock,
  Flame,
  HeartPulse,
  Moon,
  Play,
  Repeat,
  Sparkles,
  Sunrise,
  Target,
  Timer,
  TrendingUp,
  Wallet,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { PROJECT_MAP } from '../data/seed'
import { useNavigateTab } from '../hooks/useNavigateTab'
import type { Store } from '../hooks/useStore'
import { DEEP_WORK_IDS, type DeepWorkId } from '../types'
import { isAutopilotLocked } from '../utils/autopilotLocks'
import { needsMissDayRepair } from '../utils/dayChecks'
import { formatMoney, spentOnDate, totalMonthlyExpenses } from '../utils/finance'
import { blocksOnDate } from '../utils/recurrence'
import { addDays, formatMinutes, todayDateKey, weekDays } from '../utils/time'
import { AttentionAllocation } from './AttentionAllocation'
import { EveningWindDown } from './autopilot/EveningWindDown'
import { BodyEnergyLog } from './BodyEnergyLog'
import { DailyNotes } from './DailyNotes'
import { IdentityPanel } from './IdentityPanel'
import { MentalRam } from './MentalRam'
import { MissDayRepair } from './MissDayRepair'
import { NonNegotiables } from './NonNegotiables'
import { PauseAnalytics, SessionAnalytics } from './SessionAnalytics'
import { TimeSummary } from './TimeSummary'
import { WeekIntention } from './WeekIntention'
import { WeeklyGoalsPanel } from './WeeklyGoalsPanel'
import { Button } from './ui/Button'
import { BarRow, MeterBar, ProgressRing, Sparkline } from './ui/Charts'
import { Modal } from './ui/Modal'
import { Badge, Card, EmptyState, Stat } from './ui/Surfaces'

type RitualId = 'morning' | 'week'
type CommandModal = 'identity' | 'mental' | 'habits' | 'analytics' | 'body' | null

const DAY_INITIALS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

export function DashboardView({
  store,
  onStartProject,
}: {
  store: Store
  onStartProject: (projectId: DeepWorkId) => void
}) {
  const navigateTab = useNavigateTab()
  const today = todayDateKey()
  const busy = !!store.state.activeTimer
  const [ritualOpen, setRitualOpen] = useState<RitualId | null>(null)
  const [windDownOpen, setWindDownOpen] = useState(false)
  const [commandModal, setCommandModal] = useState<CommandModal>(null)
  const [repairOpen, setRepairOpen] = useState(false)
  const repairNeeded = useMemo(() => needsMissDayRepair(store.state), [store.state])
  const eveningLocked = isAutopilotLocked(store.state, 'evening')

  const target = store.state.dailyDeepWorkTargetMinutes
  const deepToday = store.deepWorkMinutesForDate(today)
  const remaining = Math.max(0, target - deepToday)

  // Last 30 days of deep work, for the momentum line.
  const trend = useMemo(() => {
    const byDate = new Map<string, number>()
    for (const entry of store.state.timeEntries) {
      if (!DEEP_WORK_IDS.includes(entry.projectId as DeepWorkId)) continue
      byDate.set(entry.date, (byDate.get(entry.date) || 0) + entry.minutes)
    }
    return Array.from({ length: 30 }, (_, i) => byDate.get(addDays(today, i - 29)) || 0)
  }, [store.state.timeEntries, today])

  const deepWorkMinutesForDate = store.deepWorkMinutesForDate
  const selectedDate = store.state.selectedDate
  const week = useMemo(() => {
    return weekDays(selectedDate).map((date, i) => ({
      label: DAY_INITIALS[i],
      value: deepWorkMinutesForDate(date),
      target,
      active: date === today,
    }))
  }, [deepWorkMinutesForDate, selectedDate, target, today])

  const nextBlock = useMemo(() => {
    const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes()
    return blocksOnDate(store.state.calendarBlocks, today)
      .filter((b) => b.endMinutes > nowMinutes)
      .sort((a, b) => a.startMinutes - b.startMinutes)[0]
  }, [store.state.calendarBlocks, today])

  const spentToday = spentOnDate(store.state.personalFinance, today)
  const dailyBudget = totalMonthlyExpenses(store.state.personalFinance) / 30
  const oneThing = store.state.dailyOneThing[today] || ''
  const habits = store.state.habits
  const openCharge = (store.state.mentor.charges || []).find((c) => c.status === 'open')

  const trendTotal = trend.reduce((sum, v) => sum + v, 0)
  const prevWeek = trend.slice(0, 7).reduce((s, v) => s + v, 0)
  const lastWeek = trend.slice(-7).reduce((s, v) => s + v, 0)

  return (
    <div className="dash">
      {/* ---- Hero: today at a glance -------------------------------------- */}
      <section className="dash-hero">
        <div className="dash-hero-ring">
          <ProgressRing
            value={deepToday}
            max={target}
            size={168}
            stroke={12}
            tone={deepToday >= target ? 'accent' : 'accent'}
            label={formatMinutes(deepToday)}
            sublabel={`of ${formatMinutes(target)}`}
          />
        </div>

        <div className="dash-hero-copy">
          <div className="dash-hero-head">
            <p className="ui-kicker">Deep work today</p>
            <h1 className="dash-hero-title">
              {deepToday >= target
                ? 'Target hit. Everything else is bonus.'
                : remaining === target
                  ? 'Nothing logged yet. Start the first block.'
                  : `${formatMinutes(remaining)} left to hit target.`}
            </h1>
          </div>

          <div className="dash-hero-stats">
            <Stat
              label="Streak"
              value={store.targetStreak}
              sub={store.targetStreak === 1 ? 'day on target' : 'days on target'}
              tone={store.targetStreak > 0 ? 'accent' : 'muted'}
              icon={<Flame />}
            />
            <Stat
              label="This week"
              value={formatMinutes(lastWeek)}
              sub={
                prevWeek > 0
                  ? `${lastWeek >= prevWeek ? '+' : ''}${Math.round(((lastWeek - prevWeek) / prevWeek) * 100)}% vs prior`
                  : 'no prior week yet'
              }
              icon={<TrendingUp />}
            />
            <Stat
              label="Week hit rate"
              value={
                store.weekHitRate.counted > 0
                  ? `${Math.round((store.weekHitRate.hits / store.weekHitRate.counted) * 100)}%`
                  : '—'
              }
              sub={`${store.weekHitRate.hits}/${store.weekHitRate.counted} days at target`}
              icon={<Target />}
            />
          </div>

          {trendTotal > 0 && (
            <div className="dash-trend">
              <Sparkline values={trend} height={44} />
              <span className="ui-kicker">Last 30 days</span>
            </div>
          )}
        </div>
      </section>

      {/* ---- Repair banner ------------------------------------------------ */}
      {repairNeeded && !isAutopilotLocked(store.state, 'miss-repair') && (
        <section className="dash-alert">
          <span className="dash-alert-icon" aria-hidden="true">
            <Activity />
          </span>
          <div>
            <p className="dash-alert-title">Yesterday slipped</p>
            <p className="dash-alert-body">Name what broke before the day drifts too.</p>
          </div>
          <Button variant="primary" size="sm" onClick={() => setRepairOpen(true)}>
            Repair
          </Button>
        </section>
      )}

      {/* ---- Start deep work ---------------------------------------------- */}
      <Card
        kicker="Start a block"
        title="Deep work"
        action={<Badge tone={busy ? 'accent' : 'muted'} dot={busy}>{busy ? 'Running' : 'Idle'}</Badge>}
      >
        <div className="dash-timers">
          {DEEP_WORK_IDS.map((id) => {
            const project = PROJECT_MAP[id]
            let logged = store.minutesFor(id, 'day', today)
            if (store.state.activeTimer?.projectId === id) {
              logged += Math.floor(store.liveTimerSeconds / 60)
            }
            const slice = store.state.dailyDeepWorkSplit[id]
            const isLive = store.state.activeTimer?.projectId === id
            return (
              <button
                key={id}
                type="button"
                className={`dash-timer${isLive ? ' is-live' : ''}`}
                style={{ ['--project-color' as string]: project.color }}
                disabled={busy && !isLive}
                onClick={() => onStartProject(id)}
              >
                <span className="dash-timer-head">
                  <span className="dash-timer-name">{project.name}</span>
                  {isLive ? (
                    <Timer className="dash-timer-glyph is-live" aria-hidden="true" />
                  ) : (
                    <Play className="dash-timer-glyph" aria-hidden="true" />
                  )}
                </span>
                <span className="dash-timer-figure">
                  {formatMinutes(logged)}
                  <span className="dash-timer-target"> / {formatMinutes(slice)}</span>
                </span>
                <MeterBar value={logged} max={slice} />
                <span className="dash-timer-cta">
                  {isLive ? 'Running — open timer' : 'Start timer'}
                </span>
              </button>
            )
          })}
        </div>
      </Card>

      {/* ---- Focus row ----------------------------------------------------- */}
      <div className="dash-split">
        <Card kicker="Today" title="The one thing">
          <input
            className="dash-onething"
            type="text"
            value={oneThing}
            placeholder="If only one thing gets done today, what is it?"
            onChange={(e) => store.setOneThing(today, e.target.value)}
            aria-label="Today's one thing"
          />
          {nextBlock ? (
            <div className="dash-next">
              <CalendarClock aria-hidden="true" />
              <span>
                <strong>{nextBlock.title}</strong>
                <em>
                  {String(Math.floor(nextBlock.startMinutes / 60)).padStart(2, '0')}:
                  {String(nextBlock.startMinutes % 60).padStart(2, '0')} — next on the calendar
                </em>
              </span>
            </div>
          ) : (
            <div className="dash-next is-empty">
              <CalendarClock aria-hidden="true" />
              <span>
                <strong>Nothing scheduled</strong>
                <em>The rest of today is unplanned</em>
              </span>
            </div>
          )}
        </Card>

        <Card kicker="This week" title="Deep work by day">
          <BarRow bars={week} height={104} />
        </Card>
      </div>

      {/* ---- Habits + money ------------------------------------------------ */}
      <div className="dash-split">
        <Card
          kicker="Non-negotiables"
          title="Habits"
          action={
            <Button variant="quiet" size="sm" onClick={() => setCommandModal('habits')}>
              Manage
            </Button>
          }
        >
          {habits.length === 0 ? (
            <EmptyState
              icon={<Repeat />}
              title="No habits yet"
              body="Add the handful of daily actions you refuse to skip."
              action={
                <Button variant="secondary" size="sm" onClick={() => setCommandModal('habits')}>
                  Add habits
                </Button>
              }
            />
          ) : (
            <div className="dash-habits">
              {habits.map((habit) => {
                const done = habit.lastCompletedDate === today
                return (
                  <button
                    key={habit.id}
                    type="button"
                    className={`dash-habit${done ? ' is-done' : ''}`}
                    onClick={() => store.completeHabit(habit.id)}
                    aria-pressed={done}
                  >
                    <span className="dash-habit-name">{habit.name}</span>
                    {habit.streak > 0 && (
                      <span className="dash-habit-streak">
                        <Flame aria-hidden="true" />
                        {habit.streak}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </Card>

        <Card
          kicker="Money"
          title="Spend today"
          action={
            <Button variant="quiet" size="sm" onClick={() => navigateTab('personalFinances')}>
              Open
            </Button>
          }
        >
          <div className="dash-money">
            <div className="dash-money-figure">
              <span className={spentToday > dailyBudget && dailyBudget > 0 ? 'is-over' : ''}>
                {formatMoney(spentToday)}
              </span>
              {dailyBudget > 0 && <em>daily pace {formatMoney(dailyBudget)}</em>}
            </div>
            {dailyBudget > 0 ? (
              <MeterBar
                value={spentToday}
                max={dailyBudget}
                tone={spentToday > dailyBudget ? 'danger' : 'accent'}
              />
            ) : (
              <p className="dash-money-hint">
                Set your monthly expenses to see a daily pace here.
              </p>
            )}
          </div>
        </Card>
      </div>

      {/* ---- Mentor nudge --------------------------------------------------- */}
      {openCharge && (
        <Card
          kicker="Mentor"
          title="Open charge"
          action={
            <Button variant="quiet" size="sm" onClick={() => navigateTab('mentor')}>
              Review
            </Button>
          }
        >
          <p className="dash-charge">
            <Sparkles aria-hidden="true" />
            {openCharge.text}
          </p>
        </Card>
      )}

      <WeeklyGoalsPanel store={store} />

      {/* ---- Rituals -------------------------------------------------------- */}
      <Card kicker="Operating cadence" title="Rituals">
        <div className="dash-rituals">
          <button type="button" className="dash-ritual" onClick={() => setRitualOpen('morning')}>
            <Sunrise aria-hidden="true" />
            <span>
              <strong>Morning</strong>
              <em>Open the day deliberately</em>
            </span>
          </button>
          <button
            type="button"
            className={`dash-ritual is-accent${eveningLocked ? ' is-locked' : ''}`}
            disabled={eveningLocked}
            onClick={() => setWindDownOpen(true)}
          >
            <Moon aria-hidden="true" />
            <span>
              <strong>Evening wind down</strong>
              <em>{eveningLocked ? 'Done today' : 'Finance, body, tomorrow, journal'}</em>
            </span>
          </button>
          <button type="button" className="dash-ritual" onClick={() => setRitualOpen('week')}>
            <Repeat aria-hidden="true" />
            <span>
              <strong>Week</strong>
              <em>Cadence and reset points</em>
            </span>
          </button>
        </div>
      </Card>

      {/* ---- Command surfaces ------------------------------------------------ */}
      <Card kicker="Deeper" title="Command surfaces">
        <div className="dash-surfaces">
          <button type="button" className="dash-surface" onClick={() => setCommandModal('identity')}>
            <Target aria-hidden="true" />
            <span>Identity</span>
          </button>
          <button type="button" className="dash-surface" onClick={() => setCommandModal('mental')}>
            <BrainCircuit aria-hidden="true" />
            <span>Mental OS</span>
          </button>
          <button type="button" className="dash-surface" onClick={() => setCommandModal('body')}>
            <HeartPulse aria-hidden="true" />
            <span>Body &amp; energy</span>
          </button>
          <button type="button" className="dash-surface" onClick={() => setCommandModal('analytics')}>
            <Activity aria-hidden="true" />
            <span>Analytics</span>
          </button>
          <button
            type="button"
            className="dash-surface"
            onClick={() => navigateTab('personalFinances')}
          >
            <Wallet aria-hidden="true" />
            <span>Money</span>
          </button>
        </div>
      </Card>

      {/* ---- Modals ---------------------------------------------------------- */}
      <Modal
        open={ritualOpen !== null}
        onClose={() => setRitualOpen(null)}
        title={ritualOpen === 'morning' ? 'Morning' : 'Week'}
        size="md"
      >
        {ritualOpen === 'morning' && (
          <ol className="dashboard-list">
            <li>Coffee at home</li>
            <li>Breathwork</li>
            <li>Water &amp; salt</li>
            <li>Write the identity statement and set intentions</li>
            <li>Straight into deep work</li>
          </ol>
        )}
        {ritualOpen === 'week' && (
          <div className="dashboard-week">
            <div className="dashboard-week-block">
              <span className="dashboard-week-when">Mon–Sun · Midday</span>
              <p>Foot on the gas. Execute.</p>
            </div>
            <div className="dashboard-week-block">
              <span className="dashboard-week-when">Sunday · Afternoon</span>
              <p>Assess, plan, personal admin, analyse, go deep.</p>
            </div>
            <div className="dashboard-week-block">
              <span className="dashboard-week-when">Sunday · Evening</span>
              <p>Me time. Chill.</p>
            </div>
          </div>
        )}
      </Modal>

      <EveningWindDown store={store} open={windDownOpen} onClose={() => setWindDownOpen(false)} />

      <Modal
        open={commandModal === 'identity'}
        onClose={() => setCommandModal(null)}
        title="90-day identity"
        size="lg"
      >
        <IdentityPanel store={store} />
      </Modal>

      <Modal
        open={commandModal === 'mental'}
        onClose={() => setCommandModal(null)}
        title="Mental OS"
        size="lg"
      >
        <div className="layout-stack">
          <WeekIntention store={store} />
          <MentalRam store={store} />
          <DailyNotes store={store} />
        </div>
      </Modal>

      <Modal
        open={commandModal === 'habits'}
        onClose={() => setCommandModal(null)}
        title="Non-negotiables"
        size="md"
      >
        <NonNegotiables store={store} />
      </Modal>

      <Modal
        open={commandModal === 'body'}
        onClose={() => setCommandModal(null)}
        title="Body & energy"
        size="md"
      >
        <BodyEnergyLog store={store} date={today} />
      </Modal>

      <Modal
        open={commandModal === 'analytics'}
        onClose={() => setCommandModal(null)}
        title="Time analytics"
        size="xl"
      >
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
