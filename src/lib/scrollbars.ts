/** Scrollbars stay hidden until an element scrolls, and hide again shortly after it stops */
const HIDE_AFTER_MS = 900

export function revealScrollbarsWhileScrolling(): void {
  const timers = new WeakMap<Element, number>()
  document.addEventListener(
    'scroll',
    (event) => {
      const el =
        event.target === document ? document.documentElement : (event.target as Element | null)
      if (!el || typeof el.setAttribute !== 'function') return
      el.setAttribute('data-scrolling', '')
      window.clearTimeout(timers.get(el))
      timers.set(
        el,
        window.setTimeout(() => el.removeAttribute('data-scrolling'), HIDE_AFTER_MS)
      )
    },
    { capture: true, passive: true }
  )
}
