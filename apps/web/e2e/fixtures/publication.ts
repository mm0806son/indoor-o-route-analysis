import type { EventData, CustomRoute } from "@indoor-o-route-analysis/core";
import { jsPDF } from "jspdf";

const pdf = new jsPDF({
  unit: "mm",
  format: [200, 120],
  orientation: "landscape",
});
pdf.setFillColor(240, 240, 235);
pdf.rect(0, 0, 200, 120, "F");
pdf.setDrawColor(40, 40, 40);
pdf.rect(10, 10, 180, 100);
pdf.text("Post-race test map", 15, 18);
export const testEvent: EventData = {
  id: "race-a",
  name: "测试赛 A",
  country: "",
  startTime: { date: "2026-10-19" },
  raceCourses: [
    {
      maps: [
        {
          id: "map",
          scale: 1000,
          layout: "horizontal",
          image: {
            width: 200,
            height: 120,
            mediaType: "application/pdf",
            encodedData: Buffer.from(pdf.output("arraybuffer")).toString(
              "base64",
            ),
          },
          mapPositionTopLeft: { x: 0, y: 0 },
          mapPositionBottomRight: { x: 200, y: 120 },
        },
      ],
      vertices: [
        { id: "S", x: 20, y: 60 },
        { id: "A", x: 70, y: 25 },
        { id: "B", x: 70, y: 95 },
        { id: "31", x: 120, y: 60 },
        { id: "F", x: 180, y: 60 },
      ],
      edges: [
        { from: "S", to: "A", label: "" },
        { from: "A", to: "31", label: "" },
        { from: "S", to: "B", label: "" },
        { from: "B", to: "31", label: "" },
        { from: "31", to: "F", label: "", oneWay: true },
      ],
      controls: [
        { id: "S", type: "start", mapPosition: { x: 20, y: 60 } },
        { id: "31", type: "control", mapPosition: { x: 120, y: 60 } },
        { id: "F", type: "finish", mapPosition: { x: 180, y: 60 } },
      ],
      courses: [
        {
          id: "course",
          name: "公开赛程",
          mapId: "map",
          controls: [
            { controlId: "S", type: "start" },
            { controlId: "31", type: "control" },
            { controlId: "F", type: "finish" },
          ],
        },
      ],
    },
  ],
};
export const recommended: CustomRoute = {
  id: "recommended",
  name: "组织者推荐",
  courseId: "course",
  legs: [
    {
      fromControlId: "S",
      toControlId: "31",
      path: ["S", "A", "31"].map((nodeId) => ({ nodeId })),
    },
    {
      fromControlId: "31",
      toControlId: "F",
      path: ["31", "F"].map((nodeId) => ({ nodeId })),
    },
  ],
};
export const publishedA = {
  schemaVersion: 1,
  eventId: "race-a",
  revision: "v1",
  event: testEvent,
  recommendations: [recommended],
};
export const publishedB = {
  ...publishedA,
  eventId: "race-b",
  event: { ...testEvent, id: "race-b", name: "测试赛 B" },
};
export const manifest = {
  schemaVersion: 1,
  currentEventId: "race-a",
  events: [
    { eventId: "race-a", revision: "v1", path: "events/race-a/v1.json" },
    { eventId: "race-b", revision: "v1", path: "events/race-b/v1.json" },
  ],
};
