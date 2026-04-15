import type { EventData, Course } from "../models";
import type { LegExportInfo } from "./training-data-io";
import type { RouteInfo } from "../route-analyzer";
import { getActualCourseControls } from "../utils";

const IOF_NS = "http://www.orienteering.org/datastandard/3.0";
const TRAINING_NS = "http://www.orienteering.org/datastandard/3.0/extensions/training/1.0";
const XSI_NS = "http://www.w3.org/2001/XMLSchema-instance";

export class TrainingDataXmlGenerator {
  static generateXml(
    event: EventData,
    course: Course,
    legs: LegExportInfo[],
    getAlternativeRoutes: (leg: LegExportInfo) => RouteInfo[],
  ): string {
    const controls = event.raceCourses?.[0]?.controls || [];
    // Get actual course controls (intermediate start controls removed) for the XML
    const courseControls = getActualCourseControls(course.controls || [], controls);
    const eventDateFormatted = event.startTime.date || new Date().toISOString().split("T")[0];

    // Create XML Document
    const doc = document.implementation.createDocument(IOF_NS, "CourseData", null);
    const root = doc.documentElement;

    root.setAttributeNS("http://www.w3.org/2000/xmlns/", "xmlns:xsi", XSI_NS);
    root.setAttributeNS("http://www.w3.org/2000/xmlns/", "xmlns:training", TRAINING_NS);
    root.setAttribute("iofVersion", "3.0");
    root.setAttribute("createTime", new Date().toISOString());
    root.setAttribute("creator", "Indoor O Route Analysis");

    // Helper to create element with text content
    const createEl = (tagName: string, text?: string | number) => {
      const el = doc.createElementNS(IOF_NS, tagName);
      if (text !== undefined && text !== null) {
        el.textContent = String(text);
      }
      return el;
    };

    // Helper to create training element
    const createTrainingEl = (tagName: string, text?: string | number) => {
      const el = doc.createElementNS(TRAINING_NS, `training:${tagName}`);
      if (text !== undefined && text !== null) {
        el.textContent = String(text);
      }
      return el;
    };

    // <Event>
    const eventEl = createEl("Event");
    eventEl.appendChild(createEl("Name", event.name || "Untitled Event"));
    
    if (event.id) {
      const extEl = createEl("Extensions");
      extEl.appendChild(createTrainingEl("EventId", event.id));
      eventEl.appendChild(extEl);
    }

    const startTimeEl = createEl("StartTime");
    startTimeEl.appendChild(createEl("Date", eventDateFormatted));
    eventEl.appendChild(startTimeEl);
    root.appendChild(eventEl);

    // <RaceCourseData>
    const raceCourseDataEl = createEl("RaceCourseData");
    root.appendChild(raceCourseDataEl);

    // 1. Controls
    const usedControlIds = new Set<string>();
    courseControls.forEach((cc) => usedControlIds.add(cc.controlId));
    const usedControls = controls.filter((c) => usedControlIds.has(c.id));

    usedControls.forEach((control) => {
      const controlEl = createEl("Control");
      controlEl.appendChild(createEl("Id", control.id));

      const mapPosEl = createEl("MapPosition");
      mapPosEl.setAttribute("x", String(control.mapPosition.x));
      mapPosEl.setAttribute("y", String(control.mapPosition.y));
      mapPosEl.setAttribute("unit", "mm");
      controlEl.appendChild(mapPosEl);

      raceCourseDataEl.appendChild(controlEl);
    });

    // 2. Course
    const courseEl = createEl("Course");
    courseEl.appendChild(createEl("Id", course.id));
    courseEl.appendChild(createEl("Name", course.name || "Untitled Course"));

    if (course.id) {
      const extEl = createEl("Extensions");
      extEl.appendChild(createTrainingEl("CourseId", course.id));
      courseEl.appendChild(extEl);
    }
    
    raceCourseDataEl.appendChild(courseEl);

    // 3. Course Controls
    courseControls.forEach((cc, index) => {
      const courseControlEl = createEl("CourseControl");
      courseControlEl.appendChild(createEl("Control", cc.controlId));

      if (index > 0) {
        const legIndex = index - 1;
        if (legIndex < legs.length) {
          const leg = legs[legIndex];
          const alternatives = getAlternativeRoutes(leg);
          const sorted = [...alternatives].sort((a, b) => a.distance - b.distance);

          if (sorted.length > 0) {
            const extEl = createEl("Extensions");
            sorted.forEach((route) => {
              const routeDesc = route.description ? route.description.replace(/[,\s]/g, "") : "-";
              const routeEl = createTrainingEl("Route");
              routeEl.appendChild(createTrainingEl("Description", routeDesc));
              routeEl.appendChild(createTrainingEl("Length", Math.round(route.distance)));
              extEl.appendChild(routeEl);
            });
            courseControlEl.appendChild(extEl);
          }
        }
      }
      courseEl.appendChild(courseControlEl);
    });

    const serializer = new XMLSerializer();
    const xmlString = serializer.serializeToString(doc);
    return `<?xml version="1.0" encoding="UTF-8"?>\n${xmlString}`;
  }
}
