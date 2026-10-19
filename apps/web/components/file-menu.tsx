"use client"

import { useState, useCallback, useRef, useEffect } from "react";
import { Menu, Plus, FolderOpen, Save, X as XIcon, FileUp, FileDown, Settings, Trash2, ChevronRight, ChevronDown, Info } from "lucide-react";
import { Button } from "@indoor-o-route-analysis/ui";
import { useAppData } from "@indoor-o-route-analysis/ui";
import { getMapFile, getEventPdfData } from "@indoor-o-route-analysis/core";
import { arrayBufferToBase64 } from "@indoor-o-route-analysis/core";
import { ConfirmDialog } from "@indoor-o-route-analysis/ui";
import PublishDialog from "@/components/publishing/publish-dialog";
import SettingsDialog from "@/components/settings-dialog";
import type { EventData, RaceCourseData } from "@indoor-o-route-analysis/core";
import { parseEventFromIOFXML, exportEventToIOFXML } from "@indoor-o-route-analysis/core";
import { serializeEventToJSON } from "@indoor-o-route-analysis/core";
import { processImportedJSON } from "@indoor-o-route-analysis/core";
import { openJsonFilePicker, saveJsonToFile } from "@/lib/file-picker";
import { NO, SE, FI, DK, GB, US, FR, CH, IT, ES, CZ } from 'country-flag-icons/react/3x2';

type FileMenuProps = {
  onNavigate?: (screen: string) => void;
  activeScreen?: string;
};

// country-flag-icons Props type collapses className/title under React 19 types
const flagProps = (className: string, title: string) =>
  ({ className, title } as Record<string, string>);

function CountryFlag({ country }: { country?: string }) {
  if (!country) return null;
  const code = country.toLowerCase();
  const cls = "w-4 h-3 flex-none"; // Fixed size for menu items

  switch (code) {
    case "sweden": return <SE {...flagProps(cls, country)} />;
    case "norway": return <NO {...flagProps(cls, country)} />;
    case "finland": return <FI {...flagProps(cls, country)} />;
    case "denmark": return <DK {...flagProps(cls, country)} />;
    case "uk": return <GB {...flagProps(cls, country)} />;
    case "usa": return <US {...flagProps(cls, country)} />;
    case "france": return <FR {...flagProps(cls, country)} />;
    case "switzerland": return <CH {...flagProps(cls, country)} />;
    case "italy": return <IT {...flagProps(cls, country)} />;
    case "spain": return <ES {...flagProps(cls, country)} />;
    case "czech republic":
    case "czechia": return <CZ {...flagProps(cls, country)} />;
    default: return null;
  }
}

// processImportedJSON is imported from @/lib/io/process-import

/**
 * Build a serialized JSON string for the event, embedding PDF data if needed.
 */
async function buildEventJSON(
  selectedEvent: EventData,
  currentPdfData: ArrayBuffer | null,
): Promise<string> {
  const eventData = { ...selectedEvent };
  const mapData = eventData.raceCourses?.[0]?.maps?.[0];

  if (mapData && mapData.saveEncoded) {
    let pdfData: ArrayBuffer | undefined = currentPdfData || undefined;
    if (!pdfData && mapData.id) {
      pdfData = await getMapFile(mapData.id);
    }
    if (!pdfData) {
      pdfData = await getEventPdfData(eventData.id);
    }
    if (pdfData) {
      const newMap = { ...mapData, image: { ...mapData.image } };
      newMap.image.encodedData = arrayBufferToBase64(pdfData);
      if (eventData.raceCourses && eventData.raceCourses[0].maps) {
        const newRaceCourses = [...eventData.raceCourses];
        const course = newRaceCourses[0];
        if (course) {
          const existingMaps = course.maps ?? [];
          const updatedMaps = [...existingMaps];
          updatedMaps[0] = newMap;
          newRaceCourses[0] = { ...course, maps: updatedMaps };
          eventData.raceCourses = newRaceCourses;
        }
      }
    }
  }

  return serializeEventToJSON(eventData);
}

export default function FileMenu({ onNavigate, activeScreen: _activeScreen }: FileMenuProps) {
  const {
    selectedEvent,
    setSelectedEventId,
    updateEventData,
    addEvent,
    unsavedChanges,
    saveCurrentEvent,
    discardChanges,
    fileHandle,
    setFileHandle,
    recentFiles,
    persistToDB,
    setPersistToDB,
    runningSpeed,
    setRunningSpeed,
    routeAnalysisK,
    setRouteAnalysisK,
    markAsSaved,
    currentPdfData,
    clearRecentFilesList,
    addRecentFileHandle,
    eventFilenames,
    setEventFilename,
  } = useAppData();

  const [showMenu, setShowMenu] = useState(false);
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const [showPublishDialog, setShowPublishDialog] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(false);
  const importIOFInputRef = useRef<HTMLInputElement>(null);
  const [exampleEvents, setExampleEvents] = useState<{ url: string; date: string; title?: string; country?: string }[]>([]);
  const [openSubmenu, setOpenSubmenu] = useState<'examples' | 'recent' | null>(null);

  // Load examples index — fetch works in both web and Electron (custom app:// protocol)
  useEffect(() => {
    fetch("/examples/index.json")
      .then((res) => {
        if (res.ok) return res.json();
        return [];
      })
      .then((data) => {
        if (Array.isArray(data)) {
          setExampleEvents(data);
        }
      })
      .catch((err) => console.error("Failed to load examples index", err));
  }, []);

  const selectedEventRef = useRef(selectedEvent);
  const fileHandleRef = useRef(fileHandle);

  // Update refs
  if (selectedEventRef.current !== selectedEvent) {
    selectedEventRef.current = selectedEvent;
  }
  if (fileHandleRef.current !== fileHandle) {
    fileHandleRef.current = fileHandle;
  }

  // --- Helper: get suggested filename ---
  const getSuggestedFilename = useCallback(() => {
    if (!selectedEvent) return "event.json";
    const savedName = eventFilenames[selectedEvent.id];
    if (fileHandle?.name) return fileHandle.name;
    if (savedName) return savedName;
    const dateStr = selectedEvent.startTime.date || new Date().toISOString().split("T")[0];
    const titleStr = selectedEvent.name || "Untitled";
    return `${dateStr} ${titleStr}.json`;
  }, [selectedEvent, eventFilenames, fileHandle]);

  // --- Open File ---
  const openLocalFile = useCallback(async () => {
    try {
      const handle = await openJsonFilePicker();

      if (handle) {
        const file = await handle.getFile();
        const text = await file.text();

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let importedData: any;
        try {
          importedData = JSON.parse(text);
        } catch {
          alert("Failed to parse JSON file.");
          return;
        }

        const { event: newEvent, pdfData } = await processImportedJSON(importedData);

        await addEvent(newEvent, pdfData, true);
        if (handle.name) {
          await setEventFilename(newEvent.id, handle.name);
        }

        setFileHandle(handle);
        if (onNavigate) onNavigate("event-manager");
      }
    } catch (e) {
      const err = e as Error;
      if (err.name !== "AbortError") {
        console.error(err);
        alert("Error opening file: " + err.message);
      }
    }
  }, [addEvent, setFileHandle, onNavigate, setEventFilename]);

  // --- Open Recent File ---
  const handleOpenRecentFile = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (recentItem: any) => {
      // Web: use File System Access API handle
      const handle = recentItem?.handle || recentItem;
      if (!handle || !handle.getFile) {
        // Handles can't be persisted in localStorage - fall back to file picker
        openLocalFile();
        return;
      }

      try {
        const options = { mode: "read" };

        if (handle.queryPermission) {
          const status = await handle.queryPermission(options);
          if (status !== "granted") {
            const requestStatus = await handle.requestPermission(options);
            if (requestStatus !== "granted") return;
          }
        }

        const file = await handle.getFile();
        const text = await file.text();

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let importedData: any;
        try {
          importedData = JSON.parse(text);
        } catch {
          alert("Failed to parse JSON file.");
          return;
        }

        const { event: newEvent, pdfData } = await processImportedJSON(importedData);
        newEvent.id = crypto.randomUUID();

        await addEvent(newEvent, pdfData, true);
        if (handle.name) {
          await setEventFilename(newEvent.id, handle.name);
        }

        setFileHandle(handle);
        if (onNavigate) onNavigate("event-manager");
      } catch (err) {
        console.error("Error opening recent file", err);
        alert("Failed to open file: " + (err as Error).message);
      }
    },
    [addEvent, setFileHandle, onNavigate, openLocalFile, setEventFilename],
  );

  // Auto-save timer
  useEffect(() => {
    let intervalId: NodeJS.Timeout;
    if (autoSaveEnabled) {
      intervalId = setInterval(async () => {
        const currentEvent = selectedEventRef.current;
        const currentHandle = fileHandleRef.current;

        if (currentEvent && currentHandle) {
          console.log("Auto-saving to file...");
          try {
            if (currentHandle.createWritable) {
              // Web: File System Access API
              const eventData = { ...currentEvent };
              const jsonString = JSON.stringify(eventData, null, 2);
              const writable = await currentHandle.createWritable();
              await writable.write(jsonString);
              await writable.close();
            }
          } catch (e) {
            console.error("Auto-save failed", e);
          }
        }
      }, 5 * 60 * 1000);
    }
    return () => clearInterval(intervalId);
  }, [autoSaveEnabled]);

  // --- Keyboard shortcuts (Ctrl+S, Ctrl+O) ---
  const saveToLocalFileRef = useRef<(() => void) | undefined>(undefined);
  const openLocalFileRef = useRef<(() => void) | undefined>(undefined);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && e.shiftKey && e.key.toLowerCase() === "p") {
        e.preventDefault(); setShowPublishDialog(true); return;
      }
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;

      switch (e.key.toLowerCase()) {
        case 's':
          e.preventDefault();
          saveToLocalFileRef.current?.();
          break;
        case 'o':
          e.preventDefault();
          openLocalFileRef.current?.();
          break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // --- Action Handlers ---

  const executeAction = useCallback(
    (action: () => void) => {
      if (unsavedChanges) {
        setPendingAction(() => action);
        setShowUnsavedDialog(true);
      } else {
        action();
      }
    },
    [unsavedChanges]
  );

  const handleDiscardUnsaved = async () => {
    await discardChanges();
    setShowUnsavedDialog(false);
    if (pendingAction) {
      pendingAction();
      setPendingAction(null);
    }
  };

  const createNewEvent = useCallback(async () => {
    try {
      const newEvent: EventData = {
        id: crypto.randomUUID(),
        name: "New Event",
        startTime: { date: new Date().toISOString().split("T")[0] },
        raceCourses: [
          {
            courses: [],
            controls: [],
            maps: [
              {
                id: crypto.randomUUID(),
                scale: 1000,
                image: { url: "", width: 0, height: 0 },
                mapPositionTopLeft: { x: 0, y: 0 },
                layout: "horizontal",
              },
            ],
            vertices: [],
            edges: [],
            polygons: [],
          },
        ],
        country: "",
      };
      await addEvent(newEvent);
      setFileHandle(null);
      if (onNavigate) onNavigate("event-manager");
    } catch (error) {
      console.error("Error adding event:", error);
    }
  }, [addEvent, setFileHandle, onNavigate]);

  // --- Open Example --- fetch works in both web and Electron (custom app:// protocol)
  const openExample = useCallback(
    async (url: string) => {
      try {
        const fullUrl = url.startsWith("./") ? "/examples/" + url.substring(2) : "/examples/" + url;
        const response = await fetch(fullUrl);
        if (!response.ok) {
          throw new Error("Failed to fetch example event");
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const importedData: any = await response.json();

        const { event: newEvent, pdfData } = await processImportedJSON(importedData);

        // Ensure ID is new
        newEvent.id = crypto.randomUUID();
        newEvent.startTime.date = newEvent.startTime.date || new Date().toISOString().split("T")[0];

        await addEvent(newEvent, pdfData, true);
        const normalizedUrl = url.trim().replace(/^\.\//, "").replace(/^\/+/, "").replace(/^examples\//, "");
        const normalizedFilename = (normalizedUrl.split("?")[0]?.split("#")[0] ?? "").split("/").pop() ?? "";
        if (normalizedFilename) {
          await setEventFilename(newEvent.id, normalizedFilename);
        }
        setFileHandle(null);
        await addRecentFileHandle({ name: newEvent.name || url, url: url });
        if (onNavigate) onNavigate("event-manager");
      } catch (error) {
        console.error("Error importing example event:", error);
        alert("Failed to import example event. Please check that the file exists.");
      }
    },
    [addEvent, setEventFilename, setFileHandle, onNavigate, addRecentFileHandle],
  );

  // --- Save ---
  const saveToLocalFile = useCallback(async () => {
    if (!selectedEvent) return;

    const jsonString = await buildEventJSON(selectedEvent, currentPdfData);
    const suggestedName = getSuggestedFilename();

    try {
      // File System Access API where available, browser download fallback otherwise (Firefox/Safari).
      const { handle, saved } = await saveJsonToFile(jsonString, suggestedName, fileHandle);
      if (!saved) return;

      if (handle) setFileHandle(handle);
      await saveCurrentEvent();

      const savedName = handle?.name ?? suggestedName;
      if (savedName && eventFilenames[selectedEvent.id] !== savedName) {
        await setEventFilename(selectedEvent.id, savedName);
      }

      markAsSaved();
    } catch (e) {
      const err = e as Error;
      if (err.name !== "AbortError") {
        console.error(err);
        alert("Error saving file: " + err.message);
      }
    }
  }, [selectedEvent, fileHandle, setFileHandle, saveCurrentEvent, markAsSaved, currentPdfData, eventFilenames, setEventFilename, getSuggestedFilename]);

  // --- Save As ---
  const saveAsLocalFile = useCallback(async () => {
    if (!selectedEvent) return;

    const jsonString = await buildEventJSON(selectedEvent, currentPdfData);
    const suggestedName = getSuggestedFilename();

    try {
      // "Save As" always prompts for a new location — pass no existing handle.
      const { handle, saved } = await saveJsonToFile(jsonString, suggestedName, null);
      if (!saved) return;

      if (handle) setFileHandle(handle);
      await saveCurrentEvent();

      const savedName = handle?.name ?? suggestedName;
      if (savedName && eventFilenames[selectedEvent.id] !== savedName) {
        await setEventFilename(selectedEvent.id, savedName);
      }

      markAsSaved();
    } catch (e) {
      const err = e as Error;
      if (err.name !== "AbortError") {
        console.error(err);
        alert("Error saving file: " + err.message);
      }
    }
  }, [selectedEvent, setFileHandle, saveCurrentEvent, markAsSaved, currentPdfData, eventFilenames, setEventFilename, getSuggestedFilename]);

  // Update refs for keyboard shortcuts
  saveToLocalFileRef.current = saveToLocalFile;
  openLocalFileRef.current = openLocalFile;

  const handleConfirmUnsaved = async () => {
    if (persistToDB) {
      await saveCurrentEvent();
    }
    setShowUnsavedDialog(false);
    if (pendingAction) {
      pendingAction();
      setPendingAction(null);
    }
  };

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

  // Export as IOF XML
  const exportIOFXML = useCallback(async () => {
    if (!selectedEvent) return;

    if (selectedEvent.raceCourses?.some(r => r.stairFloorOrder?.length || r.vertices?.some(n => n.stair))) {
      if (!window.confirm("IOF XML preserves graph routing but omits stair node annotations and floor order. Use JSON for a complete backup. Continue XML export?")) return;
    }
    const xml = exportEventToIOFXML(selectedEvent);
    const dateStr = selectedEvent.startTime.date || new Date().toISOString().split("T")[0];
    const filename = `${dateStr} ${selectedEvent.name}.xml`;

    downloadFile(xml, filename, "application/xml");
  }, [selectedEvent]);

  // --- Import IOF XML ---
  const handleImportXML = useCallback(
    async (file: File) => {
      if (!selectedEvent) return;

      try {
        const text = await file.text();
        const parsed = parseEventFromIOFXML(text);

        const currentRaceCourse = selectedEvent.raceCourses?.[0] || { controls: [], courses: [] };

        // Merge Controls
        const updatedControls = [...(currentRaceCourse.controls || [])];
        const parsedControls = parsed.raceCourses?.[0].controls || [];

        let changedControlsCount = 0;

        parsedControls.forEach((pc) => {
          const existingIndex = updatedControls.findIndex((c) => c.id === pc.id);
          if (existingIndex >= 0) {
            changedControlsCount++;
            updatedControls[existingIndex] = {
              ...updatedControls[existingIndex],
              ...pc,
              mapPosition: pc.mapPosition || updatedControls[existingIndex].mapPosition,
            };
          } else {
            if (!updatedControls.some((c) => c.id === pc.id)) {
              updatedControls.push(pc);
            }
          }
        });

        // Merge Courses
        const updatedCourses = [...(currentRaceCourse.courses || [])];
        const parsedCourses = parsed.raceCourses?.[0].courses || [];

        parsedCourses.forEach((pc) => {
          const existingIndex = updatedCourses.findIndex((c) => c.name === pc.name);
          if (existingIndex >= 0) {
            updatedCourses[existingIndex] = { ...updatedCourses[existingIndex], controls: pc.controls };
          } else {
            updatedCourses.push(pc);
          }
        });

        // Extension: Routes (Vertices/Edges)
        const parsedVertices = parsed.raceCourses?.[0].vertices || [];
        const parsedEdges = parsed.raceCourses?.[0].edges || [];

        // Class/Course Assignments - replace entirely to match XML content
        const parsedClassAssignments = parsed.raceCourses?.[0].classAssignments || [];

        // Build update object
        const raceCourseUpdate: Partial<RaceCourseData> = {};
        if (parsedControls.length > 0) raceCourseUpdate.controls = updatedControls;
        if (parsedCourses.length > 0) raceCourseUpdate.courses = updatedCourses;
        if (parsedVertices.length > 0 || parsedEdges.length > 0) {
          raceCourseUpdate.vertices = parsedVertices.length > 0 ? parsedVertices : currentRaceCourse.vertices || [];
          raceCourseUpdate.edges = parsedEdges.length > 0 ? parsedEdges : currentRaceCourse.edges || [];
        }
        raceCourseUpdate.classAssignments = parsedClassAssignments;

        const currentCourses = selectedEvent.raceCourses || [];
        const newRaceCourses = [...currentCourses];
        if (newRaceCourses.length === 0) {
          newRaceCourses.push({ ...raceCourseUpdate } as RaceCourseData);
        } else {
          newRaceCourses[0] = { ...newRaceCourses[0], ...raceCourseUpdate };
        }

        const updates: Partial<EventData> = {
          raceCourses: newRaceCourses,
          country: parsed.country || selectedEvent.country || "",
          difficultyScoringModel: selectedEvent.difficultyScoringModel,
          eventUrl: parsed.eventUrl || selectedEvent.eventUrl,
          eventImageUrl: parsed.eventImageUrl || selectedEvent.eventImageUrl,
        };

        await updateEventData(selectedEvent.id, updates);

        alert(`Import Successful!
Courses imported: ${parsedCourses.length}
Controls imported: ${parsedControls.length}
Controls changed: ${changedControlsCount}
Class assignments: ${parsedClassAssignments.length}`);

      } catch (e) {
        console.error("Failed to import IOF XML:", e);
        alert("Failed to import IOF XML: " + (e instanceof Error ? e.message : String(e)));
      }
    },
    [selectedEvent, updateEventData],
  );

  const onNewEvent = () => executeAction(createNewEvent);
  const onOpenEvent = () => executeAction(openLocalFile);
  const onSaveEvent = () => saveToLocalFile();
  const onSaveAsEvent = () => saveAsLocalFile();
  const onCloseEvent = () =>
    executeAction(() => {
      setSelectedEventId(null);
      setFileHandle(null);
    });

  const closeMenu = () => {
    setShowMenu(false);
    setOpenSubmenu(null);
  };

  return (
    <>
      <div className="relative">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            if (showMenu) setOpenSubmenu(null);
            setShowMenu(!showMenu);
          }}
          className="rounded-none h-8 w-8"
        >
          <Menu className="h-5 w-5" />
        </Button>
        {showMenu && (
          <>
            <div className="fixed inset-0 z-40" onClick={closeMenu} />
            <div className="absolute top-full left-0 mt-0 w-56 bg-card border border-border shadow-lg py-1 z-50">
              <button
                className="w-full text-left px-4 py-2 text-sm hover:bg-accent hover:text-accent-foreground flex items-center gap-2"
                onClick={() => {
                  closeMenu();
                  onNewEvent();
                }}
              >
                <Plus className="h-4 w-4" /> New
              </button>
              <button
                className="w-full text-left px-4 py-2 text-sm hover:bg-accent hover:text-accent-foreground flex items-center gap-2"
                onClick={() => {
                  closeMenu();
                  onOpenEvent();
                }}
              >
                <FolderOpen className="h-4 w-4" /> Open...
              </button>

              {exampleEvents.length > 0 && (
                <div className="relative">
                  <button
                    className="w-full text-left px-4 py-2 text-sm hover:bg-accent hover:text-accent-foreground flex items-center gap-2"
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpenSubmenu(openSubmenu === "examples" ? null : "examples");
                    }}
                  >
                    <span className="w-4 flex-none" />
                    <span>Examples</span>
                    <span className="ml-auto">
                      {openSubmenu === "examples" ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </span>
                  </button>
                  {openSubmenu === "examples" && (
                    <div className="w-full bg-accent/5 sm:absolute sm:left-full sm:top-0 sm:w-80 sm:bg-popover sm:border sm:border-border sm:shadow-lg sm:py-1 sm:-ml-1">
                      {exampleEvents.map((item, i) => (
                        <button
                          key={i}
                          className="w-full text-left px-4 py-2 text-sm hover:bg-accent hover:text-accent-foreground flex items-center gap-2 pl-8 sm:pl-4"
                          onClick={() => {
                            closeMenu();
                            executeAction(() => openExample(item.url));
                          }}
                          title={item.title || item.url.split("/").pop() || item.url}
                        >
                          <CountryFlag country={item.country} />
                          <span className="truncate">{item.title || item.url.split("/").pop()?.replace(".json", "") || item.url}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {recentFiles.length > 0 && (
                <div className="relative">
                  <button
                    className="w-full text-left px-4 py-2 text-sm hover:bg-accent hover:text-accent-foreground flex items-center gap-2"
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpenSubmenu(openSubmenu === "recent" ? null : "recent");
                    }}
                  >
                    <span className="w-4 flex-none" />
                    <span>Recent Files</span>
                    <span className="ml-auto">
                      {openSubmenu === "recent" ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </span>
                  </button>
                  {openSubmenu === "recent" && (
                    <div className="w-full bg-accent/5 sm:absolute sm:left-full sm:top-0 sm:w-80 sm:bg-popover sm:border sm:border-border sm:shadow-lg sm:py-1 sm:-ml-1">
                      {recentFiles.map((item, i) => (
                        <button
                          key={i}
                          className="w-full text-left px-4 py-2 text-sm hover:bg-accent hover:text-accent-foreground truncate block pl-8 sm:pl-4"
                          onClick={() => {
                            closeMenu();
                            if (item.url) {
                              executeAction(() => openExample(item.url!));
                            } else {
                              executeAction(() => handleOpenRecentFile(item));
                            }
                          }}
                          title={item.name}
                        >
                          {item.name}
                        </button>
                      ))}
                      <div className="my-1 border-t border-border" />
                      <button
                        className="w-full text-left px-4 py-2 text-sm text-red-500 hover:bg-accent hover:text-red-600 flex items-center gap-2 pl-8 sm:pl-4"
                        onClick={() => {
                          clearRecentFilesList();
                          closeMenu();
                        }}
                      >
                        <Trash2 className="h-3 w-3" /> Clear list
                      </button>
                    </div>
                  )}
                </div>
              )}
              <button
                className="w-full text-left px-4 py-2 text-sm hover:bg-accent hover:text-accent-foreground flex items-center gap-2 disabled:opacity-50"
                onClick={() => {
                  closeMenu();
                  onSaveEvent();
                }}
                disabled={!selectedEvent}
              >
                <Save className="h-4 w-4" /> Save
              </button>
              <button
                className="w-full text-left px-4 py-2 text-sm hover:bg-accent hover:text-accent-foreground flex items-center gap-2 disabled:opacity-50"
                onClick={() => {
                  closeMenu();
                  onSaveAsEvent();
                }}
                disabled={!selectedEvent}
              >
                <Save className="h-4 w-4" /> Save As...
              </button>

              <div className="my-1 border-t border-border" />

              <button
                className="w-full text-left px-4 py-2 text-sm hover:bg-accent hover:text-accent-foreground flex items-center gap-2 disabled:opacity-50"
                onClick={() => {
                  importIOFInputRef.current?.click();
                  closeMenu();
                }}
                disabled={!selectedEvent}
              >
                <FileUp className="h-4 w-4" /> Import IOF XML...
              </button>
              <button
                className="w-full text-left px-4 py-2 text-sm hover:bg-accent hover:text-accent-foreground flex items-center gap-2 disabled:opacity-50"
                onClick={() => {
                  closeMenu();
                  exportIOFXML();
                }}
                disabled={!selectedEvent}
              >
                <FileDown className="h-4 w-4" /> Export IOF XML...
              </button>

              <div className="my-1 border-t border-border" />
              <button className="w-full text-left px-4 py-2 text-sm hover:bg-accent flex items-center gap-2" onClick={() => { closeMenu(); setShowPublishDialog(true); }} title="准备赛后公开包：选择赛程和当前比赛 (Alt+Shift+P)">
                <FileDown className="h-4 w-4" /> 赛后发布…
              </button>
              <button
                className="w-full text-left px-4 py-2 text-sm hover:bg-accent hover:text-accent-foreground flex items-center gap-2"
                onClick={() => {
                  closeMenu();
                  if (onNavigate) onNavigate("landing");
                }}
              >
                <Info className="h-4 w-4" /> About...
              </button>
              <button
                className="w-full text-left px-4 py-2 text-sm hover:bg-accent hover:text-accent-foreground flex items-center gap-2"
                onClick={() => {
                  closeMenu();
                  setShowSettingsDialog(true);
                }}
              >
                <Settings className="h-4 w-4" /> Settings...
              </button>

              <button
                className="w-full text-left px-4 py-2 text-sm hover:bg-accent hover:text-accent-foreground flex items-center gap-2 disabled:opacity-50"
                onClick={() => {
                  closeMenu();
                  onCloseEvent();
                }}
                disabled={!selectedEvent}
              >
                <XIcon className="h-4 w-4" /> Close
              </button>
            </div>
          </>
        )}
      </div>

      <input
        type="file"
        accept=".xml,application/xml,text/xml"
        ref={importIOFInputRef}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleImportXML(f);
          e.currentTarget.value = "";
        }}
      />

      {showPublishDialog && <PublishDialog onClose={() => setShowPublishDialog(false)} />}

      <SettingsDialog
        isOpen={showSettingsDialog}
        onClose={() => setShowSettingsDialog(false)}
        autoSaveEnabled={autoSaveEnabled}
        onAutoSaveChange={setAutoSaveEnabled}
        persistToDB={persistToDB}
        onPersistToDBChange={setPersistToDB}
        runningSpeed={runningSpeed}
        onRunningSpeedChange={setRunningSpeed}
        routeAnalysisK={routeAnalysisK}
        onRouteAnalysisKChange={setRouteAnalysisK}
      />

      <ConfirmDialog
        isOpen={showUnsavedDialog}
        title={selectedEvent ? selectedEvent.name : "Unsaved Changes"}
        message={`You have unsaved changes${fileHandle ? ` in "${fileHandle.name}"` : ""}. Do you want to save them?`}
        onConfirm={handleConfirmUnsaved}
        onCancel={() => setShowUnsavedDialog(false)}
        onDiscard={handleDiscardUnsaved}
        confirmLabel="Save"
        discardLabel="Discard"
      />
    </>
  );
}
