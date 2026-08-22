import { useState } from 'react'
import {
  habitDisplayStreak,
  isHabitDoneOn,
  type Store,
} from '../hooks/useStore'
import { todayDateKey } from '../utils/time'
import { HudPanel } from './HudPanel'
import { useToast } from './ui/Toast'

export function NonNegotiables({ store }: { store: Store }) {
  const { toastUndo } = useToast()
  const [name, setName] = useState('')
  const [adding, setAdding] = useState(false)
  const today = todayDateKey()

  return (
    <HudPanel
      label="NON-NEGOTIABLES"
      action={
        <span className="habit-hint" title="Tick for today — locks until tomorrow">
          Today · locks when done
        </span>
      }
    >
      <div className="habits-row">
        {store.state.habits.map((habit) => {
          const done = isHabitDoneOn(habit, today)
          const streak = habitDisplayStreak(habit, today)
          return (
            <div
              key={habit.id}
              className={`habit-chip${done ? ' on locked' : ''}`}
            >
              <button
                type="button"
                className="habit-tick"
                disabled={done}
                onClick={() => store.completeHabit(habit.id)}
                title={done ? 'Done for today — resets tomorrow' : 'Mark done for today'}
              >
                <span className={`check-box${done ? ' on' : ''}`}>{done ? '✓' : ''}</span>
                <span className="habit-name">{habit.name}</span>
                {streak > 0 && (
                  <span className="streak" title="Day streak">
                    ×{streak}
                  </span>
                )}
              </button>
              <button
                type="button"
                className="x-btn visible habit-remove"
                title="Remove habit"
                aria-label={`Remove ${habit.name}`}
                onClick={() => {
                  const undo = store.removeHabit(habit.id)
                  toastUndo('Habit removed', undo, habit.name)
                }}
              >
                ×
              </button>
            </div>
          )
        })}
        {adding ? (
          <form
            className="inline-add"
            style={{ minWidth: 200 }}
            onSubmit={(e) => {
              e.preventDefault()
              store.addHabit(name)
              setName('')
              setAdding(false)
            }}
          >
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Habit name"
              onBlur={() => {
                if (!name.trim()) setAdding(false)
              }}
            />
          </form>
        ) : (
          <button className="ghost-btn" type="button" onClick={() => setAdding(true)}>
            + Add habit
          </button>
        )}
      </div>
    </HudPanel>
  )
}
