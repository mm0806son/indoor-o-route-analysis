import { describe, it, expect } from 'vitest';
import { parseEventFromJSON, serializeEventToJSON, validateEventData } from "./json-io";
import type { EventData } from "../models/event";

describe('JSON Import/Export', () => {
  const validEvent: EventData = {
    id: "event-123",
    name: "Test Event",
    startTime: { date: "2024-01-15" },
    country: "norway",
    difficultyScoringModel: "stepscore@0.1",
    raceCourses: [
      {
        courses: [
          {
            id: "course-1",
            name: "Course A",
            controls: [
              { controlId: "101", type: "start", mapText: "1" },
              { controlId: "102", type: "control", mapText: "2" },
              { controlId: "103", type: "finish", mapText: "3" },
            ],
            mapId: "map-1",
          },
        ],
        controls: [
          { id: "101", type: "start", mapPosition: { x: 0, y: 0 }, floor: 1 },
          { id: "102", type: "control", mapPosition: { x: 100, y: 100 }, floor: 1 },
          { id: "103", type: "finish", mapPosition: { x: 200, y: 200 }, floor: 2 },
        ],
        vertices: [
          { id: "n1", x: 50, y: 50 },
          { id: "n2", x: 150, y: 150 },
        ],
        edges: [
          { from: "101", to: "n1", label: "corridor1", oneWay: false },
          { from: "n1", to: "102", label: "stairs", oneWay: false, ignoreLength: true },
        ],
        maps: [{ id: "map-1", scale: 5000, image: { url: "", width: 1000, height: 1000 } }],
      },
    ],
  };

  describe('serializeEventToJSON', () => {
    it('should serialize event to JSON string with formatting', () => {
      const json = serializeEventToJSON(validEvent, true);
      
      expect(json).toContain('"id": "event-123"');
      expect(json).toContain('"name": "Test Event"');
      expect(json).toContain('"date": "2024-01-15"');
      expect(json).toContain('"country": "norway"');
      expect(typeof json).toBe('string');
    });

    it('should serialize event to compact JSON without formatting', () => {
      const json = serializeEventToJSON(validEvent, false);
      
      expect(json).not.toContain('\n');
      expect(json).toContain('"id":"event-123"');
      expect(typeof json).toBe('string');
    });

    it('should serialize all event properties', () => {
      const json = serializeEventToJSON(validEvent);
      const parsed = JSON.parse(json);
      
      expect(parsed).toHaveProperty('id');
      expect(parsed).toHaveProperty("name");
      expect(parsed).toHaveProperty("startTime");
      expect(parsed).toHaveProperty("raceCourses");
    });

    it('should serialize courses with controls', () => {
      const json = serializeEventToJSON(validEvent);
      const parsed = JSON.parse(json);
      const raceCourse = parsed.raceCourses[0];
      
      expect(raceCourse.courses).toHaveLength(1);
      expect(raceCourse.courses[0].name).toBe("Course A");
      expect(raceCourse.courses[0].controls).toHaveLength(3);
    });

    it('should serialize controls with all properties', () => {
      const json = serializeEventToJSON(validEvent);
      const parsed = JSON.parse(json);
      const raceCourse = parsed.raceCourses[0];
      
      expect(raceCourse.controls).toHaveLength(3);
      expect(raceCourse.controls[0]).toHaveProperty("id");
      expect(raceCourse.controls[0]).toHaveProperty("type");
      expect(raceCourse.controls[0]).toHaveProperty("mapPosition");
      expect(raceCourse.controls[0]).toHaveProperty("floor");
    });

    it('should serialize nodes and edges', () => {
      const json = serializeEventToJSON(validEvent);
      const parsed = JSON.parse(json);
      const raceCourse = parsed.raceCourses[0];
      
      expect(raceCourse.vertices).toHaveLength(2);
      expect(raceCourse.edges).toHaveLength(2);
      expect(raceCourse.edges[1]).toHaveProperty("ignoreLength");
    });
  });

  describe('parseEventFromJSON', () => {
    it("should parse valid JSON string to EventData", () => {
      const json = serializeEventToJSON(validEvent);
      const parsed = parseEventFromJSON(json);

      expect(parsed.id).toBe(validEvent.id);
      expect(parsed.name).toBe(validEvent.name);
      expect(parsed.startTime.date).toBe(validEvent.startTime.date);
      expect(parsed.country).toBe(validEvent.country);
    });

    it("should parse courses correctly", () => {
      const json = serializeEventToJSON(validEvent);
      const parsed = parseEventFromJSON(json);
      const raceCourse = parsed.raceCourses![0];

      expect(raceCourse.courses).toHaveLength(1);
      expect(raceCourse.courses?.[0].name).toBe("Course A");
      expect(raceCourse.courses?.[0].controls).toHaveLength(3);
    });

    it("should parse controls correctly", () => {
      const json = serializeEventToJSON(validEvent);
      const parsed = parseEventFromJSON(json);
      const raceCourse = parsed.raceCourses![0];

      expect(raceCourse.controls).toHaveLength(3);
      expect(raceCourse.controls?.[0].id).toBe("101");
      expect(raceCourse.controls?.[0].type).toBe("start");
      expect(raceCourse.controls?.[2].floor).toBe(2);
    });

    it("should parse nodes and edges correctly", () => {
      const json = serializeEventToJSON(validEvent);
      const parsed = parseEventFromJSON(json);
      const raceCourse = parsed.raceCourses![0];

      expect(raceCourse.vertices).toHaveLength(2);
      expect(raceCourse.edges).toHaveLength(2);
      expect(raceCourse.edges?.[1].ignoreLength).toBe(true);
    });

    it("should throw error for invalid JSON", () => {
      const invalidJson = "{ invalid json }";

      expect(() => parseEventFromJSON(invalidJson)).toThrow("Invalid JSON format");
    });

    it("should throw error for missing id", () => {
      const json = '{ "name": "Test Event", "startTime": { "date": "2024-01-15" } }';

      expect(() => parseEventFromJSON(json)).toThrow("Missing or invalid required field: id");
    });
  });

  describe("validateEventData", () => {
    it("should validate a valid event record", () => {
      expect(validateEventData(validEvent)).toBe(true);
    });

    it("should throw error for missing id", () => {
      const invalid = { ...validEvent, id: "" };

      expect(() => validateEventData(invalid)).toThrow("Invalid event: missing or invalid id");
    });

    it("should throw error for missing name", () => {
      const invalid = { ...validEvent, name: "" };

      expect(() => validateEventData(invalid)).toThrow("Invalid event: missing or invalid name");
    });
  });
});
