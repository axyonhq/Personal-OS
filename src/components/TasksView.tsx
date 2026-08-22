import type { Store } from '../hooks/useStore'
import type { ProjectId } from '../types'
import { ProjectCard } from './ProjectCard'
import { Button } from './ui/Button'

export function TasksView({
  store,
  onStartSession,
}: {
  store: Store
  onStartSession: (projectId: ProjectId) => void
}) {
  return (
    <div className="layout-stack tasks-stage">
      <div className="tasks-toolbar">
        <h2>Projects</h2>
        <Button
          variant={store.state.showAllTasks ? 'secondary' : 'ghost'}
          size="sm"
          onClick={() => store.setShowAllTasks(!store.state.showAllTasks)}
        >
          {store.state.showAllTasks ? 'Showing all tasks' : 'Show all tasks'}
        </Button>
      </div>

      <div className="grid-projects">
        {store.projects.map((p) => (
          <ProjectCard
            key={p.id}
            store={store}
            project={p}
            onStart={() => onStartSession(p.id)}
          />
        ))}
      </div>
    </div>
  )
}
