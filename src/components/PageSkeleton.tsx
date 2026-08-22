'use client'

import { Skeleton } from './ui/Surfaces'

/** Placeholder shown while a lazily-loaded view is fetched. */
export function PageSkeleton() {
  return (
    <div className="ui-stack" aria-busy="true" aria-label="Loading">
      <Skeleton height="2.5rem" width="40%" />
      <div className="ui-grid ui-grid-3">
        <Skeleton height="7rem" />
        <Skeleton height="7rem" />
        <Skeleton height="7rem" />
      </div>
      <Skeleton height="12rem" />
      <Skeleton height="8rem" />
    </div>
  )
}
