"""Generate the system overview figure, system-overview.svg, beside this script.

Twin copies (keep both files and both SVGs identical):
    ns3-mmwave/scratch/mesh-sim/docs/diagrams/system-overview.py
    ns3-mmwave-viz/docs/diagrams/system-overview.py

The SVG is embedded with \image html by docs/system-overview.md (both sites) and
the simulator's docs/index.md. Edit this script, not the SVG, then from docs/:

    python3 diagrams/system-overview.py

Layout: four numbered bands read top to bottom (scenario, simulator, run
outputs, visualizer), with the simulator's once-per-run steps and its per-tick
loop. Colours are flat (no gradients) on a white card so the figure reads on
light and dark pages: blue = simulator, amber = files on disk, green =
visualizer, grey = Python tools. Labels follow README.md, CLAUDE.md and the
module pages; keep them in step when those change.
"""
import os
from html import escape

W = 900
PAD = 20
SANS = "-apple-system, BlinkMacSystemFont, 'Helvetica Neue', Helvetica, Arial, sans-serif"
MONO = "SFMono-Regular, Menlo, Consolas, monospace"

C = {
    "ink": "#1f2d3a", "muted": "#5b6b7b", "line": "#8a96a3",
    "sim_fill": "#f2f7fc", "sim_stroke": "#c9dcef", "sim_head": "#1f6391", "sim_accent": "#2980b9",
    "file_fill": "#fdf7e8", "file_stroke": "#ecd9a6", "file_head": "#86620f", "file_accent": "#c99a1e",
    "viz_fill": "#f0f9f3", "viz_stroke": "#c8e6d2", "viz_head": "#1e7a45", "viz_accent": "#27ae60",
    "tool_fill": "#f5f6f8", "tool_stroke": "#dadee3", "tool_head": "#4a5663", "tool_accent": "#7f8c99",
}

out = []


def add(s):
    out.append(s)


def text(x, y, s, size=13, weight=400, color=None, family=SANS, anchor="start"):
    add(f'<text x="{x}" y="{y}" font-family="{family}" font-size="{size}" font-weight="{weight}" '
        f'fill="{color or C["ink"]}" text-anchor="{anchor}">{escape(s)}</text>')


def panel(x, y, w, h, kind, number, title, subtitle=None):
    add(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="14" fill="{C[kind + "_fill"]}" '
        f'stroke="{C[kind + "_stroke"]}" stroke-width="1.2"/>')
    hx = x + 18
    if number:
        add(f'<circle cx="{hx + 11}" cy="{y + 25}" r="11" fill="{C[kind + "_accent"]}"/>')
        text(hx + 11, y + 29.5, number, size=12.5, weight=700, color="#ffffff", anchor="middle")
        hx += 30
    text(hx, y + 30, title, size=15, weight=700, color=C[kind + "_head"])
    if subtitle:
        # subtitle sits after the title on the same baseline
        add(f'<text x="{hx}" y="{y + 30}" font-family="{SANS}" font-size="15" font-weight="700" '
            f'fill="{C[kind + "_head"]}">{escape(title)}<tspan font-weight="400" fill="{C["muted"]}" '
            f'font-size="13">  ·  {escape(subtitle)}</tspan></text>')
        out.pop(-2)  # drop the plain title written above


def card(x, y, w, h, kind, title, lines=(), code=None, title_mono=False):
    add(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="10" fill="#ffffff" '
        f'stroke="{C[kind + "_stroke"]}" stroke-width="1.2"/>')
    add(f'<rect x="{x}" y="{y + 12}" width="3" height="{h - 24}" rx="1.5" fill="{C[kind + "_accent"]}"/>')
    ty = y + 24
    text(x + 16, ty, title, size=14 if not title_mono else 13, weight=700,
         family=MONO if title_mono else SANS)
    ty += 19
    for line in lines:
        text(x + 16, ty, line, size=12.5, color=C["muted"])
        ty += 17
    if code:
        text(x + 16, ty, code, size=12, color=C[kind + "_head"], family=MONO)


def chip(x, y, label, kind, mono=True, note=None):
    cw = 7.3 if mono else 6.9
    w = len(label) * cw + 22 + (len(note) * 6.6 + 6 if note else 0)
    add(f'<rect x="{x}" y="{y}" width="{w:.0f}" height="26" rx="13" fill="#ffffff" '
        f'stroke="{C[kind + "_stroke"]}" stroke-width="1.1"/>')
    fam = MONO if mono else SANS
    if note:
        add(f'<text x="{x + 11}" y="{y + 17.5}" font-family="{fam}" font-size="12" fill="{C["ink"]}">'
            f'{escape(label)}<tspan font-family="{SANS}" fill="{C["muted"]}" font-size="11.5"> {escape(note)}'
            f'</tspan></text>')
    else:
        text(x + 11, y + 17.5, label, size=12, family=fam)
    return x + w


def arrow(x1, y1, x2, y2, label=None, dashed=False, label_pos=None, label_side="right"):
    dash = ' stroke-dasharray="5 4"' if dashed else ""
    add(f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{C["line"]}" stroke-width="1.5"{dash} '
        f'marker-end="url(#arrow)"/>')
    if label:
        lx, ly = label_pos or ((x1 + x2) / 2 + 10, (y1 + y2) / 2 + 4)
        anchor = "start" if label_side == "right" else ("end" if label_side == "left" else "middle")
        fam = MONO if label.startswith("--") else SANS
        text(lx, ly, label, size=12, color=C["muted"], anchor=anchor, family=fam)


# ---------------------------------------------------------------- layout
y = PAD

# Band 1: scenario files + Python tools
b1h = 128
left_w = 500
panel(PAD, y, left_w, b1h, "file", "1", "Scenario", "inputs/<scenario>/")
cx = PAD + 18
cy = y + 50
cx = chip(cx, cy, "run.ini", "file") + 8
cx = chip(cx, cy, "nodes.json", "file") + 8
cy2 = cy + 34
cx2 = PAD + 18
cx2 = chip(cx2, cy2, "buildings.json", "file", note="optional") + 8
chip(cx2, cy2, "jammers.json", "file", note="optional")

tools_x = PAD + left_w + 100
tools_w = W - PAD - tools_x
panel(tools_x, y, tools_w, b1h, "tool", None, "Python tools", "scripts/")
text(tools_x + 18, y + 58, "Field-data pipeline, validation,", size=12.5, color=C["muted"])
text(tools_x + 18, y + 75, "sweeps, RL training, baselines,", size=12.5, color=C["muted"])
text(tools_x + 18, y + 92, "plotting", size=12.5, color=C["muted"])
text(tools_x + 18, y + 113, "never build the simulator", size=11.5, color=C["muted"])

arrow(tools_x - 4, y + 64, PAD + left_w + 6, y + 64, dashed=True)
text(PAD + left_w + 50, y + 56, "build", size=12, color=C["muted"], anchor="middle")
text(PAD + left_w + 50, y + 84, "scenarios", size=12, color=C["muted"], anchor="middle")

band1_bottom = y + b1h
y = band1_bottom + 56

# Band 2: simulator
b2y = y
b2h = 352
panel(PAD, b2y, W - 2 * PAD, b2h, "sim", "2", "Simulator", "sim.cc, C++ modules in src/")

# Arrows into band 2
arrow(PAD + 140, band1_bottom + 2, PAD + 140, b2y - 4, label="scenario")
arrow(tools_x + 90, band1_bottom + 2, tools_x + 90, b2y - 4, label="--sim-binary <BIN>", dashed=True)

# Row 1: once per run
row1_y = b2y + 52
text(PAD + 18, row1_y - 4, "ONCE PER RUN", size=11, weight=700, color=C["sim_head"])
inner = W - 2 * PAD - 36
cw, ch, gap = (inner - 2 * 30) // 3, 92, 30
x0 = PAD + 18
r1y = row1_y + 6
card(x0, r1y, cw, ch, "sim", "Load and validate",
     ["run.ini + JSON files into a SimConfig;", "CLI overrides applied"], code="config/  cli/")
card(x0 + cw + gap, r1y, cw, ch, "sim", "Record the run",
     ["archive the inputs, write run.log", "(“Resolved config” block)"], code="io/")
card(x0 + 2 * (cw + gap), r1y, cw, ch, "sim", "Build the topology, per seed",
     ["ns-3 nodes, mobility, buildings,", "propagation models"], code="setup/")
arrow(x0 + cw + 2, r1y + ch / 2, x0 + cw + gap - 4, r1y + ch / 2)
arrow(x0 + 2 * cw + gap + 2, r1y + ch / 2, x0 + 2 * (cw + gap) - 4, r1y + ch / 2)

# Row 2: every tick
row2_y = r1y + ch + 40
loop_x = PAD + 18
loop_w = W - 2 * PAD - 36
loop_h = 162
add(f'<rect x="{loop_x}" y="{row2_y}" width="{loop_w}" height="{loop_h}" rx="12" fill="#ffffff" '
    f'fill-opacity="0.55" stroke="{C["sim_stroke"]}" stroke-width="1.2" stroke-dasharray="4 4"/>')
text(loop_x + 14, row2_y + 22, "EVERY TICK", size=11, weight=700, color=C["sim_head"])
text(loop_x + 96, row2_y + 22, "advance the ns-3 clock, then", size=12, color=C["muted"])
arrow(x0 + 2 * (cw + gap) + cw / 2, r1y + ch + 2, x0 + 2 * (cw + gap) + cw / 2, row2_y - 4)

tg = 26
tw, th = (loop_w - 28 - 3 * tg) // 4, 82
tx0 = loop_x + 14
ty = row2_y + 36
steps = [
    ("Evaluate links", ["SINR, capacity, MCS", "for every node pair"], "eval/  jammer/"),
    ("Generate traffic", ["flow-level demands", "(no packets)"], "traffic/"),
    ("Route flows", ["multi-hop paths over", "the link table"], "routing/"),
    ("Write outputs", ["per-tick CSVs and", "metrics"], "io/"),
]
for i, (t, lines, code) in enumerate(steps):
    card(tx0 + i * (tw + tg), ty, tw, th, "sim", t, lines, code=code)
    if i:
        arrow(tx0 + i * (tw + tg) - tg + 2, ty + th / 2, tx0 + i * (tw + tg) - 4, ty + th / 2)
# "next tick": from the last step back to the first, under the cards
back_y = ty + th + 18
first_cx = tx0 + tw / 2
last_cx = tx0 + 3 * (tw + tg) + tw / 2
add(f'<path d="M{last_cx},{ty + th + 2} V{back_y} H{first_cx} V{ty + th + 6}" fill="none" '
    f'stroke="{C["line"]}" stroke-width="1.5" marker-end="url(#arrow)"/>')
add(f'<rect x="{(first_cx + last_cx) / 2 - 36}" y="{back_y - 9}" width="72" height="18" rx="9" fill="#ffffff"/>')
text((first_cx + last_cx) / 2, back_y + 4, "next tick", size=12, color=C["muted"], anchor="middle")
write_cx = last_cx
text(loop_x + loop_w - 14, row2_y + 22, "optional RL step: rl/ ⇄ Python env over stdin/stdout JSON",
     size=12, color=C["muted"], anchor="end")

band2_bottom = b2y + b2h
y = band2_bottom + 56

# Band 3: outputs
b3h = 128
panel(PAD, y, W - 2 * PAD, b3h, "file", "3", "Run outputs",
      "<output-dir>/  (default outputs/YYYY-MM/DD/HH-MM-SS/)")
arrow(write_cx, band2_bottom + 2, write_cx, y - 4, label="writes")
cy = y + 50
cx = PAD + 18
cx = chip(cx, cy, "run.log", "file") + 8
cx = chip(cx, cy, "inputs/", "file", note="archived scenario") + 8
chip(cx, cy, "summary.json", "file", note="per seed")
cy2 = cy + 34
cx = PAD + 18
cx = chip(cx, cy2, "seed-N/", "file", note="positions, links, rx-power, mcs, flows, routes CSVs") + 8
chip(cx, cy2, "RL artifacts", "file", mono=False, note="manifests, models")

band3_bottom = y + b3h
y = band3_bottom + 56

# Band 4: visualizer
b4h = 150
panel(PAD, y, W - 2 * PAD, b4h, "viz", "4", "Visualizer", "ns3-mmwave-viz, read-only")
arrow(PAD + 140, band3_bottom + 2, PAD + 140, y - 4, label="read-only")
vg = 38
vw, vh = (W - 2 * PAD - 36 - 2 * vg) // 3, 82
vx0 = PAD + 18
vy = y + 50
viz = [
    ("Open Data Folder", ["run discovery"], "lib/assembleRuns.ts"),
    ("Parse and play back", ["CSV/JSON parsing, playback state"], "lib/parseSimFiles.ts"),
    ("3D canvas and RL pages", ["3D scene, RL experiment pages"], "components/canvas/"),
]
for i, (t, lines, code) in enumerate(viz):
    card(vx0 + i * (vw + vg), vy, vw, vh, "viz", t, lines, code=code)
    if i:
        arrow(vx0 + i * (vw + vg) - vg + 2, vy + vh / 2, vx0 + i * (vw + vg) - 4, vy + vh / 2)

H = y + b4h + PAD

svg = [
    '<!-- Generated by system-overview.py in this directory; edit the script and re-run it. -->',
    f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" '
    f'role="img" aria-labelledby="t d">',
    '<title id="t">Mesh-Sim system overview</title>',
    '<desc id="d">Scenario files and Python tools feed the simulator; the simulator runs setup once, '
    'then evaluates links, generates traffic, routes flows and writes outputs every tick; the run '
    'outputs are read by the visualizer.</desc>',
    '<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" '
    f'orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="{C["line"]}"/></marker></defs>',
    f'<rect x="0.5" y="0.5" width="{W - 1}" height="{H - 1}" rx="16" fill="#ffffff" stroke="#e1e4e5"/>',
]
svg += out
svg.append("</svg>")
target = os.path.join(os.path.dirname(os.path.abspath(__file__)), "system-overview.svg")
with open(target, "w") as f:
    f.write("\n".join(svg) + "\n")
print(f"wrote {target} ({W}x{H})")
