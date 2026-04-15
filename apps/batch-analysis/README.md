# Batch Route Analysis CLI

Command-line tool that analyzes route difficulties across all event files and exports CSV reports and an HTML summary.

## Usage

```bash
pnpm start [inputFolder] [outputFolder] [fileFilter]
```

### Arguments

| Argument       | Default                    | Description                                |
| -------------- | -------------------------- | ------------------------------------------ |
| `inputFolder`  | `../web/public/examples`   | Folder containing event JSON files         |
| `outputFolder` | `../../analysis-output`    | Folder for output CSV and HTML reports     |
| `fileFilter`   | (none)                     | Only process files containing this string  |

### Examples

```bash
# Analyze all example files with defaults
pnpm start

# Analyze only 2026 files
pnpm start ../web/public/examples ../../analysis-output 2026
```

## Output

- `course_difficulties.csv` — per-course difficulty scores for all scoring models
- `leg_difficulties.csv` — per-leg difficulty scores for all scoring models
- `report.html` — HTML summary table
