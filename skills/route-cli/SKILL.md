---
name: route-cli
description: "Use this skill to run the route-cli tool for indoor orienteering route analysis. Triggers: 'analyze route', 'shortest path', 'analyze course', 'analyze all courses', 'route difficulty', 'course difficulty', 'route analysis CLI', 'batch route analysis'. The tool loads .json or .xml event files and outputs route/course analysis in JSON or CSV format."
allowed-tools: Bash, Read, Glob
---

# route-cli — Indoor Orienteering Route Analysis CLI

A command-line tool for analyzing indoor orienteering routes, courses, and difficulties. It loads event data files (.json or .xml) and uses the shared `@indoor-o-route-analysis/core` library for all analysis.

## Location

The tool lives at `apps/route-cli/` in the monorepo.

## How to Run

From the repository root:

```bash
pnpm route-cli <file> <command> [options]
```

Or directly:

```bash
pnpm --filter route-cli start -- <file> <command> [options]
```

## Commands

### `shortest-path` — Find shortest path between two controls/nodes

Finds the shortest path between two controls or graph nodes. Returns the path, route description (based on edge labels like staircase identifiers), distance, and difficulty.

```bash
pnpm route-cli event.json shortest-path --from S1 --to 31
pnpm route-cli event.json shortest-path --from S1 --to 31 --format csv
```

**Required options:**
- `--from <id>` — Start control or node ID
- `--to <id>` — End control or node ID

**JSON output fields:**
- `from`, `to` — The requested control/node IDs
- `path` — Array of node IDs defining the route
- `description` — Human-readable route description built from edge labels (e.g. "A, B1, A" means staircase A → corridor B1 → staircase A)
- `labels` — Array of individual edge labels
- `distance` — Path length in meters
- `difficulty` — Numeric difficulty score
- `difficultyCategory` — Category label (White/Yellow/Orange/Purple/Black)
- `decisionPoints` — Number of junctions requiring route choice
- `alternativeEdges` — Number of edges not taken at decision points
- `totalClimb` — Total elevation change in meters (if polygons defined)

### `analyze-course` — Analyze a specific course

Analyzes each leg of a named course. Outputs per-leg difficulty, distance, route description, and a course summary.

```bash
pnpm route-cli event.json analyze-course --course "Course A"
pnpm route-cli event.json analyze-course --course "Course A" --format csv
```

**Required options:**
- `--course <name>` — Course name (case-insensitive match)

**JSON output fields:**
- `courseName`, `legs`, `totalDistance` — Course summary
- `maxDifficulty`, `maxDifficultyCategory` — Overall course difficulty
- `avgDifficulty` — Average leg difficulty
- `targetDifficulty` — The course's intended difficulty category
- `legDetails[]` — Array of per-leg results with same fields as shortest-path plus `leg` label (e.g. "S → 1")

### `analyze-all` — Analyze all courses

Analyzes every course in the event file and outputs a summary table.

```bash
pnpm route-cli event.json analyze-all
pnpm route-cli event.json analyze-all --format csv
```

**JSON output fields:**
- `eventName`, `eventDate` — Event metadata
- `courses[]` — Array of course summaries, each containing:
  - `courseName`, `legs`, `totalDistance`
  - `maxDifficulty`, `maxDifficultyCategory`, `avgDifficulty`
  - `targetDifficulty`

## Common Options

| Option | Default | Description |
|--------|---------|-------------|
| `--format json\|csv` | `json` | Output format |
| `--scoring-model <id>` | `alpha@0.1` | Difficulty scoring model to use |
| `--help` | — | Show usage help |

## Supported Input Formats

- **JSON** (`.json`) — Native event format used by the web app. Contains all event data including courses, controls, graph vertices/edges, and polygons.
- **IOF XML** (`.xml`) — IOF 3.0 CourseData format with custom `<x:Routes>` extension for graph data (vertices and edges).

## Understanding the Output

### Route Description
Edge labels represent staircases or named corridors. A route description like `"A, B1, A"` means: take staircase A, then corridor B1, then staircase A again. Labels are directional — uppercase typically means "up" and the reverse label means "down".

### Difficulty Categories
The scoring model maps numeric difficulty scores to standard orienteering categories:

| Category | Score Range | Meaning |
|----------|------------|---------|
| White | 0–20 | Easiest, few choices |
| Yellow | 20–40 | Easy, some decision points |
| Orange | 40–60 | Moderate complexity |
| Purple | 60–80 | Challenging navigation |
| Black | 80+ | Most difficult |

### Distance
Distances are in meters, calculated from graph edge weights (which are derived from map coordinates and scale). Staircase edges (ignoreLength=true) contribute 0 distance.

## Example Workflows

### Analyze a single event file
```bash
# Overview of all courses
pnpm route-cli data/event.json analyze-all

# Detailed leg-by-leg analysis of one course
pnpm route-cli data/event.json analyze-course --course "Purple"

# Export to CSV for spreadsheet analysis
pnpm route-cli data/event.json analyze-all --format csv > courses.csv
```

### Find a specific route
```bash
# Shortest path between two controls
pnpm route-cli data/event.json shortest-path --from S1 --to 42

# Same but as CSV
pnpm route-cli data/event.json shortest-path --from S1 --to 42 --format csv
```

### Pipe to other tools
```bash
# Parse JSON output with jq
pnpm route-cli event.json analyze-all | jq '.courses[] | select(.maxDifficulty > 50)'

# Generate CSV for all events in a folder
for f in events/*.json; do
  pnpm route-cli "$f" analyze-all --format csv
done
```

## Error Handling

- If the file is not found or has an unsupported extension, the tool exits with an error message.
- If a course name doesn't match, the tool lists all available course names.
- If no path exists between two controls, the tool reports "No path found".
- The tool exits with code 1 on any error, 0 on success.

## Scoring Models

Available scoring models can be listed from the registry. The default is `alpha@0.1`. Pass `--scoring-model <id>` to use a different one.
