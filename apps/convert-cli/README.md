# Convert CLI

Command-line tool that converts indoor orienteering event files between formats.

## Usage

```bash
pnpm convert <input> <output>
pnpm convert <input> --format json|xml|csv [-o <output>]
```

### Arguments

| Argument | Description                                              |
| -------- | --------------------------------------------------------- |
| `input`  | Input file (`.json` or `.xml`)                             |
| `output` | Output file; format is auto-detected from its extension    |

### Options

| Option           | Description                             |
| ---------------- | ---------------------------------------- |
| `--format`, `-f`  | Output format: `json`, `xml`, or `csv`   |
| `-o <file>`       | Output file path                        |
| `--help`, `-h`    | Show help                               |

### Formats

- **Input:** JSON (`.json`), IOF XML (`.xml`)
- **Output:** JSON (`.json`), IOF XML 3.0 with indoor route extensions (`.xml`), graph-only CSV (`.csv`)

### Examples

```bash
# JSON <-> IOF XML
pnpm convert event.json event.xml
pnpm convert event.xml event.json

# Export the graph only, as CSV
pnpm convert event.json --format csv
pnpm convert event.json -o graph.csv
pnpm convert event.xml --format csv -o output/graph.csv
```

## Output

CSV output produces two files alongside the given output path:

- `<basename>_nodes.csv` — all graph vertices and controls, with positions and type
- `<basename>_edges.csv` — all graph edges, with labels and properties (`oneWay`, `ignoreLength`)

JSON and XML output write a single file containing the full event data (courses, controls, vertices, edges, maps).
