import type { Control } from "./models/control";
import type { CourseControl } from "./models/course";

/**
 * Get the actual course controls by removing intermediate start controls.
 *
 * When a course contains a leg from control A to a start control, followed by
 * a leg from the start control to control B, the start control is removed so
 * that the two legs are combined into a single leg from A to B.
 *
 * Only start controls that are NOT the first control in the course are removed.
 *
 * @param courseControls - Ordered course controls
 * @param controls - All control definitions (used to resolve control types)
 * @returns A new array with intermediate start controls removed
 */
export function getActualCourseControls(
  courseControls: CourseControl[],
  controls: Control[],
): CourseControl[] {
  return courseControls.filter((cc, index) => {
    // Never remove the first control
    if (index === 0) return true;
    // Resolve the control type: prefer CourseControl.type, fall back to Control.type
    const controlType = cc.type ?? controls.find((c) => c.id === cc.controlId)?.type;
    return controlType !== "start";
  });
}

/**
 * Generate display labels for all controls in a course.
 * Position-based numbering correctly handles repeated controls.
 * - Start controls → "S"
 * - Finish controls → "F"
 * - Regular controls → sequential number (1, 2, 3, …)
 */
export function getCourseControlLabels(
  courseControls: CourseControl[],
  controls: Control[],
): string[] {
  let controlNumber = 0;
  return courseControls.map((cc) => {
    if (cc.mapText) return cc.mapText;
    const control = controls.find((c) => c.id === cc.controlId);
    if (!control) return "";
    if (control.mapText) return control.mapText;
    const type = cc.type ?? control.type;
    if (type === "start") return "S";
    if (type === "finish") return "F";
    controlNumber++;
    return String(controlNumber);
  });
}

/**
 * Build a map of control ID → display label(s) for map rendering.
 * For controls visited multiple times, labels are joined (e.g. "1,6").
 */
export function getCourseControlLabelMap(
  courseControls: CourseControl[],
  controls: Control[],
): Map<string, string> {
  const labels = getCourseControlLabels(courseControls, controls);
  const labelMap = new Map<string, string>();
  courseControls.forEach((cc, i) => {
    const existing = labelMap.get(cc.controlId);
    if (existing) {
      labelMap.set(cc.controlId, `${existing},${labels[i]}`);
    } else {
      labelMap.set(cc.controlId, labels[i]);
    }
  });
  return labelMap;
}

/**
 * @deprecated Use getCourseControlLabels for position-aware labels.
 * This function does not handle repeated controls correctly.
 */
export function getControlLabel(control: Control, courseControls: Control[]): string {
  const courseControl = courseControls.find((c) => c.id === control.id);
  if (courseControl?.mapText) {
    return courseControl.mapText;
  }
  if (control.mapText) {
    return control.mapText;
  }
  if (control.type === "start") {
    return "S";
  }
  if (control.type === "finish") {
    return "F";
  }

  const controlIndex = courseControls.findIndex((c) => c.id === control.id);
  if (controlIndex >= 0) {
    const numberAmongControls = courseControls.slice(0, controlIndex).filter((c) => c.type === "control").length + 1;
    return String(numberAmongControls);
  }

  return "";
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary_string = window.atob(base64);
  const len = binary_string.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary_string.charCodeAt(i);
  }
  return bytes.buffer;
}
