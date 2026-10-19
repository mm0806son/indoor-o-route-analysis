import fs from "fs"
import path from "path"

// Possible locations for the worker file
const workerPaths = [
  "node_modules/pdfjs-dist/build/pdf.worker.min.mjs",
  "node_modules/pdfjs-dist/build/pdf.worker.mjs",
  "node_modules/pdfjs-dist/build/pdf.worker.min.js",
  "node_modules/pdfjs-dist/legacy/build/pdf.worker.min.js",
  "node_modules/pdfjs-dist/dist/pdf.worker.min.js",
]

const publicDir = "public"

// Ensure public directory exists
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true })
}

// Find and copy the worker file
let found = false
for (const workerPath of workerPaths) {
  if (fs.existsSync(workerPath)) {
    const filename = path.basename(workerPath)
    const destPath = path.join(publicDir, filename)
    fs.copyFileSync(workerPath, destPath)
    console.log(`✓ PDF.js worker copied from ${workerPath}`)
    found = true
    break
  }
}

if (!found) {
  console.warn("⚠ Warning: Could not find PDF.js worker file")
  console.warn(`Tried: ${workerPaths.join(", ")}`)
  process.exit(1)
}

// Ship the matching native ESM library alongside its worker. No CDN is required.
const libraryPath = "node_modules/pdfjs-dist/build/pdf.min.mjs"
if (!fs.existsSync(libraryPath)) throw new Error("Missing PDF.js native module")
fs.copyFileSync(libraryPath, path.join(publicDir, "pdf.min.mjs"))
console.log("✓ Matching PDF.js native module copied")
