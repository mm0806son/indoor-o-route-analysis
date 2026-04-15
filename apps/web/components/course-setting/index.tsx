"use client"

import { useCallback, useEffect, useState, useRef } from "react";
import { useAppData } from "@indoor-o-route-analysis/ui";
import { RouteAnalyzer, getDifficultyCategory } from "@indoor-o-route-analysis/core";
import { ScoringModelRegistry } from "@indoor-o-route-analysis/core";
import { getActiveMap } from "@indoor-o-route-analysis/core";
import CourseSettingMapViewer, { type CourseSettingMapViewerHandle } from "./map-viewer";
import CourseSettingPropertiesPanel from "./properties-panel";

export default function CourseSetting() {
  const {
    selectedEvent,
    selectedCourseId,
    setSelectedCourseId,
    selectedControlId,
    setSelectedControlId,
    updateEventData,
  } = useAppData();

  const mapViewerRef = useRef<CourseSettingMapViewerHandle>(null);

  const handleNavigate = (point: { x: number; y: number }) => {
    mapViewerRef.current?.flyTo(point);
  };

  const [showBackgroundMap, setShowBackgroundMap] = useState(true);
  const [isMapMuted, setIsMapMuted] = useState(false);
  const [showDifficultyColors, setShowDifficultyColors] = useState(false);
  const [controlColors, setControlColors] = useState<Map<string, string>>(new Map());
  const [autoAddToCourse, setAutoAddToCourse] = useState(false);

  // Access the first race course
  const raceCourse = selectedEvent?.raceCourses?.[0];
  const activeMap = getActiveMap(selectedEvent ?? undefined, selectedCourseId ?? undefined);

  // Calculate difficulty colors for available controls
  useEffect(() => {
    if (!showDifficultyColors || !selectedEvent || !selectedCourseId || !raceCourse) {
      setTimeout(() => setControlColors(new Map()), 0);
      return;
    }

    const course = raceCourse.courses?.find((c) => c.id === selectedCourseId);
    if (!course?.controls || course.controls.length === 0) {
      setTimeout(() => setControlColors(new Map()), 0);
      return;
    }

    const lastControlEntry = course.controls[course.controls.length - 1];
    if (!lastControlEntry.controlId) {
      setTimeout(() => setControlColors(new Map()), 0);
      return;
    }
    const lastControlId = lastControlEntry.controlId;

    // Identify controls already in course to exclude them
    const courseControlIds = new Set(course.controls.map((c) => c.controlId).filter((id): id is string => !!id));

    const scoringModelId = selectedEvent.difficultyScoringModel;
    const scoringModel = scoringModelId ? ScoringModelRegistry.getModel(scoringModelId) : undefined;

    let isCancelled = false;

    const eventControls = raceCourse.controls ?? [];
    const eventNodes = raceCourse.vertices ?? [];
    const eventEdges = raceCourse.edges ?? [];
    const mapScale = activeMap?.scale ?? 1000;

    const calculateColors = async () => {
      // Yield to allow UI update
      await new Promise((resolve) => setTimeout(resolve, 0));

      const eventPolygons = raceCourse.polygons ?? [];
      const analyzer = new RouteAnalyzer(eventControls, eventNodes, eventEdges, mapScale, scoringModel, eventPolygons);

      const lastControl = eventControls.find((c) => c.id === lastControlId);
      if (!lastControl) return;

      const colors = new Map<string, string>();
      const potentialControls = eventControls.filter((c) => !courseControlIds.has(c.id) && c.id !== lastControlId);

      // Process in batches
      const BATCH_SIZE = 10;
      for (let i = 0; i < potentialControls.length; i += BATCH_SIZE) {
        if (isCancelled) return;
        const batch = potentialControls.slice(i, i + BATCH_SIZE);

        for (const targetControl of batch) {
          try {
            // Quickest route search
            const routes = analyzer.findAlternativePathsBetweenControls(lastControl.id, targetControl.id, 1);
            if (routes.length > 0) {
              const cat = getDifficultyCategory(routes[0].difficulty, scoringModel);
              colors.set(targetControl.id, cat.color);
            }
          } catch (e) {
            console.warn(`Failed to calc route to ${targetControl.id}`, e);
          }
        }
        await new Promise((resolve) => setTimeout(resolve, 0));
      }

      if (!isCancelled) {
        setControlColors(colors);
      }
    };;
    calculateColors();

    return () => {
      isCancelled = true;
    };
  }, [
    showDifficultyColors,
    selectedEvent,
    selectedCourseId,
    raceCourse, // Depend on raceCourse object
    activeMap?.scale,
  ]);

  const updateRaceCourse = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (updates: any) => {
      if (!selectedEvent) return;
      const raceCourses = selectedEvent.raceCourses ?? [];
      const updatedRaceCourses = [...raceCourses];
      // In this simplified model we always edit index 0
      updatedRaceCourses[0] = { ...updatedRaceCourses[0], ...updates };
      await updateEventData(selectedEvent.id, { raceCourses: updatedRaceCourses });
    },
    [selectedEvent, updateEventData],
  );

  const handleAddControlToCourse = useCallback(
    async (controlId: string) => {
      if (!selectedCourseId || !raceCourse) return;

      // Find the control by ID
      const control = (raceCourse.controls ?? []).find((c) => c.id === controlId);
      if (!control) return;

      // Append control ID to the current course
      const updatedCourses = (raceCourse.courses ?? []).map((c) => {
        if (c.id === selectedCourseId) {
          const courseControls = c.controls ?? [];
          return {
            ...c,
            controls: [...courseControls, { controlId: control.id }],
          };
        }
        return c;
      });

      await updateRaceCourse({ courses: updatedCourses });
    },
    [selectedCourseId, raceCourse, updateRaceCourse],
  );

  const handleMoveControl = useCallback(
    async (delta: { x: number; y: number }) => {
      if (!raceCourse || !selectedControlId) return;

      const control = raceCourse.controls?.find((c) => c.id === selectedControlId);
      if (!control) return;

      const updatedControls = (raceCourse.controls ?? []).map((c) =>
        c.id === selectedControlId
          ? {
              ...c,
              mapPosition: {
                ...c.mapPosition,
                x: c.mapPosition.x + delta.x,
                y: c.mapPosition.y + delta.y,
              },
            }
          : c,
      );

      await updateRaceCourse({ controls: updatedControls });
    },
    [selectedControlId, raceCourse, updateRaceCourse],
  );

  const handleDeleteSelectedControl = useCallback(async () => {
    if (!raceCourse || !selectedControlId) return;

    const controls = raceCourse.controls ?? [];
    const controlToDelete = controls.find((c) => c.id === selectedControlId);
    const updatedControls = controls.filter((c) => c.id !== selectedControlId);

    const updatedCourses = (raceCourse.courses ?? []).map((course) => {
      const courseControls = course.controls ?? [];
      return {
        ...course,
        controls: controlToDelete
          ? courseControls.filter((ctrl) => ctrl.controlId !== controlToDelete.id)
          : courseControls,
      };
    });

    await updateRaceCourse({
      controls: updatedControls,
      courses: updatedCourses,
    });
    setSelectedControlId(null);
  }, [selectedControlId, raceCourse, setSelectedControlId, updateRaceCourse]);

  useEffect(() => {
    const isFormElement = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName;
      const editable = target.getAttribute("contenteditable");
      return tag === "INPUT" || tag === "TEXTAREA" || editable === "true";
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (isFormElement(event.target)) return;

      if (event.key === "Escape" && selectedControlId) {
        event.preventDefault();
        setSelectedControlId(null);
        return;
      }

      if ((event.key === "Delete" || event.key === "Backspace") && selectedControlId) {
        event.preventDefault();
        handleDeleteSelectedControl();
        return;
      }


      if (event.metaKey || event.ctrlKey) {
        // Ctrl/Cmd+S: Set control type to Start
        if (event.key.toLowerCase() === "s" && selectedControlId) {
          event.preventDefault();
          const controls = raceCourse?.controls ?? [];
          const updatedControls = controls.map((c) =>
            c.id === selectedControlId ? { ...c, type: "start" as const } : c,
          );

          updateRaceCourse({ controls: updatedControls });
          return;
        }

        // Ctrl/Cmd+F: Set control type to Finish
        if (event.key.toLowerCase() === "f" && selectedControlId) {
          event.preventDefault();
          const controls = raceCourse?.controls ?? [];
          const updatedControls = controls.map((c) =>
            c.id === selectedControlId ? { ...c, type: "finish" as const } : c,
          );

          updateRaceCourse({ controls: updatedControls });
          return;
        }

        return;
      }

      if (event.key.toLowerCase() === "a" && selectedControlId) {
        event.preventDefault();
        const control = raceCourse?.controls?.find((c) => c.id === selectedControlId);
        if (control) {
          handleAddControlToCourse(control.id);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    handleAddControlToCourse,
    handleDeleteSelectedControl,
    handleMoveControl,
    selectedControlId,
    raceCourse,
    updateRaceCourse,
    setSelectedControlId,
  ]);

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Main View */}
      <div className="flex-1 flex overflow-hidden min-w-0">
        <CourseSettingMapViewer
          ref={mapViewerRef}
          map={activeMap}
          selectedControlId={selectedControlId}
          onControlSelected={setSelectedControlId}
          onMoveControl={handleMoveControl}
          showBackgroundMap={showBackgroundMap}
          backgroundOpacity={isMapMuted ? 0.3 : 1}
          controlColors={controlColors}
          autoAddToCourse={autoAddToCourse}
        />

        {/* Properties Panel */}
        <CourseSettingPropertiesPanel
          selectedCourseId={selectedCourseId}
          onSelectedCourseChange={setSelectedCourseId}
          onAddControlToCourse={handleAddControlToCourse}
          selectedControlId={selectedControlId}
          onSelectedControlChange={setSelectedControlId}
          onNavigate={handleNavigate}
          showBackgroundMap={showBackgroundMap}
          onShowBackgroundMapChange={setShowBackgroundMap}
          isMapMuted={isMapMuted}
          onMuteChange={setIsMapMuted}
          showDifficultyColors={showDifficultyColors}
          onShowDifficultyColorsChange={setShowDifficultyColors}
          autoAddToCourse={autoAddToCourse}
          onAutoAddToCourseChange={setAutoAddToCourse}
        />
      </div>
    </div>
  );
}
