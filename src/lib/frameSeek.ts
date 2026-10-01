// Pure helpers that pick a real playback frame for a decision's outcome interval.
// They never substitute a frame outside the interval: no frame means null.

function timesValid(frameTimes: ArrayLike<number>): boolean {
  if (frameTimes.length === 0) return false
  let prev = -Infinity
  for (let i = 0; i < frameTimes.length; i++) {
    const t = frameTimes[i]
    if (!Number.isFinite(t) || t < prev) return false
    prev = t
  }
  return true
}

/** Largest index whose time is <= limit, or -1. Requires ascending times. */
function lastIndexAtOrBefore(frameTimes: ArrayLike<number>, limit: number): number {
  let lo = 0
  let hi = frameTimes.length - 1
  let found = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (frameTimes[mid] <= limit) {
      found = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  return found
}

/**
 * The latest actual frame inside the half-open outcome interval (start, end].
 * `toleranceS` widens the inclusive end and keeps the exclusive start strict:
 * a frame is inside iff start + tolerance < time <= end + tolerance.
 * Returns null for empty, unsorted or nonfinite frame times, an empty interval,
 * or when no frame lies inside; it never returns a nearby outside frame.
 */
export function frameIndexForDecisionWindow(
  frameTimes: ArrayLike<number>,
  startExclusiveS: number,
  endInclusiveS: number,
  toleranceS: number
): number | null {
  if (!Number.isFinite(startExclusiveS) || !Number.isFinite(endInclusiveS)) return null
  if (!Number.isFinite(toleranceS) || toleranceS < 0) return null
  if (endInclusiveS <= startExclusiveS) return null
  if (!timesValid(frameTimes)) return null
  const index = lastIndexAtOrBefore(frameTimes, endInclusiveS + toleranceS)
  if (index < 0) return null
  return frameTimes[index] > startExclusiveS + toleranceS ? index : null
}

/**
 * The frame recorded at an instant (used for the reset snapshot at t = 0):
 * the latest frame with |time - atS| <= tolerance, or null.
 */
export function frameIndexAtTime(
  frameTimes: ArrayLike<number>,
  atS: number,
  toleranceS: number
): number | null {
  if (!Number.isFinite(atS) || !Number.isFinite(toleranceS) || toleranceS < 0) return null
  if (!timesValid(frameTimes)) return null
  const index = lastIndexAtOrBefore(frameTimes, atS + toleranceS)
  if (index < 0) return null
  return Math.abs(frameTimes[index] - atS) <= toleranceS ? index : null
}
