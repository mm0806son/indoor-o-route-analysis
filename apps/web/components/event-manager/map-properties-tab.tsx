import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import { Download, FolderOpen, Move, Ruler, Calculator, Crosshair, Check, LocateFixed } from "lucide-react";
import { Button } from "@indoor-o-route-analysis/ui";
import { Input } from "@indoor-o-route-analysis/ui";
import { Label } from "@indoor-o-route-analysis/ui";
import { Checkbox } from "@indoor-o-route-analysis/ui";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@indoor-o-route-analysis/ui";
import { ControlRenderer } from "@indoor-o-route-analysis/ui";
import { getEventTransform, getDocumentDimensions, type EventData, type RaceCourseData } from "@indoor-o-route-analysis/core";
import { type MapData } from "@indoor-o-route-analysis/core";
import { type MapViewerState, type MapViewerController, mapToPixels, eventPosToMultiPagePixels } from "@/components/map-viewer";
import { calculateLatLonFromMapPoint } from "@indoor-o-route-analysis/core";
import { calculateTransformFromControlPairs } from "@indoor-o-route-analysis/core";

const MapViewer = dynamic(() => import("@/components/map-viewer"), {
  ssr: false,
  loading: () => <div className="flex-1 bg-muted" />,
});

interface MapPropertiesTabProps {
  selectedEvent: EventData;
  mapUriInput: string;
  setMapUriInput: (value: string) => void;
  handleMapUriBlur: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- pdfjs-dist is untyped dynamic import
  pdfjsLib: any;
  updateEventProperties: (id: string, updates: Partial<EventData>, pdfData?: ArrayBuffer) => Promise<void>;
  mapScaleInput: number;
  setMapScaleInput: (value: number) => void;
  handleMapScaleBlur: () => void;
  mapLayoutInput: "horizontal" | "vertical" | "pages";
  handleMapLayoutChange: (value: string) => void;
  saveEncodedInJson: boolean;
  setSaveEncodedInJson: (value: boolean) => void;
  pdfBlobUrl: string | null;
  cursorCoordinates: { event: { x: number; y: number }; map: { x: number; y: number } } | null;
  setCursorCoordinates: (coords: { event: { x: number; y: number }; map: { x: number; y: number } } | null) => void;
  latitudeInput: number;
  setLatitudeInput: (value: number) => void;
  longitudeInput: number;
  setLongitudeInput: (value: number) => void;
  handleGeoBlur: () => void;
}

export function MapPropertiesTab({
  selectedEvent,
  mapUriInput,
  setMapUriInput,
  handleMapUriBlur,
  pdfjsLib,
  updateEventProperties,
  mapScaleInput,
  setMapScaleInput,
  handleMapScaleBlur,
  mapLayoutInput,
  handleMapLayoutChange,
  saveEncodedInJson,
  setSaveEncodedInJson,
  pdfBlobUrl,
  cursorCoordinates,
  setCursorCoordinates,
  latitudeInput,
  setLatitudeInput,
  longitudeInput,
  setLongitudeInput,
  handleGeoBlur,
}: MapPropertiesTabProps) {
  const [isRegistrationMode, setIsRegistrationMode] = useState(false);
  const [currentMapPage, setCurrentMapPage] = useState(1);
  const [registrationPhase, setRegistrationPhase] = useState<"idle" | "pan" | "wait-scale" | "scale">("idle");
  
  // Tools state
  const [activeTool, setActiveTool] = useState<"none" | "measure" | "scale">("none");
  const [measureLine, setMeasureLine] = useState<{start: {x:number,y:number}, end: {x:number,y:number}} | null>(null);
  const [isToolDrawing, setIsToolDrawing] = useState(false);
  const [scaleDistanceInputStr, setScaleDistanceInputStr] = useState("100");

  // Control-based registration tool state
  const [isControlRegMode, setIsControlRegMode] = useState(false);
  const [controlRegId1, setControlRegId1] = useState<string>("");
  const [controlRegId2, setControlRegId2] = useState<string>("");
  const [regMark1, setRegMark1] = useState<{ x: number; y: number } | null>(null);
  const [regMark2, setRegMark2] = useState<{ x: number; y: number } | null>(null);
  const [draggingMark, setDraggingMark] = useState<1 | 2 | null>(null);
  const [selectedMark, setSelectedMark] = useState<1 | 2 | null>(null);
  const mapViewerControllerRef = useRef<MapViewerController | null>(null);
  const latestPixelsPerMM = useRef<number>(3.7795); // updated from onMouseMove state

  // Temporary map positions for live preview during drag
  const [tempMapPositions, setTempMapPositions] = useState<{
    tl: { x: number; y: number };
    br: { x: number; y: number };
  } | null>(null);

  // Use refs for drag state to avoid stale closures in event handlers
  const regState = useRef<{
    lastMapPos: { x: number; y: number } | null;
    firstMapPos: { x: number; y: number } | null; // The fixed point M1
    firstEventPos: { x: number; y: number } | null; // The fixed point E1 (where M1 should be)
    thirdMapPos: { x: number; y: number } | null; // Drag start of scale phase
    thirdEventPos: { x: number; y: number } | null; // Event coord of M3 at start of scale
  }>({
    lastMapPos: null,
    firstMapPos: null,
    firstEventPos: null,
    thirdMapPos: null,
    thirdEventPos: null,
  });

  const getEffectiveMapData = () => {
    const map = selectedEvent?.raceCourses?.[0]?.maps?.[0];
    if (!map) return null;
    if (tempMapPositions) {
      if (map.pageTransformMode === "manual") {
        const pageIdx = currentMapPage - 1;
        const existing = map.pageTransforms
          ? map.pageTransforms.map((pt) => ({ topLeft: { ...pt.topLeft }, bottomRight: { ...pt.bottomRight } }))
          : Array.from({ length: map.pageCount || 1 }, () => ({
              topLeft: { x: 0, y: 0 },
              bottomRight: { x: map.image.width || 0, y: map.image.height || 0 },
            }));
        while (existing.length <= pageIdx) {
          existing.push({ topLeft: { x: 0, y: 0 }, bottomRight: { x: map.image.width || 0, y: map.image.height || 0 } });
        }
        existing[pageIdx] = { topLeft: tempMapPositions.tl, bottomRight: tempMapPositions.br };
        return { ...map, pageTransforms: existing };
      }
      return { ...map, mapPositionTopLeft: tempMapPositions.tl, mapPositionBottomRight: tempMapPositions.br };
    }
    return map;
  };

  const resetTools = () => {
    setIsRegistrationMode(false);
    setRegistrationPhase("idle");
    setTempMapPositions(null);
    setActiveTool("none");
    setMeasureLine(null);
    setIsToolDrawing(false);
    setIsControlRegMode(false);
    setRegMark1(null);
    setRegMark2(null);
    setDraggingMark(null);
    setSelectedMark(null);
  };

  const handleMouseDown = (state: MapViewerState, e: React.MouseEvent) => {
    // Registration logic
    if (isRegistrationMode) {
      handleRegMouseDown(state, e);
      return;
    }

    // Control-based registration: detect mark hit or let pan happen
    if (isControlRegMode) {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = (e.clientX - rect.left - state.pan.x) / state.zoom;
      const y = (e.clientY - rect.top - state.pan.y) / state.zoom;
      // Marks are stored in global canvas mm (same space as mapPoint from mouse events)
      const docPt = { x: x / state.pixelsPerMM, y: y / state.pixelsPerMM };
      const hitRadius = 10 / (state.zoom * state.pixelsPerMM); // ~10px tolerance

      const dist1 = regMark1 ? Math.hypot(docPt.x - regMark1.x, docPt.y - regMark1.y) : Infinity;
      const dist2 = regMark2 ? Math.hypot(docPt.x - regMark2.x, docPt.y - regMark2.y) : Infinity;

      if (dist1 <= hitRadius && dist1 <= dist2) {
        setDraggingMark(1);
        setSelectedMark(1);
        e.preventDefault(); // signal MapViewer to skip pan
        return;
      } else if (dist2 <= hitRadius) {
        setDraggingMark(2);
        setSelectedMark(2);
        e.preventDefault(); // signal MapViewer to skip pan
        return;
      } else {
        setSelectedMark(null);
      }
      // Fall through – let MapViewer handle panning
    }

    // Tools logic
    if (activeTool === "measure" || activeTool === "scale") {
        const rect = e.currentTarget.getBoundingClientRect();
        const x = (e.clientX - rect.left - state.pan.x) / state.zoom;
        const y = (e.clientY - rect.top - state.pan.y) / state.zoom;
        const mapPoint = { x: x / state.pixelsPerMM, y: y / state.pixelsPerMM };
        
        setMeasureLine({ start: mapPoint, end: mapPoint });
        setIsToolDrawing(true);
    }
  };

  const handleMouseUp = async (state: MapViewerState, e: React.MouseEvent) => {
    if (isRegistrationMode) {
       await handleRegMouseUp(state, e);
       return;
    }

    if (isControlRegMode && draggingMark) {
      setDraggingMark(null);
      return;
    }

    if (isToolDrawing) {
        setIsToolDrawing(false);
        
        if (activeTool === "scale" && measureLine) {
             const distMm = Math.hypot(measureLine.end.x - measureLine.start.x, measureLine.end.y - measureLine.start.y);
             const distM_Map = distMm / 1000.0;
             const realM = parseFloat(scaleDistanceInputStr) || 0;
             
             if (distM_Map > 0 && realM > 0) {
                 const newScale = Math.round(realM / distM_Map);
                 setMapScaleInput(newScale);
                 
                 // Apply update directly
                 const currentRaceCourse = selectedEvent?.raceCourses?.[0];
                 const currentMap = currentRaceCourse?.maps?.[0];
                 if (currentMap) {
                     const updatedMap = { ...currentMap, scale: newScale };
                     const updatedRaceCourses = [...(selectedEvent.raceCourses || [])];
                     const maps = [...(updatedRaceCourses[0].maps || [])];
                     maps[0] = updatedMap;
                     updatedRaceCourses[0] = { ...updatedRaceCourses[0], maps };
                     
                     await updateEventProperties(selectedEvent.id, { raceCourses: updatedRaceCourses });
                 }
             }
             setMeasureLine(null);
             // Keep tool active? User might want to try again.
        } else if (activeTool === "measure") {
            // Keep the line visible
        }
    }
  };

  const handleRegMouseDown = (state: MapViewerState, e: React.MouseEvent) => {
    if (!isRegistrationMode) return;
    
    // Calculate map point
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left - state.pan.x) / state.zoom;
    const y = (e.clientY - rect.top - state.pan.y) / state.zoom;
    const mapPoint = { x: x / state.pixelsPerMM, y: y / state.pixelsPerMM };
    
    if (registrationPhase === "idle") {
        setRegistrationPhase("pan");
        regState.current.lastMapPos = mapPoint;
        regState.current.firstMapPos = mapPoint;
        
        // Store the initial event coordinate of this point
        const effMap = getEffectiveMapData()!;
        const pageIdx = effMap?.pageTransformMode === "manual" ? currentMapPage - 1 : undefined;
        const transform = getEventTransform(effMap, pageIdx);
        regState.current.firstEventPos = transform.toEvent(mapPoint);

        // Initialize temp positions from current transform (global or per-page)
        const map = selectedEvent?.raceCourses?.[0]?.maps?.[0];
        if (map) {
          if (map.pageTransformMode === "manual") {
            const pt = map.pageTransforms?.[currentMapPage - 1];
            setTempMapPositions({
              tl: pt?.topLeft ? { ...pt.topLeft } : { x: 0, y: 0 },
              br: pt?.bottomRight ? { ...pt.bottomRight } : { x: map.image.width || 0, y: map.image.height || 0 },
            });
          } else if (map.mapPositionTopLeft) {
            setTempMapPositions({
              tl: { ...map.mapPositionTopLeft },
              br: map.mapPositionBottomRight ? { ...map.mapPositionBottomRight } : { x: map.image.width || 0, y: map.image.height || 0 },
            });
          }
        }
    } else if (registrationPhase === "wait-scale") {
        setRegistrationPhase("scale");
        regState.current.thirdMapPos = mapPoint;
        const effMap2 = getEffectiveMapData()!;
        const pageIdx2 = effMap2?.pageTransformMode === "manual" ? currentMapPage - 1 : undefined;
        const transform = getEventTransform(effMap2, pageIdx2);
        regState.current.thirdEventPos = transform.toEvent(mapPoint);
    }
  };

  const _handleRegMouseMove = (_state: MapViewerState, _e: React.MouseEvent) => {
      // Logic handled in main onMouseMove to share calculation
  };

  // --- Control-based registration helpers ---

  const raceCourses = selectedEvent?.raceCourses;
  const controls = useMemo(() => raceCourses?.[0]?.controls || [], [raceCourses]);

  /**
   * For manual mode with horizontal/vertical multi-page layouts the canvas places
   * page N at an offset of N * pageWidth (horizontal) or N * pageHeight (vertical).
   * Marks are stored in page-local coordinates, so this offset must be added when
   * converting to canvas pixels and subtracted when converting from canvas pixels.
   */
  const getPageOffsetMM = useCallback((pageIndex: number): { x: number; y: number } => {
    const map = selectedEvent?.raceCourses?.[0]?.maps?.[0];
    if (!map || map.pageTransformMode !== "manual") return { x: 0, y: 0 };
    if (map.layout === "horizontal") return { x: pageIndex * (map.image.width || 0), y: 0 };
    if (map.layout === "vertical") return { x: 0, y: pageIndex * (map.image.height || 0) };
    return { x: 0, y: 0 };
  }, [selectedEvent]);

  /**
   * Compute mark initial position for a control in GLOBAL CANVAS mm coordinates
   * (same space as the mapPoint from mouse events — includes the page-layout offset).
   * Using eventPosToMultiPagePixels ensures the mark starts exactly on top of the
   * rendered control circle, regardless of which page and which layout is used.
   */
  const getMarkPosition = useCallback((controlId: string, offsetX: number, offsetY: number) => {
    const map = selectedEvent?.raceCourses?.[0]?.maps?.[0];
    if (!map) return null;

    const ctrl = controls.find((c) => c.id === controlId);
    if (!ctrl) {
      const dims = getDocumentDimensions(map);
      return { x: dims.width / 2 + offsetX, y: dims.height / 2 + offsetY };
    }

    const ppm = latestPixelsPerMM.current;
    if (ppm <= 0) {
      const dims = getDocumentDimensions(map);
      return { x: dims.width / 2 + offsetX, y: dims.height / 2 + offsetY };
    }

    // eventPosToMultiPagePixels gives canvas pixels; divide by ppm to get canvas mm.
    // No offset applied — mark starts exactly on the control circle.
    // (offsetX/Y is only for the fallback so the two marks don't overlap at the centre.)
    const canvasPx = eventPosToMultiPagePixels(ctrl.mapPosition, map, ppm);
    return { x: canvasPx.x / ppm, y: canvasPx.y / ppm };
  }, [selectedEvent, controls]);

  /** Initialise marks when the tool is activated or control selection changes */
  useEffect(() => {
    if (!isControlRegMode) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing mark positions from control data
    if (controlRegId1) setRegMark1(getMarkPosition(controlRegId1, -10, -10));
     
    if (controlRegId2) setRegMark2(getMarkPosition(controlRegId2, 10, 10));
  }, [isControlRegMode, controlRegId1, controlRegId2, getMarkPosition]);

  /** Apply: compute new TL/BR from mark positions + control event positions */
  const handleApplyControlReg = async () => {
    const map = selectedEvent?.raceCourses?.[0]?.maps?.[0];
    if (!map || !regMark1 || !regMark2) return;
    const c1 = controls.find((c) => c.id === controlRegId1);
    const c2 = controls.find((c) => c.id === controlRegId2);
    if (!c1 || !c2) return;

    const isManual = map.pageTransformMode === "manual";
    const dims2 = isManual
      ? { width: map.image.width || 1, height: map.image.height || 1 }
      : getDocumentDimensions(map);

    // Marks are stored in global canvas mm. For manual per-page transforms the
    // calculation expects page-local coords (0…pageWidth, 0…pageHeight), so
    // subtract the page's canvas offset before passing to the algorithm.
    const pageOffset = getPageOffsetMM(currentMapPage - 1);
    const mark1Local = { x: regMark1.x - pageOffset.x, y: regMark1.y - pageOffset.y };
    const mark2Local = { x: regMark2.x - pageOffset.x, y: regMark2.y - pageOffset.y };

    const result = calculateTransformFromControlPairs(
      c1.mapPosition,
      mark1Local,
      c2.mapPosition,
      mark2Local,
      dims2.width || 1,
      dims2.height || 1,
    );

    if (!result) {
      alert("The two marks must be separated on both axes (not on the same horizontal or vertical line).");
      return;
    }

    const raceCourses = [...(selectedEvent.raceCourses || [])];
    if (raceCourses[0]?.maps) {
      const maps = [...raceCourses[0].maps];
      if (isManual) {
        const pageIdx = currentMapPage - 1;
        const existing = maps[0].pageTransforms
          ? maps[0].pageTransforms.map((pt) => ({ topLeft: { ...pt.topLeft }, bottomRight: { ...pt.bottomRight } }))
          : Array.from({ length: map.pageCount || 1 }, () => ({
              topLeft: { x: 0, y: 0 },
              bottomRight: { x: map.image.width || 0, y: map.image.height || 0 },
            }));
        while (existing.length <= pageIdx) {
          existing.push({ topLeft: { x: 0, y: 0 }, bottomRight: { x: map.image.width || 0, y: map.image.height || 0 } });
        }
        existing[pageIdx] = { topLeft: result.topLeft, bottomRight: result.bottomRight };
        maps[0] = { ...maps[0], pageTransforms: existing };
      } else {
        maps[0] = { ...maps[0], mapPositionTopLeft: result.topLeft, mapPositionBottomRight: result.bottomRight };
      }
      raceCourses[0] = { ...raceCourses[0], maps };
      await updateEventProperties(selectedEvent.id, { raceCourses });
    }
  };

  /** Arrow-key handler to fine-tune the selected mark */
  useEffect(() => {
    if (!isControlRegMode || !selectedMark) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const step = e.shiftKey ? 0.1 : 1; // mm; Shift = fine
      let dx = 0;
      let dy = 0;
      switch (e.key) {
        case "ArrowLeft":  dx = -step; break;
        case "ArrowRight": dx = step;  break;
        case "ArrowUp":    dy = -step; break;
        case "ArrowDown":  dy = step;  break;
        default: return;
      }
      e.preventDefault();
      const setter = selectedMark === 1 ? setRegMark1 : setRegMark2;
      setter((prev) => (prev ? { x: prev.x + dx, y: prev.y + dy } : prev));
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isControlRegMode, selectedMark]);

  const handleRegMouseUp = async (_state: MapViewerState, _e: React.MouseEvent) => {
    if (!isRegistrationMode) return;
    
    if (registrationPhase === "pan") {
        setRegistrationPhase("wait-scale");
        
        // Update firstMapPos to reflect the shift
        if (regState.current.lastMapPos) {
           regState.current.firstMapPos = { ...regState.current.lastMapPos };
           // firstEventPos remains the anchor point we started dragging
        }

        if (tempMapPositions) {
          await commitTempTransform(tempMapPositions);
        }
    } else if (registrationPhase === "scale") {
        // End of scale phase
        setIsRegistrationMode(false);
        setRegistrationPhase("idle");
        if (tempMapPositions) {
          await commitTempTransform(tempMapPositions);
        }
        setTempMapPositions(null);
    }
  };

  /** Persist a TL/BR transform to the correct location (global or per-page). */
  const commitTempTransform = async (pos: { tl: { x: number; y: number }; br: { x: number; y: number } }) => {
    const map = selectedEvent?.raceCourses?.[0]?.maps?.[0];
    if (!map) return;
    const raceCourses = [...(selectedEvent.raceCourses || [])];
    if (!raceCourses[0]?.maps) return;
    const maps = [...raceCourses[0].maps];
    if (map.pageTransformMode === "manual") {
      const pageIdx = currentMapPage - 1;
      const existing = maps[0].pageTransforms
        ? maps[0].pageTransforms.map((pt) => ({ topLeft: { ...pt.topLeft }, bottomRight: { ...pt.bottomRight } }))
        : Array.from({ length: map.pageCount || 1 }, () => ({
            topLeft: { x: 0, y: 0 },
            bottomRight: { x: map.image.width || 0, y: map.image.height || 0 },
          }));
      while (existing.length <= pageIdx) {
        existing.push({ topLeft: { x: 0, y: 0 }, bottomRight: { x: map.image.width || 0, y: map.image.height || 0 } });
      }
      existing[pageIdx] = { topLeft: pos.tl, bottomRight: pos.br };
      maps[0] = { ...maps[0], pageTransforms: existing };
    } else {
      maps[0] = { ...maps[0], mapPositionTopLeft: pos.tl, mapPositionBottomRight: pos.br };
    }
    raceCourses[0] = { ...raceCourses[0], maps };
    await updateEventProperties(selectedEvent.id, { raceCourses });
  };

  return (
    <div className="flex-1 flex overflow-hidden p-6 gap-6 h-full">
      <div className="w-96 flex-shrink-0 overflow-auto space-y-6">
        <div className="space-y-4">
          <div>
            <Label htmlFor="map-uri" className="text-xs text-muted-foreground">
              {"Map source (url or path)"}
            </Label>
            <div className="flex gap-2 mt-1">
              <Input
                id="map-uri"
                value={mapUriInput}
                onChange={(e) => setMapUriInput(e.target.value)}
                onBlur={handleMapUriBlur}
                placeholder="https://... or local path"
              />
              <input
                type="file"
                id="map-file-browse"
                className="hidden"
                accept=".pdf"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (file && selectedEvent) {
                    const arrayBuffer = await file.arrayBuffer();

                    let width = 0;
                    let height = 0;
                    let pageCount = 1;

                    if (pdfjsLib) {
                      try {
                        const loadingTask = pdfjsLib.getDocument({
                          data: arrayBuffer.slice(0),
                          verbosity: 0,
                        });
                        const pdf = await loadingTask.promise;
                        pageCount = pdf.numPages;
                        const page = await pdf.getPage(1);
                        const viewport = page.getViewport({ scale: 1.0 });
                        width = viewport.width * (25.4 / 72);
                        height = viewport.height * (25.4 / 72);
                      } catch (err) {
                        console.error("Failed to parse PDF metadata", err);
                      }
                    }

                    const currentRaceCourse = selectedEvent.raceCourses?.[0] || { courses: [], controls: [], maps: [] };
                    const currentMap =
                      currentRaceCourse.maps?.[0] ||
                      ({
                        id: crypto.randomUUID(),
                        scale: 1000,
                        image: { fileReference: "", width: 0, height: 0 }, // Defaults
                        mapPositionTopLeft: { x: 0, y: 0 },
                        layout: "horizontal",
                      } as MapData);

                    let tl = currentMap.mapPositionTopLeft;
                    let br = currentMap.mapPositionBottomRight;

                    if ((!tl || (tl.x === 0 && tl.y === 0)) && (!br || (br.x === 0 && br.y === 0))) {
                      tl = { x: 0, y: 0 };
                      // Default calibration spans the full document based on layout
                      const effectiveWidth = mapLayoutInput === "horizontal" ? width * pageCount : width;
                      const effectiveHeight = mapLayoutInput === "vertical" ? height * pageCount : height;
                      br = { x: effectiveWidth, y: effectiveHeight };
                    }

                    setMapUriInput(file.name);

                    const updatedMap: MapData = {
                      ...currentMap,
                      id: crypto.randomUUID(), // Force new ID on new file
                      scale: mapScaleInput,
                      image: {
                        url: file.name,
                        width,
                        height,
                      },
                      mapPositionTopLeft: tl,
                      mapPositionBottomRight: br,
                      layout: mapLayoutInput,
                      pageCount,
                      saveEncoded: saveEncodedInJson,
                    };

                    const updatedRaceCourses = [...(selectedEvent.raceCourses || [])];
                    if (updatedRaceCourses.length === 0) {
                      updatedRaceCourses.push({ courses: [], controls: [], maps: [updatedMap] } as RaceCourseData);
                    } else {
                      const maps = [...(updatedRaceCourses[0].maps || [])];
                      // Replace or add primary map
                      if (maps.length > 0) maps[0] = updatedMap;
                      else maps.push(updatedMap);
                      updatedRaceCourses[0] = { ...updatedRaceCourses[0], maps };
                    }

                    updateEventProperties(
                      selectedEvent.id,
                      {
                        raceCourses: updatedRaceCourses,
                      },
                      arrayBuffer,
                    );
                  }
                }}
              />
              <Button
                variant="outline"
                size="icon"
                title="Browse"
                onClick={() => document.getElementById("map-file-browse")?.click()}
              >
                <FolderOpen className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                title="Download / Refresh"
                onClick={() => {
                  alert("Refresh/Download map functionality not implemented yet.");
                }}
              >
                <Download className="h-4 w-4" />
              </Button>
            </div>
            {selectedEvent.raceCourses?.[0]?.maps?.[0] && (
              <div className="text-[10px] text-muted-foreground mt-1 flex gap-2">
                {selectedEvent.raceCourses[0].maps[0].image.width &&
                  selectedEvent.raceCourses[0].maps[0].image.height && (
                    <span>
                      {Math.round(selectedEvent.raceCourses[0].maps[0].image.width / 10)}x
                      {Math.round(selectedEvent.raceCourses[0].maps[0].image.height / 10)} cm
                    </span>
                  )}
              </div>
            )}

            <div className="flex items-center space-x-2 mt-2">
              <Checkbox
                id="save-encoded"
                checked={saveEncodedInJson}
                onCheckedChange={(c) => {
                  const checked = c as boolean;
                  setSaveEncodedInJson(checked);
                  const currentRaceCourse = selectedEvent?.raceCourses?.[0];
                  const currentMap = currentRaceCourse?.maps?.[0];

                  if (selectedEvent && currentMap) {
                    // Construct update
                    const updatedMap = {
                      ...currentMap,
                      saveEncoded: checked,
                    };
                    const updatedRaceCourses = [...(selectedEvent.raceCourses || [])];
                    const maps = [...(updatedRaceCourses[0].maps || [])];
                    maps[0] = updatedMap;
                    updatedRaceCourses[0] = { ...updatedRaceCourses[0], maps };

                    updateEventProperties(selectedEvent.id, {
                      raceCourses: updatedRaceCourses,
                    });
                  }
                }}
              />
              <Label htmlFor="save-encoded" className="text-xs text-muted-foreground font-normal">
                {"Save map encoded in event file"}
              </Label>
            </div>

            <div className="flex items-center space-x-2 mt-2">
              <Checkbox
                id="show-control-points"
                checked={!!(selectedEvent?.raceCourses?.[0]?.maps?.[0]?.showControlPoints)}
                onCheckedChange={(c) => {
                  const checked = c as boolean;
                  const currentMap = selectedEvent?.raceCourses?.[0]?.maps?.[0];
                  if (selectedEvent && currentMap) {
                    const updatedMap = { ...currentMap, showControlPoints: checked };
                    const updatedRaceCourses = [...(selectedEvent.raceCourses || [])];
                    const maps = [...(updatedRaceCourses[0].maps || [])];
                    maps[0] = updatedMap;
                    updatedRaceCourses[0] = { ...updatedRaceCourses[0], maps };
                    updateEventProperties(selectedEvent.id, { raceCourses: updatedRaceCourses });
                  }
                }}
              />
              <Label htmlFor="show-control-points" className="text-xs text-muted-foreground font-normal">
                {"Show control points"}
              </Label>
            </div>
          </div>

          <div>
            <Label htmlFor="map-scale" className="text-xs text-muted-foreground">
              {"Map scale"}
            </Label>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-sm">1 :</span>
              <Input
                id="map-scale"
                type="number"
                className="w-24"
                value={mapScaleInput}
                onChange={(e) => setMapScaleInput(parseInt(e.target.value) || 1000)}
                onBlur={handleMapScaleBlur}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="event-map-layout" className="text-xs text-muted-foreground">
              {"Multi-page layout"}
            </Label>
            <Select value={mapLayoutInput} onValueChange={handleMapLayoutChange}>
              <SelectTrigger id="event-map-layout" className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="horizontal">{"Horizontal"}</SelectItem>
                <SelectItem value="vertical">{"Vertical"}</SelectItem>
                <SelectItem value="pages">{"Pages"}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {(selectedEvent.raceCourses?.[0]?.maps?.[0]?.pageCount || 1) > 1 && (
            <div>
              <Label htmlFor="page-transform-mode" className="text-xs text-muted-foreground">
                {"Multi-page transformation"}
              </Label>
              <Select
                value={selectedEvent.raceCourses?.[0]?.maps?.[0]?.pageTransformMode || "automatic"}
                onValueChange={(value) => {
                  const currentMap = selectedEvent.raceCourses?.[0]?.maps?.[0];
                  if (!currentMap) return;
                  const mode = value as "automatic" | "manual";
                  const pageCount = currentMap.pageCount || 1;
                  const pageW = currentMap.image.width || 0;
                  const pageH = currentMap.image.height || 0;
                  const updatedMap = {
                    ...currentMap,
                    pageTransformMode: mode,
                    // Initialize per-page transforms when switching to manual
                    pageTransforms: mode === "manual" && !currentMap.pageTransforms
                      ? Array.from({ length: pageCount }, () => ({
                          topLeft: { x: 0, y: 0 },
                          bottomRight: { x: pageW, y: pageH },
                        }))
                      : currentMap.pageTransforms,
                  };
                  const updatedRaceCourses = [...(selectedEvent.raceCourses || [])];
                  updatedRaceCourses[0] = { ...updatedRaceCourses[0], maps: [updatedMap] };
                  updateEventProperties(selectedEvent.id, { raceCourses: updatedRaceCourses });
                }}
              >
                <SelectTrigger id="page-transform-mode" className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="automatic">{"Automatic"}</SelectItem>
                  <SelectItem value="manual">{"Manual"}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {selectedEvent.raceCourses?.[0]?.maps?.[0]?.pageTransformMode !== "manual" &&
            selectedEvent.raceCourses?.[0]?.maps?.[0]?.mapPositionTopLeft &&
            selectedEvent.raceCourses[0].maps[0].mapPositionBottomRight && (
              <div className="text-xs flex flex-col gap-2">
                <div className="font-medium text-muted-foreground flex items-center justify-between">
                  <span>Coordinate transformations (to IOF MapPosition)</span>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs text-muted-foreground">Top Left (x, y)</Label>
                    <div className="flex items-center gap-2 mt-1">
                      <Input
                        type="number"
                        className="h-7 text-xs"
                        value={selectedEvent.raceCourses[0].maps[0].mapPositionTopLeft.x}
                        onChange={(e) => {
                          const currentMap = selectedEvent.raceCourses?.[0].maps?.[0];
                          if (!currentMap) return;

                          const updatedMap = {
                            ...currentMap,
                            mapPositionTopLeft: {
                              ...currentMap.mapPositionTopLeft,
                              x: parseFloat(e.target.value) || 0,
                            },
                          };
                          const updatedRaceCourses = [...(selectedEvent.raceCourses || [])];
                          updatedRaceCourses[0] = { ...updatedRaceCourses[0], maps: [updatedMap] }; // Assume single map again for simplicity
                          updateEventProperties(selectedEvent.id, { raceCourses: updatedRaceCourses });
                        }}
                      />
                      <Input
                        type="number"
                        className="h-7 text-xs"
                        value={selectedEvent.raceCourses[0].maps[0].mapPositionTopLeft.y}
                        onChange={(e) => {
                          const currentMap = selectedEvent.raceCourses?.[0].maps?.[0];
                          if (!currentMap) return;

                          const updatedMap = {
                            ...currentMap,
                            mapPositionTopLeft: {
                              ...currentMap.mapPositionTopLeft,
                              y: parseFloat(e.target.value) || 0,
                            },
                          };
                          const updatedRaceCourses = [...(selectedEvent.raceCourses || [])];
                          updatedRaceCourses[0] = { ...updatedRaceCourses[0], maps: [updatedMap] };
                          updateEventProperties(selectedEvent.id, { raceCourses: updatedRaceCourses });
                        }}
                      />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Bottom Right (x, y)</Label>
                    <div className="flex items-center gap-2 mt-1">
                      <Input
                        type="number"
                        className="h-7 text-xs"
                        value={selectedEvent.raceCourses[0].maps[0].mapPositionBottomRight.x}
                        onChange={(e) => {
                          const currentMap = selectedEvent.raceCourses?.[0].maps?.[0];
                          if (!currentMap || !currentMap.mapPositionBottomRight) return;

                          const updatedMap = {
                            ...currentMap,
                            mapPositionBottomRight: {
                              ...currentMap.mapPositionBottomRight,
                              x: parseFloat(e.target.value) || 0,
                            },
                          };
                          const updatedRaceCourses = [...(selectedEvent.raceCourses || [])];
                          updatedRaceCourses[0] = { ...updatedRaceCourses[0], maps: [updatedMap] };
                          updateEventProperties(selectedEvent.id, { raceCourses: updatedRaceCourses });
                        }}
                      />
                      <Input
                        type="number"
                        className="h-7 text-xs"
                        value={selectedEvent.raceCourses[0].maps[0].mapPositionBottomRight.y}
                        onChange={(e) => {
                          const currentMap = selectedEvent.raceCourses?.[0].maps?.[0];
                          if (!currentMap || !currentMap.mapPositionBottomRight) return;

                          const updatedMap = {
                            ...currentMap,
                            mapPositionBottomRight: {
                              ...currentMap.mapPositionBottomRight,
                              y: parseFloat(e.target.value) || 0,
                            },
                          };
                          const updatedRaceCourses = [...(selectedEvent.raceCourses || [])];
                          updatedRaceCourses[0] = { ...updatedRaceCourses[0], maps: [updatedMap] };
                          updateEventProperties(selectedEvent.id, { raceCourses: updatedRaceCourses });
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

          {selectedEvent.raceCourses?.[0]?.maps?.[0]?.pageTransformMode === "manual" && (() => {
            const currentMap = selectedEvent.raceCourses?.[0]?.maps?.[0];
            const pageCount = currentMap?.pageCount || 1;
            const pageW = currentMap?.image?.width || 0;
            const pageH = currentMap?.image?.height || 0;
            const pageIdx = currentMapPage - 1;
            const pageTx = currentMap?.pageTransforms?.[pageIdx];
            const tl = pageTx?.topLeft ?? { x: 0, y: 0 };
            const br = pageTx?.bottomRight ?? { x: pageW, y: pageH };

            const updatePageTransform = (
              idx: number,
              updates: Partial<{ topLeft: { x: number; y: number }; bottomRight: { x: number; y: number } }>
            ) => {
              if (!currentMap) return;
              const existing: { topLeft: { x: number; y: number }; bottomRight: { x: number; y: number } }[] =
                currentMap.pageTransforms
                  ? currentMap.pageTransforms.map((pt) => ({ topLeft: { ...pt.topLeft }, bottomRight: { ...pt.bottomRight } }))
                  : Array.from({ length: pageCount }, (_) => ({
                      topLeft: { x: 0, y: 0 },
                      bottomRight: { x: pageW, y: pageH },
                    }));
              while (existing.length <= idx) {
                existing.push({ topLeft: { x: 0, y: 0 }, bottomRight: { x: pageW, y: pageH } });
              }
              existing[idx] = { ...existing[idx], ...updates };
              const updatedMap = { ...currentMap, pageTransforms: existing };
              const updatedRaceCourses = [...(selectedEvent.raceCourses || [])];
              updatedRaceCourses[0] = { ...updatedRaceCourses[0], maps: [updatedMap] };
              updateEventProperties(selectedEvent.id, { raceCourses: updatedRaceCourses });
            };

            return (
              <div className="text-xs flex flex-col gap-2">
                <div className="font-medium text-muted-foreground flex items-center justify-between">
                  <span>Per-page coordinate transforms</span>
                  {pageCount > 1 && (
                    <div className="flex items-center gap-1">
                      <button
                        className="px-2 py-0.5 rounded bg-muted hover:bg-muted/80 disabled:opacity-30"
                        onClick={() => setCurrentMapPage((p) => Math.max(1, p - 1))}
                        disabled={currentMapPage === 1}
                        title="Previous page"
                      >{"←"}</button>
                      <span className="font-mono">Page {currentMapPage}/{pageCount}</span>
                      <button
                        className="px-2 py-0.5 rounded bg-muted hover:bg-muted/80 disabled:opacity-30"
                        onClick={() => setCurrentMapPage((p) => Math.min(pageCount, p + 1))}
                        disabled={currentMapPage === pageCount}
                        title="Next page"
                      >{"→"}</button>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs text-muted-foreground">Top Left (x, y)</Label>
                    <div className="flex items-center gap-2 mt-1">
                      <Input
                        type="number"
                        className="h-7 text-xs"
                        value={tl.x}
                        onChange={(e) =>
                          updatePageTransform(pageIdx, { topLeft: { ...tl, x: parseFloat(e.target.value) || 0 } })
                        }
                      />
                      <Input
                        type="number"
                        className="h-7 text-xs"
                        value={tl.y}
                        onChange={(e) =>
                          updatePageTransform(pageIdx, { topLeft: { ...tl, y: parseFloat(e.target.value) || 0 } })
                        }
                      />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Bottom Right (x, y)</Label>
                    <div className="flex items-center gap-2 mt-1">
                      <Input
                        type="number"
                        className="h-7 text-xs"
                        value={br.x}
                        onChange={(e) =>
                          updatePageTransform(pageIdx, { bottomRight: { ...br, x: parseFloat(e.target.value) || 0 } })
                        }
                      />
                      <Input
                        type="number"
                        className="h-7 text-xs"
                        value={br.y}
                        onChange={(e) =>
                          updatePageTransform(pageIdx, { bottomRight: { ...br, y: parseFloat(e.target.value) || 0 } })
                        }
                      />
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          <div>
              <Label className="text-xs text-muted-foreground">Map georeferencing (top-left)</Label>
              <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                      <Label htmlFor="lat" className="text-xs text-muted-foreground">Latitude</Label>
                      <Input 
                          id="lat"
                          type="number"
                          step="0.000001"
                          value={latitudeInput}
                          onChange={(e) => setLatitudeInput(parseFloat(e.target.value))}
                          onBlur={handleGeoBlur}
                      />
                  </div>
                  <div className="space-y-1">
                      <Label htmlFor="lon" className="text-xs text-muted-foreground">Longitude</Label>
                      <Input 
                          id="lon"
                          type="number"
                          step="0.000001"
                          value={longitudeInput}
                          onChange={(e) => setLongitudeInput(parseFloat(e.target.value))}
                          onBlur={handleGeoBlur}
                      />
                  </div>
              </div>
          </div>
        </div>
      </div>
      <div className="flex-1 flex flex-col gap-2 h-full min-w-0">
         <div className="flex items-center justify-between gap-2">
             <div className="flex items-center gap-1">

                 <Button
                    variant={activeTool === "measure" ? "active" : "ghost"}
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={() => {
                        if (activeTool === "measure") {
                            resetTools();
                        } else {
                            resetTools();
                            setActiveTool("measure");
                        }
                    }}
                    title="Measure distance"
                 >
                    <Ruler className="h-4 w-4" />
                 </Button>

                    <Button
                        variant={activeTool === "scale" ? "active" : "ghost"}
                        size="sm"
                        className="h-8 w-8 p-0"
                        onClick={() => {
                            if (activeTool === "scale") {
                                resetTools();
                            } else {
                                resetTools();
                                setActiveTool("scale");
                            }
                        }}
                        title="Calculate scale from distance"
                    >
                        <Calculator className="h-4 w-4" />
                    </Button>

                 <Button
                    variant={isControlRegMode ? "active" : "ghost"}
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={() => {
                        if (isControlRegMode) {
                            resetTools();
                        } else {
                            resetTools();
                            setIsControlRegMode(true);
                            // Auto-select controls with min and max coordinates
                            const ctrls = selectedEvent?.raceCourses?.[0]?.controls || [];
                            if (ctrls.length >= 2) {
                                const sorted = [...ctrls].sort((a, b) => {
                                    const sa = a.mapPosition.x + a.mapPosition.y;
                                    const sb = b.mapPosition.x + b.mapPosition.y;
                                    return sa - sb;
                                });
                                setControlRegId1(sorted[0].id);
                                setControlRegId2(sorted[sorted.length - 1].id);
                            } else {
                                if (ctrls.length >= 1) setControlRegId1(ctrls[0].id);
                                if (ctrls.length >= 2) setControlRegId2(ctrls[1].id);
                            }
                        }
                    }}
                    title={isControlRegMode ? "Exit transformation tool" : "Update the coordinate transformation by placing two controls on the map"}
                 >
                    <Crosshair className="h-4 w-4" />
                 </Button>

                 <Button
                    variant={isRegistrationMode ? "active" : "ghost"}
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={() => {
                        if (isRegistrationMode) {
                            resetTools();
                        } else {
                            resetTools();
                            setIsRegistrationMode(true);
                            // Init reg state from current transform (global or per-page)
                            const map = selectedEvent?.raceCourses?.[0]?.maps?.[0];
                            if (map) {
                              if (map.pageTransformMode === "manual") {
                                const pt = map.pageTransforms?.[currentMapPage - 1];
                                setTempMapPositions({
                                  tl: pt?.topLeft ? { ...pt.topLeft } : { x: 0, y: 0 },
                                  br: pt?.bottomRight ? { ...pt.bottomRight } : { x: map.image.width || 0, y: map.image.height || 0 },
                                });
                              } else if (map.mapPositionTopLeft) {
                                setTempMapPositions({
                                  tl: { ...map.mapPositionTopLeft },
                                  br: map.mapPositionBottomRight ? { ...map.mapPositionBottomRight } : { x: map.image.width || 0, y: map.image.height || 0 },
                                });
                              }
                            }
                        }
                    }}
                    title={isRegistrationMode ? "Exit the registration mode" : "Map registration tool (old)"}
                 >
                    <Move className="h-4 w-4" />
                 </Button>

                 <div className="w-px h-4 bg-border mx-2" />

                    {activeTool === "scale" && (
                        <div className="flex items-center gap-2 animate-in fade-in slide-in-from-left-4 duration-300">
                             <span className="text-xs text-muted-foreground whitespace-nowrap">Distance:</span>
                             <Input 
                                className="h-7 w-20 text-xs" 
                                value={scaleDistanceInputStr}
                                onChange={(e) => setScaleDistanceInputStr(e.target.value)}
                                placeholder="100"
                             />
                             <span className="text-xs text-muted-foreground">m</span>
                        </div>
                    )}

                 {isControlRegMode && (
                   <div className="flex items-center gap-2 animate-in fade-in slide-in-from-left-4 duration-300">
                     <div className="flex items-center gap-1">
                       <Select value={controlRegId1} onValueChange={setControlRegId1}>
                         <SelectTrigger className="h-7 w-24 text-xs">
                           <SelectValue placeholder="Control 1" />
                         </SelectTrigger>
                         <SelectContent>
                           {controls.map((c) => (
                             <SelectItem key={c.id} value={c.id}>{c.id}</SelectItem>
                           ))}
                         </SelectContent>
                       </Select>
                       <Button
                         variant="ghost"
                         size="sm"
                         className="h-7 w-7 p-0"
                         title="Navigate to mark 1"
                         disabled={!regMark1}
                         onClick={() => {
                           if (regMark1 && mapViewerControllerRef.current) {
                             const ppm = latestPixelsPerMM.current;
                             mapViewerControllerRef.current.frameItem(
                               { x: regMark1.x * ppm, y: regMark1.y * ppm },
                               3
                             );
                           }
                         }}
                       >
                         <LocateFixed className="h-3.5 w-3.5" />
                       </Button>
                     </div>

                     <div className="flex items-center gap-1">
                       <Select value={controlRegId2} onValueChange={setControlRegId2}>
                         <SelectTrigger className="h-7 w-24 text-xs">
                           <SelectValue placeholder="Control 2" />
                         </SelectTrigger>
                         <SelectContent>
                           {controls.map((c) => (
                             <SelectItem key={c.id} value={c.id}>{c.id}</SelectItem>
                           ))}
                         </SelectContent>
                       </Select>
                       <Button
                         variant="ghost"
                         size="sm"
                         className="h-7 w-7 p-0"
                         title="Navigate to mark 2"
                         disabled={!regMark2}
                         onClick={() => {
                           if (regMark2 && mapViewerControllerRef.current) {
                             const ppm = latestPixelsPerMM.current;
                             mapViewerControllerRef.current.frameItem(
                               { x: regMark2.x * ppm, y: regMark2.y * ppm },
                               3
                             );
                           }
                         }}
                       >
                         <LocateFixed className="h-3.5 w-3.5" />
                       </Button>
                     </div>

                     <Button
                       size="sm"
                       className="h-7 text-xs gap-1"
                       onClick={handleApplyControlReg}
                       disabled={!regMark1 || !regMark2 || controlRegId1 === controlRegId2}
                       title="Apply registration"
                     >
                       <Check className="h-3 w-3" /> Apply
                     </Button>
                   </div>
                 )}

                 {isRegistrationMode && (
                     <span className="text-xs text-muted-foreground ml-2">
                        {registrationPhase === "idle" && "Drag to change the transformations"}
                        {registrationPhase === "pan" && "Release to set pivot"}
                        {registrationPhase === "wait-scale" && "Drag to scale around pivot"}
                        {registrationPhase === "scale" && "Release to apply"}
                     </span>
                 )}
                 {activeTool === "measure" && (
                     <span className="text-xs text-muted-foreground ml-2">
                        Drag to measure distance
                     </span>
                 )}
                 {activeTool === "scale" && (
                     <span className="text-xs text-muted-foreground ml-2">
                        Enter distance in meters, then drag that distance on map
                     </span>
                 )}
                 {isControlRegMode && (
                     <span className="text-xs text-muted-foreground ml-2">
                        Select two controls, drag marks to correct positions, then Apply
                     </span>
                 )}
             </div>
         </div>
      
      <div className="flex-1 border rounded-md overflow-hidden relative bg-muted/10 h-full flex flex-col">
        <MapViewer
          key={selectedEvent.id}
          pdfUrl={pdfBlobUrl || undefined}
          showBackgroundMap={true}
          mapLayout={mapLayoutInput}
          initialFit={true}
          disablePan={isRegistrationMode || activeTool !== "none" || draggingMark !== null}
          cursor={isRegistrationMode || activeTool !== "none" ? "crosshair" : undefined}
          onControllerReady={(ctrl: MapViewerController) => { mapViewerControllerRef.current = ctrl; }}
          onPageChange={(page: number) => setCurrentMapPage(page)}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onMouseMove={(state: MapViewerState, e: React.MouseEvent) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const x = (e.clientX - rect.left - state.pan.x) / state.zoom;
            const y = (e.clientY - rect.top - state.pan.y) / state.zoom;

            const mapData = getEffectiveMapData() || selectedEvent?.raceCourses?.[0]?.maps?.[0];
            const transform = getEventTransform(mapData, mapData?.pageTransformMode === "manual" ? currentMapPage - 1 : undefined);
            const mapPoint = { x: x / state.pixelsPerMM, y: y / state.pixelsPerMM };
            const eventPoint = transform.toEvent(mapPoint);
            setCursorCoordinates({ event: eventPoint, map: mapPoint }); // Always update cursor info
            latestPixelsPerMM.current = state.pixelsPerMM;

            // Control-reg mark drag — store global canvas mm (same as mapPoint)
            if (isControlRegMode && draggingMark) {
              if (draggingMark === 1) setRegMark1(mapPoint);
              else setRegMark2(mapPoint);
            }

            // Tool updates
            if (activeTool !== "none" && isToolDrawing && measureLine) {
                 setMeasureLine({ ...measureLine, end: mapPoint });
            }
            
            if (isRegistrationMode && tempMapPositions && mapData) {
                 if (registrationPhase === "pan" && regState.current.lastMapPos) {
                     const dMapX = mapPoint.x - regState.current.lastMapPos.x;
                     const dMapY = mapPoint.y - regState.current.lastMapPos.y;
                     
                     const currentRangeX = tempMapPositions.br.x - tempMapPositions.tl.x;
                     const currentRangeY = tempMapPositions.br.y - tempMapPositions.tl.y;
                     const regDims = getDocumentDimensions(mapData);
                     const imgW = regDims.width || 1;
                     const imgH = regDims.height || 1;
                     
                     const scaleX = currentRangeX / imgW;
                     const scaleY = currentRangeY / imgH;
                     
                     const dEventX = dMapX * scaleX;
                     const dEventY = dMapY * scaleY;

                     setTempMapPositions({
                         tl: { x: tempMapPositions.tl.x - dEventX, y: tempMapPositions.tl.y - dEventY },
                         br: { x: tempMapPositions.br.x - dEventX, y: tempMapPositions.br.y - dEventY }
                     });
                     regState.current.lastMapPos = mapPoint;
                 } else if (registrationPhase === "scale" && regState.current.thirdEventPos && regState.current.firstEventPos && regState.current.firstMapPos) {
                     const regDims2 = getDocumentDimensions(mapData);
                     const imgW = regDims2.width || 1;
                     const imgH = regDims2.height || 1;
                     const u1_x = regState.current.firstMapPos.x / imgW;
                     const u1_y = regState.current.firstMapPos.y / imgH;
                     const u4_x = mapPoint.x / imgW;
                     const u4_y = mapPoint.y / imgH;
                     const E1 = regState.current.firstEventPos;
                     const E3 = regState.current.thirdEventPos;
                     
                     const newTL = { ...tempMapPositions.tl };
                     const newBR = { ...tempMapPositions.br };
                     
                     if (Math.abs(u1_x - u4_x) > 1e-4) {
                         const spanX = (E1.x - E3.x) / (u1_x - u4_x);
                         newTL.x = E1.x - u1_x * spanX;
                         newBR.x = newTL.x + spanX;
                     }
                     if (Math.abs(u1_y - u4_y) > 1e-4) {
                         const spanY = (E1.y - E3.y) / (u1_y - u4_y);
                         newTL.y = E1.y - u1_y * spanY;
                         newBR.y = newTL.y + spanY;
                     }
                     setTempMapPositions({ tl: newTL, br: newBR });
                 }
            }
          }}
        >
          {(state: MapViewerState) => {
            const mapData = getEffectiveMapData() || selectedEvent?.raceCourses?.[0]?.maps?.[0];
            const transform = getEventTransform(mapData, mapData?.pageTransformMode === "manual" ? currentMapPage - 1 : undefined);
            const _toPixels = (p: { x: number; y: number }) =>
              mapToPixels(p, transform, state.pixelsPerMM);

            const controlsPx = controls.map((c) => ({
              ...c,
              ...eventPosToMultiPagePixels(c.mapPosition, mapData, state.pixelsPerMM),
            }));

            return (
              <>
              <svg
                width={state.pdfDimensions.width}
                height={state.pdfDimensions.height}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  pointerEvents: "none",
                }}
              >
                {controlsPx.map((control) =>
                  ControlRenderer.renderControl({
                    control,
                    courseControls: [],
                    courseControlCodes: [],
                    isSelected: false,
                    strokeColor: "#ef4444",
                    showControlPoint: mapData?.showControlPoints,
                  }),
                )}
                
                {measureLine && (
                    <g>
                        <line
                            x1={measureLine.start.x * state.pixelsPerMM}
                            y1={measureLine.start.y * state.pixelsPerMM}
                            x2={measureLine.end.x * state.pixelsPerMM}
                            y2={measureLine.end.y * state.pixelsPerMM}
                            stroke="#2563eb"
                            strokeWidth={2}
                            vectorEffect="non-scaling-stroke"
                        />
                        <circle cx={measureLine.start.x * state.pixelsPerMM} cy={measureLine.start.y * state.pixelsPerMM} r={4} fill="#2563eb" />
                        <circle cx={measureLine.end.x * state.pixelsPerMM} cy={measureLine.end.y * state.pixelsPerMM} r={4} fill="#2563eb" />
                        
                        {(() => {
                             // Calculate scale
                             const mapS = selectedEvent?.raceCourses?.[0]?.maps?.[0]?.scale || 1000;
                             // Dist in mm
                             const dx = measureLine.end.x - measureLine.start.x;
                             const dy = measureLine.end.y - measureLine.start.y;
                             const distMm = Math.hypot(dx, dy);
                             // Dist in m
                             const distM = (distMm * mapS) / 1000;
                             
                             const midX = (measureLine.start.x + measureLine.end.x) / 2 * state.pixelsPerMM;
                             const midY = (measureLine.start.y + measureLine.end.y) / 2 * state.pixelsPerMM;
                             
                             return (
                                 <g transform={`translate(${midX}, ${midY})`}>
                                     <rect x={-40} y={-14} width={80} height={28} rx={4} fill="white" stroke="#e5e7eb" fillOpacity={0.9} />
                                     <text 
                                        x={0} 
                                        y={5} 
                                        textAnchor="middle" 
                                        fontSize={12} 
                                        className="font-mono font-medium fill-slate-900"
                                     >
                                        {activeTool === "scale" ? `${distMm.toFixed(1)} mm` : `${distM.toFixed(1)} m`}
                                     </text>
                                 </g>
                             );
                        })()}
                    </g>
                )}
                {/* Control-based registration marks — rendered via shared ControlRenderer */}
                {isControlRegMode && regMark1 && ControlRenderer.renderRegistrationMark({
                  x: regMark1.x * state.pixelsPerMM,
                  y: regMark1.y * state.pixelsPerMM,
                  label: controlRegId1,
                  isSelected: selectedMark === 1,
                  color: "#22c55e",
                  selectedColor: "#15803d",
                })}
                {isControlRegMode && regMark2 && ControlRenderer.renderRegistrationMark({
                  x: regMark2.x * state.pixelsPerMM,
                  y: regMark2.y * state.pixelsPerMM,
                  label: controlRegId2,
                  isSelected: selectedMark === 2,
                  color: "#ef4444",
                  selectedColor: "#b91c1c",
                })}
              </svg>
              </>
            );
          }}
        </MapViewer>
        {cursorCoordinates && (() => {
            const map = selectedEvent?.raceCourses?.[0]?.maps?.[0];
            let latLonStr = "";
            try {
                if (map && map.latitude !== undefined && map.longitude !== undefined && 
                    !isNaN(map.latitude) && !isNaN(map.longitude)) {
                     const currentLL = calculateLatLonFromMapPoint(
                       cursorCoordinates.map,
                       map.scale || 1000,
                       { latitude: map.latitude, longitude: map.longitude }
                     );
                     
                     if (currentLL) {
                        latLonStr = `${currentLL.latitude.toFixed(6)}, ${currentLL.longitude.toFixed(6)}`;
                     }
                }
            } catch (_e) {
                // Ignore calculation errors for display
            }

            return (
              <div className="absolute bottom-4 left-4 bg-background/90 text-foreground border border-border p-2 rounded text-xs z-10 shadow-sm pointer-events-none space-y-1">
                <div className="font-mono">
                  MapPosition (IOF): {cursorCoordinates.event.x.toFixed(1)}, {cursorCoordinates.event.y.toFixed(1)}
                </div>
                <div className="font-mono text-muted-foreground">
                  DocumentPosition (mm): {cursorCoordinates.map.x.toFixed(1)}, {cursorCoordinates.map.y.toFixed(1)}
                </div>
                {latLonStr && (
                  <div className="font-mono text-primary font-semibold">
                      Lat/Lon: {latLonStr}
                  </div>
                )}
              </div>
            );
        })()}
      </div>
    </div>
    </div>
  );
}
