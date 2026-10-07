import { useEffect, useState } from 'react'
import type { RunEntry } from '../../lib/assembleRuns'
import { deliveryRatio, sinrSeries, type RunPreview } from '../../lib/runPreview'
import { MOTION } from '../../styles/motion'

// Each run is read once per session, however often its card mounts
const cache = new Map<string, Promise<RunPreview | null>>()

function loadPreview(run: RunEntry): Promise<RunPreview | null> {
  let pending = cache.get(run.key)
  if (!pending) {
    pending = Promise.all([run.linksFile.text(), run.flowsFile?.text() ?? Promise.resolve(null)])
      .then(([links, flows]) => {
        const { series, mean } = sinrSeries(links)
        return { sinr: series, meanSinrDb: mean, delivery: flows ? deliveryRatio(flows) : null }
      })
      .catch(() => null)
    cache.set(run.key, pending)
  }
  return pending
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="min-w-0">
      <div className="text-2xl font-semibold tabular-nums tracking-tight text-ink-title">
        {value}
      </div>
      <div className="text-sm font-medium text-ink-2">{label}</div>
    </div>
  )
}

/** Headline numbers for a run, read lazily from its CSVs */
export function RunPreviewPanel({ run }: { run: RunEntry | undefined }) {
  const [preview, setPreview] = useState<RunPreview | null>(null)
  useEffect(() => {
    if (!run) return
    let cancelled = false
    loadPreview(run).then((p) => {
      if (!cancelled) setPreview(p)
    })
    return () => {
      cancelled = true
    }
  }, [run])

  // Reserve the final height so cards never jump when the numbers arrive
  if (!preview) return <div className="h-14" aria-hidden="true" />
  return (
    <div className={`h-14 ${MOTION.enterFade}`}>
      <div className="grid grid-cols-2 gap-4">
        <Stat
          value={preview.meanSinrDb === null ? 'n/a' : `${preview.meanSinrDb.toFixed(1)} dB`}
          label="Signal"
        />
        <Stat
          value={preview.delivery === null ? 'n/a' : `${Math.round(preview.delivery * 100)}%`}
          label="Delivered"
        />
      </div>
    </div>
  )
}
