#!/usr/bin/env bash
#
# Build all LaTeX articles in this directory into PDFs.
#
# Usage:
#   ./build.sh            # build all *.tex files
#   ./build.sh foo.tex    # build only the given file(s)
#   ./build.sh clean      # remove aux files, keep the PDFs
#   ./build.sh distclean  # remove aux files and the PDFs
#
set -euo pipefail

cd "$(dirname "$0")"

if ! command -v latexmk >/dev/null 2>&1; then
  echo "error: latexmk not found. Install TeX Live (e.g. 'sudo dnf install texlive-scheme-full')." >&2
  exit 1
fi

# `clean` removes aux files but keeps the PDFs; `distclean` removes PDFs too.
if [[ "${1:-}" == "clean" ]]; then
  latexmk -c
  exit 0
fi
if [[ "${1:-}" == "distclean" ]]; then
  latexmk -C
  exit 0
fi

# Collect targets: explicit arguments, or every .tex file in this directory.
if [[ $# -gt 0 ]]; then
  targets=("$@")
else
  shopt -s nullglob
  targets=(*.tex)
  shopt -u nullglob
fi

if [[ ${#targets[@]} -eq 0 ]]; then
  echo "No .tex files to build." >&2
  exit 0
fi

failed=()
for tex in "${targets[@]}"; do
  echo "==> Building $tex"
  # -pdf: produce PDF via pdflatex; -interaction=nonstopmode: don't hang on errors;
  # -halt-on-error: fail fast; -file-line-error: clearer error locations.
  if latexmk -pdf -interaction=nonstopmode -halt-on-error -file-line-error "$tex"; then
    echo "    ok: ${tex%.tex}.pdf"
  else
    echo "    FAILED: $tex" >&2
    failed+=("$tex")
  fi
done

if [[ ${#failed[@]} -gt 0 ]]; then
  echo "Build failed for: ${failed[*]}" >&2
  exit 1
fi

echo "All PDFs built successfully."
