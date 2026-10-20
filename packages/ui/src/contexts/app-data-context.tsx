"use client"

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import {
  getAllEvents,
  saveEvent,
  deleteEvent,
  getEventPdfData,
  getMapFile,
  getRecentFiles,
  addRecentFile,
  clearRecentFiles,
  saveEventMetadata,
  getAllEventMetadata,
  type EventData,
  type RecentFile,
} from "@indoor-o-route-analysis/core";
import { base64ToArrayBuffer } from "@indoor-o-route-analysis/core";
import { SettingsProvider, useSettings } from "./settings-context";

/**
 * What `addRecentFileHandle` accepts: a real File System Access handle for
 * locally opened/saved files, or a synthetic `{name, url}` identity record
 * for events imported from a URL (e.g. a bundled example) — there's no
 * handle to hold onto in that case, just enough info for the recent-files
 * list entry.
 */
export type RecentFileIdentity = FileSystemFileHandle | { name: string; url: string };

interface AppDataContextType {
  // Events
  events: EventData[];
  eventFilenames: Record<string, string>;
  setEventFilename: (id: string, filename: string) => Promise<void>;
  selectedEventId: string | null;
  selectedEvent: EventData | null;
  setSelectedEventId: (id: string | null) => void;
  addEvent: (event: EventData, pdfData?: ArrayBuffer, persistImmediate?: boolean) => Promise<void>;
  updateEventData: (id: string, updates: Partial<EventData>, pdfData?: ArrayBuffer) => Promise<void>;
  removeEvent: (id: string) => Promise<void>;
  refreshEvents: () => Promise<void>;

  // Recent files
  recentFiles: RecentFile[];
  addRecentFileHandle: (handle: RecentFileIdentity) => Promise<void>;
  clearRecentFilesList: () => Promise<void>;

  // Course selection (for course-setting and graph-editor)
  selectedCourseId: string | null;
  setSelectedCourseId: (id: string | null) => void;

  // Control selection (for course-setting)
  selectedControlId: string | null;
  setSelectedControlId: (id: string | null) => void;

  // PDF Blob URL for the selected event's map
  pdfBlobUrl: string | null;
  currentPdfData: ArrayBuffer | null;

  // Loading states
  isLoadingEvents: boolean;

  // Unsaved changes
  unsavedChanges: boolean;
  markAsSaved: () => void;
  saveCurrentEvent: () => Promise<void>;
  discardChanges: () => Promise<void>;

  // Storage Persistence Setting (owned by SettingsContext; re-exposed here for
  // backward compatibility with existing consumers of useAppData())
  persistToDB: boolean;
  setPersistToDB: (value: boolean) => void;

  // Running Speed for Analysis (m/s) (owned by SettingsContext)
  runningSpeed: number;
  setRunningSpeed: (value: number) => void;

  // Route Analysis k value (max alternative routes) (owned by SettingsContext)
  routeAnalysisK: number;
  setRouteAnalysisK: (value: number) => void;

  // File System Access
  fileHandle: FileSystemFileHandle | null;
  setFileHandle: (handle: FileSystemFileHandle | null) => void;
}

const AppDataContext = createContext<AppDataContextType | null>(null);

// Local storage keys
const STORAGE_KEYS = {
  SELECTED_EVENT: "app-selected-event",
  SELECTED_COURSE: "app-selected-course",
  SELECTED_CONTROL: "app-selected-control",
};

function getEventMapId(event: EventData | null): string | undefined {
  return event?.raceCourses?.[0]?.maps?.[0]?.id;
}

/**
 * Wraps SettingsProvider around the event/selection/file-session logic so
 * that AppDataProviderInner can read persistToDB/runningSpeed/routeAnalysisK
 * from useSettings() while still exposing them on useAppData() for backward
 * compatibility with existing consumers.
 */
export function AppDataProvider({ children }: { children: React.ReactNode }) {
  return (
    <SettingsProvider>
      <AppDataProviderInner>{children}</AppDataProviderInner>
    </SettingsProvider>
  );
}

function AppDataProviderInner({ children }: { children: React.ReactNode }) {
  const { persistToDB, setPersistToDB, runningSpeed, setRunningSpeed, routeAnalysisK, setRouteAnalysisK } =
    useSettings();

  // Events state
  const [events, setEvents] = useState<EventData[]>([]);
  const [eventFilenames, setEventFilenames] = useState<Record<string, string>>({});
  const [selectedEventId, setSelectedEventIdState] = useState<string | null>(null);
  const [isLoadingEvents, setIsLoadingEvents] = useState(true);
  const [unsavedChanges, setUnsavedChanges] = useState(false);
  const [fileHandle, setFileHandle] = useState<FileSystemFileHandle | null>(null);

  // PDF Data state (binary)
  const [currentPdfData, setCurrentPdfData] = useState<ArrayBuffer | null>(null);
  // Track loaded map ID to prevent redundant reloads/overwrites
  const [currentMapId, setCurrentMapId] = useState<string | null>(null);
  // PDF Blob state
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);

  // Course selection state
  const [selectedCourseId, setSelectedCourseIdState] = useState<string | null>(null);

  // Control selection state
  const [selectedControlId, setSelectedControlIdState] = useState<string | null>(null);

  // Recent files state
  const [recentFiles, setRecentFiles] = useState<RecentFile[]>([]);
  // persistToDB/runningSpeed/routeAnalysisK now live in SettingsContext (see useSettings() above)

  const markAsSaved = useCallback(() => {
    setUnsavedChanges(false);
  }, []);

  //
  // Load recent files on mount
  useEffect(() => {
    getRecentFiles().then(setRecentFiles).catch(console.error);
  }, []);

  const addRecentFileHandle = useCallback(async (handle: RecentFileIdentity) => {
    try {
      if (!handle) return;
      await addRecentFile(handle);
      const updatedFiles = await getRecentFiles();
      setRecentFiles(updatedFiles);
    } catch (e) {
      console.error("Failed to add recent file", e);
    }
  }, []);

  const clearRecentFilesList = useCallback(async () => {
    try {
      await clearRecentFiles();
      setRecentFiles([]);
    } catch (e) {
      console.error("Failed to clear recent files", e);
    }
  }, []);

  // Use effect to add to recent files whenever fileHandle changes
  useEffect(() => {
    if (fileHandle) {
      addRecentFileHandle(fileHandle);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileHandle]);

  // Derived state
  const selectedEvent = useMemo(() => events.find((e) => e.id === selectedEventId) || null, [events, selectedEventId]);

  // Load PDF Data when event changes
  useEffect(() => {
    let active = true;

    async function loadPdf() {
      if (!selectedEventId) {
        if (active) {
          setCurrentPdfData(null);
          setCurrentMapId(null);
        }
        return;
      }

      // Find the event to get the map ID
      const event = events.find((e) => e.id === selectedEventId);
      
      const mapId = getEventMapId(event || null);

      // If we already have the correct data loaded, don't reload (avoids overwriting with DB data)
      if (currentPdfData && mapId && mapId === currentMapId) {
        return;
      }

      try {
        let data: ArrayBuffer | undefined;
        let loadedId: string | undefined;

        // First check if the map has encoded data
        const mapData = event?.raceCourses?.[0]?.maps?.[0];
        if (mapData?.image?.encodedData) {
          try {
            data = base64ToArrayBuffer(mapData.image.encodedData);
            loadedId = mapId;
          } catch (e) {
            console.error("Failed to decode embedded map data", e);
          }
        }

        // Try to load by map ID from IndexedDB if no encoded data
        if (!data && mapId) {
          data = await getMapFile(mapId);
          if (data) loadedId = mapId;
        }

        // Fallback to event ID (legacy or simple case)
        if (!data) {
          data = await getEventPdfData(selectedEventId!);
        }

        if (active) {
          setCurrentPdfData(data || null);
          if (loadedId) setCurrentMapId(loadedId);
        }
      } catch (e) {
        console.error("Failed to load PDF data", e);
        if (active) {
          setCurrentPdfData(null);
          setCurrentMapId(null);
        }
      }
    }

    loadPdf();

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEventId, events]);

  // Generate Blob URL for PDF
  useEffect(() => {
    if (!currentPdfData) {
      setPdfBlobUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      return;
    }

    let blob: Blob;
    try {
      const data = currentPdfData;
      let uint8Array: Uint8Array;
      if (Array.isArray(data)) {
        uint8Array = new Uint8Array(data);
      } else if (data instanceof ArrayBuffer) {
        uint8Array = new Uint8Array(data);
      } else if (ArrayBuffer.isView(data)) {
        // @ts-expect-error - accessing buffer properties on array buffer view
        uint8Array = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        uint8Array = new Uint8Array(data as any);
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      blob = new Blob([uint8Array as any], { type: "application/pdf" });
    } catch (e) {
      console.error("Failed to create blob from pdfData", e);
      return;
    }

    const url = URL.createObjectURL(blob);
    setPdfBlobUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return url;
    });
  }, [currentPdfData]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      setPdfBlobUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    };
  }, []);

  // Load events
  const refreshEvents = useCallback(async () => {
    setIsLoadingEvents(true);
    try {
      const [loadedEvents, loadedMetadata] = await Promise.all([
        getAllEvents(),
        getAllEventMetadata()
      ]);
      setEvents(loadedEvents);
      
      const filenameMap: Record<string, string> = {};
      loadedMetadata.forEach(m => {
        if (m.localFilename) filenameMap[m.id] = m.localFilename;
      });
      setEventFilenames(filenameMap);

      // Restore selected event from localStorage
      const storedEventId = localStorage.getItem(STORAGE_KEYS.SELECTED_EVENT);

      if (storedEventId && loadedEvents.some((e) => e.id === storedEventId)) {
        setSelectedEventIdState(storedEventId);
      } else {
        // Do not auto-select first event. Let the user see the landing page.
        setSelectedEventIdState(null);
      }

      // Restore selected course
      const storedCourseId = localStorage.getItem(STORAGE_KEYS.SELECTED_COURSE);
      if (storedCourseId) {
        setSelectedCourseIdState(storedCourseId);
      }
    } catch (error) {
      console.error("Error loading events:", error);
    } finally {
      setIsLoadingEvents(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    refreshEvents();
  }, [refreshEvents]);

  // Persist selected event to localStorage
  const setSelectedEventId = useCallback(
    (id: string | null) => {
      // If switchíng events, currentPdfData will be stale until effect runs
      // Could manually clear it here to avoid flash of old map
      if (id !== selectedEventId) {
        setCurrentPdfData(null);
        setCurrentMapId(null);
      }

      setSelectedEventIdState(id);
      if (id) {
        localStorage.setItem(STORAGE_KEYS.SELECTED_EVENT, id);
      } else {
        localStorage.removeItem(STORAGE_KEYS.SELECTED_EVENT);
      }
    },
    [selectedEventId]
  );

  // Persist selected course to localStorage
  const setSelectedCourseId = useCallback((id: string | null) => {
    setSelectedCourseIdState(id);
    if (id) {
      localStorage.setItem(STORAGE_KEYS.SELECTED_COURSE, id);
    } else {
      localStorage.removeItem(STORAGE_KEYS.SELECTED_COURSE);
    }
  }, []);

  // Event operations
  const addEvent = useCallback(
    async (event: EventData, pdfData?: ArrayBuffer, persistImmediate: boolean = false) => {
      // Persist before mutating UI state to avoid races with the initial refreshEvents load.
      if (persistImmediate && persistToDB) {
        await saveEvent(event, pdfData);
      }

      // Add to memory, replacing any existing event with the same ID
      setEvents((prev) => {
        const others = prev.filter((e) => e.id !== event.id);
        return [...others, event];
      });
      // If pdfData is provided, set it to state immediately
      if (pdfData) {
        setCurrentPdfData(pdfData);
        const mapId = getEventMapId(event);
        if (mapId) {
          setCurrentMapId(mapId);
        }
      }
      setSelectedEventId(event.id);

      if (persistImmediate) {
        setUnsavedChanges(false);
      } else {
        setUnsavedChanges(true);
      }
    },
    [setSelectedEventId, persistToDB],
  );

  const updateEventData = useCallback(async (id: string, updates: Partial<EventData>, pdfData?: ArrayBuffer) => {
    // Update in memory only
    setEvents((prev) => prev.map((e) => (e.id === id ? { ...e, ...updates } : e)));
    if (pdfData !== undefined) {
      setCurrentPdfData(pdfData);

      // Try to determine if map ID changed
      if (updates.raceCourses && updates.raceCourses.length > 0) {
        const mapId = updates.raceCourses[0].maps?.[0]?.id;
        if (mapId) setCurrentMapId(mapId);
      }
    }
    setUnsavedChanges(true);
  }, []);

  const saveCurrentEvent = useCallback(async () => {
    if (selectedEvent) {
      if (persistToDB) {
        await saveEvent(selectedEvent, currentPdfData || undefined);
        setUnsavedChanges(false);
      } else {
        console.warn("Persistence is disabled, not saving to IndexedDB.");
      }
    }
  }, [selectedEvent, currentPdfData, persistToDB]);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (unsavedChanges) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [unsavedChanges]);
  const discardChanges = useCallback(async () => {
    setUnsavedChanges(false);
    // Reload from DB - this resets events and also triggers effect to reload pdfData
    await refreshEvents();
  }, [refreshEvents]);

  const setEventFilename = useCallback(async (id: string, filename: string) => {
    setEventFilenames(prev => ({ ...prev, [id]: filename }));
    if (persistToDB) {
        await saveEventMetadata(id, { localFilename: filename });
    }
  }, [persistToDB]);

  const removeEvent = useCallback(
    async (id: string) => {
      await deleteEvent(id);

      // If deleted event was selected, select another
      if (selectedEventId === id) {
        // filter out deleted
        // Don't auto-select another event, just clear selection
        setSelectedEventId(null);
      }
      // removing from local state is implicitly done because of refetch?
      // actually removeEvent logic in prev implementation kept calling refreshEvents
      await refreshEvents();
    },
    [selectedEventId, refreshEvents, setSelectedEventId],
  );

  const value: AppDataContextType = {
    events,
    eventFilenames,
    setEventFilename,
    selectedEventId,
    clearRecentFilesList,
    selectedEvent,
    setSelectedEventId,
    addEvent,
    updateEventData,
    removeEvent,
    refreshEvents,

    recentFiles,
    addRecentFileHandle,

    pdfBlobUrl,
    currentPdfData,

    selectedCourseId,
    setSelectedCourseId,

    selectedControlId,
    setSelectedControlId: (id) => {
      setSelectedControlIdState(id);
      if (id) {
        localStorage.setItem(STORAGE_KEYS.SELECTED_CONTROL, id);
      } else {
        localStorage.removeItem(STORAGE_KEYS.SELECTED_CONTROL);
      }
    },

    isLoadingEvents,

    unsavedChanges,
    markAsSaved,
    saveCurrentEvent,
    discardChanges,

    persistToDB,
    setPersistToDB,

    runningSpeed,
    setRunningSpeed,

    routeAnalysisK,
    setRouteAnalysisK,

    fileHandle,
    setFileHandle,
  };

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

export function useAppData() {
  const context = useContext(AppDataContext)
  if (!context) {
    throw new Error("useAppData must be used within AppDataProvider")
  }
  return context
}


/** Pure rendering input: published viewers never initialize the editor's storage. */
type RenderingData = Pick<AppDataContextType, "selectedEvent" | "runningSpeed">;
const RenderingDataContext = createContext<RenderingData | null>(null);
export function RenderingDataProvider({ selectedEvent, runningSpeed, children }: RenderingData & { children: React.ReactNode }) {
  const value = useMemo(() => ({ selectedEvent, runningSpeed }), [selectedEvent, runningSpeed]);
  return <RenderingDataContext.Provider value={value}>{children}</RenderingDataContext.Provider>;
}
export function useRenderingData(): RenderingData {
  const rendering = useContext(RenderingDataContext);
  const editor = useContext(AppDataContext);
  if (rendering) return rendering;
  if (editor) return { selectedEvent: editor.selectedEvent, runningSpeed: editor.runningSpeed };
  throw new Error("Rendering data provider is missing");
}
