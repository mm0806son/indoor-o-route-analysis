"use client"

import { loadPdfJs } from "@/lib/load-pdfjs";

import { useState, useCallback, useEffect, useMemo } from "react";
// import dynamic from "next/dynamic"; // Removed dynamic import
import { Info } from "lucide-react"; // Reduced imports
import { Button } from "@indoor-o-route-analysis/ui";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@indoor-o-route-analysis/ui";
import { useAppData } from "@indoor-o-route-analysis/ui";
import EventManagerInfoDialog from "./info-dialog";
// import { ControlRenderer } from "@indoor-o-route-analysis/ui"; // Removed
import { EventPropertiesTab } from "./event-properties-tab";
import { MapPropertiesTab } from "./map-properties-tab";
import { CoursesTab } from "./courses-tab";
import { ClassAssignmentsTab } from "./class-assignments-tab";
import { ControlsTab } from "./controls-tab";

// MapViewer moved to map-properties-tab.tsx

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- pdfjs-dist is untyped dynamic import
let pdfjsLib: any = null;
if (typeof window !== "undefined") {
  loadPdfJs().then((module) => {
    pdfjsLib = module;
    pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  }).catch(error => console.error("Failed to initialize local PDF renderer", error));
}

// import OpenEventDialog from "./open-event-dialog"; // Removed

import { type Course, DEFAULT_NUMBER_OF_COMPETITORS } from "@indoor-o-route-analysis/core";
// import type { MapViewerState } from "@/components/map-viewer"; // Removed
// import { getEventTransform } from "@indoor-o-route-analysis/core"; // Removed
import type { EventData, ClassCourseAssignment, RaceCourseData } from "@indoor-o-route-analysis/core";

type CourseItem = Course;

export default function EventManager() {
  const {
    events: _events,
    selectedEventId: _selectedEventId,
    selectedEvent,
    setSelectedEventId: _setSelectedEventId,
    updateEventData,
    addEvent: _addEvent,
    isLoadingEvents,
    unsavedChanges: _unsavedChanges,
    saveCurrentEvent: _saveCurrentEvent,
    discardChanges: _discardChanges,
    fileHandle: _fileHandle,
    setFileHandle: _setFileHandle,
    pdfBlobUrl,
  } = useAppData();

  const [titleInput, setTitleInput] = useState("");

  const [dateInput, setDateInput] = useState("");

  const [eventUrlInput, setEventUrlInput] = useState("");
  const [eventImageUrlInput, setEventImageUrlInput] = useState("");
  const [mapDownloadUrlInput, setMapDownloadUrlInput] = useState("");

  // Map properties
  const [mapUriInput, setMapUriInput] = useState("");
  const [mapScaleInput, setMapScaleInput] = useState(1000);
  const [mapLayoutInput, setMapLayoutInput] = useState<"horizontal" | "vertical" | "pages">("horizontal");
  const [saveEncodedInJson, setSaveEncodedInJson] = useState(false);

  const [countryInput, setCountryInput] = useState<"norway" | "sweden" | "">("");
  const [editingCourseId, setEditingCourseId] = useState<string | null>(null);
  // const [importing, setImporting] = useState(false); // Unused
  const [_showSortMenu, _setShowSortMenu] = useState(false);
  const [showInfoDialog, setShowInfoDialog] = useState(false);

  const selectedEventCourses = [...(selectedEvent?.raceCourses?.[0]?.courses ?? [])].sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset editing state on event change
    setEditingCourseId(null);
  }, [_selectedEventId]);

  const [cursorCoordinates, setCursorCoordinates] = useState<{
    event: { x: number; y: number };
    map: { x: number; y: number };
  } | null>(null);

  const [latitudeInput, setLatitudeInput] = useState<number>(0);
  const [longitudeInput, setLongitudeInput] = useState<number>(0);

  // Sync local state when event changes
  useEffect(() => {
    if (selectedEvent) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing local form state from event data
      setTitleInput(selectedEvent.name);
      setDateInput(selectedEvent.startTime.date);
      setEventUrlInput(selectedEvent.eventUrl || "");
      setEventImageUrlInput(selectedEvent.eventImageUrl || "");
      setMapDownloadUrlInput(selectedEvent.mapDownloadUrl || "");

      const map = selectedEvent.raceCourses?.[0]?.maps?.[0];
      setMapUriInput(map?.image?.url || "");
      setMapScaleInput(map?.scale || 1000);
      setMapLayoutInput((map?.layout || "horizontal") as "horizontal" | "vertical" | "pages");
      setSaveEncodedInJson(map?.saveEncoded || false);
      setLatitudeInput(map?.latitude || 0);
      setLongitudeInput(map?.longitude || 0);

      setCountryInput(selectedEvent.country || "");
    } else {
      setTitleInput("");
      setDateInput("");
      setEventImageUrlInput("");
      setMapDownloadUrlInput("");
      setEventUrlInput("");
      setMapUriInput("");
      setMapScaleInput(1000);
      setSaveEncodedInJson(false);
      setLatitudeInput(0);
      setLongitudeInput(0);
      setCountryInput("");
    }
  }, [selectedEvent]);

  // --- Action Handlers ---

  const handleGeoBlur = async () => {
    if (!selectedEvent) return;
    const currentMap = selectedEvent.raceCourses?.[0]?.maps?.[0];
    if (!currentMap) return;

    const updatedMap = {
        ...currentMap,
        latitude: latitudeInput,
        longitude: longitudeInput
    };
    
    // We update the map inside the raceCourse structure
    const raceCourses = selectedEvent.raceCourses || [];
    const updatedRaceCourses = [...raceCourses];
    if (updatedRaceCourses.length > 0) {
        updatedRaceCourses[0] = {
            ...updatedRaceCourses[0],
            maps: [updatedMap]
        };
        await updateEventProperties(selectedEvent.id, { raceCourses: updatedRaceCourses });
    }
  };


  // Add new event

  // Import example event - REMOVED

  // Update event properties
  const updateEventProperties = useCallback(
    async (id: string, updates: Partial<EventData>, pdfData?: ArrayBuffer) => {
      await updateEventData(id, updates, pdfData);
    },
    [updateEventData],
  );

  const mutateCourses = useCallback(
    (updater: (courses: CourseItem[]) => CourseItem[]) => {
      if (!selectedEvent) return;
      
      const currentCourses = selectedEvent.raceCourses?.[0]?.courses ?? [];
      const updatedCourses = updater(currentCourses);
      
      const currentRaceCourses = selectedEvent.raceCourses ?? [];
      const newRaceCourses = [...currentRaceCourses];
      if (newRaceCourses.length === 0) {
        // Should ideally not happen if properly initialized, but safe fallback
        newRaceCourses.push({ maps: [], controls: [], courses: [] } as RaceCourseData);
      }

      newRaceCourses[0] = {
        ...newRaceCourses[0],
        courses: updatedCourses,
      };

      updateEventProperties(selectedEvent.id, { raceCourses: newRaceCourses });
    },
    [selectedEvent, updateEventProperties]
  );

  const addCourse = useCallback(() => {
    mutateCourses((courses) => [
      ...courses,
      {
        id: crypto.randomUUID(),
        name: `Course ${courses.length + 1}`,
        controls: [],
        mapId: "",
        numberOfCompetitors: DEFAULT_NUMBER_OF_COMPETITORS,
        // createdAt: Date.now(),
      },
    ]);
  }, [mutateCourses]);

  const updateCourseName = useCallback(
    (courseId: string, name: string) => {
      mutateCourses((courses) => courses.map((course) => (course.id === courseId ? { ...course, name } : course)));
    },
    [mutateCourses]
  );

  const updateCourseRunners = useCallback(
    (courseId: string, runners: number) => {
      mutateCourses((courses) =>
        courses.map((course) =>
          course.id === courseId
            ? { ...course, numberOfCompetitors: runners }
            : course,
        ),
      );
    },
    [mutateCourses],
  );

  const updateCourseTargetDifficulty = useCallback(
    (courseId: string, targetDifficulty: string | undefined) => {
      mutateCourses((courses) =>
        courses.map((course) =>
          course.id === courseId
            ? { ...course, targetDifficulty }
            : course,
        ),
      );
    },
    [mutateCourses],
  );

  const deleteCourse = useCallback(
    (courseId: string) => {
      mutateCourses((courses) => courses.filter((course) => course.id !== courseId));
    },
    [mutateCourses]
  );

  const duplicateCourse = useCallback(
    (courseId: string) => {
      mutateCourses((courses) => {
        const idx = courses.findIndex((course) => course.id === courseId);
        if (idx === -1) return courses;
        const source = courses[idx];
        const copy: CourseItem = {
          ...source,
          id: crypto.randomUUID(),
          name: `${source.name} Copy`,
          // createdAt: Date.now(),
        };
        const next = [...courses];
        next.splice(idx + 1, 0, copy);
        return next;
      });
    },
    [mutateCourses]
  );

  // Class assignment handlers
  const classAssignments = useMemo(() => selectedEvent?.raceCourses?.[0]?.classAssignments ?? [], [selectedEvent?.raceCourses]);

  const mutateClassAssignments = useCallback(
    (updater: (assignments: ClassCourseAssignment[]) => ClassCourseAssignment[]) => {
      if (!selectedEvent) return;
      
      const currentAssignments = selectedEvent.raceCourses?.[0]?.classAssignments ?? [];
      const updatedAssignments = updater(currentAssignments);
      
      const currentRaceCourses = selectedEvent.raceCourses ?? [];
      const newRaceCourses = [...currentRaceCourses];
      if (newRaceCourses.length === 0) {
        newRaceCourses.push({ maps: [], controls: [], courses: [], classAssignments: [] } as RaceCourseData);
      }

      newRaceCourses[0] = {
        ...newRaceCourses[0],
        classAssignments: updatedAssignments,
      };

      updateEventProperties(selectedEvent.id, { raceCourses: newRaceCourses });
    },
    [selectedEvent, updateEventProperties]
  );

  const addClassAssignment = useCallback(() => {
    mutateClassAssignments((assignments) => [
      ...assignments,
      { className: "", courseName: "" },
    ]);
  }, [mutateClassAssignments]);

  const updateClassAssignmentClassName = useCallback(
    (index: number, className: string) => {
      mutateClassAssignments((assignments) =>
        assignments.map((a, i) => (i === index ? { ...a, className } : a))
      );
    },
    [mutateClassAssignments]
  );

  const updateClassAssignmentCourseName = useCallback(
    (index: number, courseName: string) => {
      mutateClassAssignments((assignments) =>
        assignments.map((a, i) => (i === index ? { ...a, courseName } : a))
      );
    },
    [mutateClassAssignments]
  );

  const deleteClassAssignment = useCallback(
    (index: number) => {
      mutateClassAssignments((assignments) => assignments.filter((_, i) => i !== index));
    },
    [mutateClassAssignments]
  );

  const updateClassAssignmentRunners = useCallback(
    (index: number, numberOfCompetitors: number) => {
      mutateClassAssignments((assignments) =>
        assignments.map((a, i) => (i === index ? { ...a, numberOfCompetitors } : a))
      );
    },
    [mutateClassAssignments]
  );

  const updateCourseRunnersFromClasses = useCallback(() => {
    if (!selectedEvent) return;
    // Sum up numberOfCompetitors per courseName from class assignments
    const runnersByCourse = new Map<string, number>();
    for (const assignment of classAssignments) {
      if (!assignment.courseName) continue;
      const current = runnersByCourse.get(assignment.courseName) ?? 0;
      runnersByCourse.set(assignment.courseName, current + (assignment.numberOfCompetitors ?? 0));
    }
    // Update each course's numberOfCompetitors
    mutateCourses((courses) =>
      courses.map((course) => {
        const runners = runnersByCourse.get(course.name);
        return runners !== undefined ? { ...course, numberOfCompetitors: runners } : course;
      })
    );
  }, [selectedEvent, classAssignments, mutateCourses]);  

  // Helper function to download file
  const downloadFile = (content: string, filename: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Export graph only as JSON
  const _exportGraphJSON = useCallback(() => {
    if (!selectedEvent) return;

    const graphData = {
      nodes: selectedEvent.raceCourses?.[0]?.vertices || [],
      edges: selectedEvent.raceCourses?.[0]?.edges || [],
    };

    const json = JSON.stringify(graphData, null, 2);
    const dateStr = selectedEvent.startTime.date;
    const filename = `${dateStr} ${selectedEvent.name} (graph).json`;
    downloadFile(json, filename, "application/json");
  }, [selectedEvent]);

  // --- Import IOF XML ---

  // Save handlers
  const handleTitleBlur = () => {
    if (selectedEvent && titleInput !== selectedEvent.name) {
      updateEventProperties(selectedEvent.id, { name: titleInput });
    }
  };

  const handleDateBlur = () => {
    if (selectedEvent && dateInput) {
      if (dateInput !== selectedEvent.startTime.date) {
        updateEventProperties(selectedEvent.id, {
          startTime: {
            ...(selectedEvent.startTime || { date: "" }),
            date: dateInput,
          },
        });
      }
    }
  };

  const handleMapUriBlur = () => {
    const currentMap = selectedEvent?.raceCourses?.[0]?.maps?.[0];
    const currentUrl = currentMap?.image?.url || "";
    if (selectedEvent && mapUriInput !== currentUrl) {
      const updatedMap = currentMap
        ? {
            ...currentMap,
            image: { ...currentMap.image, url: mapUriInput },
          }
        : {
            scale: 1000,
            image: { url: mapUriInput },
            mapPositionTopLeft: { x: 0, y: 0 },
            layout: "horizontal" as const,
          };

      const updatedRaceCourses = [...(selectedEvent.raceCourses || [])];
      updatedRaceCourses[0] = {
        ...(updatedRaceCourses[0] || { controls: [], courses: [] }),
        maps: [updatedMap],
      };

      updateEventProperties(selectedEvent.id, { raceCourses: updatedRaceCourses });
    }
  };

  const handleMapScaleBlur = () => {
    const currentMap = selectedEvent?.raceCourses?.[0]?.maps?.[0];
    if (selectedEvent && mapScaleInput !== (currentMap?.scale || 1000)) {
      const updatedMap = currentMap
        ? { ...currentMap, scale: mapScaleInput }
        : {
            scale: mapScaleInput,
            image: { url: mapUriInput },
            mapPositionTopLeft: { x: 0, y: 0 },
            layout: "horizontal" as const,
          };

      const updatedRaceCourses = [...(selectedEvent.raceCourses || [])];
      updatedRaceCourses[0] = {
        ...(updatedRaceCourses[0] || { controls: [], courses: [] }),
        maps: [updatedMap],
      };

      updateEventProperties(selectedEvent.id, { raceCourses: updatedRaceCourses });
    }
  };

  const handleCountryChange = (newCountry: string) => {
    const country = newCountry === "none" ? "" : (newCountry as "norway" | "sweden" | "");
    setCountryInput(country);
    if (selectedEvent) {
      updateEventProperties(selectedEvent.id, {
        country,
      });
    }
  };

  const handleEventUrlBlur = () => {
    if (selectedEvent && eventUrlInput !== (selectedEvent.eventUrl || "")) {
      updateEventProperties(selectedEvent.id, {
        eventUrl: eventUrlInput,
      });
    }
  };

  const handleEventImageUrlBlur = () => {
    if (selectedEvent && eventImageUrlInput !== (selectedEvent.eventImageUrl || "")) {
      updateEventProperties(selectedEvent.id, {
        eventImageUrl: eventImageUrlInput,
      });
    }
  };

  const handleMapDownloadUrlBlur = () => {
    if (selectedEvent && mapDownloadUrlInput !== (selectedEvent.mapDownloadUrl || "")) {
      updateEventProperties(selectedEvent.id, {
        mapDownloadUrl: mapDownloadUrlInput,
      });
    }
  };

  const handleMapLayoutChange = (newLayout: string) => {
    const layout = newLayout as "horizontal" | "vertical" | "pages";
    setMapLayoutInput(layout);
    if (selectedEvent) {
      const currentMap = selectedEvent.raceCourses?.[0]?.maps?.[0];
      const updatedMap = currentMap
        ? {
            ...currentMap,
            layout,
          }
        : {
            scale: 1000,
            image: { url: mapUriInput },
            mapPositionTopLeft: { x: 0, y: 0 },
            layout,
          };

      const updatedRaceCourses = [...(selectedEvent.raceCourses || [])];
      updatedRaceCourses[0] = {
        ...(updatedRaceCourses[0] || { controls: [], courses: [] }),
        maps: [updatedMap],
      };

      updateEventProperties(selectedEvent.id, { raceCourses: updatedRaceCourses });
    }
  };

  if (isLoadingEvents) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="text-muted-foreground">{"Loading..."}</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 h-full bg-background overflow-hidden relative">
      {/* Header removed */}

      <div className="flex-1 flex flex-col overflow-hidden relative w-full h-full">
        {selectedEvent ? (
          <Tabs defaultValue="event-properties" className="w-full h-full flex flex-col">
            <div className="px-6 py-2 border-b flex items-center justify-between">
              <TabsList>
                <TabsTrigger value="event-properties">Event Properties</TabsTrigger>
                <TabsTrigger value="map-properties">Map Properties</TabsTrigger>
                <TabsTrigger value="courses">Courses</TabsTrigger>
                <TabsTrigger value="class-assignments">Class Assignments</TabsTrigger>
                <TabsTrigger value="controls">Controls</TabsTrigger>
              </TabsList>
              <Button variant="ghost" size="icon" onClick={() => setShowInfoDialog(true)} title="Show guide">
                <Info className="h-4 w-4" />
              </Button>
            </div>

            <TabsContent value="event-properties" className="flex-1 overflow-hidden p-0">
              <EventPropertiesTab
                titleInput={titleInput}
                setTitleInput={setTitleInput}
                handleTitleBlur={handleTitleBlur}
                dateInput={dateInput}
                setDateInput={setDateInput}
                handleDateBlur={handleDateBlur}
                eventUrlInput={eventUrlInput}
                setEventUrlInput={setEventUrlInput}
                handleEventUrlBlur={handleEventUrlBlur}
                eventImageUrlInput={eventImageUrlInput}
                setEventImageUrlInput={setEventImageUrlInput}
                handleEventImageUrlBlur={handleEventImageUrlBlur}
                mapDownloadUrlInput={mapDownloadUrlInput}
                setMapDownloadUrlInput={setMapDownloadUrlInput}
                handleMapDownloadUrlBlur={handleMapDownloadUrlBlur}
                countryInput={countryInput}
                handleCountryChange={handleCountryChange}
              />
            </TabsContent>

            <TabsContent value="map-properties" className="flex-1 overflow-hidden p-0">
              <MapPropertiesTab
                selectedEvent={selectedEvent}
                mapUriInput={mapUriInput}
                setMapUriInput={setMapUriInput}
                handleMapUriBlur={handleMapUriBlur}
                pdfjsLib={pdfjsLib}
                updateEventProperties={updateEventProperties}
                mapScaleInput={mapScaleInput}
                setMapScaleInput={setMapScaleInput}
                handleMapScaleBlur={handleMapScaleBlur}
                mapLayoutInput={mapLayoutInput}
                handleMapLayoutChange={handleMapLayoutChange}
                saveEncodedInJson={saveEncodedInJson}
                setSaveEncodedInJson={setSaveEncodedInJson}
                pdfBlobUrl={pdfBlobUrl}
                cursorCoordinates={cursorCoordinates}
                setCursorCoordinates={setCursorCoordinates}
              latitudeInput={latitudeInput}
              setLatitudeInput={setLatitudeInput}
              longitudeInput={longitudeInput}
              setLongitudeInput={setLongitudeInput}
              handleGeoBlur={handleGeoBlur}
            />
          </TabsContent>
          <TabsContent value="courses" className="flex-1 overflow-hidden flex flex-col p-0">
            <CoursesTab
                selectedEventCourses={selectedEventCourses}
                classAssignments={classAssignments}
                addCourse={addCourse}
                editingCourseId={editingCourseId}
                setEditingCourseId={setEditingCourseId}
                updateCourseName={updateCourseName}
                updateCourseRunners={updateCourseRunners}
                updateCourseTargetDifficulty={updateCourseTargetDifficulty}
                duplicateCourse={duplicateCourse}
                deleteCourse={deleteCourse}
            />
          </TabsContent>
          <TabsContent value="controls" className="flex-1 overflow-hidden flex flex-col p-0">
            <ControlsTab
                controls={selectedEvent.raceCourses?.[0]?.controls || []}
                courses={selectedEventCourses}
                polygons={selectedEvent.raceCourses?.[0]?.polygons || []}
            />
          </TabsContent>
          <TabsContent value="class-assignments" className="flex-1 overflow-hidden flex flex-col p-0">
            <ClassAssignmentsTab
                classAssignments={classAssignments}
                courses={selectedEventCourses}
                onAddAssignment={addClassAssignment}
                onUpdateClassName={updateClassAssignmentClassName}
                onUpdateCourseName={updateClassAssignmentCourseName}
                onUpdateNumberOfCompetitors={updateClassAssignmentRunners}
                onDeleteAssignment={deleteClassAssignment}
                onUpdateCourseRunners={updateCourseRunnersFromClasses}
            />
          </TabsContent>
          </Tabs>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-sm text-muted-foreground gap-4">
            <div className="text-lg font-medium">No Event Selected</div>
            <div className="text-center">
              Use the File menu in the top bar
              <br />
              to create or open an event.
            </div>
          </div>
        )}
      </div>

      {/* Info Dialog */}
      <EventManagerInfoDialog isOpen={showInfoDialog} onClose={() => setShowInfoDialog(false)} />
    </div>
  );
}
