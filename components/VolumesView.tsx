import React, { useMemo, useRef, useState, useEffect, useCallback, useLayoutEffect, useImperativeHandle, forwardRef } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Grid, PerspectiveCamera, OrthographicCamera, GizmoHelper, GizmoViewport, Text, Edges, Html, Line } from '@react-three/drei';
import * as THREE from 'three';
import { OBJExporter } from 'three-stdlib';
import { Room, Floor, ZoneColor, VerticalConnection, ZONE_COLORS, AppSettings, DiagramStyle } from '../types';
import { Maximize } from 'lucide-react';

interface VolumesViewProps {
    rooms: Room[];
    floors: Floor[];
    verticalConnections: VerticalConnection[];
    zoneColors: Record<string, ZoneColor>;
    pixelsPerMeter: number;
    connectionSourceId: string | null;
    onLinkToggle: (roomId: string) => void;
    appSettings: AppSettings;
    diagramStyle: DiagramStyle;
    selectedRoomIds: Set<string>;
    onRoomSelect: (id: string | null, multi: boolean) => void;
    darkMode: boolean;
    gridSize: number;
    viewState: {
        cameraPosition: [number, number, number];
        target: [number, number, number];
        zoom: number;
        viewType: 'perspective' | 'isometric';
        hasInitialZoomed: boolean;
    };
    onViewStateChange: (updates: Partial<VolumesViewProps['viewState']>, incrementVersion?: boolean) => void;
    cameraVersion: number;
    active: boolean;
    floorGap: number;
    hiddenFloorIds: Set<number>;
    showLabels: boolean;
    labelFontSize: number;
}

export interface VolumesViewHandle {
    exportOBJ: () => Blob | null;
    captureScreenshot: () => Promise<Blob | null>;
}

const HEIGHT_SCALE = 2; // 1m = 2 units (consistent with horizontal scale of 20px/m / 10)

function RoomVolume({ room, floors, zoneColors, isSelected, isLinkingSource, onSelect, appSettings, diagramStyle, darkMode, floorGap, showLabels, labelFontSize }: {
    room: Room;
    floors: Floor[];
    zoneColors: Record<string, ZoneColor>;
    isSelected: boolean;
    isLinkingSource: boolean;
    onSelect: () => void;
    appSettings: AppSettings;
    diagramStyle: DiagramStyle;
    darkMode: boolean;
    floorGap: number;
    showLabels: boolean;
    labelFontSize: number;
}) {
    const color = useMemo(() => {
        const style = zoneColors[room.zone];
        if (style?.bg) {
            const match = style.bg.match(/\[(#[0-9a-fA-F]{6})\]/);
            if (match) return match[1];
        }

        if (room.zone === 'Public') return '#fb923c';
        if (room.zone === 'Private') return '#60a5fa';
        if (room.zone === 'Service') return '#94a3b8';
        if (room.zone === 'Circulation') return '#facc15';
        if (room.zone === 'Outdoor') return '#4ade80';
        if (room.zone === 'Admin') return '#c084fc';
        return '#e2e8f0';
    }, [room.zone, zoneColors]);

    const floor = floors.find(f => f.id === room.floor);
    const heightInMeters = room.depth || floor?.height || 3;
    const heightIn3D = heightInMeters * HEIGHT_SCALE;

    // Calculate cumulative floor Y position
    const yFloor = useMemo(() => {
        let y = 0;
        // Sort floors by ID to calculate cumulative height correctly from bottom up
        const sortedFloors = [...floors].sort((a, b) => a.id - b.id);
        for (const f of sortedFloors) {
            if (f.id < room.floor) {
                y += (f.height * HEIGHT_SCALE) + floorGap;
            }
        }
        return y;
    }, [floors, room.floor, floorGap]);

    // Calculate centroid for label positioning
    const centroid = useMemo(() => {
        if (room.shape === 'rect' || !room.shape) return { x: 0, y: 0 };
        const pts = room.polygon || [];
        if (pts.length === 0) return { x: 0, y: 0 };
        let cx = 0, cy = 0;
        pts.forEach(p => { cx += p.x; cy += p.y; });
        return { x: cx / pts.length, y: cy / pts.length };
    }, [room.shape, room.polygon]);

    // Create Shape for Extrusion
    const shape = useMemo(() => {
        const s = new THREE.Shape();
        if (room.shape === 'rect' || !room.shape) {
            const w = Math.max(0.01, (room.width || 0) / 10); // Ensure non-zero width
            const d = Math.max(0.01, (room.height || 0) / 10); // Ensure non-zero height
            s.moveTo(-w / 2, -d / 2);
            s.lineTo(w / 2, -d / 2);
            s.lineTo(w / 2, d / 2);
            s.lineTo(-w / 2, d / 2);
            s.closePath();
        } else if (room.shape === 'polygon' || room.shape === 'bubble') {
            const pts = room.polygon || [];
            // Validate points to prevent NaN crashes
            if (pts.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return null;

            if (pts.length > 2) {
                if (room.shape === 'polygon') {
                    s.moveTo(pts[0].x / 10, -pts[0].y / 10);
                    for (let i = 1; i < pts.length; i++) {
                        s.lineTo(pts[i].x / 10, -pts[i].y / 10);
                    }
                } else if (room.shape === 'bubble') {
                    // Smooth bubble path logic
                    for (let i = 0; i < pts.length; i++) {
                        const p1 = pts[i];
                        const p2 = pts[(i + 1) % pts.length];
                        const p3 = pts[(i + 2) % pts.length];
                        const p0 = pts[(i - 1 + pts.length) % pts.length];

                        const cp1x = p1.x + (p2.x - p0.x) / 6;
                        const cp1y = p1.y + (p2.y - p0.y) / 6;
                        const cp2x = p2.x - (p3.x - p1.x) / 6;
                        const cp2y = p2.y - (p3.y - p1.y) / 6;

                        if (i === 0) s.moveTo(p1.x / 10, -p1.y / 10);

                        s.bezierCurveTo(
                            cp1x / 10, -cp1y / 10,
                            cp2x / 10, -cp2y / 10,
                            p2.x / 10, -p2.y / 10
                        );
                    }
                }
                s.closePath();
            }
        }
        return s;
    }, [room.shape, room.polygon, room.width, room.height]);

    if (!shape) return null;

    // Position calculation
    let posX = (room.x || 0) / 10;
    let posY = -((room.y || 0) / 10);

    if (room.shape === 'rect' || !room.shape) {
        posX += (room.width / 10) / 2;
        posY -= (room.height / 10) / 2;
    }

    // Safety check: Do not render invalid polygons/bubbles to prevent ExtrudeGeometry crashes
    if ((room.shape === 'polygon' || room.shape === 'bubble') && (!room.polygon || room.polygon.length < 3)) {
        return null;
    }

    return (
        <group
            position={[posX, posY, yFloor]}
            rotation={[0, 0, -(room.rotation || 0) * Math.PI / 180]}
            onClick={(e) => { e.stopPropagation(); onSelect(); }}
        >
            <mesh>
                <extrudeGeometry args={[shape, { depth: heightIn3D, bevelEnabled: false }]} />
                <meshStandardMaterial
                    color={isLinkingSource ? '#f59e0b' : color}
                    transparent
                    opacity={isSelected ? 0.9 : 0.6}
                    roughness={0.2}
                    metalness={0.1}
                />
                <Edges color={isSelected || isLinkingSource ? "#f59e0b" : "white"} threshold={15} />
            </mesh>

            {/* Projected Label - Billboard Style */}
            {showLabels && (
                <Html
                position={[centroid.x / 10, -centroid.y / 10, heightIn3D + 2]}
                center
                pointerEvents="none"
            >
                <div
                    className={`flex flex-col items-center justify-center text-center select-none ${diagramStyle.fontFamily}`}
                    style={{
                        color: isSelected ? '#f97316' : darkMode ? '#fff' : '#000',
                        fontSize: `${labelFontSize}px`,
                        fontWeight: 'bold',
                        minWidth: '80px',
                        filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.4))',
                        background: darkMode ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.7)',
                        backdropFilter: 'blur(8px)',
                        padding: '3px 8px',
                        borderRadius: '6px',
                        border: isSelected ? '1.5px solid #f97316' : darkMode ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.05)',
                        transform: 'translateY(-100%)'
                    }}
                >
                    <div className="leading-tight whitespace-nowrap">{room.name}</div>
                    <div className="text-[0.8em] opacity-80 font-mono tracking-tighter mt-0.5">{Math.round(room.area)}m²</div>
                </div>
            </Html>
            )}
        </group>
    );
}

function FloorPlane({ floor, floors, darkMode, gridSize, floorGap }: { floor: Floor, floors: Floor[], darkMode: boolean, gridSize: number, floorGap: number }) {
    const y = useMemo(() => {
        let totalY = 0;
        const sortedFloors = [...floors].sort((a, b) => a.id - b.id);
        for (const f of sortedFloors) {
            if (f.id < floor.id) {
                totalY += (f.height * HEIGHT_SCALE) + floorGap;
            }
        }
        return totalY;
    }, [floors, floor.id, floorGap]);

    // Only render grid for ground floor
    if (floor.id !== 0) return null;

    // 1m = 2 units (since height 10 = 5m). 
    // If gridSize is 2m, sectionSize should be 4 units.
    const sectionSizeValue = gridSize * 2;

    return (
        <group position={[0, 0, y - 0.05]} rotation={[Math.PI / 2, 0, 0]} userData={{ isGrid: true }}>
            <Grid
                args={[100, 100]}
                sectionSize={sectionSizeValue}
                sectionColor={darkMode ? "#1e293b" : "#cbd5e1"}
                cellSize={0}
                infiniteGrid={false}
                fadeDistance={100}
                sectionThickness={1.5}
            />
        </group>
    );
}

function VerticalLink({ conn, rooms, floors, darkMode, floorGap }: { conn: VerticalConnection; rooms: Room[]; floors: Floor[]; darkMode: boolean; floorGap: number }) {
    const fromRoom = rooms.find(r => r.id === conn.fromId);
    const toRoom = rooms.find(r => r.id === conn.toId);

    if (!fromRoom || !toRoom) return null;

    const getCenter = (room: Room) => {
        const floor = floors.find(f => f.id === room.floor);
        const h = (room.depth || floor?.height || 3) * HEIGHT_SCALE;

        let yBase = 0;
        const sortedFloors = [...floors].sort((a, b) => a.id - b.id);
        for (const f of sortedFloors) {
            if (f.id < room.floor) {
                yBase += (f.height * HEIGHT_SCALE) + floorGap;
            }
        }

        if (room.shape === 'rect' || !room.shape) {
            return [
                (room.x + room.width / 2) / 10,
                -((room.y + room.height / 2) / 10),
                yBase + (h / 2)
            ] as [number, number, number];
        } else {
            const pts = room.polygon || [];
            if (pts.length === 0) return [(room.x + room.width / 2) / 10, -((room.y + room.height / 2) / 10), yBase + (h / 2)] as [number, number, number];
            let cx = 0, cy = 0;
            pts.forEach(p => { cx += p.x; cy += p.y; });
            cx /= pts.length;
            cy /= pts.length;

            const angleRad = (room.rotation || 0) * Math.PI / 180;
            const cos = Math.cos(angleRad);
            const sin = Math.sin(angleRad);
            const rx = cx * cos - cy * sin;
            const ry = cx * sin + cy * cos;
            return [
                (room.x + rx) / 10,
                -((room.y + ry) / 10),
                yBase + (h / 2)
            ] as [number, number, number];
        }
    };

    const p1 = getCenter(fromRoom);
    const p2 = getCenter(toRoom);

    // Safety check for NaN coordinates
    if (!p1 || !p2 || p1.some(v => !Number.isFinite(v)) || p2.some(v => !Number.isFinite(v))) return null;

    return (
        <Line
            points={[p1, p2]}
            color={darkMode ? "#fb923c" : "#f97316"}
            lineWidth={3}
            transparent
            opacity={0.6}
            dashed={false}
        />
    );
}

// Camera control helper
function CameraController({ zoomTrigger, placedRooms, floors, onFitComplete, floorGap }: { zoomTrigger: number, placedRooms: Room[], floors: Floor[], onFitComplete?: (pos: THREE.Vector3, target: THREE.Vector3, zoom: number) => void, floorGap: number }) {
    const { camera, controls, size } = useThree();

    useEffect(() => {
        if (zoomTrigger === 0) return;

        const box = new THREE.Box3();
        if (placedRooms.length === 0) {
            box.setFromCenterAndSize(new THREE.Vector3(0, 0, 0), new THREE.Vector3(200, 200, 200));
        } else {
            placedRooms.forEach(room => {
                const floor = floors.find(f => f.id === room.floor);
                const rH = (room.depth || floor?.height || 3) * HEIGHT_SCALE;

                let yBase = 0;
                const sortedFloors = [...floors].sort((a, b) => a.id - b.id);
                for (const f of sortedFloors) {
                    if (f.id < room.floor) {
                        yBase += (f.height * HEIGHT_SCALE) + floorGap;
                    }
                }

                if (room.shape === 'rect' || !room.shape) {
                    const x = (room.x || 0) / 10;
                    const y = -((room.y || 0) / 10);
                    const w = (room.width || 1) / 10;
                    const d = (room.height || 1) / 10;
                    // Y is inverted, so "top" in canvas (low Y) is high Y in 3D.
                    // Top-Left (x, y) -> (x, -y).
                    // Bottom-Right (x+w, y+h) -> (x+w, -(y+h)).
                    // Box needs min/max.
                    box.expandByPoint(new THREE.Vector3(x, y, yBase));
                    box.expandByPoint(new THREE.Vector3(x + w, y - d, yBase + rH));
                } else {
                    const pts = room.polygon || [];
                    pts.forEach(p => {
                        if (Number.isFinite(p.x) && Number.isFinite(p.y)) {
                            box.expandByPoint(new THREE.Vector3(((room.x || 0) + p.x) / 10, -(((room.y || 0) + p.y) / 10), yBase));
                            box.expandByPoint(new THREE.Vector3(((room.x || 0) + p.x) / 10, -(((room.y || 0) + p.y) / 10), yBase + rH));
                        }
                    });
                }
            });
        }

        // Safety check: If box is empty (e.g. only invalid polygons), set a default size to prevent NaN/Infinity
        if (box.isEmpty()) {
            box.setFromCenterAndSize(new THREE.Vector3(0, 0, 0), new THREE.Vector3(100, 100, 100));
        }

        const center = new THREE.Vector3();
        box.getCenter(center);
        const boxSize = new THREE.Vector3();
        box.getSize(boxSize);
        const maxDim = Math.max(boxSize.x, boxSize.y, boxSize.z, 1); // Ensure min size > 0

        const distance = maxDim * 2;

        // Preserve current orientation
        const currentDir = new THREE.Vector3();
        if (controls) {
            currentDir.subVectors(camera.position, (controls as any).target).normalize();
        } else {
            camera.getWorldDirection(currentDir).negate();
        }

        // Fallback to default orientation if current direction is invalid (e.g. zero length)
        if (currentDir.lengthSq() < 0.0001) currentDir.set(1, -1, 1).normalize();

        const offset = currentDir.multiplyScalar(distance);
        const newPos = center.clone().add(offset);

        camera.position.copy(newPos);
        camera.lookAt(center);

        // Reset zoom for orthographic camera to ensure it fits
        if (camera.type === 'OrthographicCamera') {
            // Calculate zoom to fit the object within the canvas dimensions
            // padding factor (1.5 = 150% of object size)
            const padding = 1.5;
            const minCanvasDim = Math.min(size.width || 1, size.height || 1);
            const safeMaxDim = Math.max(maxDim, 1);

            let newZoom = minCanvasDim / (safeMaxDim * padding);
            if (!Number.isFinite(newZoom) || newZoom <= 0) newZoom = 1;
            (camera as THREE.OrthographicCamera).zoom = newZoom;
            camera.updateProjectionMatrix();
        }

        if (controls) {
            (controls as any).target.copy(center);
            (controls as any).update();
        }

        if (onFitComplete && Number.isFinite(center.x) && Number.isFinite(center.y) && Number.isFinite(center.z)) {
            onFitComplete(camera.position, center, camera.zoom);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [zoomTrigger, floorGap]);

    return null;
}

function ViewStateTracker({ onUpdate, isInteracting }: { onUpdate: (pos: THREE.Vector3, target: THREE.Vector3, zoom: number) => void, isInteracting: React.MutableRefObject<boolean> }) {
    const { camera, controls } = useThree();
    const onUpdateRef = useRef(onUpdate);
    onUpdateRef.current = onUpdate;

    useEffect(() => {
        const ctrl = controls as any;
        if (!ctrl) return;

        const onStart = () => {
            isInteracting.current = true;
        };

        // Use 'end' event instead of 'change' to avoid re-rendering parent on every frame of drag
        const onEnd = () => {
            isInteracting.current = false;
            onUpdateRef.current(camera.position, ctrl.target, camera.zoom);
        };

        ctrl.addEventListener('start', onStart);
        ctrl.addEventListener('end', onEnd);
        return () => {
            ctrl.removeEventListener('start', onStart);
            ctrl.removeEventListener('end', onEnd);
        };
    }, [camera, controls, isInteracting]);

    return null;
}

function CameraHandler({ viewState, onViewStateChange, isInteracting, cameraVersion }: {
    viewState: VolumesViewProps['viewState'],
    onViewStateChange: (updates: Partial<VolumesViewProps['viewState']>, incrementVersion?: boolean) => void,
    isInteracting: React.MutableRefObject<boolean>,
    cameraVersion: number
}) {
    const { camera, controls, size } = useThree();
    const prevCameraVersion = useRef(-1);
    const prevViewType = useRef(viewState.viewType);

    // Effect for View Type Switching (Perspective/Isometric)
    useEffect(() => {
        if (prevViewType.current !== viewState.viewType) {
            const isIso = viewState.viewType === 'isometric';
            const target = new THREE.Vector3(...viewState.target);
            const currentPos = new THREE.Vector3(...viewState.cameraPosition);
            const distance = currentPos.distanceTo(target);

            if (isIso) {
                // Perspective -> Isometric
                const fov = 45;
                const visibleHeight = 2 * distance * Math.tan((fov * Math.PI) / 360);
                const newZoom = size.height / visibleHeight;
                (camera as THREE.OrthographicCamera).zoom = newZoom;
                camera.updateProjectionMatrix();
                // Update state with new zoom and increment version to force update
                onViewStateChange({ zoom: newZoom }, true);
            } else {
                // Isometric -> Perspective
                const currentZoom = viewState.zoom;
                const visibleHeight = size.height / currentZoom;
                const fov = 45;
                const newDistance = visibleHeight / (2 * Math.tan((fov * Math.PI) / 360));
                const direction = currentPos.sub(target).normalize();
                const newPos = target.clone().add(direction.multiplyScalar(newDistance));
                camera.position.copy(newPos);
                camera.updateProjectionMatrix();
                // Update state with new position and reset zoom, increment version
                onViewStateChange({
                    cameraPosition: [newPos.x, newPos.y, newPos.z],
                    zoom: 1
                }, true);
            }
            prevViewType.current = viewState.viewType;
        }
    }, [viewState.viewType, size, camera, onViewStateChange, viewState.target, viewState.cameraPosition, viewState.zoom]);


    // Effect for Programmatic Camera Moves (Driven by cameraVersion)
    useLayoutEffect(() => {
        // Only update if the version has changed (indicating an external, intentional move)
        // or if it's the very first mount (to set initial position)
        if (cameraVersion === prevCameraVersion.current) return;

        prevCameraVersion.current = cameraVersion;

        const targetPos = new THREE.Vector3(...viewState.cameraPosition);
        const targetTarget = new THREE.Vector3(...viewState.target);

        camera.up.set(0, 0, 1);
        camera.position.copy(targetPos);

        if (camera.type === 'OrthographicCamera') {
            let safeZoom = viewState.zoom;
            if (!Number.isFinite(safeZoom) || safeZoom <= 0) safeZoom = 1;
            (camera as THREE.OrthographicCamera).zoom = safeZoom;
            camera.updateProjectionMatrix();
        }

        if (controls) {
            (controls as any).target.copy(targetTarget);
            (controls as any).update();
        }

    }, [cameraVersion, viewState.cameraPosition, viewState.target, viewState.zoom, camera, controls]);

    return null;
}

// Internal component to handle scene access and export logic
const SceneManager = forwardRef<VolumesViewHandle, { hiddenFloorIds: Set<number> }>(({ hiddenFloorIds }, ref) => {
    const { scene, gl, camera } = useThree();

    useImperativeHandle(ref, () => ({
        exportOBJ: () => {
            const exporter = new OBJExporter();
            const objectsToHide: THREE.Object3D[] = [];

            // Hide grids and helpers before export
            scene.traverse((child) => {
                if (child.userData?.isGrid || child.type === 'GridHelper' || (child as any).isGizmo) {
                    if (child.visible) {
                        child.visible = false;
                        objectsToHide.push(child);
                    }
                }
                // Hide GizmoHelper container if identifiable (often added to scene directly)
                if (child.name === 'GizmoHelper' || child.userData?.type === 'GizmoHelper') {
                     if (child.visible) {
                        child.visible = false;
                        objectsToHide.push(child);
                    }
                }
            });

            const result = exporter.parse(scene);

            // Restore visibility
            objectsToHide.forEach(o => o.visible = true);

            return new Blob([result], { type: 'text/plain' });
        },
        captureScreenshot: async () => {
            gl.render(scene, camera);
            return new Promise((resolve) => {
                gl.domElement.toBlob((blob) => resolve(blob));
            });
        }
    }));
    return null;
});


export const VolumesView = forwardRef<VolumesViewHandle, VolumesViewProps>(({
    rooms, floors, verticalConnections, zoneColors, pixelsPerMeter,
    connectionSourceId, onLinkToggle, appSettings, diagramStyle,
    selectedRoomIds, onRoomSelect, darkMode, gridSize, active, floorGap, hiddenFloorIds, showLabels, labelFontSize,
    viewState, onViewStateChange, cameraVersion
}: VolumesViewProps, ref) => {
    const [zoomToFitTrigger, setZoomToFitTrigger] = useState(0);
    const visiblePlacedRooms = useMemo(() => rooms.filter(r => r.isPlaced && !hiddenFloorIds.has(r.floor)), [rooms, hiddenFloorIds]);
    const isInteracting = useRef(false);
    const internalRef = useRef<VolumesViewHandle>(null);

    useImperativeHandle(ref, () => ({
        exportOBJ: () => internalRef.current?.exportOBJ() ?? null,
        captureScreenshot: () => internalRef.current?.captureScreenshot() ?? Promise.resolve(null)
    }));

    // Track camera state in ref to avoid re-renders, save on unmount
    const cameraStateRef = useRef({
        pos: new THREE.Vector3(...viewState.cameraPosition),
        target: new THREE.Vector3(...viewState.target),
        zoom: viewState.zoom
    });

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
                e.preventDefault();
                setZoomToFitTrigger(prev => prev + 1);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    const handleZoomToFit = () => setZoomToFitTrigger(prev => prev + 1);

    // Initial Zoom to Fit
    useEffect(() => {
        if (!viewState.hasInitialZoomed && visiblePlacedRooms.length > 0) {
            const timer = setTimeout(() => {
                setZoomToFitTrigger(t => t + 1);
            }, 100);
            return () => clearTimeout(timer);
        }
    }, [viewState.hasInitialZoomed, visiblePlacedRooms.length]);

    const handleFitComplete = useCallback((pos: THREE.Vector3, target: THREE.Vector3, zoom: number) => {
        // Update internal ref to prevent jump on next render
        cameraStateRef.current.pos.copy(pos);
        cameraStateRef.current.target.copy(target);
        cameraStateRef.current.zoom = zoom;

        onViewStateChange({
            hasInitialZoomed: true,
            cameraPosition: [pos.x, pos.y, pos.z],
            target: [target.x, target.y, target.z],
            zoom: zoom
        }, true);
    }, [onViewStateChange]);

    const handleCameraUpdate = (pos: THREE.Vector3, target: THREE.Vector3, zoom: number) => {
        cameraStateRef.current.pos.copy(pos);
        cameraStateRef.current.target.copy(target);
        cameraStateRef.current.zoom = zoom;

        // Sync to parent state only when interaction ends (handled by ViewStateTracker 'end' event)
        onViewStateChange({
            cameraPosition: [pos.x, pos.y, pos.z],
            target: [target.x, target.y, target.z],
            zoom: zoom
        });
    };

    // Save state on unmount
    useEffect(() => {
        return () => {
            onViewStateChange({
                cameraPosition: [cameraStateRef.current.pos.x, cameraStateRef.current.pos.y, cameraStateRef.current.pos.z],
                target: [cameraStateRef.current.target.x, cameraStateRef.current.target.y, cameraStateRef.current.target.z],
                zoom: cameraStateRef.current.zoom
            });
        };
    }, [onViewStateChange]);

    const handleViewTypeChange = (type: 'perspective' | 'isometric') => {
        onViewStateChange({
            viewType: type,
            cameraPosition: [cameraStateRef.current.pos.x, cameraStateRef.current.pos.y, cameraStateRef.current.pos.z],
            target: [cameraStateRef.current.target.x, cameraStateRef.current.target.y, cameraStateRef.current.target.z],
        }, true);
    };

    return (
        <div className="h-full w-full bg-[#f8fafc] dark:bg-[#020617] relative" style={{ cursor: 'default' }}>
            <Canvas
                shadows
                gl={{ antialias: true }}
                orthographic={viewState.viewType === 'isometric'}
                style={{ cursor: 'default' }}
                frameloop={active ? 'always' : 'never'}
                onPointerMissed={() => onRoomSelect(null, false)}
            >
                {viewState.viewType === 'perspective' ? (
                    <PerspectiveCamera makeDefault fov={45} up={[0, 0, 1]} />
                ) : (
                    <OrthographicCamera makeDefault near={0.1} far={2000} up={[0, 0, 1]} />
                )}
                <OrbitControls key={viewState.viewType} makeDefault zoomToCursor enableDamping={false} />
                <SceneManager ref={internalRef} hiddenFloorIds={hiddenFloorIds} />
                <CameraHandler viewState={viewState} onViewStateChange={onViewStateChange} isInteracting={isInteracting} cameraVersion={cameraVersion} />
                <CameraController zoomTrigger={zoomToFitTrigger} placedRooms={visiblePlacedRooms} floors={floors} onFitComplete={handleFitComplete} floorGap={floorGap} />
                <ViewStateTracker onUpdate={handleCameraUpdate} isInteracting={isInteracting} />
                <ambientLight intensity={0.7} />
                <pointLight position={[200, 200, 500]} intensity={1.5} castShadow />
                <directionalLight position={[-200, -200, 400]} intensity={0.8} />

                {floors.map((floor) => (
                    !hiddenFloorIds.has(floor.id) && <FloorPlane key={floor.id} floor={floor} floors={floors} darkMode={darkMode} gridSize={gridSize} floorGap={floorGap} />
                ))}

                {visiblePlacedRooms.map(room => (
                    <RoomVolume
                        key={room.id}
                        room={room}
                        floors={floors}
                        zoneColors={zoneColors}
                        isSelected={selectedRoomIds.has(room.id)}
                        isLinkingSource={connectionSourceId === room.id}
                        appSettings={appSettings}
                        diagramStyle={diagramStyle}
                        darkMode={darkMode}
                        floorGap={floorGap}
                        onSelect={() => {
                            if (connectionSourceId) {
                                onLinkToggle(room.id);
                            } else {
                                onRoomSelect(room.id, false);
                            }
                        }}
                        showLabels={showLabels}
                        labelFontSize={labelFontSize}
                    />
                ))}

                {verticalConnections.map(conn => (
                    (!hiddenFloorIds.has(conn.fromFloor) && !hiddenFloorIds.has(conn.toFloor)) && <VerticalLink key={conn.id} conn={conn} rooms={rooms} floors={floors} darkMode={darkMode} floorGap={floorGap} />
                ))}

                <GizmoHelper alignment="bottom-right" margin={[80, 80]}>
                    <GizmoViewport axisColors={['#f87171', '#4ade80', '#60a5fa']} labelColor="black" />
                </GizmoHelper>
            </Canvas>

            {/* Standard Zoom Position (Top Right) */}
            <div className="absolute top-6 right-6 flex flex-col items-end gap-2 z-[200]">
                <div className="h-12 bg-white/90 dark:bg-dark-surface/90 backdrop-blur-md px-4 rounded-full border border-slate-200 dark:border-dark-border shadow-xl flex items-center gap-4 animate-in slide-in-from-right-4 transition-all duration-300 pointer-events-auto">
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-sans font-black text-slate-700 dark:text-gray-300">FIT</span>
                        <button onClick={handleZoomToFit} className="w-6 h-6 rounded-full bg-orange-100 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 flex items-center justify-center hover:bg-orange-500 hover:text-white transition-all shadow-sm" title="Zoom to Fit (Ctrl+F)">
                            <Maximize size={12} />
                        </button>
                    </div>
                </div>
            </div>

            <div className="absolute top-6 left-6 pointer-events-none flex flex-col gap-4">
                <div className="bg-white/80 dark:bg-dark-surface/80 backdrop-blur-md p-4 rounded-3xl border border-slate-200 dark:border-dark-border shadow-2xl animate-in fade-in slide-in-from-left-4 pointer-events-auto">
                    <div className="flex justify-between items-center mb-3">
                        <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">View Orientation</h3>
                    </div>
                    <div className="flex bg-slate-100 dark:bg-white/5 p-1 rounded-2xl">
                        <button
                            onClick={() => handleViewTypeChange('perspective')}
                            className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${viewState.viewType === 'perspective' ? 'bg-white dark:bg-dark-surface shadow-lg text-orange-600' : 'text-slate-500 hover:text-slate-700 dark:text-gray-400'}`}
                        >
                            Perspective
                        </button>
                        <button
                            onClick={() => handleViewTypeChange('isometric')}
                            className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${viewState.viewType === 'isometric' ? 'bg-white dark:bg-dark-surface shadow-lg text-orange-600' : 'text-slate-500 hover:text-slate-700 dark:text-gray-400'}`}
                        >
                            Isometric
                        </button>
                    </div>
                </div>
            </div>

            {connectionSourceId && (
                <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-50 pointer-events-auto">
                    <div className="bg-orange-500 text-white px-8 py-4 rounded-full shadow-[0_10px_40px_rgba(249,115,22,0.4)] animate-bounce flex items-center gap-3">
                        <span className="text-xs font-black uppercase tracking-widest">Select another space to link vertically</span>
                        <button onClick={() => onLinkToggle(connectionSourceId)} className="bg-white/20 hover:bg-white/30 p-1.5 rounded-full">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
});
