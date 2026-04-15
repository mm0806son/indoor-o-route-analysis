/**
 * XML Import/Export functions for IOF CourseData format
 * Supports IOF XML 3.0 standard with custom extensions for indoor routes
 */

import type { EventData, RaceCourseData } from "../models/event";

/**
 * Escape special XML characters
 */
export function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Export EventData to IOF XML format
 * @param event - EventData to export
 * @returns XML string in IOF CourseData format
 */
export function exportEventToIOFXML(event: EventData): string {
  const raceCourse = event.raceCourses?.[0] || ({} as RaceCourseData);
  const courses = raceCourse.courses || [];
  const controls = raceCourse.controls || [];
  const vertices = raceCourse.vertices || [];
  const edges = raceCourse.edges || [];

  const mapScale = raceCourse.maps?.[0]?.scale;
  const eventDate = event.startTime.date;

  let xml = `<?xml version="1.0" encoding="utf-8"?>\n`;
  xml += `<CourseData xmlns="http://www.orienteering.org/datastandard/3.0" xmlns:x="urn:indoor-route-analysis">\n`;
  xml += `  <Event>\n`;
  xml += `    <Name>${escapeXml(event.name)}</Name>\n`;
  xml += `    <Date>${eventDate}</Date>\n`;
  
  // Add event extensions if any
  const hasExtensions = event.eventUrl || event.country || event.eventImageUrl;
  if (hasExtensions) {
    xml += `    <Extensions>\n`;
    if (event.eventUrl) {
      xml += `      <x:EventUrl>${escapeXml(event.eventUrl)}</x:EventUrl>\n`;
    }
    if (event.eventImageUrl) {
      xml += `      <x:EventImageUrl>${escapeXml(event.eventImageUrl)}</x:EventImageUrl>\n`;
    }
    if (event.country) {
      xml += `      <x:Country>${escapeXml(event.country)}</x:Country>\n`;
    }
    xml += `    </Extensions>\n`;
  }
  
  xml += `  </Event>\n`;
  xml += `  <RaceCourseData>\n`;

  // Map info if available
  if (mapScale) {
    xml += `    <Map>\n`;
    xml += `      <Scale>${mapScale}</Scale>\n`;
    xml += `    </Map>\n`;
  }

  // Controls
  controls.forEach((control) => {
    const typeAttr = (control.type || "control").toLowerCase();
    const typeOut = typeAttr === "start" ? "Start" : typeAttr === "finish" ? "Finish" : "Control";
    xml += `    <Control type="${typeOut}">\n`;
    xml += `      <Id>${escapeXml(control.id)}</Id>\n`;
    xml += `      <MapPosition unit="mm" x="${control.mapPosition?.x || 0}" y="${control.mapPosition?.y || 0}" />\n`;
    // Level removed from control model, export logic might need updating if x:Floor is required
    xml += `    </Control>\n`;
  });

  // Courses
  courses.forEach((course) => {
    xml += `    <Course>\n`;
    xml += `      <Name>${escapeXml(course.name)}</Name>\n`;
    if (course.controls && course.controls.length > 0) {
      course.controls.forEach((cc) => {
        const typeAttr = (cc.type || "control").toLowerCase();
        const typeOut = typeAttr === "start" ? "Start" : typeAttr === "finish" ? "Finish" : "Control";
        xml += `      <CourseControl type="${typeOut}">\n`;
        const ctrlText = cc.controlId || "";
        xml += `        <Control>${escapeXml(ctrlText)}</Control>\n`;
        if (cc.mapText !== undefined) {
          xml += `        <MapText>${cc.mapText}</MapText>\n`;
        }
        xml += `      </CourseControl>\n`;
      });
    }
    xml += `    </Course>\n`;
  });

  // Class-Course Assignments
  const classAssignments = raceCourse.classAssignments || [];
  classAssignments.forEach((assignment) => {
    const numCompAttr = assignment.numberOfCompetitors != null ? ` numberOfCompetitors="${assignment.numberOfCompetitors}"` : "";
    xml += `    <ClassCourseAssignment${numCompAttr}>\n`;
    xml += `      <ClassName>${escapeXml(assignment.className)}</ClassName>\n`;
    xml += `      <CourseName>${escapeXml(assignment.courseName)}</CourseName>\n`;
    xml += `    </ClassCourseAssignment>\n`;
  });

  // Extension: Routes (vertices + edges)
  if (vertices.length > 0 || edges.length > 0) {
    xml += `    <x:Routes>\n`;
    vertices.forEach((n) => {
      xml += `      <x:Node id="${escapeXml(n.id)}" x="${n.x}" y="${n.y}" />\n`;
    });
    edges.forEach((e) => {
      const attrs: string[] = [];
      attrs.push(`from="${escapeXml(e.from)}"`);
      attrs.push(`to="${escapeXml(e.to)}"`);
      if (e.label) attrs.push(`label="${escapeXml(e.label)}"`);
      if (typeof e.oneWay === "boolean") attrs.push(`oneWay="${e.oneWay ? "true" : "false"}"`);
      if (typeof e.ignoreLength === "boolean") attrs.push(`teleport="${e.ignoreLength ? "true" : "false"}"`); // legacy name mapping
      if (e.reverseLabel) attrs.push(`reverseLabel="${escapeXml(e.reverseLabel)}"`);
      xml += `      <x:Edge ${attrs.join(" ")} />\n`;
    });
    xml += `    </x:Routes>\n`;
  }

  xml += `  </RaceCourseData>\n`;
  xml += `</CourseData>`;

  return xml;
}

import { IOFXmlImporter } from "./iof-xml-importer";

/**
 * Parse IOF XML string into EventData structure
 * @param xmlString - IOF XML string to parse
 * @returns Partial EventData with parsed data
 * @throws Error if XML is invalid or missing required elements
 */
export function parseEventFromIOFXML(xmlString: string): Partial<EventData> {
  const importer = new IOFXmlImporter();
  return importer.parse(xmlString);
}

