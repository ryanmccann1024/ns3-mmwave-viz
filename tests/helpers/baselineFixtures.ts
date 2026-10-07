// Minimal synthetic Phase 1 baseline producer outputs (v1). Nullable fields are null.

const identity = () => ({
  run_ini_sha256: null,
  nodes_json_sha256: null,
  buildings_json_sha256: null,
  jammers_json_sha256: null,
  run_config: null,
})

export function makeBaselineManifest(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    baseline_manifest_version: 1,
    run_id: null,
    mode: 'standalone',
    requested_algorithm: null,
    method: null,
    objective: null,
    application: null,
    executor: null,
    started_at: null,
    ended_at: null,
    status: 'complete',
    error: null,
    planner_seed: null,
    planner_seed_status: null,
    max_iterations: null,
    max_iterations_status: null,
    planner_source: { aggregate_sha256: null },
    rf: { sha256: null },
    source_scenario_identity: identity(),
    effective_scenario_identity: identity(),
    package_versions: {},
    mapping_sha256: null,
    sim_binary_sha256: null,
    source_run_config_abs: null,
    fingerprint: null,
    origin: null,
    ground_datum: null,
    waypoint_policy: null,
    geofence: null,
    simulation_seeds: [],
    initial_displacement_m_total: null,
    planner_wall_s: null,
    plan: null,
    planner_log: null,
    sim_log: null,
    source_inputs: null,
    effective_inputs: null,
    eval_manifest: null,
    seeds: [],
    ...overrides,
  }
}

export function makeBaselinePlan(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    baseline_plan_version: 1,
    method: null,
    objective: null,
    nodes: [
      {
        id: 'uav-0',
        roster_index: 0,
        slot: 0,
        role: null,
        platform: null,
        radios: [],
        selected: true,
        original: { x: 0, y: 0, z: 10 },
        planned: { x: 3, y: 4, z: 10 },
        displacement_m: 5,
      },
    ],
    initial_displacement_m_total: null,
    planner_predictions: null,
    ...overrides,
  }
}

export const json = (value: unknown) => JSON.stringify(value)
