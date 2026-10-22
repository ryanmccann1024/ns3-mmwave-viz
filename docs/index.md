# ns3-mmwave-viz

<!-- Landing page, laid out like the simulator site's index.md (itself modelled
     on the FUSION documentation home page): tagline, intro, then sections
     separated by rules. Section headings are HTML <h2> so they are not
     repeated as entries in the sidebar tree. Commands are copied from
     README.md; keep them in sync with it. The \subpage order sets the order of
     this page's children in the sidebar, and header.html's captions name the
     first page of each group. -->

<div class="ms-tagline">Browser-based 3D visualizer for ns-3 wireless network simulations</div>

ns3-mmwave-viz is a React + Three.js app that reads what the Mesh-Sim simulator writes. It discovers simulation runs in a data folder, parses their `positions.csv` / `links.csv` files (plus optional JSON), plays them back as a 3D scene, and reads saved RL experiment results. The \ref viz_readme "User guide" covers setup, loading, controls and the RL pages in full.

\note The visualizer is a reader only. It never writes into the simulator's outputs and does not train, evaluate or fetch jobs; those are run with the simulator's own CLI.

<hr>

<h2>How These Docs Are Organized</h2>

New here? Start with the \ref viz_readme "User guide", then try the <a href="#ms-quickstart">Quickstart</a> below. The sidebar follows the same groups:

| | |
|---|---|
| **Get started** | \subpage viz_readme "User guide" (setup, loading, controls, RL results) · \subpage system_overview "System overview" |
| **Reference** | \subpage source_map "Source map" (where things live in `src/`) |
| **Project** | \subpage generating_the_docs "Generating the docs" · <a href="../../../ns3-mmwave/scratch/mesh-sim/docs/html/documentation_standard.html">Documentation standard</a> (simulator site) |

<hr>

<h2>What the Visualizer Does</h2>

<dl class="ms-terms">
<dt>Run discovery</dt>
<dd>Finds every valid simulation run in a chosen folder and groups them by date. With the dev server, the sibling simulator's outputs are found automatically. \ref viz_readme_loading "Learn more"</dd>
<dt>3D playback</dt>
<dd>Plays a run back tick by tick: nodes, links, buildings and jammers in 1D, 2D or 3D views, at 0.5× to 10× speed, with node and link inspection. \ref viz_readme_controls "Learn more"</dd>
<dt>RL experiment results</dt>
<dd>Reads saved experiments: the exact observation, action and reward; training curves; held-out comparisons against hold and random policies; and individual episodes in 3D. \ref viz_readme_rl_results "Learn more"</dd>
<dt>Mission experiments</dt>
<dd>Shows numbered mission campaigns as projects, with one page per physical scenario and mission and radio timelines. \ref viz_readme_missions "Learn more"</dd>
<dt>Decisions</dt>
<dd>Steps through a policy's saved decisions: the inputs it saw, the action it sent and was applied, and the reward that followed, seeking the scene to each one. \ref viz_readme_decisions "Learn more"</dd>
<dt>Jamming map</dt>
<dd>Draws jammer interference as 3D shells or a slice, using the simulator's own jammer gates and path-loss models with the run's archived channel settings. \ref source_map "Learn more"</dd>
</dl>

<hr>

<h2>How a Run Is Shown</h2>

Each run goes through the same three stages:

1. **Discover.** **Open Data Folder** hands a directory to run discovery, which lists the valid runs grouped by date.
2. **Parse.** Selecting a run parses its CSV/JSON files into frames; the `#key=value` header comments carry the simulation metadata.
3. **Play.** The playback state machine advances through the frames while the Three.js canvas renders nodes, links, buildings and jammers.

**What it reads**

- Per-tick `positions.csv` and `links.csv` under `outputs/YYYY-MM/DD/HH-MM-SS/seed-N/`, plus optional `buildings.json`
- RL experiment files: `experiment_plan.json`, evaluation manifests and `comparison.json`, and on demand the episode files and `steps.jsonl`
- The run's archived `inputs/run.ini` for the jamming map's channel settings

**What it leaves out**

- No simulation, training, evaluation or job submission: results are produced with the simulator's CLI
- No statistical inference of its own: intervals and means come from `comparison.json`
- No model archives: the Learning view reads only a training run's `evaluations.npz`

See \ref system_overview "System overview" for how the simulator, its output files and the visualizer fit together.

<hr>

<h2>Choose Your Path</h2>

| | |
|---|---|
| **Viewing simulation runs** | Playing back runs and inspecting nodes and links.<br>Start: \ref viz_readme_getting_started "Getting Started", then \ref viz_readme_loading "Loading a Simulation" |
| **Reading RL results** | Comparing trained policies with hold and random baselines.<br>Start: \ref viz_readme_rl_results "Reading RL experiment results", then the \ref viz_readme_decisions "Decisions tab" |
| **Contributor** | Changing the app or its documentation.<br>Start: \ref source_map "Source map", then \ref viz_readme_linting "Linting & Code Style" |

<hr>

<h2 id="ms-quickstart">Quickstart: Your First Run</h2>

From the repository root:

```bash
# 1. Install dependencies (Node.js 18+, npm 9+)
npm install

# 2. Start the dev server
npm run dev

# 3. Open the app
open http://localhost:5173    # Linux: xdg-open http://localhost:5173
```

**What just happened?**

1. You installed the app's dependencies.
2. You started the Vite dev server on port 5173.
3. The dev server looked for the sibling simulator's outputs folder (`../ns3-mmwave/scratch/mesh-sim/outputs`) and listed any experiments in it above the legacy runs.

No runs listed? Click **Open Data Folder** and pick a folder of simulator outputs instead.

**Next steps**

- \ref viz_readme_loading "Load a simulation" and learn the \ref viz_readme_controls "controls"
- Read what the \ref viz_readme_understanding "node shapes and colors" mean
- \ref viz_readme_rl_results "Open an RL experiment"

<hr>

<h2>Common Tasks</h2>

| Task | Documentation |
|---|---|
| Install and start the app | \ref viz_readme_getting_started "Getting Started" |
| Open a folder of runs | \ref viz_readme_loading "Loading a Simulation" |
| Move the camera and play back | \ref viz_readme_controls "Controls" |
| Read node shapes, node colors and link colors | \ref viz_readme_understanding "Understanding the Visualization" |
| Read an RL experiment | \ref viz_readme_rl_results "Reading RL experiment results" |
| Inspect a policy's decisions | \ref viz_readme_decisions "Decisions tab" |
| Read the event log | \ref viz_readme_event_log "Terminal / Event Log" |
| Find the code for a feature | \ref source_map "Source map" |
| Lint, format, build and test | \ref viz_readme_linting "Linting & Code Style" |
| Rebuild these docs | \ref generating_the_docs "Generating the docs" |

<hr>

<h2>Architecture at a Glance</h2>

<div class="ms-figure">
\image html system-overview.svg
</div>

The app in `src/` is split by concern:

| Directory | Role |
|---|---|
| [hooks/](../../src/hooks/) | React hooks: playback state and parsing (`useSimData`), the event log, the open workspace |
| [lib/](../../src/lib/) | Pure functions: CSV/JSON parsing, run discovery, RL result reading, the jamming field |
| [components/canvas/](../../src/components/canvas/) | Three.js scene: nodes, links, buildings, jammers, traffic |
| [components/pages/](../../src/components/pages/) | Home, runs, experiment, training-run and player pages |
| [components/rl/](../../src/components/rl/) · [charts/](../../src/components/charts/) | RL insights, mission comparisons and charts |
| [components/decisions/](../../src/components/decisions/) | The Decisions tab |
| [components/ui/](../../src/components/ui/) | Reusable primitives (Button, Panel, Badge, …) |
| [styles/](../../src/styles/) | Design tokens and motion classes |

The \ref source_map "Source map" lists the individual files, and the README's \ref viz_readme_architecture "Architecture Overview" shows the tree.

<hr>

<h2>Project Status</h2>

**Current version:** v0.1.0

**Not yet written**

- A GUI walkthrough with screenshots
- Research write-ups

<hr>

<h2>Getting Help</h2>

**Documentation**

- \ref viz_readme "User guide": setup, loading, controls and the RL pages
- \ref system_overview "System overview": the simulator, its output files and the visualizer
- \ref source_map "Source map": where things live in `src/`

**Contributing**

- \ref viz_readme_contributing "Contributing" and \ref viz_readme_linting "Linting & Code Style"
- <a href="../../../ns3-mmwave/scratch/mesh-sim/docs/html/documentation_standard.html">Documentation standard</a>: shared with the simulator, and a page of its site
- \ref generating_the_docs "Generating the docs": tested tool versions, theme, build and open commands

**Companion project**

The simulator **ns3-mmwave** (`scratch/mesh-sim`) produces the files this visualizer reads and owns their contracts. Generate its documentation from that repository with `cd scratch/mesh-sim/docs && doxygen Doxyfile`, then open `scratch/mesh-sim/docs/html/index.html` there. If both repositories are checked out side by side under their default directory names (`ns3-mmwave` and `ns3-mmwave-viz`) and the companion site has been generated, this relative link opens it: [Simulator documentation](../../../ns3-mmwave/scratch/mesh-sim/docs/html/index.html). The link assumes exactly that layout.
