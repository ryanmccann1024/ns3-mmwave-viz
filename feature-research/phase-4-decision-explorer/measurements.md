# Phase 4 measurements (local, untracked)

Date: 2026-10-01. Machine: this Mac (Darwin 27, Node v22.17.0). Dev build.

## WP-0 baseline data facts
- GUI repo has no `outputs/`; the dev server serves `../ns3-mmwave/scratch/mesh-sim/outputs` (30,470 catalog paths, 992 eval `steps.jsonl`).
- Largest real `steps.jsonl` (any episode): 234,127 B, 122 lines = header + 121 records (`num_decisions` 120 → decisions 0…120, every decision saved). ≈1.9 KB/record with `facts`. Contract: `tick_s` 0.5, `decision_interval_ticks` 2, hold at index 4, 6 slots, 7 node ids (`BD1`, `I17`, …).
- Largest eval `steps.jsonl`: 232,905 B (random_valid/episode-0002 of `5-calfex-…`), same shape.
- Extrapolation: 12k decisions ≈ 23 MB; 200k ≈ 380 MB. 64 MiB auto-load threshold ≈ 33k decisions.
- Dev-build playback FPS / time-to-interactive on a real episode: **not measured**. Browser interaction became available for the repair pass below, but a reproducible frame-rate/TTI measurement was not captured.

## P-1 pure data layer (Node, synthetic, sampledEvery=2 + 0.5–1 % drops, 6 slots)
| N | records | jsonl bytes | build index | 1000× join | 1000× nearest | bucketize(1600) | rowIndex build + 1000 rowAt | parseSteps |
|---|---|---|---|---|---|---|---|---|
| 12,000 | 5,941 | 2.12 MB | 2.1 ms | 1.6 ms | 0.5 ms | 0.9 ms | 2.9 ms | 9.7 ms |
| 200,000 | 99,001 | 35.8 MB | 9.9 ms | 1.1 ms | 0.3 ms | 3.1 ms | 14.7 ms | 200.6 ms |

Test-agent run of `tests/decisionExplorer.test.ts` stress case: build 11.9 ms @12k, 14.4 ms @200k; bucketize 0.8 / 5.7 ms.

Against the §11 proposal: index < 150 ms @12k (2–12 ms ✔), < 1.5 s @200k (10–14 ms ✔), bucketize < 16 ms @200k (3–6 ms ✔). FPS delta (P-2), heap (P-3), input delay (P-4): **not measured**; the browser pass below was functional, not an instrumented performance trace.

## Browser charter §10
Original Implementer pass: not executed because the browser extension was unavailable. See the repair pass below; this charter remains incomplete.

## Reviewer-blocker repair: live browser pass

Date: 2026-10-01. Local Vite dev server, real simulator output catalog. IAB viewport checks at 375/768/1280; Safari baseline checks. The 1 KiB test limit was supplied through `VITE_TELEMETRY_AUTO_LOAD_BYTES=1024` when starting the dev server, with no source edit. These are observed behaviors, not a claim that the full charter or performance gate passed.

| Check | Result | Evidence / remaining condition |
|---|---|---|
| B-1 | Partial | IAB: real 121-record model evaluation episode opened, Decisions selected decision 1 and scene frame 3 at t=1 s. Safari: baseline episode opened, but model episode not repeated there. |
| B-2 | Pass (IAB) | Selecting decision 51 paused and sought frame 103/t=51 s; detail used input from decision 50. |
| B-3 | Partial | Arrow, Home, End, PageUp/Down and Escape changed the decision/range in IAB. Visual focus ring was not separately checked. |
| B-4 | Pending | No sampled evaluation `steps.jsonl` found among the real evaluation outputs inspected; no synthetic browser fixture was installed. Sampled/missing-source unit cases pass, but they do not replace this browser check or Safari repeat. |
| B-5 | Pass (IAB) | Drag brushed approximately decisions 31–50; focused strip/list showed that range, selecting decision 40 sought t=40 s, and Show all restored the full range. |
| B-6 | Partial | Clicking a chip selected the slot; Safari scene click on geometric UAV-a kept Decisions open and selected the UAV-a chip. Scene highlight and unmapped case were not visually certified. |
| B-7 | Partial | Five sequential replay switches among seeds 4–8 ended on the correct seed/frame set with no captured console errors. They were not completed within the charter's <2 s window. |
| B-8 | Pass for evaluation | Hold and model opened in IAB; geometric, optimization and random-valid opened in Safari. All showed the shared context/action/outcome layout without invented preferences. Training awaits gated WP-7. |
| B-9 | Pending | Reduced-motion setting was not changed/emulated; no Safari repeat. |
| B-10 | Pass (IAB) | At 375/768/1280 px, document width matched viewport, one timeline was present; at 375 px the chip rail scrolled horizontally (306 px client, 450 px content). |
| B-11 | Partial | Charts/SINR tab opened; sharp spikes, actual gap behavior and no animation on switch were not visually certified. |
| B-12 | Partial | Decision detail showed pre-action mask in model and baseline. EpisodeDetails' separate mask label was not opened in this pass. |
| B-13 | Pending | Full Home→Runs→Experiments→Experiment→Player keyboard focus traversal and slider-thumb ring not checked. |
| B-14 | Pass (IAB/Safari) | With 1 KiB threshold, a 196 KiB model file and 9 KiB baseline file each showed explicit-load state; clicking Load this episode restored the decision panel and sought a real frame. This verifies the threshold path, not 200k-decision heap/performance behavior. |

Performance still required for sign-off: WP-0 browser FPS/TTI baseline; P-2 Decisions-vs-Overview FPS and React commit behavior on the same episode; P-3 heap delta after loading the largest episode; P-4 pointer readout latency and list scroll. The available IAB DOM evaluation scope does not expose `requestAnimationFrame` or `performance`, and no Chrome Performance/Memory or React Profiler trace was captured. Do not infer the FPS budget from the passing Node microbenchmarks.
