import type { ActivityItem } from '@shared/types'

/** At most this many toasts are on screen at once. */
export const MAX_TOASTS = 3

/**
 * Adds new events (oldest first) to the toasts on screen. An event with the same title and kind as one already
 * shown takes its place instead of stacking. When there are too many, the oldest ones that are not errors go
 * first, and the number that was pushed out is returned so the stack can say so.
 */
export function stackToasts(shown: ActivityItem[], fresh: ActivityItem[]): { next: ActivityItem[]; skipped: number } {
  let next = [...shown]
  for (const a of fresh) {
    const same = next.findIndex((x) => x.title === a.title && x.kind === a.kind)
    if (same >= 0) next[same] = a
    else next.push(a)
  }
  let skipped = 0
  while (next.length > MAX_TOASTS) {
    const i = next.findIndex((x) => x.kind !== 'error')
    next.splice(i >= 0 ? i : 0, 1)
    skipped++
  }
  return { next, skipped }
}
