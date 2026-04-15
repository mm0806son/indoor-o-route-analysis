"use client";

import React, { useCallback, useMemo, useRef, useEffect, memo, forwardRef, useImperativeHandle, useState } from "react";
import { jsPDF } from "jspdf";
import MapViewer, { MapViewerState, MapViewerController, eventPosToMultiPagePixels } from "@/components/map-viewer";
import { useAppData } from "@indoor-o-route-analysis/ui";
import { ControlRenderer } from "@indoor-o-route-analysis/ui";
import { exportCanvasAndSvgAsImage, exportCanvasAndSvgAsPdf } from "@indoor-o-route-analysis/core";
import { ExportNaming } from "@indoor-o-route-analysis/core";
import type { Edge, Node } from "@indoor-o-route-analysis/core";
import { edgeKey } from "@indoor-o-route-analysis/core";
import type { Control, CourseControl } from "@indoor-o-route-analysis/core";
import { RouteAnalyzer, type RouteInfo } from "@indoor-o-route-analysis/core";
import { getActiveMap } from "@indoor-o-route-analysis/core";
import type { MapData } from "@indoor-o-route-analysis/core";
import type { VideoExportSettings } from "./video-export-dialog";
import { VideoExporter, type VideoExportContext } from "@indoor-o-route-analysis/core";
import { MM_TO_METERS, ROUTE_ANALYSIS_COLORS } from "@indoor-o-route-analysis/core";
import { getActualCourseControls, getCourseControlLabels, getCourseControlLabelMap } from "@indoor-o-route-analysis/core";

// Interface for what we display
interface DisplayedRoute {
    path: string[];
    distance: number;
    color: string;
    isValid: boolean;
    decisionPointNodeIds?: string[];
    floorValidation: {
        isValid: boolean;
        calculatedFloor: number;
        expectedFloor: number;
    }
}


interface RouteAnalysisMapViewerProps {
  map?: MapData;
  pdfUrl: string | null;
  scale: number;
  selectedLeg: number | null;
  selectedCourseId: string | null;
  selectedRoute: number | null;
  showBackgroundMap: boolean;
  backgroundOpacity?: number;
  showEdges: boolean;
  showDecisionPoints: boolean;
  isPlaying: boolean;
  playReset: number;
  followPlayback: boolean;
  onPlaybackComplete?: () => void;
  onPlaybackTimeUpdate?: (currentTime: number, totalTime: number) => void;
  findAllRoutes?: boolean; // Added optional prop
  playbackSpeed?: number; // Added optional prop
  runningSpeed?: number;
  precomputedRoutes?: RouteInfo[];
}

export interface RouteAnalysisMapViewerHandle {
  exportImage: (abortSignal?: AbortSignal) => Promise<void>;
  exportPdf: (abortSignal?: AbortSignal) => Promise<void>;
  exportAllLegsPdf: (onProgress?: (p: number) => void, abortSignal?: AbortSignal) => Promise<void>;
  exportVideo: (settings: VideoExportSettings, onProgress: (progress: number) => void, filename?: string, autoRoute?: boolean, abortSignal?: AbortSignal) => Promise<void>;
  setPlaybackTime: (time: number) => void;
}

// Dijkstra's shortest path algorithm - returns path as node IDs
function dijkstra(
  startNodeId: string,
  endNodeId: string,
  edges: Edge[],
  nodes: Node[],
  controls: Control[],
  scale: number
): string[] | null {
  const graph = new Map<string, Map<string, number>>();

  edges.forEach((edge) => {
    const fromNode = findNode(edge.from, nodes, controls);
    const toNode = findNode(edge.to, nodes, controls);

    if (!fromNode || !toNode) return;

    const distance = calculateEdgeDistanceMeters(edge, fromNode, toNode, scale);
    if (!Number.isFinite(distance)) return;

    if (!graph.has(edge.from)) {
      graph.set(edge.from, new Map());
    }
    if (!graph.has(edge.to)) {
      graph.set(edge.to, new Map());
    }

    const forwardMap = graph.get(edge.from)!;
    const existingForward = forwardMap.get(edge.to);
    if (existingForward === undefined || distance < existingForward) {
      forwardMap.set(edge.to, distance);
    }

    if (!edge.oneWay) {
      const reverseDistance = calculateEdgeDistanceMeters(edge, toNode, fromNode, scale);
      if (Number.isFinite(reverseDistance)) {
        const reverseMap = graph.get(edge.to)!;
        const existingReverse = reverseMap.get(edge.from);
        if (existingReverse === undefined || reverseDistance < existingReverse) {
          reverseMap.set(edge.from, reverseDistance);
        }
      }
    }
  });

  const distances = new Map<string, number>();
  const previous = new Map<string, string>();
  const unvisited = new Set<string>();

  // Ensure both start and end nodes are included in the graph
  if (!graph.has(startNodeId)) {
    graph.set(startNodeId, new Map());
  }
  if (!graph.has(endNodeId)) {
    graph.set(endNodeId, new Map());
  }

  graph.forEach((_, nodeId) => {
    distances.set(nodeId, nodeId === startNodeId ? 0 : Infinity);
    unvisited.add(nodeId);
  });

  while (unvisited.size > 0) {
    let minNode: string | null = null;
    let minDist = Infinity;
    unvisited.forEach((nodeId) => {
      const dist = distances.get(nodeId) ?? Infinity;
      if (dist < minDist) {
        minDist = dist;
        minNode = nodeId;
      }
    });

    if (minNode === null || minDist === Infinity) break;
    if (minNode === endNodeId) break;

    unvisited.delete(minNode);

    const neighbors = graph.get(minNode);
    if (neighbors) {
      neighbors.forEach((edgeWeight, neighbor) => {
        if (!unvisited.has(neighbor)) return;

        const altDist = minDist + edgeWeight;
        if (altDist < (distances.get(neighbor) ?? Infinity)) {
          distances.set(neighbor, altDist);
          previous.set(neighbor, minNode!);
        }
      });
    }
  }

  const path: string[] = [];
  let current: string | undefined = endNodeId;
  while (current) {
    path.unshift(current);
    current = previous.get(current);
  }

  const distance = distances.get(endNodeId) ?? Infinity;
  if (distance === Infinity || path[0] !== startNodeId) {
    return null;
  }

  return path;
}

// Find k-shortest paths using a simplified Yen's approach
function _findAlternativePaths(
  startNodeId: string,
  endNodeId: string,
  edges: Edge[],
  nodes: Node[],
  controls: Control[],
  scale: number,
  k: number = 6
): string[][] {
  const paths: string[][] = [];
  const shortestPath = dijkstra(startNodeId, endNodeId, edges, nodes, controls, scale);

  if (!shortestPath) return [];
  paths.push(shortestPath);

  for (let i = 0; i < shortestPath.length - 1 && paths.length < k; i++) {
    const fromNodeId = shortestPath[i];
    const toNodeId = shortestPath[i + 1];

    const modifiedEdges = edges.filter(
      (e) =>
        !((e.from === fromNodeId && e.to === toNodeId) || (!e.oneWay && e.from === toNodeId && e.to === fromNodeId)),
    );

    const altPath = dijkstra(startNodeId, endNodeId, modifiedEdges, nodes, controls, scale);
    if (altPath && !paths.some((p) => p.join(",") === altPath.join(","))) {
      paths.push(altPath);
    }
  }

  return paths;
}

const ROUTE_COLORS = ROUTE_ANALYSIS_COLORS;

// MM_TO_METERS is imported from constants

function calculateEdgeDistanceMeters(edge: Edge | undefined, fromNode: Node | Control | undefined, toNode: Node | Control | undefined, scale: number): number {
  if (!fromNode || !toNode) return Number.POSITIVE_INFINITY;
  if (edge?.ignoreLength) {
    return 0;
  }

  const effectiveScale = scale && scale > 0 ? scale : 1;
  const fromX = "x" in fromNode ? fromNode.x : fromNode.mapPosition.x;
  const fromY = "y" in fromNode ? fromNode.y : fromNode.mapPosition.y;
  const toX = "x" in toNode ? toNode.x : toNode.mapPosition.x;
  const toY = "y" in toNode ? toNode.y : toNode.mapPosition.y;

  const mapDistanceMM = Math.hypot(toX - fromX, toY - fromY);
  const meters = mapDistanceMM * effectiveScale * MM_TO_METERS;
  return meters;
}

function _calculatePathDistance(path: string[], edges: Edge[], nodes: Node[], controls: Control[], scale: number): number {
  let total = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const fromNode = findNode(path[i], nodes, controls);
    const toNode = findNode(path[i + 1], nodes, controls);
    const edge = edges.find(
      (e) => (e.from === path[i] && e.to === path[i + 1]) || (!e.oneWay && e.from === path[i + 1] && e.to === path[i]),
    );
    total += calculateEdgeDistanceMeters(edge, fromNode, toNode, scale);
  }
  return total;
}

function findNode(nodeId: string, nodes: Node[], controls: Control[]): Node | Control | undefined {
  return nodes.find((n: Node) => n.id === nodeId) || controls.find((c: Control) => c.id === nodeId);
}

function _getContrastColor(hexColor: string): string {
  const r = parseInt(hexColor.slice(1, 3), 16);
  const g = parseInt(hexColor.slice(3, 5), 16);
  const b = parseInt(hexColor.slice(5, 7), 16);
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness > 128 ? "#000000" : "#FFFFFF";
}

const getLineCoordinates = (from: Control & { x: number; y: number }, to: Control & { x: number; y: number }) => {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy);
  if (distance === 0) return { x1: from.x, y1: from.y, x2: to.x, y2: to.y };

  const angle = Math.atan2(dy, dx);
  return {
    x1: from.x + ControlRenderer.CONTROL_RADIUS * Math.cos(angle),
    y1: from.y + ControlRenderer.CONTROL_RADIUS * Math.sin(angle),
    x2: to.x - ControlRenderer.CONTROL_RADIUS * Math.cos(angle),
    y2: to.y - ControlRenderer.CONTROL_RADIUS * Math.sin(angle),
  };
};

interface MapEffectsProps {
  controllerRef: React.MutableRefObject<MapViewerController | null> | { current: MapViewerController | null };
  playPosRef: React.MutableRefObject<{ x: number; y: number } | null>;
  isPlaying: boolean;
  followPlayback: boolean;
  state: MapViewerState;
  displayedRoutes: DisplayedRoute[];
  selectionKey: string;
  lastSelectionRef: React.MutableRefObject<string | null>;
  nodes: Node[];
  controls: Control[];
  fromControlId: string | null;
  map: MapData | undefined;
}

const MapEffects = ({
  controllerRef,
  playPosRef: _playPosRef,
  isPlaying: _isPlaying,
  followPlayback: _followPlayback,
  state,
  displayedRoutes,
  selectionKey,
  lastSelectionRef,
  nodes,
  controls,
  fromControlId,
  map,
}: MapEffectsProps) => {

  useEffect(() => {
    const controller = controllerRef.current;
    if (
        !controller ||
        !state.pixelsPerMM ||
        state.pdfDimensions.width === 0
    ) {
        return;
    }

    if (lastSelectionRef.current === selectionKey) return;

    // Fly to the start of the leg
    let startMM: { x: number; y: number } | null = null;

    if (displayedRoutes.length > 0) {
      // Use the first point in the first route's path
      const firstRoute = displayedRoutes[0];
      if (firstRoute && firstRoute.path.length > 0) {
        const startNodeId = firstRoute.path[0];
        const startNode = nodes.find((n: Node) => n.id === startNodeId);
        const startControl = controls.find((c: Control) => c.id === startNodeId);

        if (startNode && "x" in startNode) {
          startMM = { x: startNode.x, y: startNode.y };
        } else if (startControl?.mapPosition) {
          startMM = { x: startControl.mapPosition.x, y: startControl.mapPosition.y };
        }
      }
    } else if (fromControlId) {
      // No routes found, but a leg is selected — fly to the start control directly
      const startControl = controls.find((c: Control) => c.id === fromControlId);
      if (startControl?.mapPosition) {
        startMM = { x: startControl.mapPosition.x, y: startControl.mapPosition.y };
      }
    }

    if (!startMM) return;

    const startPx = eventPosToMultiPagePixels(startMM, map, state.pixelsPerMM);
    controller.flyTo(startPx);
    lastSelectionRef.current = selectionKey;
  }, [
    displayedRoutes,
    selectionKey,
    fromControlId,
    state.pixelsPerMM,
    state.pdfDimensions.width,
    state.pdfDimensions.height,
    controllerRef,
    lastSelectionRef,
    nodes,
    controls,
    map
  ]);

  return null;
};

const RouteAnalysisMapViewer = forwardRef<RouteAnalysisMapViewerHandle, RouteAnalysisMapViewerProps>(
  function RouteAnalysisMapViewer(
    {
      map,
      pdfUrl,
      scale,
      selectedLeg,
      selectedCourseId,
      selectedRoute,
      showBackgroundMap,
      backgroundOpacity = 1,
      showEdges,
      showDecisionPoints,
      isPlaying,
      playReset,
      followPlayback,
      onPlaybackComplete,
      onPlaybackTimeUpdate,
      findAllRoutes: _findAllRoutes = false,
      playbackSpeed = 4,
      runningSpeed = 3,
      precomputedRoutes,
    }: RouteAnalysisMapViewerProps,
    ref,
  ) {
    const { selectedEvent, runningSpeed: contextRunningSpeed } = useAppData();
    // Use prop if provided (for flexibility), otherwise context or default 3
    const effectiveRunningSpeed = runningSpeed ?? contextRunningSpeed ?? 3;

    type ControlWithPos = Control & { x: number; y: number; mapText: string; code?: string };
    // Debug speed mismatch
    useEffect(() => {
      // console.log("MapViewer running speed:", effectiveRunningSpeed, "Prop:", runningSpeed, "Context:", contextRunningSpeed);
    }, [effectiveRunningSpeed, runningSpeed, contextRunningSpeed]);

    const controllerRef = useMemo<{ current: MapViewerController | null }>(() => ({ current: null }), []);
    const handleControllerReady = useCallback((c: MapViewerController) => { controllerRef.current = c; }, [controllerRef]);
    const svgRef = useRef<SVGSVGElement | null>(null);
    const mapStateRef = useRef<MapViewerState | null>(null);
    const totalSimTimeRef = useRef<number>(0);
    const lastTimeReportRef = useRef<number>(0);
    const onPlaybackTimeUpdateRef = useRef(onPlaybackTimeUpdate);
    onPlaybackTimeUpdateRef.current = onPlaybackTimeUpdate;
    const onPlaybackCompleteRef = useRef(onPlaybackComplete);
    onPlaybackCompleteRef.current = onPlaybackComplete;
    const effectiveRunningSpeedRef = useRef(effectiveRunningSpeed);
    effectiveRunningSpeedRef.current = effectiveRunningSpeed;
    const isExportingRef = useRef(false);
    const overrideRoutesRef = useRef<DisplayedRoute[] | null>(null);

    // Need to update mapStateRef whenever state changes, via the render prop below
    // This is a bit unusual but we need access to the inner state in the imperative handle.

    useImperativeHandle(ref, () => ({
      exportImage: async (abortSignal?: AbortSignal) => {
        const controller = controllerRef.current;
        const svg = svgRef.current;
        if (!controller || !svg) return;

        const canvas = controller.getCanvas();
        if (!canvas) return;

        const course = selectedEvent?.raceCourses?.[0]?.courses?.find((c) => c.id === selectedCourseId);
        const legName = selectedLeg !== null ? `Leg ${selectedLeg + 1}` : null;
        const routeName = selectedRoute !== null ? `Route ${selectedRoute + 1}` : null;

        const filenameBase = ExportNaming.getFilename({
            eventDate: selectedEvent?.startTime,
            eventName: selectedEvent?.name,
            courseName: course?.name,
            legName,
            routeName,
            suffix: " - route analysis map"
        }, "png");
        const filename = filenameBase.replace(/\.png$/, "");

        await exportCanvasAndSvgAsImage(
          canvas,
          svg,
          filename,
          { showBackground: true, backgroundOpacity: 1 },
          abortSignal
        );
      },
      exportPdf: async (abortSignal?: AbortSignal) => {
        const controller = controllerRef.current;
        const svg = svgRef.current;
        if (!controller || !svg) return;

        const canvas = controller.getCanvas();
        if (!canvas) return;
        
        const course = selectedEvent?.raceCourses?.[0]?.courses?.find((c) => c.id === selectedCourseId);
        const legName = selectedLeg !== null ? `Leg ${selectedLeg + 1}` : null;
        const routeName = selectedRoute !== null ? `Route ${selectedRoute + 1}` : null;

        const filenameBase = ExportNaming.getFilename({
            eventDate: selectedEvent?.startTime,
            eventName: selectedEvent?.name,
            courseName: course?.name,
            legName,
            routeName,
            suffix: " - route analysis map"
        }, "pdf");
        const filename = filenameBase.replace(/\.pdf$/, "");

        await exportCanvasAndSvgAsPdf(
          canvas,
          svg,
          filename,
          { showBackground: true, backgroundOpacity: 1 },
          abortSignal
        );
      },
      exportAllLegsPdf: async (onProgress?: (progress: number) => void, signal?: AbortSignal) => {
        const controller = controllerRef.current;
        const state = mapStateRef.current;
        if (!controller || !selectedEvent || !selectedCourseId || !state) return;

        const canvas = controller.getCanvas();
        if (!canvas) return;

        // Find course
        const course = selectedEvent.raceCourses?.[0]?.courses?.find((c) => c.id === selectedCourseId);
        if (!course || !course.controls || course.controls.length < 2) return;

        const courseControlsList = course.controls;
        // Get actual course controls (intermediate start controls removed) for leg iteration
        const filteredControlsList = getActualCourseControls(courseControlsList, controls);
        const combinedCanvas = document.createElement("canvas");
        combinedCanvas.width = canvas.width;
        combinedCanvas.height = canvas.height;
        const ctx = combinedCanvas.getContext("2d");
        if (!ctx) return;

        const pdf = new jsPDF({
          orientation: canvas.width > canvas.height ? "l" : "p",
          unit: "px",
          format: [canvas.width, canvas.height],
        });

        const courseControls = courseControlsList
          .map((cc: CourseControl): ControlWithPos | null => {
            const control = controls.find((c) => c.id === cc.controlId);
            if (!control) return null;
            return { ...control, mapText: cc.mapText ?? control.mapText ?? "" } as ControlWithPos;
          })
          .filter((c): c is ControlWithPos => c !== null);

        const svgControlLabels = getCourseControlLabels(courseControlsList, controls);

        const activeMap = getActiveMap(selectedEvent, selectedCourseId);

        const controlPxMap = new Map<string, ControlWithPos>();
        controls.forEach((c) => {
          const pt = eventPosToMultiPagePixels({ x: c.mapPosition.x, y: c.mapPosition.y }, activeMap, state.pixelsPerMM);
          controlPxMap.set(c.id, { ...c, mapText: c.mapText ?? "", x: pt.x, y: pt.y } as ControlWithPos);
        });

        const courseControlsPx: ControlWithPos[] = courseControls
          .map((c): ControlWithPos | null => {
            const px = controlPxMap.get(c.id);
            return px ? { ...px, mapText: c.mapText } : null;
          })
          .filter((c): c is ControlWithPos => c !== null);
        const _courseControlCodes = courseControls.map((c) => c.mapText || c.id);

        const routeAnalyzer = new RouteAnalyzer(controls, nodes, edges, scale, undefined, selectedEvent?.raceCourses?.[0]?.polygons || []);

        // Helper to draw SVG to canvas
        const drawSvgToCanvas = (svgString: string): Promise<void> => {
          return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
              ctx.drawImage(img, 0, 0);
              resolve();
            };
            img.onerror = reject;
            img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgString)));
          });
        };

        const findNodePx = (nodeId: string): (Node & { x: number; y: number }) | ControlWithPos | null => {
          const n = nodes.find((no: Node) => no.id === nodeId);
          if (n) {
            const pt = eventPosToMultiPagePixels({ x: n.x, y: n.y }, activeMap, state.pixelsPerMM);
            return { ...n, x: pt.x, y: pt.y };
          }
          return controlPxMap.get(nodeId) ?? null;
        };

        let pageIndex = 0;
        const totalLegs = filteredControlsList.length - 1;

        for (let i = 0; i < totalLegs; i++) {
          if (signal?.aborted) {
               throw new Error("Export cancelled");
          }
          
          if (onProgress) {
             onProgress((i) / totalLegs);
             // Allow UI update
             await new Promise(resolve => setTimeout(resolve, 0));
          }

          const fromId = filteredControlsList[i].controlId;
          const toId = filteredControlsList[i + 1].controlId;

          if (!fromId || !toId || fromId === toId) continue;

          // Clear canvas and draw background
          ctx.clearRect(0, 0, combinedCanvas.width, combinedCanvas.height);
          ctx.fillStyle = "white";
          ctx.fillRect(0, 0, combinedCanvas.width, combinedCanvas.height);
          ctx.drawImage(canvas, 0, 0);

          // Find route
          const routes = routeAnalyzer.findAlternativePathsBetweenControls(fromId, toId);
          const bestRoute = routes[0]; // Best route is first

          // Generate SVG content manually for this leg
          // Only draw the route and arrow positions + leg lines + controls

          // Start SVG
          let svgContent = `<svg width="${state.pdfDimensions.width}" height="${state.pdfDimensions.height}" xmlns="http://www.w3.org/2000/svg">`;

          // 1. Leg Lines (all leg lines, dim unselected, highlight current)
          // Draw all leg lines
          if (courseControlsPx.length > 1) {
            for (let cIdx = 0; cIdx < courseControlsPx.length - 1; cIdx++) {
              const c1 = courseControlsPx[cIdx];
              const c2 = courseControlsPx[cIdx + 1];
              const coords = getLineCoordinates(c1, c2);
              const isCurrent = cIdx === i;
              const color = "#8b5cf6";
              const width = isCurrent ? 4 : 2;

              svgContent += `<line x1="${coords.x1}" y1="${coords.y1}" x2="${coords.x2}" y2="${coords.y2}" stroke="${color}" stroke-width="${width}" stroke-linecap="round" />`;
            }
          }

          // 2. Controls
          courseControlsPx.forEach((c, idx) => {
            // We need to render the circle/triangle/double circle
            // Simplified rendering for export
            const isStart = idx === 0;
            const isFinish = idx === courseControlsPx.length - 1;
            const color = "#8b5cf6";
            const r = ControlRenderer.CONTROL_RADIUS;

            // Very basic manual SVG generation for controls to match ControlRenderer
            // Ideally we'd use ControlRenderer.renderControl but it returns JSX
            // We'll just draw circles for now as a fallback/simplification?
            // Or better, let's just serialize what we have?
            // Problem: we want to change highlighting per leg loop.

            // Let's implement basic shapes
            if (isStart) {
              // Triangle
              const size = r * 1.2;
              // Points for triangle centered at cx, cy
              // This is rough approximation of the ControlRenderer logic
              const p1 = { x: c.x, y: c.y - size };
              const p2 = { x: c.x - size * 0.866, y: c.y + size * 0.5 };
              const p3 = { x: c.x + size * 0.866, y: c.y + size * 0.5 };
              svgContent += `<polygon points="${p1.x},${p1.y} ${p2.x},${p2.y} ${p3.x},${p3.y}" fill="none" stroke="${color}" stroke-width="3" />`;
            } else if (isFinish) {
              // Double circle
              svgContent += `<circle cx="${c.x}" cy="${c.y}" r="${r}" fill="none" stroke="${color}" stroke-width="3" />`;
              svgContent += `<circle cx="${c.x}" cy="${c.y}" r="${
                r * 0.7
              }" fill="none" stroke="${color}" stroke-width="2" />`;
            } else {
              svgContent += `<circle cx="${c.x}" cy="${c.y}" r="${r}" fill="none" stroke="${color}" stroke-width="3" />`;
            }

            // Label
            // Only number for regular controls
            if (!isStart && !isFinish) {
              svgContent += `<text x="${c.x + r + 2}" y="${
                c.y + r + 2
              }" font-family="Arial" font-size="14" fill="${color}" font-weight="bold">${svgControlLabels[idx] || idx}</text>`;
            }
          });

          // 3. Best Route
          if (bestRoute && bestRoute.path.length > 0) {
            const routeColor = ROUTE_COLORS[0];
            const polylineSegments: { points: { x: number; y: number }[]; isIgnoreLength: boolean }[] = [];
            let currentSegment: { x: number; y: number }[] = [];

            for (let j = 0; j < bestRoute.path.length - 1; j++) {
              const n1 = findNodePx(bestRoute.path[j]);
              const n2 = findNodePx(bestRoute.path[j + 1]);
              if (!n1 || !n2) continue;

              // Check edges for teleport
              const edge = edges.find(
                (e) =>
                  (e.from === bestRoute.path[j] && e.to === bestRoute.path[j + 1]) ||
                  (!e.oneWay && e.from === bestRoute.path[j + 1] && e.to === bestRoute.path[j]),
              );

              if (currentSegment.length === 0) currentSegment.push(n1);

              if (edge?.ignoreLength) {
                if (currentSegment.length > 1) polylineSegments.push({ points: currentSegment, isIgnoreLength: false });
                currentSegment = [n1, n2];
                polylineSegments.push({ points: currentSegment, isIgnoreLength: true });
                currentSegment = [n2]; // start new
              } else {
                currentSegment.push(n2);
              }
            }
            if (currentSegment.length > 1) polylineSegments.push({ points: currentSegment, isIgnoreLength: false });

            polylineSegments.forEach((seg) => {
              if (seg.isIgnoreLength) return;
              const pts = seg.points.map((p) => `${p.x},${p.y}`).join(" ");
              svgContent += `<polyline points="${pts}" stroke="${routeColor}" stroke-width="4" opacity="0.8" stroke-linecap="round" stroke-linejoin="round" fill="none" />`;
            });
          }

          svgContent += `</svg>`;

          await drawSvgToCanvas(svgContent);

          // Add to PDF
          if (pageIndex > 0) pdf.addPage([canvas.width, canvas.height], canvas.width > canvas.height ? "l" : "p");

          pdf.addImage(combinedCanvas.toDataURL("image/png"), "PNG", 0, 0, canvas.width, canvas.height);

          // Add title text to page
          const fromControl = controls.find((c) => c.id === fromId);
          const toControl = controls.find((c) => c.id === toId);
          const title = `Leg ${pageIndex + 1}: ${fromControl?.id || "?"} -> ${toControl?.id || "?"}`;

          pdf.setFontSize(24);
          pdf.text(title, 50, 50);
          pageIndex++;
        }

        if (signal?.aborted) throw new Error("Export cancelled");
        pdf.save(`route-analysis-${selectedCourseId}-all-legs.pdf`);
      },
      exportVideo: async (
        settings: VideoExportSettings, 
        onProgress: (progress: number) => void, 
        filename?: string, 
        autoRoute?: boolean,
        abortSignal?: AbortSignal
      ) => {
        const controller = controllerRef.current;
        const svg = svgRef.current;
        if (!controller || !svg) return;

        // Capture current zoom level immediately to use throughout export
        const exportZoomLevel = mapStateRef.current?.zoom || 1;

        // Auto-route logic setup
        if (autoRoute && routeAnalyzer) {
            // Calculate best route for ALL legs and concatenate them
            if (courseControls.length > 1) {
                let combinedPath: string[] = [];
                let combinedLength = 0;
                const combinedColor = ROUTE_COLORS[0];
                
                for(let i=0; i<courseControls.length-1; i++) {
                const fromId = courseControls[i].id;
                const toId = courseControls[i+1].id;
                if (!fromId || !toId) continue;
                
                const legs = routeAnalyzer.findAlternativePathsBetweenControls(fromId, toId);
                if (legs.length > 0) {
                    const best = legs[0];
                    // If not first leg, ensure we don't duplicate the join node
                    if (combinedPath.length > 0 && best.path.length > 0 && combinedPath[combinedPath.length-1] === best.path[0]) {
                        combinedPath = [...combinedPath, ...best.path.slice(1)];
                    } else {
                        combinedPath = [...combinedPath, ...best.path];
                    }
                    combinedLength += best.distance;
                }
                }
                
                const combinedRoute: DisplayedRoute = {
                    path: combinedPath,
                    distance: combinedLength,
                    color: combinedColor,
                    isValid: true,
                    floorValidation: { isValid: true, calculatedFloor: 0, expectedFloor: 0 }
                };
                
                overrideRoutesRef.current = [combinedRoute];
            }
        } else {
            overrideRoutesRef.current = null;
        }

        isExportingRef.current = true;
        const originalTime = accumulatedTimeRef.current;

        try {
            // If auto-route, we need to ensure the full route is loaded and time calculated
            if (autoRoute && overrideRoutesRef.current && overrideRoutesRef.current.length > 0) {
                 // Trigger re-render to mock the routes and calculate totalSimTime
                 forceRender(n => n + 1);
                 // Wait for React to render and update totalSimTimeRef
                 await new Promise(resolve => setTimeout(resolve, 100));
            }
            
            const simDuration = totalSimTimeRef.current || 10;
            const videoDuration = autoRoute ? simDuration : settings.duration;

            const context: VideoExportContext = {
                getCanvas: () => controller.getCanvas(),
                getSvg: () => svg,
                setSimulationTime: async (time: number) => {
                    accumulatedTimeRef.current = time;
                    await new Promise<void>(resolve => {
                        forceRender(n => n + 1);
                        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
                    });
                },
                getPlayPosition: () => playPosRef.current,
                getZoom: () => exportZoomLevel
            };

            const exporter = new VideoExporter();
            
            // Hook cancellation
            if (abortSignal) {
                abortSignal.addEventListener('abort', () => {
                   exporter.cancel().catch(console.error);
                });
            }

            try {
              await exporter.export(
                  settings, 
                  filename || `route-analysis-video.mp4`, 
                  videoDuration, 
                  simDuration, 
                  context, 
                  onProgress
              );
            } catch (err) {
              if (abortSignal?.aborted) {
                // Ignore abort errors
                return;
              }
              throw err;
            }

        } catch (err) {
            if (abortSignal?.aborted) return;
            console.error("Export failed", err);
            alert("Video export failed: " + (err instanceof Error ? err.message : String(err)));
        } finally {
            accumulatedTimeRef.current = originalTime;
            isExportingRef.current = false;
            overrideRoutesRef.current = null;
            forceRender(n => n + 1);
        }
      },
      setPlaybackTime: (time: number) => {
        accumulatedTimeRef.current = time;
        playDoneRef.current = false;
        completionNotifiedRef.current = false;
        drawPlaybackCanvasRef.current(); // Immediate canvas update on scrub
        forceRender(n => n + 1);
      },
    }));

    const playStartRef = useRef<number | null>(null);
    const playPosRef = useRef<{ x: number; y: number } | null>(null);
    const playDoneRef = useRef<boolean>(false);
    const completionNotifiedRef = useRef<boolean>(false);

    // Add accumulated playback time ref to support clean pausing and loop resetting
    const accumulatedTimeRef = useRef<number>(0);
    const lastFrameTimeRef = useRef<number>(0);

    const lastResetKeyRef = useRef<string>("");
    const lastSelectionRef = useRef<string | null>(null);
    const [, forceRender] = useState(0);
    const playbackCanvasRef = useRef<HTMLCanvasElement>(null);
    type CachedGeoSegment = { points: Array<{ x: number; y: number }>; isTeleport: boolean };
    type CachedRouteGeo = { color: string; segments: CachedGeoSegment[]; totalLength: number; strokeWidth: number };
    const cachedGeometryRef = useRef<CachedRouteGeo[]>([]);
    const pixelsPerMeterRef = useRef<number>(0);
    const drawPlaybackCanvasRef = useRef<() => void>(() => {});
    const followPlaybackRef = useRef(followPlayback);
    followPlaybackRef.current = followPlayback;

    // Assign canvas drawing function — runs at 60fps without React reconciliation
    drawPlaybackCanvasRef.current = () => {
      const canvas = playbackCanvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Skip canvas during video export (SVG handles runner for capture)
      if (isExportingRef.current) return;

      const geometry = cachedGeometryRef.current;
      if (!geometry.length) return;
      const ppm = pixelsPerMeterRef.current;
      if (ppm <= 0) return;
      const hasPlayback = accumulatedTimeRef.current > 0 || isPlaying;
      if (!hasPlayback) return;

      const speedMps = effectiveRunningSpeedRef.current;
      const elapsed = accumulatedTimeRef.current;
      const maxRoutePixels = Math.max(0, ...geometry.map((g) => g.totalLength));
      const targetPixels = elapsed * speedMps * ppm;

      // Completion detection at 60fps
      if (maxRoutePixels > 0 && targetPixels >= maxRoutePixels - 1e-6 && !playDoneRef.current) {
        playDoneRef.current = true;
        if (!completionNotifiedRef.current) {
          completionNotifiedRef.current = true;
          onPlaybackCompleteRef.current?.();
        }
      }

      geometry.forEach((geo, geoIdx) => {
        const routeTargetPixels = Math.min(targetPixels, geo.totalLength);
        const isComplete = targetPixels >= maxRoutePixels - 1e-6;
        let remaining = routeTargetPixels;
        let runnerPos: { x: number; y: number } | null = null;

        ctx.strokeStyle = geo.color;
        ctx.lineWidth = geo.strokeWidth;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";

        if (isComplete) {
          // Draw all segments
          for (const seg of geo.segments) {
            if (seg.isTeleport || seg.points.length < 2) continue;
            ctx.beginPath();
            ctx.moveTo(seg.points[0].x, seg.points[0].y);
            for (let i = 1; i < seg.points.length; i++) ctx.lineTo(seg.points[i].x, seg.points[i].y);
            ctx.stroke();
          }
          // Runner at end of last non-teleport segment
          for (let sIdx = geo.segments.length - 1; sIdx >= 0; sIdx--) {
            const seg = geo.segments[sIdx];
            if (!seg.isTeleport && seg.points.length > 0) {
              runnerPos = seg.points[seg.points.length - 1];
              break;
            }
          }
        } else {
          let done = false;
          for (const seg of geo.segments) {
            if (done || remaining <= 0) break;
            if (seg.isTeleport || seg.points.length < 2) continue;
            ctx.beginPath();
            ctx.moveTo(seg.points[0].x, seg.points[0].y);
            for (let i = 0; i < seg.points.length - 1; i++) {
              const p1 = seg.points[i];
              const p2 = seg.points[i + 1];
              const dx = p2.x - p1.x;
              const dy = p2.y - p1.y;
              const len = Math.hypot(dx, dy);
              if (remaining >= len) {
                ctx.lineTo(p2.x, p2.y);
                remaining -= len;
                runnerPos = { x: p2.x, y: p2.y };
              } else {
                const t = len > 0 ? remaining / len : 0;
                const ex = p1.x + dx * t;
                const ey = p1.y + dy * t;
                ctx.lineTo(ex, ey);
                runnerPos = { x: ex, y: ey };
                remaining = 0;
                done = true;
                break;
              }
            }
            ctx.stroke();
          }
        }

        // Update follow-playback ref from primary route
        if (geoIdx === 0 && runnerPos) playPosRef.current = runnerPos;

        // Draw runner with white halo
        if (runnerPos) {
          const { x, y } = runnerPos;
          ctx.beginPath();
          ctx.arc(x, y, 16, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(255,255,255,0.75)";
          ctx.fill();
          ctx.beginPath();
          ctx.arc(x, y, 12, 0, Math.PI * 2);
          ctx.fillStyle = geo.color;
          ctx.globalAlpha = 0.9;
          ctx.fill();
          ctx.globalAlpha = 1.0;
        }
      });
    };

    const selectionKey = useMemo(
      () => `${selectedCourseId ?? "none"}:${selectedLeg ?? "none"}:${selectedRoute ?? "none"}`,
      [selectedCourseId, selectedLeg, selectedRoute],
    );

    // Reset last auto-center when selection changes so the next render can pan once
    useEffect(() => {
      lastSelectionRef.current = null;
    }, [selectionKey]);

    // Animation loop for smooth playback - use ref to avoid state churn
    // Animation loop — canvas draws at 60fps, React renders throttled to ~30fps for follow-playback
    useEffect(() => {
      if (!isPlaying) {
        lastFrameTimeRef.current = 0;
        return;
      }

      if (playDoneRef.current) {
        playStartRef.current = null;
        playDoneRef.current = false;
        completionNotifiedRef.current = false;
        accumulatedTimeRef.current = 0;
        playPosRef.current = null;
      }

      let animationId: number;
      if (lastFrameTimeRef.current === 0) {
        lastFrameTimeRef.current = performance.now();
      }

      const animate = (timestamp: number) => {
        if (lastFrameTimeRef.current === 0) lastFrameTimeRef.current = timestamp;
        const dt = (timestamp - lastFrameTimeRef.current) / 1000;
        if (dt > 0 && dt < 1.0) {
          accumulatedTimeRef.current += dt * playbackSpeed;
        }
        lastFrameTimeRef.current = timestamp;

        // Draw runner directly on canvas — no React re-render needed
        drawPlaybackCanvasRef.current();

        const now = performance.now();
        // Follow playback: direct DOM pan — no React re-render, no scheduling delay
        if (followPlaybackRef.current && playPosRef.current) {
          controllerRef.current?.panTo(playPosRef.current);
        }
        // Report time to slider at ~10fps
        if (now - lastTimeReportRef.current > 100) {
          lastTimeReportRef.current = now;
          onPlaybackTimeUpdateRef.current?.(accumulatedTimeRef.current, totalSimTimeRef.current);
        }

        animationId = requestAnimationFrame(animate);
      };
      animationId = requestAnimationFrame(animate);

      return () => {
        cancelAnimationFrame(animationId);
      };
    }, [isPlaying, playbackSpeed, controllerRef]);

    // Sync slider, canvas, and pan state when playback stops
    useEffect(() => {
      if (!isPlaying) {
        onPlaybackTimeUpdateRef.current?.(accumulatedTimeRef.current, totalSimTimeRef.current);
        drawPlaybackCanvasRef.current();
        // Flush the direct-DOM pan back to React state so normal panning works correctly
        controllerRef.current?.syncPanState();
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isPlaying]);

    const raceCourse = selectedEvent?.raceCourses?.[0];
    const controls = useMemo(() => raceCourse?.controls || [], [raceCourse?.controls]);
    const edges = useMemo(() => raceCourse?.edges || [], [raceCourse?.edges]);
    const nodes = useMemo(() => raceCourse?.vertices || [], [raceCourse?.vertices]);

    const courseControls: ControlWithPos[] = useMemo<ControlWithPos[]>(() => {
      if (!selectedCourseId || !raceCourse?.courses) return [];
      const course = raceCourse.courses.find((c) => c.id === selectedCourseId);
      if (!course) return [];
      // Get actual course controls (intermediate start controls removed)
      const filteredCC = getActualCourseControls(course.controls || [], controls);
      return filteredCC
        .map((cc: CourseControl): ControlWithPos | null => {
          const control = controls.find((c) => c.id === cc.controlId);
          if (!control) return null;
          return { ...control, mapText: cc.mapText ?? control.mapText ?? "", x: control.mapPosition.x, y: control.mapPosition.y } as ControlWithPos;
        })
        .filter((c): c is ControlWithPos => c !== null);
    }, [controls, selectedCourseId, raceCourse]);

    const controlLabelMap = useMemo(() => {
      if (!selectedCourseId || !raceCourse?.courses) return new Map<string, string>();
      const course = raceCourse.courses.find((c) => c.id === selectedCourseId);
      if (!course) return new Map<string, string>();
      const filteredCC = getActualCourseControls(course.controls || [], controls);
      // When a single leg is selected, only show labels for that leg's controls
      // (avoids combined labels like "5,23" for controls visited multiple times)
      if (selectedLeg !== null && selectedLeg >= 0 && selectedLeg < filteredCC.length - 1) {
        const labels = getCourseControlLabels(filteredCC, controls);
        const labelMap = new Map<string, string>();
        labelMap.set(filteredCC[selectedLeg].controlId, labels[selectedLeg]);
        labelMap.set(filteredCC[selectedLeg + 1].controlId, labels[selectedLeg + 1]);
        return labelMap;
      }
      return getCourseControlLabelMap(filteredCC, controls);
    }, [controls, selectedCourseId, raceCourse, selectedLeg]);

    const { fromControlId, toControlId } = useMemo(() => {
      if (selectedLeg === null || !selectedCourseId || !selectedEvent) {
        return { fromControlId: null, toControlId: null };
      }

      const course = raceCourse?.courses?.find((c) => c.id === selectedCourseId);
      if (!course) {
        return { fromControlId: null, toControlId: null };
      }

      // Use filtered controls (intermediate start controls removed) for leg indexing
      const courseControlsList = getActualCourseControls(course.controls || [], controls);

      let fromControl = null;
      let toControl = null;

      if (selectedLeg >= 0 && selectedLeg < courseControlsList.length - 1) {
        const fromControlIdValue = courseControlsList[selectedLeg]?.controlId;
        const toControlIdValue = courseControlsList[selectedLeg + 1]?.controlId;
        fromControl = controls.find((c) => c.id === fromControlIdValue) || null;
        toControl = controls.find((c) => c.id === toControlIdValue) || null;
      }

      return {
        fromControlId: fromControl ? fromControl.id : null,
        toControlId: toControl ? toControl.id : null,
      };
    }, [selectedLeg, selectedCourseId, selectedEvent, controls, raceCourse?.courses]);

    const routeAnalyzer = useMemo(() => {
      if (controls.length === 0) return null;
      const polygons = selectedEvent?.raceCourses?.[0]?.polygons || [];
      return new RouteAnalyzer(
        controls,
        nodes,
        edges,
        scale,
        undefined, // Use default scoring model
        polygons
      );
    }, [controls, nodes, edges, scale, selectedEvent]);

    const routes = useMemo(() => {
      // Wait for routes computed by the main route analysis
      if (precomputedRoutes === undefined) return [];

      return precomputedRoutes.map((routeInfo, index) => {
        // Derive floor info from pathPolygons
        const endLevel = routeInfo.pathPolygons[routeInfo.pathPolygons.length - 1]?.level ?? 0;

        return {
          path: routeInfo.path,
          distance: routeInfo.distance,
          color: ROUTE_COLORS[index % ROUTE_COLORS.length],
          isValid: true,
          decisionPointNodeIds: routeInfo.decisionPointNodeIds,
          floorValidation: {
            isValid: true,
            calculatedFloor: endLevel,
            expectedFloor: endLevel,
          },
        };
      });
    }, [precomputedRoutes]);
    const displayedRoutes = useMemo(() => {
      if (overrideRoutesRef.current) return overrideRoutesRef.current;
      if (selectedRoute === null) {
        return routes;
      }
      return [routes[selectedRoute]].filter(Boolean);
    }, [routes, selectedRoute]); // overrideRoutesRef is read during export which triggers forceRender state update

    const renderSvgContent = (state: MapViewerState, includeWhiteBackground: boolean = false) => {
      const controlPxMap = new Map<string, ControlWithPos>();
      controls.forEach((c) => {
        const pt = eventPosToMultiPagePixels({ x: c.mapPosition.x, y: c.mapPosition.y }, map, state.pixelsPerMM);
        controlPxMap.set(c.id, { ...c, mapText: c.mapText ?? "", x: pt.x, y: pt.y } as ControlWithPos);
      });

      const nodePxMap = new Map<string, Node>();
      (nodes || []).forEach((n: Node) => {
        const pt = eventPosToMultiPagePixels({ x: n.x, y: n.y }, map, state.pixelsPerMM);
        nodePxMap.set(n.id, { ...n, x: pt.x, y: pt.y });
      });

      const findNodePx = (nodeId: string): (Node & { x: number; y: number }) | ControlWithPos | null => nodePxMap.get(nodeId) || controlPxMap.get(nodeId) || null;

      const courseControlsPx: ControlWithPos[] = courseControls
        .map((c): ControlWithPos | null => controlPxMap.get(c.id) ?? null)
        .filter((c): c is ControlWithPos => c !== null);

      const courseControlCodes = courseControls.map((c) => c.mapText || c.id);
      const arrowSpacingPx = 10 * state.pixelsPerMM;

      const highlightedLegIndex =
        selectedLeg !== null && selectedLeg >= 0 && selectedLeg < courseControls.length - 1 ? selectedLeg : null;

      // Compute longest route length (pixels) across displayed routes for synchronized playback
      const computeRoutePixelLength = (path: string[]) => {
        let total = 0;
        for (let i = 0; i < path.length - 1; i++) {
          const nodeId = path[i];
          const nextNodeId = path[i + 1];
          const fromNode = nodePxMap.get(nodeId) || controlPxMap.get(nodeId);
          const toNode = nodePxMap.get(nextNodeId) || controlPxMap.get(nextNodeId);
          if (!fromNode || !toNode) continue;
          const edge = edges.find(
            (e: Edge) =>
              (e.from === nodeId && e.to === nextNodeId) || (!e.oneWay && e.from === nextNodeId && e.to === nodeId),
          );
          if (edge?.ignoreLength) continue;
          total += Math.hypot(toNode.x - fromNode.x, toNode.y - fromNode.y);
        }
        return total;
      };

      const metersPerMM = scale > 0 ? scale * 0.001 : 0.001;
      const pixelsPerMeter = state.pixelsPerMM / metersPerMM;
      pixelsPerMeterRef.current = pixelsPerMeter;
      const maxRoutePixels = Math.max(0, ...displayedRoutes.map((r) => computeRoutePixelLength(r.path)));
      
      const currentSpeedMps = effectiveRunningSpeed;
      if (pixelsPerMeter > 0) {
        totalSimTimeRef.current = (maxRoutePixels > 0)
         ? maxRoutePixels / pixelsPerMeter / currentSpeedMps
         : 60;
      }

      // Canvas playback mode: runner + covered path drawn on canvas overlay at 60fps
      const canvasPlaybackMode = !isExportingRef.current;
      const tempGeometry: CachedRouteGeo[] = [];

      // On-map time overlay (simulated time)
      let timeOverlay: React.ReactNode = null;
      const hasActivePlayback = accumulatedTimeRef.current > 0 || isPlaying || isExportingRef.current;
      if (hasActivePlayback && maxRoutePixels > 0) {
        const speedMps = effectiveRunningSpeed;
        const totalSimSeconds = maxRoutePixels / pixelsPerMeter / speedMps;
        const simSeconds = Math.min(accumulatedTimeRef.current, totalSimSeconds);
        const m = Math.floor(simSeconds / 60);
        const s = Math.floor(simSeconds % 60);
        const ss = s < 10 ? `0${s}` : `${s}`;
        const label = `${m}:${ss}`;
        timeOverlay = (
          <g key="time-overlay">
            <text
              x={state.pdfDimensions.width - 12}
              y={18}
              textAnchor="end"
              dominantBaseline="hanging"
              fontSize="14"
              fontWeight="bold"
              fill="#000"
              stroke="#fff"
              strokeWidth={3}
              pointerEvents="none"
            >
              {label}
            </text>
            <text
              x={state.pdfDimensions.width - 12}
              y={18}
              textAnchor="end"
              dominantBaseline="hanging"
              fontSize="14"
              fontWeight="bold"
              fill="#000"
              pointerEvents="none"
            >
              {label}
            </text>
          </g>
        );
      }

      const svgResult = (
        <svg
          ref={svgRef}
          width={state.pdfDimensions.width}
          height={state.pdfDimensions.height}
          style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none" }}
        >
          <defs>
            <filter id="white-halo-route" x="-200%" y="-200%" width="500%" height="500%">
              <feGaussianBlur in="SourceAlpha" stdDeviation="6" result="blur1" />
              <feFlood floodColor="white" floodOpacity="1" result="flood1">
                <animate attributeName="floodOpacity" values="0.8;1;0.8" dur="1.5s" repeatCount="indefinite" />
              </feFlood>
              <feComposite in2="blur1" operator="in" result="halo1" />
              <feGaussianBlur in="SourceAlpha" stdDeviation="3" result="blur2" />
              <feFlood floodColor="white" floodOpacity="1" result="flood2">
                <animate attributeName="floodOpacity" values="0.8;1;0.8" dur="1.5s" repeatCount="indefinite" />
              </feFlood>
              <feComposite in2="blur2" operator="in" result="halo2" />
              <feMerge>
                <feMergeNode in="halo1" />
                <feMergeNode in="halo2" />
                <feMergeNode in="halo1" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {includeWhiteBackground && (
            <rect x={0} y={0} width={state.pdfDimensions.width} height={state.pdfDimensions.height} fill="white" />
          )}

          {showEdges &&
            edges
              .filter((edge: Edge) => !edge.ignoreLength)
              .map((edge: Edge) => {
              const fromNode = findNodePx(edge.from);
              const toNode = findNodePx(edge.to);

              if (!fromNode || !toNode) return null;

              return (
                <line
                  key={`edge-${edgeKey(edge)}`}
                  x1={fromNode.x}
                  y1={fromNode.y}
                  x2={toNode.x}
                  y2={toNode.y}
                  stroke="#999999"
                  strokeWidth="2"
                  opacity="0.3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              );
            })}

          {courseControlsPx.length > 1 &&
            courseControlsPx.map((control, idx) => {
              if (idx === courseControlsPx.length - 1) return null;
              if (highlightedLegIndex !== null && idx !== highlightedLegIndex) return null;

              const nextControl = courseControlsPx[idx + 1];
              const coords = getLineCoordinates(control, nextControl);
              const isHighlighted = highlightedLegIndex !== null && idx === highlightedLegIndex;

              return (
                <line
                  key={`line-${control.id}-${nextControl.id}`}
                  x1={coords.x1}
                  y1={coords.y1}
                  x2={coords.x2}
                  y2={coords.y2}
                  stroke="#8b5cf6"
                  strokeWidth={isHighlighted ? 4 : 2}
                  filter={isHighlighted ? "url(#white-halo-route)" : undefined}
                  strokeLinecap="round"
                />
              );
            })}

          {Array.from(controlPxMap.values())
            .filter((control) => {
              // When a leg is selected, only show controls for that leg
              if (selectedLeg !== null && fromControlId && toControlId) {
                return control.id === fromControlId || control.id === toControlId;
              }
              // When showing full course (no leg selected), only show course controls
              return courseControlsPx.some((c) => c.id === control.id);
            })
            .map((control) =>
              ControlRenderer.renderControl({
                control,
                courseControls: courseControlsPx,
                courseControlCodes,
                strokeColor: "#8b5cf6",
                showLabel: true,
                maybeGlow: "url(#white-halo-route)",
                controlLabelMap,
                showControlPoint: map?.showControlPoints,
              }),
            )}

          {displayedRoutes.map((route, routeIndex) => {
            const strokeWidth = routeIndex === 0 ? 10 : 8;
            const lineThickness = strokeWidth / 2;
            const arrowSize = routeIndex === 0 ? 2.2 : 2.0;
            const lineOpacity = 1;
            const _teleportOpacity = 0.35;

            // Create lighter version of route color for arrows
            const lightenColor = (hex: string): string => {
              const r = parseInt(hex.slice(1, 3), 16);
              const g = parseInt(hex.slice(3, 5), 16);
              const b = parseInt(hex.slice(5, 7), 16);
              const lighter = (c: number) => Math.min(255, Math.floor(c + (255 - c) * 0.5));
              return `#${lighter(r).toString(16).padStart(2, "0")}${lighter(g).toString(16).padStart(2, "0")}${lighter(
                b,
              )
                .toString(16)
                .padStart(2, "0")}`;
            };
            const arrowColor = lightenColor(route.color);

            // Build polyline segments (non-teleport) and teleport segments separately
            const polylineSegments: Array<{ points: Array<{ x: number; y: number }>; isTeleport: boolean }> = [];
            let currentSegment: Array<{ x: number; y: number }> = [];
            let currentIsIgnoreLength = false;

            for (let i = 0; i < route.path.length; i++) {
              const nodeId = route.path[i];
              const node = findNodePx(nodeId);
              if (!node) continue;

              if (i === 0) {
                currentSegment.push({ x: node.x, y: node.y });
              } else {
                const prevNodeId = route.path[i - 1];
                const edge = edges.find(
                  (e: Edge) =>
                    (e.from === prevNodeId && e.to === nodeId) ||
                    (!e.oneWay && e.from === nodeId && e.to === prevNodeId),
                );
                const isIgnoreLength = edge?.ignoreLength || false;

                if (isIgnoreLength !== currentIsIgnoreLength && currentSegment.length > 0) {
                  polylineSegments.push({ points: [...currentSegment], isTeleport: currentIsIgnoreLength });
                  currentSegment = [currentSegment[currentSegment.length - 1]];
                  currentIsIgnoreLength = isIgnoreLength;
                }
                currentSegment.push({ x: node.x, y: node.y });
              }
            }

            if (currentSegment.length > 0) {
              polylineSegments.push({ points: currentSegment, isTeleport: currentIsIgnoreLength });
            }

            // Calculate total path length and arrow positions along non-ignoreLength segments
            const arrowPositions: Array<{ x: number; y: number; angle: number; dist: number }> = [];
            let totalLength = 0;
            const segmentLengths: number[] = [];

            polylineSegments.forEach((segment) => {
              if (segment.isTeleport) {
                segmentLengths.push(0);
                return;
              }
              let segmentLength = 0;
              for (let i = 0; i < segment.points.length - 1; i++) {
                const dx = segment.points[i + 1].x - segment.points[i].x;
                const dy = segment.points[i + 1].y - segment.points[i].y;
                segmentLength += Math.hypot(dx, dy);
              }
              segmentLengths.push(segmentLength);
              totalLength += segmentLength;
            });

            // Cache route geometry for canvas overlay drawing at 60fps
            tempGeometry.push({ color: route.color, segments: polylineSegments, totalLength, strokeWidth });

            // Distribute arrows evenly along the entire path
            if (totalLength > 0) {
              const numArrows = Math.floor(totalLength / arrowSpacingPx);
              for (let arrowIdx = 0; arrowIdx < numArrows; arrowIdx++) {
                const targetDist = (arrowIdx + 1) * arrowSpacingPx;
                let accumulatedDist = 0;

                for (let segIdx = 0; segIdx < polylineSegments.length; segIdx++) {
                  const segment = polylineSegments[segIdx];
                  if (segment.isTeleport) continue;

                  const segmentLength = segmentLengths[segIdx];
                  if (accumulatedDist + segmentLength >= targetDist) {
                    const distInSegment = targetDist - accumulatedDist;
                    let traveled = 0;

                    for (let i = 0; i < segment.points.length - 1; i++) {
                      const p1 = segment.points[i];
                      const p2 = segment.points[i + 1];
                      const dx = p2.x - p1.x;
                      const dy = p2.y - p1.y;
                      const edgeLength = Math.hypot(dx, dy);

                      if (traveled + edgeLength >= distInSegment) {
                        const t = (distInSegment - traveled) / edgeLength;
                        const x = p1.x + dx * t;
                        const y = p1.y + dy * t;
                        const angle = Math.atan2(dy, dx);
                        arrowPositions.push({ x, y, angle, dist: targetDist });
                        break;
                      }
                      traveled += edgeLength;
                    }
                    break;
                  }
                  accumulatedDist += segmentLength;
                }
              }
            }

            const junctionPoints: Array<{ nodeId: string; node: (Node & { x: number; y: number }) | ControlWithPos; outgoingCount: number }> = [];
            // Use decision point node IDs from the route analysis (matches the count in the route list)
            const decisionPointNodeIdSet = new Set(route.decisionPointNodeIds ?? []);
            const decisionPointNodes: Array<{ nodeId: string; node: (Node & { x: number; y: number }) | ControlWithPos }> = [];
            for (let i = 0; i < route.path.length; i++) {
              const nodeId = route.path[i];
              const node = findNodePx(nodeId);
              if (!node) continue;

              const incomingNodeId = i > 0 ? route.path[i - 1] : null;
              const outgoingEdges = edges.filter((e: Edge) => {
                if (incomingNodeId && e.to === incomingNodeId) return false;
                return e.from === nodeId;
              });
              if (outgoingEdges.length > 1) {
                junctionPoints.push({ nodeId, node, outgoingCount: outgoingEdges.length });
              }

              if (decisionPointNodeIdSet.has(nodeId)) {
                decisionPointNodes.push({ nodeId, node });
              }
            }

            // Playback animation: compute play position AND rendered path segments
            let playCircle: React.ReactNode | null = null;
            let currentPathEndIndex = polylineSegments.length; // Default calculate all
            let lastSegmentCutoff: { points: Array<{ x: number; y: number }> } | null = null;
            let playbackPixelsCovered: number | null = null; // Track pixels covered for arrow filtering

            const hasPlaybackState = accumulatedTimeRef.current > 0 || isPlaying || isExportingRef.current;
            if (hasPlaybackState && displayedRoutes.length >= 1 && !canvasPlaybackMode) {
              const speedMps = effectiveRunningSpeed;
              const elapsed = accumulatedTimeRef.current;
              const targetPixels = elapsed * speedMps * pixelsPerMeter;

              // Check if animation is complete
              const isComplete = targetPixels >= maxRoutePixels - 1e-6;
              if (isComplete && !playDoneRef.current) {
                playDoneRef.current = true;
                if (!completionNotifiedRef.current && onPlaybackComplete) {
                  completionNotifiedRef.current = true;
                  onPlaybackComplete();
                }
              }

              let remaining = Math.min(targetPixels, totalLength);
              playbackPixelsCovered = remaining; // Use per-route pixel distance for arrow filtering
              let pos: { x: number; y: number } | null = null;

              // Iterate to find cutoff point
              currentPathEndIndex = 0;
              
              for (let segIdx = 0; segIdx < polylineSegments.length; segIdx++) {
                const seg = polylineSegments[segIdx];
                if (seg.isTeleport) {
                    currentPathEndIndex++; // Always include teleports if we passed them, though they don't render lines
                    continue;
                }
                
                let segmentFound = false;
                for (let i = 0; i < seg.points.length - 1; i++) {
                  const p1 = seg.points[i];
                  const p2 = seg.points[i + 1];
                  const dx = p2.x - p1.x;
                  const dy = p2.y - p1.y;
                  const len = Math.hypot(dx, dy);
                  if (remaining <= len) {
                    const t = len === 0 ? 0 : remaining / len;
                    pos = { x: p1.x + dx * t, y: p1.y + dy * t };
                    
                    // We found the cutoff in this segment!
                    // Construct partial segment points
                    const partialPoints = seg.points.slice(0, i + 1);
                    partialPoints.push(pos);
                    lastSegmentCutoff = { points: partialPoints };
                    
                    currentPathEndIndex = segIdx + 1; // Include this modified segment
                    segmentFound = true;
                    break;
                  }
                  remaining -= len;
                }
                if (segmentFound) break;
                currentPathEndIndex++; // Include this full segment
              }

              // Fallback to end if finished
               if (isComplete || (!pos && targetPixels >= totalLength)) {
                 currentPathEndIndex = polylineSegments.length;
                 lastSegmentCutoff = null; // No cutoff needed
                 playbackPixelsCovered = totalLength; // Show all arrows
                 
                  // Find last pos for circle
                  for (let segIdx = polylineSegments.length - 1; segIdx >= 0; segIdx--) {
                    const seg = polylineSegments[segIdx];
                    if (!seg.isTeleport && seg.points.length > 0) {
                      pos = seg.points[seg.points.length - 1];
                      break;
                    }
                  }
               }

              if (pos) {
                  playPosRef.current = pos;
                  playCircle = (
                    <circle
                      cx={pos.x}
                      cy={pos.y}
                      r={12}
                      fill={route.color}
                      opacity={0.9}
                      filter="url(#white-halo-route)"
                    />
                  );
              }
            }

            return (
              <g key={routeIndex}>
                {polylineSegments.map((segment, segIdx) => {
                  if (segment.points.length < 2 || segment.isTeleport) return null;

                  if (canvasPlaybackMode) {
                    // Canvas handles covered path + runner; SVG shows static faded route
                    const pointsStr = segment.points.map((p) => `${p.x},${p.y}`).join(" ");
                    return (
                      <polyline
                        key={`segment-${segIdx}`}
                        points={pointsStr}
                        stroke={route.color}
                        strokeWidth={strokeWidth}
                        opacity={hasActivePlayback ? 0.15 : lineOpacity}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        fill="none"
                      />
                    );
                  }

                  // SVG path cutoff mode (video export)
                  if (segIdx >= currentPathEndIndex) return null;
                  const pointsToUse = (segIdx === currentPathEndIndex - 1 && lastSegmentCutoff)
                    ? lastSegmentCutoff.points
                    : segment.points;
                  if (pointsToUse.length < 2) return null;
                  const pointsStr = pointsToUse.map((p) => `${p.x},${p.y}`).join(" ");
                  return (
                    <polyline
                      key={`segment-${segIdx}`}
                      points={pointsStr}
                      stroke={route.color}
                      strokeWidth={strokeWidth}
                      opacity={lineOpacity}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      fill="none"
                    />
                  );
                })}

                {arrowPositions.map((arrow, idx) => {
                  // During SVG export mode, filter arrows to covered distance; canvas mode shows all
                  if (!canvasPlaybackMode && playbackPixelsCovered !== null && arrow.dist > playbackPixelsCovered) return null;
                  return (
                    <polygon
                      key={`arrow-${idx}`}
                      points={`${arrow.x},${arrow.y} ${
                        arrow.x - lineThickness * arrowSize * Math.cos(arrow.angle - 0.4)
                      },${arrow.y - lineThickness * arrowSize * Math.sin(arrow.angle - 0.4)} ${
                        arrow.x - lineThickness * arrowSize * Math.cos(arrow.angle + 0.4)
                      },${arrow.y - lineThickness * arrowSize * Math.sin(arrow.angle + 0.4)}`}
                      fill={arrowColor}
                      stroke={arrowColor}
                      strokeWidth={0.5}
                      opacity={1}
                    />
                  );
                })}

                {/* Canvas handles runner in live playback; SVG runner only used during video export */}
                {canvasPlaybackMode ? null : playCircle}

                {/* Decision point markers - only shown when a single route is selected */}
                {showDecisionPoints && selectedRoute !== null && decisionPointNodes.map((dp, idx) => {
                  const r = 8; // Radius of the decision point circle
                  return (
                    <g key={`dp-${idx}`}>
                      <circle
                        cx={dp.node.x}
                        cy={dp.node.y}
                        r={r}
                        fill="white"
                        stroke={route.color}
                        strokeWidth={2}
                        opacity={0.95}
                      />
                      {/* Brain icon: scaled to fit inside the decision point circle */}
                      <g transform={`translate(${dp.node.x - 5}, ${dp.node.y - 5}) scale(0.4167)`}>
                        <path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z" fill="none" stroke={route.color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z" fill="none" stroke={route.color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4" fill="none" stroke={route.color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M17.599 6.5a3 3 0 0 0 .399-1.375" fill="none" stroke={route.color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M6.003 5.125A3 3 0 0 0 6.401 6.5" fill="none" stroke={route.color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M3.477 10.896a4 4 0 0 1 .585-.396" fill="none" stroke={route.color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M19.938 10.5a4 4 0 0 1 .585.396" fill="none" stroke={route.color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M6 18a4 4 0 0 1-1.967-.516" fill="none" stroke={route.color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M19.967 17.484A4 4 0 0 1 18 18" fill="none" stroke={route.color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </g>
                    </g>
                  );
                })}
              </g>
            );
          })}
          {timeOverlay}
        </svg>
      );
      cachedGeometryRef.current = tempGeometry;
      return svgResult;
    };

    // Reset playback when playReset changes or route/leg changes
    const resetKey = `${playReset}:${selectedRoute}:${fromControlId}:${toControlId}`;
    if (lastResetKeyRef.current !== resetKey) {
      lastResetKeyRef.current = resetKey;
      playStartRef.current = null;
      playPosRef.current = null;
      playDoneRef.current = false;
      completionNotifiedRef.current = false;
      accumulatedTimeRef.current = 0;
      // Clear canvas overlay when playback resets
      const c = playbackCanvasRef.current;
      if (c) c.getContext("2d")?.clearRect(0, 0, c.width, c.height);
    }

    return (
      <MapViewer
        pdfUrl={pdfUrl ?? undefined}
        showBackgroundMap={showBackgroundMap}
        backgroundOpacity={backgroundOpacity}
        mapLayout={getActiveMap(selectedEvent ?? undefined, selectedCourseId ?? undefined)?.layout || "horizontal"}
        onControllerReady={handleControllerReady}
      >
        {(state: MapViewerState) => {
          mapStateRef.current = state;

          return (
            <div style={{ position: "absolute", top: 0, left: 0 }}>
              <MapEffects
                controllerRef={controllerRef}
                playPosRef={playPosRef}
                isPlaying={isPlaying}
                followPlayback={followPlayback}
                state={state}
                displayedRoutes={displayedRoutes}
                selectionKey={selectionKey}
                lastSelectionRef={lastSelectionRef}
                nodes={nodes}
                controls={controls}
                fromControlId={fromControlId}
                map={map}
              />
              {renderSvgContent(state, !showBackgroundMap)}
              <canvas
                ref={playbackCanvasRef}
                width={state.pdfDimensions.width}
                height={state.pdfDimensions.height}
                style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none" }}
              />
            </div>
          );
        }}
      </MapViewer>
    );
  },
);

export default memo(RouteAnalysisMapViewer);
