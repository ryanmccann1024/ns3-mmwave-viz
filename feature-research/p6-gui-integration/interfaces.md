# Reader slice interfaces (local coordination note)

Repos: GUI `/Users/ryanmccann/Desktop/git.nosync/ns3-mmwave-viz`; simulator (READ ONLY)
`/Users/ryanmccann/Desktop/git.nosync/ns3-mmwave/scratch/mesh-sim` (`MESH`). Real root: `MESH/outputs/bypass-matrix`;
incomplete comparison: `MESH/outputs/missing-check/comparison.json`; standalone evals: `MESH/outputs/p3-verification/bypass-eval-*`.
Plan: `docs/rl-program/p6-gui-integration/gui-integration-implementation-plan.md`. Scout: `feature-research/p6-gui-integration/scout.md`.

## Hard rules
- Reader only. No POST routes, no process spawning, no config editing, no job control.
- Never recompute means, differences or intervals. Display simulator fields verbatim.
- Never resolve absolute paths from manifests; never suffix-search. Identity = declared row label + training seed + policy +
  basename(episode_dir) + seed, resolved relative to the manifest's own directory inside the catalog.
- Edit ONLY the files assigned to you. No git state changes. No repo-wide formatters or `--fix`.
- Runtime code: short comments only, no phase labels ("P6", "S1"), no AI attribution. Prettier style: no semicolons, single
  quotes, 2 spaces, width 100.
- Tests: Node built-in runner, no new dependencies. `npm test` = `node --experimental-strip-types --test tests/*.test.ts`
  (Node 22.17). Consequences for any module a test imports: use `import type` for types; value imports between local
  modules need the `.ts` extension (tsconfig allows it); no enums, namespaces or constructor parameter properties.
  Tests live in top-level `tests/`, use `node:test` + `node:assert/strict`, tiny synthetic fixtures inline. Keep them few.

## Verified contract (S0)
- Versions: experiment_plan_version 1, eval_manifest_version 2, comparison_version 1, train manifest_version 4,
  rl_episode manifest_version 3, telemetry_version 1 (steps.jsonl header line), fetch_manifest_version 1.
- Layout: `<root>/experiment_plan.json`, `<root>/eval/<row>/train-seed-<T>/eval_manifest.json`,
  `<evalDir>/<policy>/episode-NNNN/{rl_episode.json,steps.jsonl,inputs/{nodes.json,buildings.json,run.ini},seed-<S>/{links,positions,flows,routes,mcs,rx-power}.csv,seed-<S>/summary.json}`,
  `<root>/train/<row>/train-seed-<T>/train_manifest.json`, `<root>/comparison/{comparison.json,episodes.csv}`,
  optional `<root>/fetch_manifest.json`.
- eval manifest: `label` (row; null is valid for a standalone evaluation), `seed_roles.{training_seed,held_out_seeds,held_out,overlap}`, `status`, `error`,
  `episodes_expected/completed`, `contract.{node_ids,slot_node_ids,action_meanings,tick_s,decision_interval_s,bounds}`,
  `reward_schema`, `selection`, `bundle.{model_selection,model_sha256}`, `compatibility.note`, `metric_source`,
  `policies.<p>.episodes[]: {seed,episode_dir(abs),status,error,exit_code,decisions,return,reward_components_sum,metrics,mask_violations,revalidated_slots_total,summary_json(abs)}`,
  `policies.<p>.summary`.
- plan: `matrix.name`, `seeds.{training[],model_selection,held_out[]}`, `rows[].{name,observation_preset,action_profile,reward_components,reward_weights}`,
  `evaluations[].{label,training_seed,eval_dir(abs)}`.
- comparison: `status` complete|incomplete, `primary_metric`, `metric_source`, `metrics.<m>.{higher_is_better,comparable_across_reward_definitions}`,
  `inputs[]`, `missing_evaluations[].{label,training_seed,eval_dir,reason}`,
  `evaluations[].{label,training_seed,held_out,health.<policy>.{mask_violations,revalidated_slots},comparisons[]}` where a paired comparison is
  `{baseline,metric,n_expected,n_used,model_mean,baseline_mean,mean_difference,std_difference,zero_variance,interval|null,interval_omitted?,pairs[],excluded[].{seed,reasons}}`;
  `groups[].{label,runs_expected,runs_used,excluded_runs,comparisons[]}` where a group comparison is
  `{baseline,metric,common_seeds,seeds_dropped_for_commonality,per_run[],mean_difference,std_across_runs,interval|null,interval_omitted?}`.
  interval: `{kind: paired_t_across_evaluation_seeds|t_across_training_runs, variability_source, fixed_model, level, n, df, t, half_width, low, high}`.
  P0 regression `comparison.json` files have no `comparison_version` (keys atol/baseline/candidate/match) → not an RL comparison.
- fetch manifest: `{fetch_manifest_version,remote,selection[],fetched_at,files[],tasks[].{index,id:"<row>/train-seed-<T>",state: completed|partial|missing|failed|not_fetched},comparison: complete|incomplete|absent|unreadable|not_fetched,snapshot_of_incomplete_run: bool|null}`.
- steps.jsonl: line 1 header `{telemetry_version, contract, observation_schema, reward_schema, selection}`; then
  `{type:"step",decision,tick,time_s,ticks_in_step,action_sent:int[]|null,mask:int[],reward:{total,components?,valid?,source?}|null,legacy_reward,revalidated_slots:[],facts}`.
  Decision 0 has `reward:null`, `action_sent:null`. `action_sent[i]` indexes `contract.action_meanings` for slot i
  (`contract.slot_node_ids[i]`). A saved action/reward describes the interval ending at `time_s`;
  `ticks_in_step × contract.tick_s` gives its duration. Sparse saves leave gaps. The mask is observed
  at the ending decision. Mask is flat, `mask_dim = slots × actions`.
- Node mapping (checked in `MESH/src/io/viz-writer.cc:141-147` and `src/rl/rl-bridge.cc:63-66,259`): CSV integer `node_id` i ==
  index i of `contract.node_ids` (both iterate cfg.nodes in file order). Controlled = ids in `contract.slot_node_ids`.
- No fetched root or `cluster/` directory exists locally; fetch view is tested with a synthetic manifest.

## Shared interface: `src/lib/resultCatalog.ts`
```ts
export interface ResultCatalog {
  readonly name: string
  readonly truncated?: boolean             // filtered reader file cap was reached
  paths(): string[]                       // normalized, root-relative, '/'-separated, sorted
  has(path: string): boolean
  getFile(path: string): Promise<File | null>   // lazy; null when absent
}
export function normalizeRelPath(p: string): string | null   // null for absolute, '..', empty, backslash or NUL
export function catalogFromFiles(name: string, entries: { path: string; file: File }[]): ResultCatalog
export function catalogFromFileList(files: FileList | File[]): ResultCatalog   // strips picked-folder first segment
export function catalogFromDirectoryHandle(handle: FileSystemDirectoryHandle): Promise<ResultCatalog> // names+handles only; getFile() lazily
export function catalogFromDevServer(): Promise<ResultCatalog | null>   // GET /api/outputs listing; fetches bytes only in getFile()
export function isReaderFileName(name: string): boolean
export function isTrainRolloutDirectory(segments: string[]): boolean
export function subCatalog(catalog: ResultCatalog, prefix: string): ResultCatalog
export function readJson(catalog: ResultCatalog, path: string): Promise<unknown | null>  // null when absent; throws on bad JSON
export function readText(catalog: ResultCatalog, path: string): Promise<string | null>
```
