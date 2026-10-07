# Re-review — Decision Explorer T0 + motion (after three blockers)

Date: 2026-10-01 · Branch `feat/decision-explorer`, HEAD `96a02ed3` plus an uncommitted worktree · Reviewer had fresh context and made no source edits.

**Scope.** The union of plan §15 "Files touched" and the audit's "Files changed". `git diff --name-only` matches the audit's modified list exactly, so nothing is out of scope. All audit files appear in §15, with `pages/shared.tsx` covered as "the shared rows file(s)". These files are untouched: Row.tsx, BaselineInfo.tsx, the T1-owned `resultCatalog.ts`/`experimentIndex.ts`/`trainingRun.ts`, `vite-plugin-outputs.ts`, `useMetricSeries.ts`, `tokens.ts` and `canvas/**`. `src/schemas/` and `tests/fixtures/decision_record/` do not exist, so no T1 code started before its gate.

**Commands run by this reviewer.**
- `npm test`: 145 tests, 144 pass, 0 fail, 1 skipped (the existing real-root smoke test).
- `npm run lint`: exit 0.
- `tsc --noEmit`: exit 0.
- `npm run build`: passes, with only the existing >500 kB chunk warning.
- `prettier --check` on the decisions components, `decisionExplorer.ts`, its test and `PlayerPage.tsx`: clean.
- A scratch script (outside the repo) copied the strip's pointer helpers and compared them with `bucketize` at 50/121/600/1600 columns on dense and sampled 121-decision episodes. Results are below.

---

## Blocking issues

### Code correctness

**B-1 (original blocker 1: one owning-column mapping). Partly fixed, still blocking.**

Fixed parts, checked numerically (0 mismatches at 50/121/600/1600 columns, dense and `sampledEvery: 2`):
- `columnForDecision` (`src/lib/decisionExplorer.ts:389-399`) is the exact inverse of `bucketize`'s ownership rule (`decisionExplorer.ts:423-427`): `ceil((o+1)·cols/span) − 1` is the smallest `x` with `floor((x+1)·span/cols) > o`. The integer arithmetic cannot cross a rounding boundary.
- **Selected marker:** `DecisionStrip.tsx:193-204` uses `columnForDecision`. At 600 columns decision 1 lands on column 9 (`wide[9].firstDecision === 1`), not on decision 0.
- **Hover line and readout:** `DecisionStrip.tsx:188-192` and `:303-307`. Hovering a shared empty column now reports the decision that owns it. In the sampled case it reports "not recorded" for the hatched owner of a missing decision, not "outside saved range". Test: `tests/decisionExplorer.test.ts:493-517`.
- **Click:** `selectAtColumn` (`DecisionStrip.tsx:215-223`) on a shared column guesses `firstDecision`, which is the same decision the readout names.

Still broken: **the brush end does not use the owning-column mapping.**
- When the drag is committed (`DecisionStrip.tsx:251-257`) and when the preview is drawn (`:238-241`), the range end is computed as `decisionOfColumn(maxX + 1) − 1`. That is `bucketize`'s raw `lastRaw` (`decisionExplorer.ts:424`), not `bucket.lastDecision = max(first, lastRaw)` (`:425`).
- Whenever the strip has more columns than decisions, every non-owning column has `lastRaw = first − 1`. A drag that ends on such a column therefore drops the decision the hover readout names under the pointer.
- Measured at 121 decisions over 600 columns: 479 of 600 end columns disagree with the readout. At 1,600 columns, 1,479 of 1,600 disagree.
- Concrete example: a drag ending at x=248 shows the readout "decision 50" but commits `[…, 49]`. The preview's right edge is drawn at column 247, before the pointer.
- The focused strip uses the same handler and spans far fewer decisions (for example 20 decisions over 600 px, about 30 px per decision). There, about 29 of every 30 end positions brush one decision short.
- The brush feeds `decisionRange`, which then sets the scope of the focused strip, the list and Prev/Next (D-10, A-4).
- This is exactly the "brush … same owning-column mapping" condition this re-review was asked to verify. The regression test covers marker and hover only; nothing tests the brush, because `decisionOfColumn` is local to the component.
- Fix (small): take the end from `buckets[maxX].lastDecision`, or equivalently `max(decisionOfColumn(maxX), decisionOfColumn(maxX + 1) − 1)`, in both the preview and the commit. Move the pointer-range calculation into a pure exported helper in `decisionExplorer.ts`. Add a 600-column test asserting that for every end column the brushed range includes the decision the readout names, for both dense and sampled data. The start side (`decisionOfColumn(minX)`) already matches the readout.

**B-2 (original blocker 2: playback re-bucketing and scroll churn). Fixed in code. The performance proof is not done (see B-3).**
- `fullDomain` is memoized on `[index]` (`DecisionExplorer.tsx:71-74`). `navRange` is memoized on `[decisionRange, fullDomain]` (`:75-78`).
- The upstream identities are stable during playback:
  - `explorer.index` is memoized on `telemetry` (`PlayerPage.tsx:213-220`).
  - `telemetry` is the object held in state (`useEpisodeTelemetry.ts:82`). The `{...state, loadExplicitly}` spread at `:94` creates a new wrapper each render, but the `telemetry` reference inside it does not change.
  - `decisionRange` is React state (`PlayerPage.tsx:202`), and playback never writes it.
- Effects that therefore no longer re-run on a playback frame:
  - bucket memo (`DecisionStrip.tsx:106-109`)
  - `rewardRange` (`:110-120`)
  - base-canvas paint (`:123-165`)
  - overlay paint, except on hover/select/brush (`:168-205`)
  - the list's `makeRowIndex` memo (`DecisionList.tsx:35`)
  - the scroll-into-view effect, `[selectedDecision, rows, viewport]` (`DecisionList.tsx:45-69`); playback never changes `selectedDecision`.
- What remains, and why it is not blocking:
  - `DecisionExplorer` still re-renders on every **frame-index change** (not on every RAF tick), because it receives `frame` (`PlayerPage.tsx:553`).
  - `DecisionList` is not memoized, so it rebuilds its ~25 windowed row *elements*, each doing a `recordForDecision` binary search, on each frame. React keeps the DOM nodes because the keys are stable. There is no rebucketing, repainting or scrolling.
  - Wrapping it in `React.memo` alone would not stop this. `onSelect` = `selectDecision` has `sim` in its deps (`PlayerPage.tsx:290`), and `useSimData` returns a new object every render (`useSimData.ts:392-407`). Listed under non-blocking issues; it needs the P-2 profiler check.

### Browser and performance sign-off (separate from code)

**B-3 (original blocker 3: browser and performance evidence). Unverified. Still blocking for any ready or complete claim.**

`measurements.md` is honest about what is missing; I did not treat passing unit tests as evidence for any of it.

*Charter status (§10):*
- **Pending:** B-4 (sampled episode / missing-source text in a browser, plus the Safari repeat), B-9 (reduced motion, plus Safari), B-13 (focus traversal across all pages, slider-thumb ring).
- **Partial:**
  - B-1: no Safari model run.
  - B-3: focus ring not checked.
  - B-6: scene highlight and the unmapped case not certified.
  - B-7: rapid switching not done within the required <2 s.
  - B-11: chart spikes, gaps and no-animation not certified.
  - B-12: the EpisodeDetails label was not opened.
- **Wrong browser:** §10 says "Use Chrome", but the pass was in "IAB" and Safari. No Chrome run is recorded.
- **Timing unclear:** measurements.md does not say whether the browser pass ran before or after the `columnForDecision` change. B-5's "approximately decisions 31–50" is consistent with the brush-end defect above going unnoticed.

*Accessibility (§11 says "must pass before PR"):*
- Accent text ≥ 4.5:1 and ring ≥ 3:1 contrast against glass surfaces: not recorded anywhere.
- Reduced motion (B-9): pending.

*Performance (§11):*
- WP-0 browser FPS and time-to-interactive baseline: **not measured** (`measurements.md:10`).
- P-2 FPS delta with Decisions vs Overview, plus React Profiler: not measured.
- P-3 heap delta: not measured.
- P-4 pointer→readout latency and list scroll: not measured (`measurements.md:20, :46`).
- The ≤ 2 fps budget (§11, A-7) therefore cannot be assigned or checked, and stop condition 7 cannot be evaluated.
- The P-1 Node microbenchmarks (12k/200k index build, bucketize) are real and within the proposal. They are not browser evidence.

*Combined-feature gate (§17), separate from T0 quality:*
- WP-7/T1 has not started. G-1…G-4 are open: no pinned producer schema or SHA-256, no fixtures, no vendored schema, no pin test.
- §17 items 3 and 6 cannot pass. The plan explicitly forbids presenting the T0-only branch as completion.

---

## Non-blocking issues

1. **Per-frame re-render of the explorer subtree** (`PlayerPage.tsx:290, 553`; `DecisionList.tsx` not memoized).
   - P-2 allows updates at decision boundaries. Frames arrive about twice per decision here, and more often at higher playback speed.
   - Cheap at the current window size, but confirm it with the React Profiler during P-2.
   - To actually stop the re-renders: depend on `sim.pause`/`sim.seekDecisionWindow`/`sim.seekInstant` (each already a stable `useCallback`) instead of `sim`, and memoize `DecisionList`.
2. **Hover readout is `aria-live="polite"`** (`DecisionStrip.tsx:346`) and changes on every column during pointer movement. Screen readers will be flooded. Consider announcing only on keyboard or selection changes.
3. **Raw-record cap counts UTF-16 code units, not bytes** (`DecisionDetail.tsx:28, 62`). The 64 KB label is approximate for non-ASCII `facts`.
4. **Visual oddity in the focused strip:** each decision's bar, hatch, selection and hover line sit on a single 1-px owning column at the *right* edge of a span that can be about 30 px wide. This matches the mapping, but the bar is drawn away from where the pointer sits. Consider drawing owner bars across their whole span when `cols > span`; this would not change the mapping.
5. **PageUp = +100 / PageDown = −100** (`DecisionStrip.tsx:286-290`). This is slider-like and defensible, but §5.2 does not give a direction. Document it in the strip's description or the hover hint.
6. **Audit-acknowledged items I agree are non-blocking:**
   - Disclosure's `overflow-hidden` may clip its focus ring.
   - ChartsView publishes the default metric as a preference.
   - `transition-colors` remains in unlisted files.
   - Deviation 9: the `min-[1600px]` breakpoint is used instead of a measured container width.

---

## Verdict

**Fix first. The GUI PR is not ready.**

| Original blocker | Status | Evidence |
|---|---|---|
| 1. Owning-column consistency | **Still blocking (narrowed).** Marker, hover readout and click are fixed. The brush end does not use the mapping: 479 of 600 end columns at 121 decisions disagree with the readout. | `DecisionStrip.tsx:238-241, 251-257` vs `decisionExplorer.ts:424-425` |
| 2. Stable fullDomain/navRange | **Fixed in code.** No rebucketing, base repaint, row-index rebuild or repeated scrolling during playback. Row elements still re-render per frame (non-blocking). | `DecisionExplorer.tsx:71-78`; `DecisionStrip.tsx:106-165`; `DecisionList.tsx:35, 45-69` |
| 3. Browser and performance evidence | **Unverified and incomplete.** B-4, B-9 and B-13 are pending; six checks are partial; no Chrome run; no contrast check; WP-0, P-2, P-3 and P-4 are unmeasured. | `measurements.md:10, 20, 31-46` |

- **Code-correctness gate:** after the brush-end fix and its regression test, the T0 code has no known correctness blockers. Tests, lint, tsc and build are green.
- **Sign-off gate:** separate and still open. It needs the §10 charter in Chrome with the Safari repeats, §11 accessibility contrast and reduced-motion checks, and instrumented P-2/P-3/P-4 measurements with budgets assigned.
- **Completion:** even with both gates closed, this branch can at most be a draft PR clearly labelled T0 + motion. The plan's completion gate (§17) also requires WP-7/T1 and the producer schema pin, which have not started.
