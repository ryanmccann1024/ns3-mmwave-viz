import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'

const EASE = 'cubic-bezier(0.2, 0, 0, 1)'
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * FLIP for re-sorted lists: children marked `data-flip="<id>"` slide from their old row
 * to their new one, and rows that were not there before rise in. Positions are offsetTop
 * (layout, not transform), so a re-render mid-slide never restarts the animation.
 * The container must be the rows' offsetParent (give it `relative`).
 */
export function useFlip(ref: RefObject<HTMLElement>) {
  const tops = useRef(new Map<string, number>())
  useLayoutEffect(() => {
    const root = ref.current
    if (!root) return
    const first = tops.current.size === 0,
      reduce = reducedMotion(),
      next = new Map<string, number>()
    root.querySelectorAll<HTMLElement>('[data-flip]').forEach((node) => {
      const id = node.dataset.flip ?? '',
        top = node.offsetTop,
        prev = tops.current.get(id)
      next.set(id, top)
      if (reduce || first) return
      if (prev === undefined)
        node.animate(
          [
            { opacity: 0, transform: 'translateY(6px)' },
            { opacity: 1, transform: 'none' },
          ],
          { duration: 240, easing: EASE }
        )
      else if (prev !== top)
        node.animate([{ transform: `translateY(${prev - top}px)` }, { transform: 'none' }], {
          duration: 360,
          easing: EASE,
        })
    })
    tops.current = next
  })
}

/** A number that eases to each new target instead of jumping (cubic ease-out) */
export function useTween(target: number | null, ms = 480): number | null {
  const [shown, setShown] = useState(target)
  const current = useRef(target)
  useEffect(() => {
    const from = current.current
    if (target == null || from == null || from === target || reducedMotion()) {
      current.current = target
      setShown(target)
      return
    }
    const start = performance.now()
    let frame = 0
    const step = (now: number) => {
      const k = Math.min(1, (now - start) / ms),
        v = from + (target - from) * (1 - (1 - k) ** 3)
      current.current = v
      setShown(v)
      if (k < 1) frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [target, ms])
  return shown
}

/** False on the first paint and true right after, so widths can grow from zero */
export function useEntered(): boolean {
  const [entered, setEntered] = useState(false)
  useEffect(() => {
    const frame = requestAnimationFrame(() => setEntered(true))
    return () => cancelAnimationFrame(frame)
  }, [])
  return entered
}
