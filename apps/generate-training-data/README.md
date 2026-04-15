# Generate Training Data CLI

Command-line tool that processes event JSON files to generate training data for the indoor orienteering training app.

## Usage

```bash
pnpm start [fileFilter] [inputFolder] [outputFolder] [--k <n>] [--verbose]
```

### Arguments

| Argument       | Default                                        | Description                                          |
| -------------- | ---------------------------------------------- | ---------------------------------------------------- |
| `fileFilter`   | (none)                                         | Only process files containing this string            |
| `inputFolder`  | `../web/public/examples`                       | Folder containing event JSON files                   |
| `outputFolder` | `../../../indoor-o-training/public/examples`   | Folder for output training JSON files                |
| `--k <n>`      | `100`                                          | Max number of alternative paths to find per leg      |
| `--verbose`    | (off)                                          | Print number of routes found for each leg            |

### Examples

```bash
# Process all files with defaults
pnpm start

# Process only 2026 files with verbose output
pnpm start 2026 --verbose

# Custom folders with 50 max paths
pnpm start "" ./input ./output --k 50
```

## Output

Output files are named with a " - training" suffix (e.g., `event.json` → `event - training.json`).
