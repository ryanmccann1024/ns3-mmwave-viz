# Running an RL simulation and viewing its reward landscape

The reward landscape is a 2D map drawn on the ground of the 3D player. For one
RL-controlled node at one decision, each point shows the reward that node would
have received if it were parked there while every other node stayed where it
was. Contour lines, like a test-function plot, and five discs for the node's
possible moves (W, E, S, N, hold) sit on top of it.

The pipeline has three steps:

1. **mesh-sim** runs an RL evaluation that records every decision to `steps.jsonl`.
2. **`scripts.rl.reward_landscape`** scores a grid of hypothetical positions with
   the simulator's `--channel-query` mode and writes `reward_landscape.json`
   into the episode folder.
3. **ns3-mmwave-viz** loads that file and draws it in the episode's 3D view.

Paths below assume the two repos sit side by side:

```bash
SIM=/home/kimson/ns3-mmwave/scratch/mesh-sim
VIZ=/home/kimson/ns3-mmwave-viz
BIN=/home/kimson/ns3-mmwave/build/scratch/mesh-sim/ns3.42-sim-debug
NODE=/home/kimson/.vscode-server/bin/e4c7e7b1d6d060162f4aa7f8225271b67ce1df75/node   # node v24
```

## 1. Build the simulator

Do this only after the C++ changes. The binary must support `--channel-query`:

```bash
cd /home/kimson/ns3-mmwave
./ns3 build
strings $BIN | grep -c mesh_channel_query_v1   # must print a number > 0
```

The Python environment lives in `$SIM/.venv`. If it is missing, create it with
`python3 scripts/rl/bootstrap_venv.py` from `$SIM`.

## 2. Pick a scenario

The landscape needs centralized RL control. The scenario's `run.ini` `[rl]`
section must list `controlled_nodes = ...`. Scenarios that only set the older
`controlled_node_id` do not export the per-step facts, and the evaluation stops
with "require centralized control mode".

| Scenario | Controlled nodes | Notes |
|---|---|---|
| `inputs/baselines/building-bypass-smoke/run.ini` | `node-b` | Buildings with blockage, 20 s, one decision per second, 2 m steps |
| `inputs/baselines/centralized-multi-smoke/run.ini` | `node-b`, `node-c` | No buildings, 1 s long (3 decisions), 1 m steps |

To make your own, copy one of these folders and edit its `run.ini` and
`nodes.json`. Keep `controlled_nodes`, the `x_min/x_max/y_min/y_max` bounds
(the landscape covers exactly this area) and `decision_interval_s`.

## 3. Run the RL simulation (evaluation with step telemetry)

```bash
cd $SIM
.venv/bin/python -m scripts.rl.evaluate --sim-binary $BIN \
  --run-config inputs/baselines/building-bypass-smoke/run.ini \
  --policies hold,random_valid --seeds 1 \
  --reward-components delivery_ratio,connectivity,sinr_quality,travel_fraction \
  --reward-weights 1.0,0.5,0.3,-0.2 \
  --telemetry steps --label my-run
```

It prints `Evaluation output: outputs/YYYY-MM/DD/HH-MM-SS-rl-evaluation`. Each
policy gets its own folder, for example `hold/episode-0000/`.

| Option | Meaning |
|---|---|
| `--telemetry steps` | **Required.** Writes `steps.jsonl`, the record of every decision that the landscape is built from. |
| `--reward-components`, `--reward-weights` | Gives a per-component breakdown. Without them the reward is the C++ total only, and the landscape can show only "Total". Weights go in the same order as the components. |
| `--policies` | `hold` and `random_valid` need no trained model. Add `model` together with `--run-dir <training-folder>` to evaluate a trained policy. |
| `--seeds` | One episode per seed, e.g. `1-5`. |
| `--label` | Name shown in the viz. |

Available reward components: `delivery_ratio`, `delivery_binary`,
`signed_delivery_ratio`, `connectivity`, `throughput_mbps`, `legacy`,
`service_success`, `service_failure`, `travel_fraction`, `origin_fraction`,
`sinr_quality`, `unmet_sinr_quality`.

## 4. Produce the reward landscape

```bash
cd $SIM
.venv/bin/python -m scripts.rl.reward_landscape --sim-binary $BIN \
  --episode-dir outputs/YYYY-MM/DD/HH-MM-SS-rl-evaluation/random_valid/episode-0000 \
  --grid 41 --every 1 --seeds 1,2,3 --workers 8
```

This writes `reward_landscape.json` and `reward_landscape.log` into the episode
folder. Run it once per episode you want to inspect.

| Option | Default | Meaning |
|---|---|---|
| `--grid N` | 41 | N×N points over the `[rl]` bounds |
| `--every K` / `--decisions 0,5,10` | 8 evenly spaced decisions | Which decisions get a landscape |
| `--nodes node-b,1` | all controlled nodes | Contract node ids or slot indices |
| `--seeds 1,2,3` | the episode's seed | Channel seeds to average. More seeds smooth shadow-fading speckle, and `spread.total` records the standard deviation across them. |
| `--workers N` | — | Parallel simulator query processes (this machine has 8 cores) |
| `--output FILE` | `<episode-dir>/reward_landscape.json` | Where to write |

**Cost.** One simulator query per grid point:
seeds × decisions × nodes × (grid² + 5). With 4 workers this is about 140 points
per second. 21 decisions × 1,681 points × 3 seeds with 8 workers takes about
10 minutes. For a quick look, use `--grid 21 --decisions 0,10 --seeds 1`.

## 5. View it

Start the viz dev server, which reads `$SIM/outputs` directly:

```bash
cd $VIZ
$NODE node_modules/vite/bin/vite.js      # same as `npm run dev`; the node on PATH (v12) is too old
```

Open <http://localhost:5173>, then:

1. Go to **RL experiments**, pick your evaluation, open the **Episodes** tab, and
   open an episode in **3D**. Refresh the page if the landscape was generated
   while it was open.
2. Click a controlled node. If you click no node, the map shows the first one.
   If you click an uncontrolled node, the card says so.
3. **Reward map** in the top-right toolbar, next to **Jamming map**, turns the
   map on and off. The settings button beside it opens a menu with:
   - the field: **Total reward** or a single component, with a
     **Weighted / Raw** switch for components;
   - the colour scale for the shown decision;
   - the node, the decision, the best move and the recorded reward.
4. Play or scrub the timeline. The map shows the latest landscape decision at
   or before the playhead.

## How to read it

- **Snapshot, not replay.** Each point is a fresh channel draw at t = 0 with
  the node parked there for one tick. It is not the exact channel the episode
  experienced at that moment.
- **Buildings make sharp edges.** In scenarios with buildings, line of sight is
  geometric, so building shadows appear as sharp edges in `sinr_quality`,
  `connectivity` and `delivery_ratio`.
- **Travel fraction.** It is measured from where the node was at the previous
  decision, so it is about flat (maximum cost) everywhere except right next to
  that spot. The five move discs measure travel from the current position, so
  "hold" has zero travel cost.
- **Move discs.** They are spread out so they are visible. The real moves are
  `step_size_m` apart. The white ring marks the best move by weighted reward.
- **Flat maps mean the component is saturated.** In the smoke scenarios traffic
  is light (`demand_mbps = 10`), so `delivery_ratio` and `connectivity` are 1.0
  everywhere and their maps are flat. Only `sinr_quality` and travel vary. Raise
  `demand_mbps`, move nodes farther apart, or add buildings to get landscapes
  where delivery depends on position.
- **Colours are per decision.** The colour scale is recomputed for each
  decision, so compare values in the legend, not colours.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `require centralized control mode` | The scenario uses `controlled_node_id`. Use `controlled_nodes = ...` in `[rl]`. |
| Generator says the binary has no channel query | Rebuild (step 1). |
| No **Reward map** button in the viz | The episode folder has no `reward_landscape.json`, or the reward is C++-only (no `--reward-components`). Refresh after generating. |
| Only "Total reward" in the settings menu | The evaluation ran without `--reward-components`. |
| `npm run dev` fails | Use `$NODE node_modules/vite/bin/vite.js` (node v24). |
