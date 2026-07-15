# Splits CLI

Command-line tool that joins runner splits with per-leg difficulty data, so each
split row is annotated with the leg's length, difficulty, and estimated
running/thinking time.

## Usage

```bash
pnpm splits [legs.csv] [options]
```

### Arguments

| Argument   | Default                              | Description                                     |
| ---------- | -------------------------------------- | -------------------------------------------------- |
| `legs.csv` | `output/route-analysis/legs.csv`       | Leg difficulty CSV, from `pnpm analyse-all`         |

### Options

| Option            | Default                                    | Description                                          |
| ----------------- | ------------------------------------------- | ----------------------------------------------------- |
| `--splits <path>`  | `results/splits.csv`                       | Splits CSV                                           |
| `--courses <path>` | `results/courses.csv`                      | Courses CSV                                          |
| `-o <path>`        | `<splits-dir>/splits_with-difficulty.csv`  | Output CSV                                           |
| `--speed <m/s>`    | `3`                                        | Running speed used to estimate running/thinking time |
| `--help`, `-h`     |                                             | Show help                                            |

### Examples

```bash
# Use output/route-analysis/legs.csv (written by pnpm analyse-all) and default paths
pnpm splits

# Point at a specific legs.csv export and speed
pnpm splits output/route-analysis/2026-07-01_0038/legs.csv --speed 3.5

# Custom splits/courses locations and output path
pnpm splits --splits data/splits.csv --courses data/courses.csv -o data/joined.csv
```

## Join path

```
splits(event, class) -> courses(title, course) -> legs(Event Title, Course, Leg)
```

- `courses.csv` must have columns: `event`, `class`, `title`, `course`.
- `legs.csv` must have columns: `Event Title`, `Course`, `Leg`,
  `Leg Length (m)` (or `Shortest Length (m)` in newer exports), `alpha@0.1`.
- `splits.csv` must have columns: `event`, `class`, `leg`, `legtime_seconds`.

## Output

Writes `splits_with-difficulty.csv` (or the path given via `-o`), with these
columns appended to every input row:

| Column                 | Description                                                            |
| ---------------------- | ------------------------------------------------------------------------ |
| `leg_length_m`          | Leg length in metres                                                     |
| `difficulty_alpha_0.1`  | Leg difficulty at alpha = 0.1                                            |
| `difficulty_category`   | Difficulty category/colour (e.g. "Black")                               |
| `runningtime_seconds`   | Estimated pure running time: `min(leg_length_m / speed, legtime_seconds)` |
| `runningtime_minutes`   | `runningtime_seconds / 60`                                               |
| `thinkingtime_seconds`  | `legtime_seconds - runningtime_seconds` (time spent navigating; never negative) |
| `thinkingtime_minutes`  | `thinkingtime_seconds / 60`                                              |
| `average_speed`         | `leg_length_m / legtime_seconds`, in m/s                                 |

Rows that can't be matched to a course or leg are left with blank difficulty
columns; a summary of matched/unmatched rows and the missing keys is printed
after the run.
