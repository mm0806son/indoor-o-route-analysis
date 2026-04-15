---
name: convert
description: "Use this skill to convert indoor orienteering event files between formats. Triggers: 'convert file', 'convert json to xml', 'convert xml to json', 'export csv', 'export graph', 'convert to csv', 'convert to xml', 'convert to json', 'convert event file'. Converts between JSON, IOF XML 3.0, and graph-only CSV formats."
allowed-tools: Bash, Read, Glob
---

# convert — Indoor Orienteering File Format Converter

A CLI tool for converting indoor orienteering event files between JSON, IOF XML 3.0, and graph-only CSV formats.

## Location

The tool lives at `apps/convert/` in the monorepo.

## How to Run

From the repository root:

```bash
pnpm convert -- <input> [output] [options]
```

Or directly:

```bash
pnpm --filter convert start -- <input> [output] [options]
```

## Usage Patterns

### Positional arguments

```bash
# Auto-detect output format from extension
pnpm convert -- event.json event.xml
pnpm convert -- event.xml event.json
pnpm convert -- event.json graph.csv
```

### With --format flag

```bash
# Specify format explicitly (auto-names output based on input)
pnpm convert -- event.json --format xml
pnpm convert -- event.xml --format json
pnpm convert -- event.json --format csv
```

### With -o flag

```bash
# Specify output path
pnpm convert -- event.json -o output/converted.xml
pnpm convert -- event.xml -f csv -o output/graph.csv
```

## Supported Formats

### Input Formats

- **JSON** (`.json`) — Native event format used by the web app. Contains all event data including courses, controls, graph vertices/edges, polygons, and custom routes.
- **IOF XML** (`.xml`) — IOF 3.0 CourseData format with custom `<x:Routes>` extension for indoor graph data (vertices and edges).

### Output Formats

- **JSON** (`.json`) — Full event data serialized as pretty-printed JSON.
- **IOF XML** (`.xml`) — IOF XML 3.0 with `<x:Routes>` extension containing vertices and edges.
- **CSV** (`.csv`) — Graph-only export. Produces **two files**:
  - `<basename>_nodes.csv` — All controls and graph vertices with positions and type
  - `<basename>_edges.csv` — All graph edges with labels and properties

### CSV Node Format

```csv
id,x,y,type
S1,10.5,20.3,start
31,15.2,30.1,control
F1,50.0,60.0,finish
1000,12.3,25.4,node
```

The `type` column is one of: `start`, `control`, `finish`, or `node` (graph vertex).

### CSV Edge Format

```csv
from,to,label,reverseLabel,oneWay,ignoreLength
S1,1000,,,false,false
1000,1001,A,a,false,false
1001,31,B1,,false,true
```

- `label` — Edge label (e.g. staircase identifier)
- `reverseLabel` — Label when traversing in reverse direction
- `oneWay` — Whether the edge can only be traversed in the from→to direction
- `ignoreLength` — Whether the edge represents a teleport/staircase (zero distance)

## Options

| Option | Description |
|--------|-------------|
| `--format`, `-f` | Output format: `json`, `xml`, or `csv` |
| `-o <file>` | Output file path |
| `--help`, `-h` | Show usage help |

## Example Workflows

### Convert a single file

```bash
# JSON to IOF XML
pnpm convert -- data/event.json data/event.xml

# IOF XML back to JSON
pnpm convert -- data/event.xml data/event.json

# Export graph to CSV for analysis in a spreadsheet
pnpm convert -- data/event.json --format csv
```

### Batch convert multiple files

```bash
# Convert all JSON files to XML
for f in events/*.json; do
  pnpm convert -- "$f" --format xml
done

# Export all graphs to CSV
for f in events/*.json; do
  pnpm convert -- "$f" --format csv -o "csv-output/$(basename "$f" .json).csv"
done
```

### Use with other tools

```bash
# Convert XML to JSON, then analyze
pnpm convert -- imported.xml converted.json
pnpm route-cli converted.json analyze-all
```

## Error Handling

- If the input file is not found, the tool exits with an error message.
- If the file extension is unsupported, the tool lists supported formats.
- If no output file or format is specified, the tool shows usage help.
- If output would overwrite the input file (same format), it appends `_converted` to the filename.
- The tool exits with code 1 on any error, 0 on success.

## Data Loss Notes

- **JSON → XML**: Polygons, custom routes, and map image data are not included in IOF XML output (only controls, courses, and graph are exported).
- **XML → JSON**: The imported event gets a new random UUID and may have default values for fields not present in the XML.
- **JSON/XML → CSV**: Only graph data (vertices, edges, and control positions) is exported. All other event data is discarded.
