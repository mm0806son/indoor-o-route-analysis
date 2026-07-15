# Route Viz CLI

Command-line tool that renders a video visualization of the route-finding
algorithms — shortest route, easiest route, simulated human route, and all
distinct routes — for a single leg. It reuses the real `RouteAnalyzer`
algorithms from `@indoor-o-route-analysis/core` via an injected trace-recording
callback, so the animation reflects exactly what the algorithms do.

## Usage

```bash
pnpm route-viz <file> --course <name> --leg <from>-<to> [options]
pnpm route-viz <file> --from <id> --to <id> [options]
```

`<file>` is an event JSON or IOF XML file. Requires `ffmpeg` to be available on
the system for video encoding.

### Options

| Option                  | Default              | Description                                                                 |
| ------------------------ | ---------------------- | ----------------------------------------------------------------------------- |
| `--export <list>`        | all four phases       | Comma-separated phases to include: `shortest`, `easiest`, `human`, `all-routes` |
| `--duration <seconds>`   | `20`                   | Animation time **per selected phase**                                        |
| `--fps <n>`              | `30`                   | Frames per second                                                             |
| `--width <px>`           | `1920`                 | Video width                                                                   |
| `--height <px>`          | `1080`                 | Video height                                                                  |
| `--out <path>`           | derived from course/leg | Output `.mp4` path                                                          |
| `--scoring-model <id>`   | `alpha@0.1`            | Difficulty scoring model                                                      |
| `--max-routes <n>`       | `300`                  | Max number of distinct routes to enumerate                                    |
| `--vcodec <name>`        | `libopenh264`          | ffmpeg video encoder                                                          |
| `--bitrate <rate>`       | `10M`                  | Video bitrate, e.g. `10M` or `8000k`                                          |
| `--help`                 |                        | Show help                                                                     |

### Examples

```bash
pnpm route-viz event.json --course "Bana 1" --leg 3-4 --duration 20
pnpm route-viz event.json --course "Bana 1" --leg 3-4 --export shortest,human --duration 10
pnpm route-viz event.json --from 33 --to 34 --out leg.mp4
```

## Phases

Phases always play in this canonical order, regardless of the order given to
`--export`:

1. **shortest** — the shortest route between the two controls
2. **easiest** — the lowest-difficulty route (skipped visually if identical to the shortest)
3. **human** — a simulated human route (skipped if none is found)
4. **all-routes** — every distinct route discovered, up to `--max-routes`

Each phase renders for `--duration` seconds (minimum enforced to stay legible;
a warning is printed if the requested duration is below it).

## Output

An `.mp4` video at the given resolution/fps, with a caption/subcaption overlay
per phase (route distance, difficulty category, and route label sequence,
e.g. `FlPLbb`). If no `--out` is given, the filename is derived from the
course name and leg (slugified), e.g. `route-viz-bana-1-3-4.mp4`.
