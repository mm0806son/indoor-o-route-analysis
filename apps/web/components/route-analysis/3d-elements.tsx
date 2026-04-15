
import { useRef, useEffect, useMemo } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Polygon, Node, Edge } from "@indoor-o-route-analysis/core";
import { edgeKey } from "@indoor-o-route-analysis/core";
import type { MapData } from "@indoor-o-route-analysis/core";
import { 
  findPolygonForPoint, 
  isPointInPolygon, 
  ROUTE_HEIGHT_OFFSET 
} from "@indoor-o-route-analysis/core";
import { mapToWorld, worldToVector3 } from "@indoor-o-route-analysis/core";

/** Radial segments around the tube cross-section (higher = smoother circle). */
const TUBE_RADIAL_SEGMENTS = 12;

export interface RouteSegment {
  points: { x: number; y: number; level?: number }[];
  isTeleport: boolean;
  isIgnoreLength?: boolean;
  color?: string;
}

export type TimingScheduleEntry = { distMeters: number; timeSec: number };

/**
 * Given a time value and a timing schedule, compute the route progress (0..1)
 * using piecewise-linear interpolation.
 */
function getProgressFromSchedule(time: number, schedule: TimingScheduleEntry[]): number {
  if (schedule.length < 2) return 0;
  const totalDist = schedule[schedule.length - 1].distMeters;
  const totalTime = schedule[schedule.length - 1].timeSec;
  if (totalTime <= 0 || totalDist <= 0) return 1;
  if (time >= totalTime) return 1;
  if (time <= 0) return 0;

  // Find which segment of the schedule we're in
  let distAtTime = 0;
  for (let i = 0; i < schedule.length - 1; i++) {
    const s0 = schedule[i];
    const s1 = schedule[i + 1];
    if (time >= s0.timeSec && time <= s1.timeSec) {
      const segDuration = s1.timeSec - s0.timeSec;
      const frac = segDuration > 0 ? (time - s0.timeSec) / segDuration : 0;
      distAtTime = s0.distMeters + frac * (s1.distMeters - s0.distMeters);
      break;
    }
  }
  return Math.min(distAtTime / totalDist, 1.0);
}

export const ControlCylinder = ({ position }: { position: [number, number, number] }) => {
  const shape = useMemo(() => {
    const s = new THREE.Shape();
    s.arc(0, 0, 1, 0, Math.PI * 2, false);
    const hole = new THREE.Path();
    hole.arc(0, 0, 0.9, 0, Math.PI * 2, true);
    s.holes.push(hole);
    return s;
  }, []);

  const extrudeSettings = useMemo(
    () => ({
      depth: 0.5, // 0.5m high
      bevelEnabled: false,
      curveSegments: 64,
    }),
    []
  );

  return (
    <mesh position={position}>
      <extrudeGeometry args={[shape, extrudeSettings]} />
      <meshStandardMaterial
        color="#8b5cf6"
        metalness={0.2}
        roughness={0.3}
        emissive="#8b5cf6"
        emissiveIntensity={0.4}
      />
    </mesh>
  );
};

const SinglePlaybackMarker = ({
  routeSegments,
  isPlaying,
  levelPolygons,
  mapData,
  color,
  activeElevationRef,
  hideUpperLevels = false,
  followPlayback = false,
  playbackSpeed = 4,
  baseSpeed = 3,
  manualTime = null,
  timingSchedule,
}: {
  routeSegments: RouteSegment[];
  isPlaying: boolean;
  levelPolygons: Polygon[];
  mapData: MapData;
  color: string;
  activeElevationRef?: React.MutableRefObject<number>;
  hideUpperLevels?: boolean;
  followPlayback?: boolean;
  playbackSpeed?: number;
  baseSpeed?: number;
  manualTime?: number | null;
  timingSchedule?: TimingScheduleEntry[];
}) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const startTime = useRef<number | null>(null);
  const elapsedBeforePauseRef = useRef<number>(0);

  const { camera, controls } = useThree(); // Get camera and controls

  useEffect(() => {
    if (isPlaying && manualTime === null) {
      // Resume from where we paused (or from a seek position)
      startTime.current = performance.now() - elapsedBeforePauseRef.current * 1000;
    } else {
      // Pause: save elapsed wall-clock time
      if (startTime.current !== null) {
        elapsedBeforePauseRef.current = (performance.now() - startTime.current) / 1000;
      }
      // If a seek position is set, use it as the resume offset
      if (manualTime !== null) {
        elapsedBeforePauseRef.current = manualTime;
      }
      startTime.current = null;
    }
  }, [isPlaying, manualTime]);

  // Pre-calculate 3D segments and curves
  const processedSegments = useMemo(() => {
    return routeSegments
      .map((segment) => {
        const polygonElevations: number[] = [];
        const points3D: THREE.Vector3[] = segment.points.map((p) => {
          const polygon = findPolygonForPoint(p, levelPolygons);
          const level = p.level !== undefined ? p.level : polygon ? polygon.level : 0;
          const elevation = polygon?.elevation ?? (level * 3.0);
          polygonElevations.push(elevation);

          const wp = mapToWorld(p, polygon || { id: '', points: [], level, origin: { x: 0, y: 0 } }, mapData);
          return worldToVector3({ ...wp, z: elevation + ROUTE_HEIGHT_OFFSET });
        });

        // We need at least 2 points for a curve
        if (points3D.length < 2) return null;

        const curve = new THREE.CatmullRomCurve3(points3D);
        const length = curve.getLength();

        return {
          curve,
          length,
          isIgnoreLength: segment.isIgnoreLength,
          points: points3D,
          pointElevations: polygonElevations, // Store elevations
        };
      })
      .filter((s): s is NonNullable<typeof s> => s !== null);
  }, [routeSegments, levelPolygons, mapData]);

  // Calculate total runnable length (excluding ignoreLength edges)
  const totalRunnableLength = useMemo(() => {
    return processedSegments.reduce((sum, seg) => (seg.isIgnoreLength ? sum : sum + seg.length), 0);
  }, [processedSegments]);

  useFrame(() => {
    if ((!isPlaying && manualTime === null) || !meshRef.current || processedSegments.length === 0) return;

    let distance = 0;

    if (timingSchedule && timingSchedule.length >= 2) {
      // Use timing schedule for piecewise-linear interpolation
      let scheduleTime: number;
      if (manualTime !== null) {
        scheduleTime = manualTime;
      } else if (startTime.current) {
        const elapsed = (performance.now() - startTime.current) / 1000;
        scheduleTime = elapsed * playbackSpeed;
      } else {
        return;
      }
      const progress = getProgressFromSchedule(scheduleTime, timingSchedule);
      distance = progress * totalRunnableLength;
    } else {
      // Constant speed fallback
      const speedMps = baseSpeed;
      if (manualTime !== null) {
        distance = manualTime * speedMps * playbackSpeed;
      } else if (startTime.current) {
        const elapsed = (performance.now() - startTime.current) / 1000;
        distance = elapsed * speedMps * playbackSpeed;
      } else {
        return;
      }
    }

    // Clamp distance to total length
    if (distance >= totalRunnableLength) {
      distance = totalRunnableLength;
    }

    let remainingDist = distance;
    let targetPoint: THREE.Vector3 | null = null;
    let targetElevation: number | null = null;
    let segmentFound = false;

    // Find current position
    for (let i = 0; i < processedSegments.length; i++) {
      const seg = processedSegments[i];

      if (seg.isIgnoreLength) continue;

      if (remainingDist <= seg.length) {
        // We are inside this segment
        const t = remainingDist / seg.length;
        targetPoint = seg.curve.getPointAt(t);
        targetElevation = targetPoint.z - ROUTE_HEIGHT_OFFSET;
        segmentFound = true;
        break;
      } else {
        remainingDist -= seg.length;
      }
    }

    // If we passed all segments (due to float precision or exact finish), snap to last point
    if (!segmentFound && processedSegments.length > 0) {
      // Find last non-ignoreLength segment to stick to
      for (let i = processedSegments.length - 1; i >= 0; i--) {
        if (!processedSegments[i].isIgnoreLength) {
          const pts = processedSegments[i].points;
          targetPoint = pts[pts.length - 1];
          targetElevation = processedSegments[i].pointElevations[pts.length - 1];
          break;
        }
      }
      // Fallback for weird edge case
      if (!targetPoint) {
        const last = processedSegments[processedSegments.length - 1];
        targetPoint = last.points[last.points.length - 1];
        targetElevation = last.pointElevations[last.pointElevations.length - 1];
      }
    }

    if (targetPoint) {
      meshRef.current.position.copy(targetPoint);

      // Update active level ref if reporting is enabled
      if (activeElevationRef && hideUpperLevels && targetElevation !== null) {
        activeElevationRef.current = targetElevation;
      }

      // Camera follow logic
      if (followPlayback && (isPlaying || manualTime !== null)) {
        const orbitControls = controls as { target: THREE.Vector3; update: () => void } | null;
        if (orbitControls && orbitControls.target) {
            const currentTarget = orbitControls.target.clone();
            const currentOffset = camera.position.clone().sub(currentTarget);
            
            if (manualTime !== null) {
                // Instant snap for export
                orbitControls.target.copy(targetPoint);
                camera.position.copy(targetPoint.clone().add(currentOffset));
                orbitControls.update();
            } else {
                // Smooth follow for playback
                const lerpedTarget = currentTarget.clone().lerp(targetPoint, 0.1);
                
                orbitControls.target.copy(lerpedTarget);
                camera.position.copy(lerpedTarget.clone().add(currentOffset));
                orbitControls.update();
            }
        } else {
             // Fallback if no controls or controls.target
             const cameraOffset = new THREE.Vector3(10, -10, 15);
             const idealPos = targetPoint.clone().add(cameraOffset);
             camera.position.lerp(idealPos, 0.1);
             camera.lookAt(targetPoint);
        }
      }
    }
  });

  if (!isPlaying && manualTime === null) return null;

  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[0.5, 32, 32]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.8} roughness={0.1} metalness={0.1} />
    </mesh>
  );
};

export const PlaybackMarker = ({
  segments,
  isPlaying,
  onPlaybackComplete,
  levelPolygons,
  mapData,
  activeElevationRef,
  hideUpperLevels = false,
  followPlayback = false,
  playbackSpeed = 4,
  baseSpeed = 3,
  manualTime = null,
  timingSchedule,
  onTimeUpdate,
  playReset,
}: {
  segments: RouteSegment[];
  isPlaying: boolean;
  onPlaybackComplete?: () => void;
  levelPolygons: Polygon[];
  mapData: MapData;
  activeElevationRef?: React.MutableRefObject<number>;
  hideUpperLevels?: boolean;
  followPlayback?: boolean;
  playbackSpeed?: number;
  baseSpeed?: number;
  manualTime?: number | null;
  timingSchedule?: TimingScheduleEntry[];
  onTimeUpdate?: (currentTime: number, totalTime: number) => void;
  playReset?: number;
}) => {
  // Group segments by color
  const routesByColor = useMemo(() => {
    const groups: Record<string, RouteSegment[]> = {};
    segments.forEach((seg) => {
      const c = seg.color || "#8b5cf6";
      if (!groups[c]) groups[c] = [];
      groups[c].push(seg);
    });
    return groups;
  }, [segments]);
  
  // Calculate total duration for this set of routes (in wall-clock seconds)
  const totalDuration = useMemo(() => {
    if (timingSchedule && timingSchedule.length >= 2) {
      // Use timing schedule's total time, divided by playbackSpeed for wall-clock duration
      return timingSchedule[timingSchedule.length - 1].timeSec / playbackSpeed;
    }

    let maxDuration = 0;
    Object.values(routesByColor).forEach((routeSegs) => {
       let routeLength = 0;
       routeSegs.forEach(seg => {
           if (seg.isIgnoreLength) return;
           // Use CatmullRomCurve3 to match the actual curve lengths used by
           // SinglePlaybackMarker/RouteVisualizerGroup for totalRunnableLength
           const points3D = seg.points.map((p: { x: number; y: number; level?: number }) => {
            const polygon = findPolygonForPoint(p, levelPolygons);
            const level = p.level !== undefined ? p.level : polygon ? polygon.level : 0;
            const z = polygon?.elevation ?? (level * 3.0);
            const wp = mapToWorld(p, polygon || { id: '', points: [], level, origin: { x: 0, y: 0 } }, mapData);
            return worldToVector3({ ...wp, z });
          });
          if (points3D.length >= 2) {
            const curve = new THREE.CatmullRomCurve3(points3D);
            routeLength += curve.getLength();
          }
       });
       const speedMps = baseSpeed || 3;
       const duration = routeLength / (speedMps * playbackSpeed);
       if (duration > maxDuration) maxDuration = duration;
    });
    return maxDuration;
  }, [routesByColor, levelPolygons, mapData, baseSpeed, playbackSpeed, timingSchedule]);
  
  // Time tracking for pause/resume and time reporting
  const startWallClockRef = useRef<number | null>(null);
  const elapsedBeforePauseRef = useRef<number>(0);
  const lastReportRef = useRef<number>(0);

  useEffect(() => {
    if (isPlaying && manualTime === null) {
      startWallClockRef.current = performance.now() - elapsedBeforePauseRef.current * 1000;
    } else {
      if (startWallClockRef.current !== null) {
        elapsedBeforePauseRef.current = (performance.now() - startWallClockRef.current) / 1000;
      }
      if (manualTime !== null) {
        elapsedBeforePauseRef.current = manualTime;
      }
      startWallClockRef.current = null;
    }
  }, [isPlaying, manualTime]);

  useEffect(() => {
    elapsedBeforePauseRef.current = 0;
    startWallClockRef.current = null;
  }, [playReset]);

  useFrame(() => {
    if (!onTimeUpdate) return;
    const now = performance.now();
    if (now - lastReportRef.current < 100) return; // throttle to ~10 Hz
    lastReportRef.current = now;

    let currentTime: number;
    if (manualTime !== null) {
      currentTime = manualTime;
    } else if (isPlaying && startWallClockRef.current !== null) {
      currentTime = (now - startWallClockRef.current) / 1000;
    } else {
      return;
    }

    const clamped = Math.min(currentTime, totalDuration);
    onTimeUpdate(clamped, totalDuration);
  });

  // Track max duration to stop playback
  useEffect(() => {
    if ((!isPlaying && manualTime === null) || !onPlaybackComplete) return;
    if (manualTime !== null) return; // Don't auto-complete in manual mode?

    if (totalDuration === 0) return;

    const timer = setTimeout(() => {
      onPlaybackComplete();
    }, totalDuration * 1000);

    return () => clearTimeout(timer);
  }, [isPlaying, totalDuration, onPlaybackComplete, manualTime]);

  // If manualTime is provided, we render regardless of isPlaying
  if (!isPlaying && manualTime === null) return null;

  return (
    <group>
      {Object.entries(routesByColor).map(([color, routeSegs]) => (
        <SinglePlaybackMarker
          key={`${color}-${playReset ?? 0}`}
          routeSegments={routeSegs}
          isPlaying={isPlaying}
          levelPolygons={levelPolygons}
          mapData={mapData}
          color={color}
          activeElevationRef={activeElevationRef}
          hideUpperLevels={hideUpperLevels}
          followPlayback={followPlayback}
          playbackSpeed={playbackSpeed}
          baseSpeed={baseSpeed}
          manualTime={manualTime}
          timingSchedule={timingSchedule}
        />
      ))}
    </group>
  );
};

const RouteSegmentMesh = ({
  curve,
  color,
  startDist,
  length,
  tubularSegments,
  getDistance,
  isPlaying,
  manualTime,
}: {
  curve: THREE.Curve<THREE.Vector3>;
  color: string;
  startDist: number;
  length: number;
  tubularSegments: number;
  getDistance: () => number;
  isPlaying: boolean;
  manualTime: number | null;
}) => {
  const meshRef = useRef<THREE.Mesh>(null);
  
  // Create geometry once.  tubularSegments is pre-computed by the parent
  // using a global budget so the total allocation across all segments
  // stays within a safe limit (prevents OOM during video export).
  const geometry = useMemo(() => {
    try {
      return new THREE.TubeGeometry(curve, tubularSegments, 0.15, TUBE_RADIAL_SEGMENTS, false);
    } catch {
      // Allocation failed — fall back to a simple thin line (BufferGeometry)
      console.warn('TubeGeometry allocation failed, falling back to line geometry');
      const pts = curve.getPoints(Math.min(tubularSegments, 32));
      return new THREE.BufferGeometry().setFromPoints(pts);
    }
  }, [curve, tubularSegments]);

  useFrame(() => {
    if (!meshRef.current) return;

    if (!isPlaying && manualTime === null) {
      // Show full route when not in playback mode
      meshRef.current.geometry.setDrawRange(0, Infinity);
      meshRef.current.visible = true;
      return;
    }

    const currentDist = getDistance();
    const relDist = currentDist - startDist;

    if (relDist <= 0) {
      // Segment not started
      meshRef.current.visible = false; 
    } else if (relDist >= length) {
      // Segment fully traversed
      meshRef.current.visible = true;
      meshRef.current.geometry.setDrawRange(0, Infinity);
    } else {
      // Segment partially traversed
      meshRef.current.visible = true;
      // Calculate index count
      // geometry.index.count is the total number of indices
      if (meshRef.current.geometry.index) {
        const totalIndices = meshRef.current.geometry.index.count;
        const progress = relDist / length;
        const p = Math.max(0, Math.min(1, progress));
        
        // Snap to ring boundaries for clean rendering.
        // TubeGeometry emits (radialSegments * 6) indices per ring.
        // Using Math.floor ensures the tube never extends beyond the
        // playback sphere position.
        const indicesPerRing = TUBE_RADIAL_SEGMENTS * 6;
        const totalRings = Math.round(totalIndices / indicesPerRing);
        const ringsToDraw = Math.floor(p * totalRings);
        const drawCount = ringsToDraw * indicesPerRing;
        meshRef.current.geometry.setDrawRange(0, drawCount);
      }
    }
  });

  return (
    <mesh ref={meshRef} geometry={geometry}>
      <meshStandardMaterial
        color={color}
        metalness={0.2}
        roughness={0.3}
        emissive={color}
        emissiveIntensity={0.4}
      />
    </mesh>
  );
};

const RouteVisualizerGroup = ({
  routeSegments,
  isPlaying,
  levelPolygons,
  mapData,
  baseSpeed = 3,
  playbackSpeed = 4,
  manualTime = null,
  timingSchedule,
}: {
  routeSegments: RouteSegment[];
  isPlaying: boolean;
  levelPolygons: Polygon[];
  mapData: MapData;
  baseSpeed?: number;
  playbackSpeed?: number;
  manualTime?: number | null;
  timingSchedule?: TimingScheduleEntry[];
}) => {
  const startTime = useRef<number | null>(null);
  
  // Sync start time logic with PlaybackMarker
  useEffect(() => {
    if (isPlaying && manualTime === null) {
      startTime.current = performance.now();
    } else {
      startTime.current = null;
    }
  }, [isPlaying, manualTime]);

  const processedData = useMemo(() => {
    let currentTotalDist = 0;

    // Global budget: keep total tubular segments across ALL RouteSegmentMesh
    // instances in this group within a safe limit.  Each tubular segment ×
    // 5 radial sides generates ~120 bytes of geometry buffers; 4096 total
    // ≈ 500 KB which leaves plenty of headroom during video export.
    const MAX_TOTAL_TUBULAR_SEGMENTS = 16384;
    const PER_SEGMENT_CAP = 512;

    const rawSegments = routeSegments
      .map((segment) => {
        const points3D: THREE.Vector3[] = segment.points.map((p) => {
          const polygon = findPolygonForPoint(p, levelPolygons);
          const level = p.level !== undefined ? p.level : polygon ? polygon.level : 0;
          const z = (polygon?.elevation ?? (level * 3.0)) + ROUTE_HEIGHT_OFFSET;
          const wp = mapToWorld(p, polygon || { id: '', points: [], level, origin: { x: 0, y: 0 } }, mapData);
          return worldToVector3({ ...wp, z });
        });

        if (points3D.length < 2) return null;

        const curve = new THREE.CatmullRomCurve3(points3D);
        const length = curve.getLength();
        
        const startDist = currentTotalDist;
        if (!segment.isIgnoreLength) {
            // eslint-disable-next-line react-hooks/immutability -- running accumulator inside useMemo, not mutating React state
            currentTotalDist += length;
        }

        // Desired tubular segments (before budget scaling)
        const desiredTubular = Math.min(Math.max(Math.ceil(length * 8), 32), PER_SEGMENT_CAP);

        return {
          curve,
          length,
          startDist,
          points3D,
          color: segment.color || "#8b5cf6",
          isIgnoreLength: segment.isIgnoreLength,
          desiredTubular,
        };
      })
      .filter((s): s is NonNullable<typeof s> => s !== null);

    // Apply budget: if the total desired segments exceed the cap, scale down
    // proportionally so each segment gets a fair share of the budget.
    const totalDesired = rawSegments.reduce((sum, s) => sum + s.desiredTubular, 0);
    const budgetScale = totalDesired > MAX_TOTAL_TUBULAR_SEGMENTS
      ? MAX_TOTAL_TUBULAR_SEGMENTS / totalDesired
      : 1;

    const segments = rawSegments.map(s => ({
      ...s,
      tubularSegments: Math.max(16, Math.round(s.desiredTubular * budgetScale)),
    }));

    return { segments, totalLength: currentTotalDist };
  }, [routeSegments, levelPolygons, mapData]);

  const activeDistanceRef = useRef(0);

  useFrame(() => {
    if ((!isPlaying && manualTime === null)) return;

    let distance = 0;

    if (timingSchedule && timingSchedule.length >= 2) {
      // Use timing schedule for piecewise-linear interpolation
      let scheduleTime: number;
      if (manualTime !== null) {
        scheduleTime = manualTime;
      } else if (startTime.current) {
        const elapsed = (performance.now() - startTime.current) / 1000;
        scheduleTime = elapsed * playbackSpeed;
      } else {
        scheduleTime = 0;
      }
      const progress = getProgressFromSchedule(scheduleTime, timingSchedule);
      distance = progress * processedData.totalLength;
    } else {
      // Constant speed fallback
      const speedMps = baseSpeed;
      if (manualTime !== null) {
        distance = manualTime * speedMps * playbackSpeed;
      } else if (startTime.current) {
        const elapsed = (performance.now() - startTime.current) / 1000;
        distance = elapsed * speedMps * playbackSpeed;
      }
    }

    // Clamp distance
    if (distance >= processedData.totalLength) {
      distance = processedData.totalLength;
    }
    
    activeDistanceRef.current = distance;
  });

  const getDistance = () => activeDistanceRef.current;

  return (
    <group>
      {processedData.segments.map((seg, i) => (
        <group key={i}>
            <RouteSegmentMesh
                curve={seg.curve}
                length={seg.length}
                tubularSegments={seg.tubularSegments}
                startDist={seg.startDist}
                color={seg.color}
                getDistance={getDistance}
                isPlaying={isPlaying}
                manualTime={manualTime}
            />
            {/* Control Cylinders */}
            {/* Start Control (only for first segment or if non-contiguous?) 
                Original logic drew cylinder at start of every segment if index==0, 
                and end of segment if index==len-1.
                This assumes one continuous strip. 
                We will preserve that logic relative to the group list. 
             */}
            {i === 0 && (
              <ControlCylinder position={[seg.points3D[0].x, seg.points3D[0].y, seg.points3D[0].z - ROUTE_HEIGHT_OFFSET]} />
            )}
            {i === processedData.segments.length - 1 && (
              <ControlCylinder
                position={[
                  seg.points3D[seg.points3D.length - 1].x,
                  seg.points3D[seg.points3D.length - 1].y,
                  seg.points3D[seg.points3D.length - 1].z - ROUTE_HEIGHT_OFFSET,
                ]}
              />
            )}
        </group>
      ))}
    </group>
  );
};

export function RouteVisualizer({
  segments,
  mapData,
  levelPolygons,
  isPlaying = false,
  manualTime = null,
  playbackSpeed = 4,
  baseSpeed = 3,
  timingSchedule,
}: {
  segments: RouteSegment[];
  mapData: MapData;
  levelPolygons: Polygon[];
  isPlaying?: boolean;
  manualTime?: number | null;
  playbackSpeed?: number;
  baseSpeed?: number;
  timingSchedule?: TimingScheduleEntry[];
}) {

  // Group by color to match PlaybackMarker logic
  const routesByColor = useMemo(() => {
    const groups: Record<string, RouteSegment[]> = {};
    segments.forEach((seg) => {
      const c = seg.color || "#8b5cf6";
      if (!groups[c]) groups[c] = [];
      groups[c].push(seg);
    });
    return groups;
  }, [segments]);

  return (
    <group>
      {Object.entries(routesByColor).map(([color, groupSegments]) => (
        <RouteVisualizerGroup
            key={color}
            routeSegments={groupSegments}
            isPlaying={isPlaying}
            manualTime={manualTime}
            levelPolygons={levelPolygons}
            mapData={mapData}
            playbackSpeed={playbackSpeed}
            baseSpeed={baseSpeed}
            timingSchedule={timingSchedule}
        />
      ))}

      {/* Straight Line from Start to End (Dashed Line) - Logic kept from original */}
      {(() => {
        // We need the first point of the first segment and the last point of the last segment of the PASSED LIST
        // The original logic didn't account for color grouping, it took start of segments[0] and end of segments[last].
        // This likely represents Start->Finish of the whole course leg.
        if (segments.length === 0) return null;

        const startSeg = segments[0];
        const endSeg = segments[segments.length - 1];

        if (startSeg.points.length === 0 || endSeg.points.length === 0) return null;

        const pStart = startSeg.points[0];
        const pEnd = endSeg.points[endSeg.points.length - 1];

        const getPoint3D = (p: { x: number; y: number; level?: number }) => {
          let level = p.level;
          let polygon = undefined;

          if (level === undefined) {
            polygon = levelPolygons.find((poly) => isPointInPolygon(p, poly.points));
            level = polygon ? polygon.level : 0;
          }
          if (!polygon) {
            polygon = levelPolygons.find((poly) => isPointInPolygon(p, poly.points));
          }

          const z = (polygon?.elevation ?? (level * 3.0)) + ROUTE_HEIGHT_OFFSET;
          const wp = mapToWorld(p, polygon || { id: '', points: [], level, origin: { x: 0, y: 0 } }, mapData);
          return worldToVector3({ ...wp, z });
        };

        const start3D = getPoint3D(pStart);
        const end3D = getPoint3D(pEnd);

        const distance = start3D.distanceTo(end3D);
        const direction = new THREE.Vector3().subVectors(end3D, start3D).normalize();

        // Create dashed line
        const DASH_LENGTH = 1.0; // 1 meter dashes
        const GAP_LENGTH = 1.0;
        const dashes = [];

        const orientation = new THREE.Quaternion();
        orientation.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);

        let currentDist = 0;
        let i = 0;
        while (currentDist < distance) {
          const segmentLength = Math.min(DASH_LENGTH, distance - currentDist);

          // Calculate center of this dash segment
          const centerOffset = currentDist + segmentLength / 2;
          const center = new THREE.Vector3().copy(start3D).add(direction.clone().multiplyScalar(centerOffset));

          dashes.push(
            <mesh key={i} position={center} quaternion={orientation}>
              <cylinderGeometry args={[0.2, 0.2, segmentLength, 8]} />
              <meshStandardMaterial
                color="#8b5cf6"
                metalness={0.2}
                roughness={0.3}
                emissive="#8b5cf6"
                emissiveIntensity={0.4}
              />
            </mesh>,
          );

          currentDist += segmentLength + GAP_LENGTH;
          i++;
        }

        return <group>{dashes}</group>;
      })()}
    </group>
  );
}

export const GraphVisualizer = ({
  nodes,
  edges,
  levelPolygons,
  mapData,
}: {
  nodes: Node[];
  edges: Edge[];
  levelPolygons: Polygon[];
  mapData: MapData;
}) => {
  const getPoint3D = (p: { x: number; y: number }) => {
    const polygon = levelPolygons.find((poly) => isPointInPolygon(p, poly.points));
    const level = polygon ? polygon.level : 0;
    const z = (polygon?.elevation ?? (level * 3.0)) + ROUTE_HEIGHT_OFFSET;
    const wp = mapToWorld(p, polygon || { id: '', points: [], level, origin: { x: 0, y: 0 } }, mapData);
    return worldToVector3({ ...wp, z });
  };

  return (
    <group>
      {/* Nodes */}
      {nodes.map((node) => {
        const p = getPoint3D(node);
        return (
          <mesh key={`node-${node.id}`} position={p}>
            <sphereGeometry args={[0.2, 16, 16]} />
            <meshStandardMaterial color="#888888" />
          </mesh>
        );
      })}

      {/* Edges */}
      {edges.map((edge) => {
        if (edge.ignoreLength) return null;

        const n1 = nodes.find((n) => n.id === edge.from);
        const n2 = nodes.find((n) => n.id === edge.to);
        if (!n1 || !n2) return null;

        const p1 = getPoint3D(n1);
        const p2 = getPoint3D(n2);

        const curve = new THREE.LineCurve3(p1, p2);
        const tubeGeometry = new THREE.TubeGeometry(curve, 1, 0.1, 8, false);

        return (
          <mesh key={`edge-${edgeKey(edge)}`} geometry={tubeGeometry}>
            <meshStandardMaterial color="#888888" />
          </mesh>
        );
      })}
    </group>
  );
};
