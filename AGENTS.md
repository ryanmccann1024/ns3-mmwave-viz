# AGENTS.md — ns3-mmwave-viz

Scoped instructions for any agent or engineer working in this repository.
This file is an index; it does not restate the guidance it links to.

## Read first

1. The human's task direction, whether a chat request or a written plan.
2. [CLAUDE.md](CLAUDE.md) — stack, commands, data and rendering rules, and the
   `Docs` section.
3. The [shared MeshSim documentation standard](../ns3-mmwave/scratch/mesh-sim/docs/documentation-standard.md)
   (assumes `ns3-mmwave` is a sibling checkout; this is a source link, not a site URL).

## Every task must

- Read the human's task direction and applicable project guidance before editing.
- Preserve unrelated changes; this tree has active concurrent work. Start from the
  current file content, never from a summary.
- Stay within the scope the human authorized. Honor any explicit file limits
  or ownership boundaries; otherwise choose the files needed to complete the task.
- Report out-of-scope needs or unresolved material instruction conflicts. Apply
  the governing instruction hierarchy and explicit human task direction.
- For role outputs, use paths the human specifies; otherwise use the role
  instructions' documented defaults. A read-only role returns its findings in chat
  unless its instructions permit saving them.

## Ownership reminder

This project's guides own loading, derived displays, coordinates and missing-data
behavior. Artifact contracts are owned by the simulator; link, do not duplicate.
