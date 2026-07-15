"use client"

import { useState, useEffect, useRef } from "react";
import dynamic from "next/dynamic"
import { useAppData } from "@indoor-o-route-analysis/ui";
import { getActiveMap } from "@indoor-o-route-analysis/core";
import Model3DPropertiesPanel, { type ModelMistake } from "./properties-panel";
import type { Model3DViewerHandle } from "./viewer-3d";
import type { Model3DMapViewerHandle } from "./map-viewer";
import { findPolygonForPoint } from "@indoor-o-route-analysis/core";
import { mapToWorld } from "@indoor-o-route-analysis/core/3d";

const Model3DMapViewer = dynamic(() => import("./map-viewer"), {
  ssr: false,
  loading: () => <div className="flex-1" />,
});

const Model3DViewer = dynamic(() => import("./viewer-3d"), {
  ssr: false,
  loading: () => <div className="flex-1" />,
});

export default function Model3D() {
  const [selectedPolygonId, setSelectedPolygonId] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [mapScale, setMapScale] = useState<number>(1);
  const [_isLoading, setIsLoading] = useState(true);
  const [frameAllTrigger, setFrameAllTrigger] = useState(false);
  const [show3D, setShow3D] = useState(false);
  const { selectedEvent, pdfBlobUrl, updateEventData, selectedCourseId } = useAppData();
  const viewerRef = useRef<Model3DViewerHandle>(null);
  const mapViewerRef = useRef<Model3DMapViewerHandle>(null);
  const [findings, setFindings] = useState<ModelMistake[]>([]);
  const [verified, setVerified] = useState(false);

  const activeMap = getActiveMap(selectedEvent ?? undefined, selectedCourseId);

  const handleVerify = () => {
    if (!selectedEvent) return;

    // reset findings
    setFindings([]);

    const raceCourse = selectedEvent.raceCourses?.[0];
    const controls = raceCourse?.controls || [];
    const vertices = raceCourse?.vertices || [];
    const polygons = raceCourse?.polygons || [];

    const newFindings: ModelMistake[] = [];

    // Check controls
    controls.forEach((c) => {
      const polygon = findPolygonForPoint(c.mapPosition, polygons);
      if (!polygon) {
        newFindings.push({
          id: c.id,
          type: "control",
          name: c.id,
          point: c.mapPosition,
        });
      }
    });

    // Check nodes (vertices)
    vertices.forEach((v) => {
      const point = {
        x: v.x,
        y: v.y,
        level: 0, // Nodes don't have a level property, default to 0
      };
      const polygon = findPolygonForPoint(point, polygons);
      if (!polygon) {
        newFindings.push({
          id: v.id,
          type: "node",
          point: point,
        });
      }
    });

    setFindings(newFindings);
    setVerified(true);
  };

  const handleNavigate = (point: { x: number; y: number }) => {
    mapViewerRef.current?.flyTo(point);
  };

  // Load map from selectedEvent
  useEffect(() => {
    const map = activeMap;

    // Set scale always if map exists
    if (map?.scale) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing local state from context
      setMapScale(map.scale);
    }

    if (pdfBlobUrl) {
      setPdfUrl(pdfBlobUrl);
      setIsLoading(false);
      return;
    }

    if (!map) {
      setPdfUrl(null);
      setIsLoading(false);
      return;
    }

    // Fallback for direct URIs if no binary data loaded
    if (map.image?.url && (map.image.url.startsWith("http") || map.image.url.startsWith("https"))) {
      setPdfUrl(map.image.url);
      setIsLoading(false);
    } else {
      setPdfUrl(null);
      setIsLoading(false);
    }
  }, [activeMap, pdfBlobUrl]);

  const handleFrameAll = () => {
    setFrameAllTrigger(true);
    setTimeout(() => setFrameAllTrigger(false), 100);
  };

  const handleExportPolygonsJson = () => {
    const polygons = selectedEvent?.raceCourses?.[0]?.polygons;
    if (!polygons || polygons.length === 0) {
      alert("No polygons to export");
      return;
    }
    const json = JSON.stringify(polygons, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "polygons.json";
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleImportPolygonsJson = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(e.target?.result as string);
        if (!Array.isArray(parsed)) {
          alert("Invalid format: expected an array of polygons");
          return;
        }
        for (const p of parsed) {
          if (typeof p.id !== "string" || !Array.isArray(p.points) || typeof p.level !== "number") {
            alert("Invalid polygon data: each polygon must have id (string), points (array), and level (number)");
            return;
          }
        }
        if (!selectedEvent?.raceCourses?.[0]) return;
        const updatedRaceCourses = selectedEvent.raceCourses.map((rc, i) =>
          i === 0 ? { ...rc, polygons: parsed } : rc
        );
        updateEventData(selectedEvent.id, { raceCourses: updatedRaceCourses });
      } catch {
        alert("Failed to parse JSON file");
      }
    };
    reader.readAsText(file);
  };

  const handleExport = () => {
    const polygons = selectedEvent?.raceCourses?.[0]?.polygons;
    if (!polygons || polygons.length === 0) {
      alert("No polygons to export");
      return;
    }

    // Export to OBJ format
    let objContent = "# Indoor Orienteering 3D Model\n";
    objContent += "mtllib model.mtl\n\n";

    if (!activeMap) {
      alert("No map data for export");
      return;
    }

    // We need vertices counter global for obj
    let vertexTotalIndex = 1;

    polygons.forEach((polygon, polyIndex) => {
      objContent += `# Polygon ${polyIndex + 1}\n`;
      objContent += `o Polygon_${polyIndex + 1}\n`;

      // Write vertices with origin transformation
      polygon.points.forEach((p) => {
        const wp = mapToWorld(p, polygon, activeMap);
        objContent += `v ${wp.x} ${wp.y} ${wp.z ?? 0}\n`;
      });

      // Write texture coordinates (if applicable)
      objContent += `vt 0 0\n`;
      objContent += `vt 1 0\n`;
      objContent += `vt 1 1\n`;
      objContent += `vt 0 1\n`;

      // Write faces (triangulate polygon)
      // Note: This simple fan triangulation assumes convex polygons
      // For concave polygons, consider using a proper triangulation library
      for (let i = 1; i < polygon.points.length - 1; i++) {
        objContent += `f ${vertexTotalIndex} ${vertexTotalIndex + i} ${vertexTotalIndex + i + 1}\n`;
      }

      vertexTotalIndex += polygon.points.length;
      objContent += "\n";
    });

    // Create and download OBJ file
    const objBlob = new Blob([objContent], { type: "text/plain" });
    const objUrl = URL.createObjectURL(objBlob);
    const objLink = document.createElement("a");
    objLink.href = objUrl;
    objLink.download = "model.obj";
    objLink.click();
    URL.revokeObjectURL(objUrl);

    // Export texture if available
    if (pdfUrl) {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = pdfUrl;
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0);
          canvas.toBlob((blob) => {
            if (blob) {
              const url = URL.createObjectURL(blob);
              const link = document.createElement("a");
              link.href = url;
              link.download = "texture.png";
              link.click();
              URL.revokeObjectURL(url);
            }
          }, "image/png");
        }
      };
    }
  };

  return (
    <div className="flex flex-1 overflow-hidden h-full">
      {/* Main View Split Panel */}
      <div className="flex flex-1 overflow-hidden h-full">
        {/* Left Panel - Map View */}
        <div className="flex-1 overflow-hidden border-r h-full">
          <Model3DMapViewer
            ref={mapViewerRef}
            map={activeMap}
            pdfUrl={pdfUrl}
            scale={mapScale}
            selectedPolygonId={selectedPolygonId}
            onSelectPolygon={setSelectedPolygonId}
          />
        </div>

        {/* Right Panel - 3D View */}
        {show3D && (
          <div className="flex-1 overflow-hidden h-full">
            <Model3DViewer
              ref={viewerRef}
              pdfUrl={pdfUrl}
              scale={mapScale}
              onFrameAllTrigger={frameAllTrigger}
              polygonOpacity={0.9}
            />
          </div>
        )}
      </div>

      {/* Properties Panel */}
      <Model3DPropertiesPanel
        selectedPolygonId={selectedPolygonId}
        onSelectPolygon={setSelectedPolygonId}
        onFrameAll={handleFrameAll}
        onExport={handleExport}
        onExportPolygonsJson={handleExportPolygonsJson}
        onImportPolygonsJson={handleImportPolygonsJson}
        onVerify={handleVerify}
        findings={findings}
        verified={verified}
        onNavigate={handleNavigate}
        show3D={show3D}
        onShow3DChange={setShow3D}
      />
    </div>
  );
}
