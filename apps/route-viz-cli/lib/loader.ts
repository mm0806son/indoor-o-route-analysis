/**
 * Event file loader for Node.js CLI.
 * Supports JSON (.json) and IOF XML (.xml) formats.
 */

import type { EventData } from "@indoor-o-route-analysis/core";
import {
  parseEventFromIOFXML,
  parseEventFromJSON,
} from "@indoor-o-route-analysis/core";
import * as fs from "fs";
import { DOMParser } from "linkedom";
import * as path from "path";

// Polyfill browser DOMParser for Node.js so parseEventFromIOFXML works
// @ts-expect-error — polyfilling browser API for Node.js
globalThis.DOMParser = DOMParser;

/**
 * Load and parse an event file.
 * Detects format by file extension (.json or .xml).
 */
export function loadEventFile(filePath: string): EventData {
  const resolvedPath = path.resolve(filePath);

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`File not found: ${resolvedPath}`);
  }

  const content = fs.readFileSync(resolvedPath, "utf-8");
  const ext = path.extname(resolvedPath).toLowerCase();

  if (ext === ".json") {
    return parseEventFromJSON(content);
  }

  if (ext === ".xml") {
    return loadFromXML(content);
  }

  throw new Error(`Unsupported file format: ${ext} (expected .json or .xml)`);
}

function loadFromXML(content: string): EventData {
  const partial = parseEventFromIOFXML(content);

  return {
    id: partial.id || crypto.randomUUID(),
    name: partial.name || "Imported Event",
    startTime: partial.startTime || {
      date: new Date().toISOString().split("T")[0],
    },
    raceCourses: partial.raceCourses || [],
    country: partial.country || "",
    eventUrl: partial.eventUrl,
    eventImageUrl: partial.eventImageUrl,
  };
}
