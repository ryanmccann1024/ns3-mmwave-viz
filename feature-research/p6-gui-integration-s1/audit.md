# S1 audit — safe catalog and legacy isolation

## Files changed
- `vite-plugin-outputs.ts` (modified)
- `src/lib/resultCatalog.ts` (created)
- `src/lib/assembleRuns.ts` (modified)
- `package.json` (modified: `test` script only)
- `tests/resultCatalog.test.ts` (created)
- `tests/outputsServer.test.ts` (created)
- `tests/assembleRuns.test.ts` (created)
- `feature-research/p6-gui-integration-s1/audit.md` (this file)

## What changed per file
- `vite-plugin-outputs.ts`: `import type { Plugin }`. New exported pure helpers `listOutputs(root, limit)`,
  `resolveServedPath(root, rawRelPath)`, `mimeFor(file)`, `LIST_LIMIT`. Middleware strips query strings, allows only
  GET/HEAD (405 otherwise), maps malformed encoding/NUL to 400, denies by `path.relative` containment and again after
  `fs.realpathSync` on root and target (403), serves regular files only (404 otherwise). Listing does not follow
  symlinks, skips dot-directories and `train/**/episode-*`, is filtered to reader file names, sorted, capped at 50 000;
  response stays a JSON array, truncation reported in `X-Outputs-Truncated`. `.jsonl` → `application/x-ndjson`.
- `src/lib/resultCatalog.ts`: the `ResultCatalog` interface and functions from interfaces.md. FSA walk is iterative,
  stores handles only, skips dot-directories, capped at `MAX_CATALOG_ENTRIES` (50 000). Dev catalog lists via
  `/api/outputs` and fetches `/outputs/<encoded>` only in `getFile()`; nothing is cached.
- `src/lib/assembleRuns.ts`: new exported `isLegacyRunPath(path)`; `assembleRuns` skips non-legacy paths;
  `fetchRunsFromDevServer` downloads only legacy-shaped known files. Rest of the file untouched.
- `package.json`: added `"test"` script. No dependency changes.

## Deviations
- `ResultCatalog` has one extra optional member `readonly truncated?: boolean`; `MAX_CATALOG_ENTRIES` is also exported.
- `resolveServedPath` returns `{status:200,file} | {status:400|403|404}` instead of `string | null` so the middleware
  can distinguish 400/403/404.
- Legacy shape is slightly wider than strictly `HH-MM-SS`: real data under `2026-05/19/13-59-28-validation/<batch>/seed-N/`
  exists and is grouped today, so the time segment allows a `-suffix` and one arbitrary directory (point-NNN or batch name)
  may sit between time and `seed-N`/`inputs`. RunEntry field computation is unchanged so those runs display as before.
- Audit placed in `p6-gui-integration-s1/` to avoid colliding with the concurrent agent's audit.

## Tests
- `npm test`: 8 tests in my three files pass (no other test files were present at run time).
- `npx tsc --noEmit`: clean. `npx eslint src/lib/resultCatalog.ts src/lib/assembleRuns.ts`: clean.
- Prettier check clean on all touched files (ran `prettier --write` on `vite-plugin-outputs.ts` only).
- Read-only sanity run against the real outputs root: 2795 listed paths in ~0.23 s, not truncated, 0 train rollout paths,
  370 legacy paths all under `2026-*`, no `2026-*` seed/inputs file rejected.

## Open risks
- Non-timestamp runs previously grouped by accident (`calfex/MM-DD/HHMM-HHMM/seed-N`, `p0-*/…/seed-N`) no longer appear
  as legacy runs or get downloaded in dev mode. This follows the plan, but `calfex` may be user-visible.
- Middleware itself (405, HEAD, headers) is not covered by automated tests; only the pure helpers are. Needs the
  human dev-mode check from the plan.
- The plugin is outside `tsconfig` include and the lint script, as before; it was type-checked ad hoc only.
- Listing walks `tuning-venv` and similar non-result trees (filtered out, but traversed).
