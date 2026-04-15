#!/bin/bash
# Copy pdfjs worker to public folder
# Try multiple possible locations for the worker file

WORKER_PATHS=(
  "node_modules/pdfjs-dist/build/pdf.worker.min.js"
  "node_modules/pdfjs-dist/legacy/build/pdf.worker.min.js"
  "node_modules/pdfjs-dist/dist/pdf.worker.min.js"
)

for worker_path in "${WORKER_PATHS[@]}"; do
  if [ -f "$worker_path" ]; then
    cp "$worker_path" public/
    echo "✓ PDF.js worker copied from $worker_path"
    exit 0
  fi
done

echo "⚠ Warning: Could not find PDF.js worker file at any expected location"
echo "Tried: ${WORKER_PATHS[@]}"
exit 1
