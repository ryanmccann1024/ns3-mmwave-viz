import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { Bucket, DecisionIndex } from '../../lib/decisionExplorer'
import {
  brushRangeForColumns,
  bucketize,
  columnForDecision,
  nearestDecision,
  stepDecision,
} from '../../lib/decisionExplorer'

interface Props {
  index: DecisionIndex
  /** inclusive decision integers drawn across the width */
  domain: [number, number]
  selectedDecision: number | null
  /** the brushed range drawn on this strip (overview only) */
  brush?: [number, number] | null
  onSelect: (decision: number) => void
  /** a drag across the strip; null clears (double-click / Escape) */
  onBrush?: (range: [number, number] | null) => void
  /** navigation range for keyboard shortcuts; defaults to the domain */
  navRange?: [number, number]
  label: string
  heightClass?: string
  coverageKnown: boolean
}

const COLORS = {
  reward: '#1e63e9',
  wash: 'rgba(30, 99, 233, 0.10)',
  zero: 'rgba(10, 19, 36, 0.18)',
  reval: '#7c3aed',
  gap: 'rgba(148, 163, 184, 0.9)',
  select: '#0a1324',
  brush: 'rgba(30, 99, 233, 0.14)',
  brushEdge: 'rgba(30, 99, 233, 0.6)',
  hover: 'rgba(10, 19, 36, 0.12)',
}

function hatch(ctx: CanvasRenderingContext2D): CanvasPattern | string {
  const tile = document.createElement('canvas')
  tile.width = 6
  tile.height = 6
  const t = tile.getContext('2d')
  if (!t) return COLORS.gap
  t.strokeStyle = COLORS.gap
  t.lineWidth = 1
  t.beginPath()
  t.moveTo(0, 6)
  t.lineTo(6, 0)
  t.stroke()
  return ctx.createPattern(tile, 'repeat') ?? COLORS.gap
}

function decisionOfColumn(x: number, domain: [number, number], columns: number): number {
  const span = domain[1] - domain[0] + 1
  return domain[0] + Math.floor((x * span) / columns)
}

const fmt = (v: number) => (Number.isNaN(v) ? '—' : v.toFixed(3))

/**
 * A canvas timeline over decision integers: one CSS pixel column per bucket,
 * reward drawn as a min→max bar, holes hatched, selection as an accent line and
 * the brushed range as a translucent fill. No DOM node per decision.
 */
export function DecisionStrip({
  index,
  domain,
  selectedDecision,
  brush = null,
  onSelect,
  onBrush,
  navRange,
  label,
  heightClass = 'h-24 max-sm:h-16',
  coverageKnown,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const baseRef = useRef<HTMLCanvasElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const [size, setSize] = useState({ width: 0, height: 0, dpr: 1 })
  const [hoverX, setHoverX] = useState<number | null>(null)
  const dragRef = useRef<{ startX: number; moved: boolean } | null>(null)
  const [dragPreview, setDragPreview] = useState<[number, number] | null>(null)

  useLayoutEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const measure = () => {
      const rect = el.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      setSize((prev) =>
        prev.width === Math.floor(rect.width) &&
        prev.height === Math.floor(rect.height) &&
        prev.dpr === dpr
          ? prev
          : { width: Math.floor(rect.width), height: Math.floor(rect.height), dpr }
      )
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const columns = size.width
  const buckets = useMemo<Bucket[]>(
    () => (columns > 0 ? bucketize(index, columns, domain) : []),
    [index, columns, domain]
  )
  const rewardRange = useMemo(() => {
    let lo = Infinity
    let hi = -Infinity
    for (const b of buckets) {
      if (!Number.isNaN(b.minReward) && b.minReward < lo) lo = b.minReward
      if (!Number.isNaN(b.maxReward) && b.maxReward > hi) hi = b.maxReward
    }
    if (!Number.isFinite(lo)) return null
    if (lo === hi) return { lo: lo - 0.5, hi: hi + 0.5 }
    return { lo, hi }
  }, [buckets])

  // Base layer: repaint only when width/dpr/domain/index change
  useEffect(() => {
    const canvas = baseRef.current
    if (!canvas || columns === 0 || size.height === 0) return
    canvas.width = Math.floor(columns * size.dpr)
    canvas.height = Math.floor(size.height * size.dpr)
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0)
    ctx.clearRect(0, 0, columns, size.height)
    const h = size.height
    const top = 4
    const bottom = h - 4
    const yOf = (v: number) =>
      rewardRange
        ? bottom - ((v - rewardRange.lo) / (rewardRange.hi - rewardRange.lo)) * (bottom - top)
        : h / 2
    const pattern = hatch(ctx)
    if (rewardRange && rewardRange.lo < 0 && rewardRange.hi > 0) {
      ctx.fillStyle = COLORS.zero
      ctx.fillRect(0, Math.round(yOf(0)), columns, 1)
    }
    // Reward as a line with a soft wash beneath it; a gap breaks the line
    const runs: { x: number; y: number }[][] = []
    let run: { x: number; y: number }[] = []
    for (const b of buckets) {
      if (b.hasGap) {
        ctx.fillStyle = pattern
        ctx.fillRect(b.x, 0, 1, h)
      }
      // Columns between two saved decisions are simply bridged; only a recorded gap breaks
      if (b.hasGap && run.length) {
        runs.push(run)
        run = []
      }
      if (b.count > 0 && !Number.isNaN(b.minReward)) {
        run.push({ x: b.x + 0.5, y: yOf((b.minReward + b.maxReward) / 2) })
      }
      if (b.revalCount > 0) {
        ctx.fillStyle = COLORS.reval
        ctx.fillRect(b.x, 0, 1, 3)
      }
    }
    if (run.length) runs.push(run)
    for (const r of runs) {
      ctx.beginPath()
      ctx.moveTo(r[0].x, bottom)
      for (const p of r) ctx.lineTo(p.x, p.y)
      ctx.lineTo(r[r.length - 1].x, bottom)
      ctx.closePath()
      ctx.fillStyle = COLORS.wash
      ctx.fill()
      ctx.beginPath()
      r.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)))
      ctx.strokeStyle = COLORS.reward
      ctx.lineWidth = 2
      ctx.lineJoin = 'round'
      ctx.lineCap = 'round'
      ctx.stroke()
    }
    if (!coverageKnown && buckets.length > 0) {
      // Trailing coverage unknown: a faint end marker, never a fabricated tail
      ctx.fillStyle = COLORS.zero
      ctx.fillRect(columns - 1, 0, 1, h)
    }
  }, [buckets, columns, size.height, size.dpr, rewardRange, coverageKnown])

  // Overlay: hover, selection, brush
  useEffect(() => {
    const canvas = overlayRef.current
    if (!canvas || columns === 0 || size.height === 0) return
    canvas.width = Math.floor(columns * size.dpr)
    canvas.height = Math.floor(size.height * size.dpr)
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0)
    ctx.clearRect(0, 0, columns, size.height)
    const h = size.height
    const range = dragPreview ?? brush
    if (range) {
      const x1 = columnForDecision(Math.min(range[0], range[1]), domain, columns)
      const x2 = columnForDecision(Math.max(range[0], range[1]), domain, columns)
      ctx.fillStyle = COLORS.brush
      ctx.fillRect(x1, 0, Math.max(1, x2 - x1 + 1), h)
      ctx.fillStyle = COLORS.brushEdge
      ctx.fillRect(x1, 0, 1, h)
      ctx.fillRect(x2, 0, 1, h)
    }
    if (hoverX !== null && hoverX >= 0 && hoverX < columns) {
      ctx.fillStyle = COLORS.hover
      const hoveredDecision = decisionOfColumn(hoverX, domain, columns)
      ctx.fillRect(columnForDecision(hoveredDecision, domain, columns), 0, 1, h)
    }
    if (
      selectedDecision !== null &&
      selectedDecision >= domain[0] &&
      selectedDecision <= domain[1]
    ) {
      const x = columnForDecision(selectedDecision, domain, columns)
      ctx.fillStyle = COLORS.select
      ctx.fillRect(x, 0, 1, h)
      ctx.beginPath()
      ctx.arc(x + 0.5, 3, 2.5, 0, Math.PI * 2)
      ctx.fill()
    }
  }, [columns, size.height, size.dpr, hoverX, selectedDecision, brush, dragPreview, domain])

  const xFromEvent = useCallback(
    (e: React.PointerEvent) => {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
      return Math.min(columns - 1, Math.max(0, Math.floor(e.clientX - rect.left)))
    },
    [columns]
  )

  const selectAtColumn = (x: number) => {
    const b = buckets[x]
    if (!b) return
    const guess =
      b.count > 0
        ? b.firstDecision + Math.floor((b.lastDecision - b.firstDecision) / 2)
        : decisionOfColumn(x, domain, columns)
    onSelect(nearestDecision(index, guess))
  }

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (columns === 0) return
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    dragRef.current = { startX: xFromEvent(e), moved: false }
  }
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (columns === 0) return
    const x = xFromEvent(e)
    setHoverX(x)
    const drag = dragRef.current
    if (drag && onBrush) {
      if (Math.abs(x - drag.startX) > 3) drag.moved = true
      if (drag.moved) {
        setDragPreview(brushRangeForColumns(buckets, drag.startX, x))
      }
    }
  }
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    dragRef.current = null
    if (!drag || columns === 0) return
    const x = xFromEvent(e)
    if (drag.moved && onBrush) {
      setDragPreview(null)
      const range = brushRangeForColumns(buckets, drag.startX, x)
      if (range) onBrush(range)
    } else {
      selectAtColumn(x)
    }
  }
  const onPointerLeave = () => {
    setHoverX(null)
    if (!dragRef.current) setDragPreview(null)
  }

  const nav = navRange ?? domain
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement
    if (target !== e.currentTarget) return
    const from = selectedDecision ?? nav[0]
    let next: number | null
    switch (e.key) {
      case 'ArrowRight':
        next = stepDecision(index, from, 1, nav)
        break
      case 'ArrowLeft':
        next = stepDecision(index, from, -1, nav)
        break
      case 'Home':
        next = nearestDecision(index, nav[0])
        break
      case 'End':
        next = nearestDecision(index, nav[1])
        break
      case 'PageUp':
        next = nearestDecision(index, Math.min(nav[1], from + 100))
        break
      case 'PageDown':
        next = nearestDecision(index, Math.max(nav[0], from - 100))
        break
      case 'Escape':
        if (onBrush) onBrush(null)
        e.preventDefault()
        return
      default:
        return
    }
    e.preventDefault()
    if (next !== null && next >= nav[0] && next <= nav[1]) onSelect(next)
  }

  const rawHovered = hoverX !== null ? buckets[hoverX] : undefined
  const hovered =
    rawHovered && rawHovered.count === 0 && !rawHovered.hasGap
      ? (buckets[columnForDecision(rawHovered.firstDecision, domain, columns)] ?? rawHovered)
      : rawHovered
  const readoutId = `${label.replace(/\s+/g, '-').toLowerCase()}-readout`
  const readout = hovered
    ? hovered.count === 0
      ? `Decision${hovered.firstDecision === hovered.lastDecision ? '' : 's'} ${hovered.firstDecision}${
          hovered.firstDecision === hovered.lastDecision ? '' : `–${hovered.lastDecision}`
        } · ${hovered.hasGap ? 'not recorded' : 'outside saved range'}`
      : `Decision${hovered.count === 1 ? '' : 's'} ${hovered.firstDecision}${
          hovered.firstDecision === hovered.lastDecision ? '' : `–${hovered.lastDecision}`
        } · ${hovered.count} saved${hovered.hasGap ? ' · has holes' : ''} · reward ${
          hovered.count === 1
            ? fmt(hovered.minReward)
            : `${fmt(hovered.minReward)}…${fmt(hovered.maxReward)}`
        }${hovered.revalCount > 0 ? ` · ${hovered.revalCount} revalidated` : ''}`
    : selectedDecision !== null
      ? `Decision ${selectedDecision} selected`
      : 'Hover, or use the arrow keys, to inspect decisions'

  return (
    <div className="flex flex-col gap-2">
      <div
        ref={wrapRef}
        role="group"
        aria-label={label}
        aria-describedby={readoutId}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerLeave}
        onDoubleClick={() => onBrush?.(null)}
        className={`relative w-full ${heightClass} rounded-xl bg-white border border-hairline overflow-hidden cursor-crosshair select-none touch-none`}
      >
        <canvas ref={baseRef} className="absolute inset-0 w-full h-full" aria-hidden="true" />
        <canvas ref={overlayRef} className="absolute inset-0 w-full h-full" aria-hidden="true" />
      </div>
      <div
        id={readoutId}
        aria-live="polite"
        className="text-base text-ink-2 tabular-nums truncate min-h-6"
      >
        {readout}
      </div>
    </div>
  )
}
