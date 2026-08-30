'use client'

import { BookOpen, Play } from 'lucide-react'
import { useState } from 'react'
import type { Store } from '../hooks/useStore'
import { todayDateKey } from '../utils/time'
import { HomeFinances } from './home/HomeFinances'
import { HomeMetrics } from './home/HomeMetrics'
import { HomeSundayReview } from './home/HomeSundayReview'
import { HomeTasks } from './home/HomeTasks'
import { HomeVision } from './home/HomeVision'
import { JournalCapture } from './JournalCapture'
import { Button } from './ui/Button'
import { Modal } from './ui/Modal'

export function DashboardView({
  store,
  onStartSession,
}: {
  store: Store
  onStartSession: () => void
}) {
  const [journalOpen, setJournalOpen] = useState(false)
  const busy = !!store.state.activeTimer

  return (
    <div className="home">
      <HomeVision store={store} />
      <HomeSundayReview store={store} />
      <HomeMetrics store={store} />

      <div className="home-actions">
        <Button
          variant="secondary"
          size="lg"
          iconLeft={<BookOpen />}
          onClick={() => setJournalOpen(true)}
        >
          Upload journal
        </Button>
        <Button
          variant="primary"
          size="lg"
          iconLeft={<Play />}
          disabled={busy}
          onClick={onStartSession}
        >
          {busy ? 'Session running' : 'Start deep work'}
        </Button>
      </div>

      <div className="home-split">
        <HomeFinances store={store} />
        <HomeTasks store={store} />
      </div>

      <Modal open={journalOpen} onClose={() => setJournalOpen(false)} title="Journal" size="lg">
        <JournalCapture store={store} defaultDate={todayDateKey()} heading="Photos of pages" />
      </Modal>
    </div>
  )
}
