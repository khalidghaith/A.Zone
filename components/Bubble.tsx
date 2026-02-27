import React, { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Room, Point, DiagramStyle, AppSettings, ZoneColor } from '../types';
import { Link as LinkIcon } from 'lucide-react';
import { createRoundedPath } from '../utils/geometry';
import { wrapText } from '../utils/exportSystem';

interface BubbleProps {
    room: Room;
    zoomScale: number;
    updateRoom: (id: string, updates: Partial<Room>) => void;
    isSelected: boolean;
    onSelect: (id: string, multi: boolean) => void;
    diagramStyle: DiagramStyle;
    snapEnabled: boolean;
    snapPixelUnit: number;
    getSnappedPosition?: (room: Room, excludeId: string) => { x: number, y: number };
    onLinkToggle?: (id: string) => void;
    onMove?: (x: number, y: number) => void;
    onDragStart?: () => void;
    isLinkingSource?: boolean;
    isAnyDragging?: boolean;
    pixelsPerMeter: number;
    floors: { id: number; label: string }[];
    appSettings: AppSettings;
    zoneColors: Record<string, ZoneColor>;
    onDragEnd?: (room: Room, e: any) => void;
    otherRooms?: Room[];
    isSketchMode?: boolean;
    isOverlay?: boolean;
}

// area utility
const calculatePolygonArea = (points: Point[]): number => {
    let area = 0;
    for (let i = 0; i < points.length; i++) {
        const j = (i + 1) % points.length;
        area += points[i].x * points[j].y;
        area -= points[j].x * points[i].y;
    }
    return Math.abs(area) / 2;
};

// Calculate area of the rendered spline (Curved Area)
// Flattens the curve into high-density segments for precision
const calculateCurvedArea = (points: Point[]): number => {
    if (points.length < 3) return 0;
    let area = 0;
    const steps = 20; // High density for precision

    for (let i = 0; i < points.length; i++) {
        const p0 = points[(i - 1 + points.length) % points.length];
        const p1 = points[i];
        const p2 = points[(i + 1) % points.length];
        const p3 = points[(i + 2) % points.length];

        // Catmull-Rom to Bezier control points
        const cp1x = p1.x + (p2.x - p0.x) / 6;
        const cp1y = p1.y + (p2.y - p0.y) / 6;
        const cp2x = p2.x - (p3.x - p1.x) / 6;
        const cp2y = p2.y - (p3.y - p1.y) / 6;

        let prevX = p1.x;
        let prevY = p1.y;

        for (let j = 1; j <= steps; j++) {
            const t = j / steps;
            const it = 1 - t;
            // Cubic Bezier formula
            const x = it * it * it * p1.x + 3 * it * it * t * cp1x + 3 * it * t * t * cp2x + t * t * t * p2.x;
            const y = it * it * it * p1.y + 3 * it * it * t * cp1y + 3 * it * t * t * cp2y + t * t * t * p2.y;

            // Shoelace formula step
            area += prevX * y - x * prevY;

            prevX = x;
            prevY = y;
        }
    }
    return Math.abs(area) / 2;
};

// Catmull-Rom to Bezier conversion for smooth bubble curves
const createBubblePath = (points: Point[]): string => {
    if (points.length < 3) return "";

    let d = `M ${points[0].x},${points[0].y}`;

    for (let i = 0; i < points.length; i++) {
        const p0 = points[(i - 1 + points.length) % points.length];
        const p1 = points[i];
        const p2 = points[(i + 1) % points.length];
        const p3 = points[(i + 2) % points.length];

        const cp1x = p1.x + (p2.x - p0.x) / 6;
        const cp1y = p1.y + (p2.y - p0.y) / 6;

        const cp2x = p2.x - (p3.x - p1.x) / 6;
        const cp2y = p2.y - (p3.y - p1.y) / 6;

        d += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
    }

    return d + " Z";
};

const calculateCentroid = (points: Point[]): Point => {
    let x = 0, y = 0;
    for (const p of points) {
        x += p.x;
        y += p.y;
    }
    return { x: x / points.length, y: y / points.length };
};

const RenderCorner = ({ cursor, pos, zoomScale, onPointerDown }: { cursor: string, pos: React.CSSProperties, zoomScale: number, onPointerDown: (e: React.PointerEvent) => void }) => (
    <div
        className="absolute z-[70]"
        style={{ ...pos, transform: `translate(-50%, -50%) scale(${1 / zoomScale})`, touchAction: 'none' }}
    >
        <div
            className="w-3 h-3 bg-white border-2 border-orange-600 rounded-full hover:bg-orange-600 cursor-pointer shadow-lg active:scale-150"
            style={{ cursor }}
            onPointerDown={onPointerDown}
        />
    </div>
);

const ROTATE_CURSOR = `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' style='filter: drop-shadow(1px 1px 0px white);'><path d='M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.3'/></svg>") 12 12, auto`;

const BubbleComponent: React.FC<BubbleProps> = ({
    room, zoomScale, updateRoom, isSelected, onSelect, diagramStyle, snapEnabled, snapPixelUnit,
    getSnappedPosition, onLinkToggle, isLinkingSource, pixelsPerMeter = 20, floors, appSettings, zoneColors, onDragEnd, onDragStart, onMove, isAnyDragging, otherRooms, isSketchMode, isOverlay
}) => {
    const [isDragging, setIsDragging] = useState(false);
    const [isRotating, setIsRotating] = useState(false);
    const [resizeHandle, setResizeHandle] = useState<string | null>(null);
    const [rotateTooltip, setRotateTooltip] = useState<{ x: number, y: number, angle: number } | null>(null);
    const [snapLines, setSnapLines] = useState<{ x?: number, y?: number }[]>([]);
    const [isTextDragging, setIsTextDragging] = useState(false);

    // Polygon Editing State
    const [hoveredVertex, setHoveredVertex] = useState<number | null>(null);
    const [hoveredEdge, setHoveredEdge] = useState<number | null>(null);
    const [draggedVertex, setDraggedVertex] = useState<number | null>(null);
    const [draggedEdge, setDraggedEdge] = useState<number | null>(null);
    const [isExtruding, setIsExtruding] = useState(false);
    const [polygonSnapshot, setPolygonSnapshot] = useState<Point[] | null>(null);

    // Bubble Physics State
    const [wobbleTime, setWobbleTime] = useState(0);

    const [selectedVertices, setSelectedVertices] = useState<Set<number>>(new Set());
    const hasMoved = useRef(false);

    const lastEdgeClick = useRef<{ time: number, index: number } | null>(null);
    const bubbleRef = useRef<HTMLDivElement>(null);
    const startDragState = useRef({
        startX: 0, startY: 0,
        roomX: room.x, roomY: room.y, roomW: room.width, roomH: room.height,
        textX: 0, textY: 0
    });

    const getZoneStyle = (z: string) => {
        const key = Object.keys(zoneColors).find(k => z.toLowerCase().includes(k.toLowerCase()));
        return key ? zoneColors[key] : zoneColors['Default'];
    };
    const visualStyle = getZoneStyle(room.zone);

    const activePoints = useMemo(() => (room.polygon && room.polygon.length > 0) ? room.polygon : [
        { x: 0, y: 0 }, { x: room.width, y: 0 }, { x: room.width, y: room.height }, { x: 0, y: room.height }
    ], [room.polygon, room.width, room.height]);

    const centroid = useMemo(() => calculateCentroid(activePoints), [activePoints]);

    const bounds = useMemo(() => {
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        activePoints.forEach(p => {
            if (p.x < minX) minX = p.x;
            if (p.x > maxX) maxX = p.x;
            if (p.y < minY) minY = p.y;
            if (p.y > maxY) maxY = p.y;
        });
        return { width: maxX - minX, height: maxY - minY };
    }, [activePoints]);

    // Wobble Animation Loop
    useEffect(() => {
        if (wobbleTime > 0) {
            let frameId: number;
            const animate = () => {
                setWobbleTime(prev => Math.max(0, prev - 0.05));
            };
            frameId = requestAnimationFrame(animate);
            return () => cancelAnimationFrame(frameId);
        }
    }, [wobbleTime]);

    const polygonPath = useMemo(() => {
        if (room.shape === 'bubble') {
            // Apply slight wobble visual offset if active
            // This is purely visual and doesn't affect the data model
            return createBubblePath(activePoints);
        }
        return createRoundedPath(activePoints, room.style?.cornerRadius ?? appSettings.cornerRadius);
    }, [activePoints, appSettings.cornerRadius, room.style?.cornerRadius, room.shape]);

    // Keyboard Listener for Deletion
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (selectedVertices.size > 0 && (e.key === 'Delete' || e.key === 'Backspace')) {
                // Check if polygon has enough points
                if (activePoints.length - selectedVertices.size < 3) {
                    // Need at least 3 points
                    return;
                }

                const newPoints = activePoints.filter((_, i) => !selectedVertices.has(i));

                const areaPx = room.shape === 'bubble' ? calculateCurvedArea(newPoints) : calculatePolygonArea(newPoints);
                const newArea = Number((areaPx / (pixelsPerMeter * pixelsPerMeter)).toFixed(2));
                updateRoom(room.id, { polygon: newPoints, area: newArea > 0 ? newArea : room.area });
                setSelectedVertices(new Set());
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedVertices, activePoints, room.id, updateRoom, room.shape, pixelsPerMeter]);

    const handleRotateStart = (e: React.PointerEvent) => {
        e.stopPropagation();
        e.preventDefault();
        onDragStart?.();
        setIsRotating(true);
        // We don't need to store start state for rotation if we calculate absolute angle from center
    };

    const handleTextMouseDown = (e: React.PointerEvent) => {
        if (!room.isTextUnlocked) return;
        e.stopPropagation();
        onDragStart?.();
        setIsTextDragging(true);

        const currentTextPos = room.textPos || centroid;
        startDragState.current = {
            ...startDragState.current,
            startX: e.clientX, startY: e.clientY,
            textX: currentTextPos.x, textY: currentTextPos.y
        };
    };

    useEffect(() => {
        const handlePointerMove = (e: PointerEvent) => {
            const dxScreen = e.clientX - startDragState.current.startX;
            const dyScreen = e.clientY - startDragState.current.startY;
            const dxWorld = dxScreen / zoomScale;
            const dyWorld = dyScreen / zoomScale;

            const shouldSnap = snapEnabled ? !e.shiftKey : e.shiftKey;

            let currentSnapLines: { x?: number, y?: number }[] = [];

            if (!hasMoved.current && (Math.abs(dxScreen) > 2 || Math.abs(dyScreen) > 2)) {
                hasMoved.current = true;
            }

            // Helper to get snap targets from other rooms
            const getSnapTargets = () => {
                const targetsX: number[] = [];
                const targetsY: number[] = [];
                if (otherRooms) {
                    otherRooms.forEach(r => {
                        if (r.polygon) {
                            r.polygon.forEach(p => { targetsX.push(r.x + p.x); targetsY.push(r.y + p.y); });
                        } else {
                            targetsX.push(r.x, r.x + r.width);
                            targetsY.push(r.y, r.y + r.height);
                        }
                    });
                }
                return { x: targetsX, y: targetsY };
            };

            if (resizeHandle) {
                const s = startDragState.current;
                const minSize = 20;
                const areaPx = s.roomW * s.roomH;

                // 1. Localize drag movements via Inverse Rotation
                const angleRadMap = - (room.rotation || 0) * (Math.PI / 180);
                const localDx = dxWorld * Math.cos(angleRadMap) - dyWorld * Math.sin(angleRadMap);
                const localDy = dxWorld * Math.sin(angleRadMap) + dyWorld * Math.cos(angleRadMap);

                const anchorLocalX = resizeHandle.includes('w') ? s.roomX + s.roomW : s.roomX;
                const anchorLocalY = resizeHandle.includes('n') ? s.roomY + s.roomH : s.roomY;

                // 2. Calculate Raw Target Dimensions based on cursor (in local unrotated coordinates)
                const startEdgeLocalX = resizeHandle.includes('w') ? s.roomX : s.roomX + s.roomW;
                const startEdgeLocalY = resizeHandle.includes('n') ? s.roomY : s.roomY + s.roomH;

                const currentEdgeLocalX = startEdgeLocalX + localDx;
                const currentEdgeLocalY = startEdgeLocalY + localDy;

                let rawW = Math.abs(currentEdgeLocalX - anchorLocalX);
                let rawH = Math.abs(currentEdgeLocalY - anchorLocalY);

                rawW = Math.max(minSize, rawW);
                rawH = Math.max(minSize, rawH);

                // 3. Calculate Theoretical Dimensions (Area Preserved)
                const ratio = rawW / rawH;
                let tW = Math.sqrt(areaPx * ratio);
                let tH = areaPx / tW;

                // 4. Identify Moving Edges candidates (Theoretical in unrotated world space for snapping)
                const movingEdgeX = resizeHandle.includes('w') ? anchorLocalX - tW : anchorLocalX + tW;
                const movingEdgeY = resizeHandle.includes('n') ? anchorLocalY - tH : anchorLocalY + tH;

                // 5. Check Snaps (Only when NOT rotated)
                let bestSnapDist = appSettings.snapTolerance / zoomScale;
                let snappedAxis: 'x' | 'y' | null = null;
                let snapValue = 0;

                if (shouldSnap && appSettings.snapWhileScaling && !(room.rotation)) {
                    const { x: targetsX, y: targetsY } = getSnapTargets();

                    // Check X Snaps
                    if (appSettings.snapToObjects) {
                        for (const tx of targetsX) {
                            const dist = Math.abs(movingEdgeX - tx);
                            if (dist < bestSnapDist) {
                                bestSnapDist = dist;
                                snappedAxis = 'x';
                                snapValue = tx;
                            }
                        }
                    }
                    if (appSettings.snapToGrid) {
                        const gx = Math.round(movingEdgeX / snapPixelUnit) * snapPixelUnit;
                        const dist = Math.abs(movingEdgeX - gx);
                        if (dist < bestSnapDist) {
                            bestSnapDist = dist;
                            snappedAxis = 'x';
                            snapValue = gx;
                        }
                    }

                    // Check Y Snaps (competing with X)
                    if (appSettings.snapToObjects) {
                        for (const ty of targetsY) {
                            const dist = Math.abs(movingEdgeY - ty);
                            if (dist < bestSnapDist) {
                                bestSnapDist = dist;
                                snappedAxis = 'y';
                                snapValue = ty;
                            }
                        }
                    }
                    if (appSettings.snapToGrid) {
                        const gy = Math.round(movingEdgeY / snapPixelUnit) * snapPixelUnit;
                        const dist = Math.abs(movingEdgeY - gy);
                        if (dist < bestSnapDist) {
                            bestSnapDist = dist;
                            snappedAxis = 'y';
                            snapValue = gy;
                        }
                    }
                }

                // 6. Apply Snap
                if (snappedAxis === 'x') {
                    tW = Math.max(minSize, Math.abs(snapValue - anchorLocalX));
                    tH = areaPx / tW;
                    currentSnapLines = [{ x: resizeHandle.includes('w') ? 0 : tW }];
                } else if (snappedAxis === 'y') {
                    tH = Math.max(minSize, Math.abs(snapValue - anchorLocalY));
                    tW = areaPx / tH;
                    currentSnapLines = [{ y: resizeHandle.includes('n') ? 0 : tH }];
                }

                // 7. Finalize Area Preserved Size
                const finalW = tW;
                const finalH = tH;

                // 8. Compensate for rotation so the opposite anchor corner remains stationary
                const angleRadPos = (room.rotation || 0) * (Math.PI / 180);
                const cosA = Math.cos(angleRadPos);
                const sinA = Math.sin(angleRadPos);

                const ancOldLocalX = resizeHandle.includes('w') ? s.roomW : 0;
                const ancOldLocalY = resizeHandle.includes('n') ? s.roomH : 0;

                const cxOld = s.roomX + s.roomW / 2;
                const cyOld = s.roomY + s.roomH / 2;

                const vxOld = ancOldLocalX - s.roomW / 2;
                const vyOld = ancOldLocalY - s.roomH / 2;

                // World position of the opposite anchor corner
                const wAncX = cxOld + (cosA * vxOld - sinA * vyOld);
                const wAncY = cyOld + (sinA * vxOld + cosA * vyOld);

                const ancNewLocalX = resizeHandle.includes('w') ? finalW : 0;
                const ancNewLocalY = resizeHandle.includes('n') ? finalH : 0;

                const vxNew = ancNewLocalX - finalW / 2;
                const vyNew = ancNewLocalY - finalH / 2;

                // New rotated offset for the anchor corner
                const rNewX = cosA * vxNew - sinA * vyNew;
                const rNewY = sinA * vxNew + cosA * vyNew;

                // Compute exact top-left
                const finalX = wAncX - finalW / 2 - rNewX;
                const finalY = wAncY - finalH / 2 - rNewY;

                updateRoom(room.id, { width: finalW, height: finalH, x: finalX, y: finalY });

            } else if (isRotating) {
                if (bubbleRef.current) {
                    const rect = bubbleRef.current.getBoundingClientRect();
                    const centerX = rect.left + rect.width / 2;
                    const centerY = rect.top + rect.height / 2;

                    // Calculate angle from center to mouse
                    const angleRad = Math.atan2(e.clientY - centerY, e.clientX - centerX);
                    let angleDeg = angleRad * (180 / Math.PI) + 90; // +90 to make top 0 degrees

                    if (e.shiftKey) {
                        angleDeg = Math.round(angleDeg / 45) * 45;
                    } else if (shouldSnap) {
                        angleDeg = Math.round(angleDeg / 5) * 5;
                    }

                    updateRoom(room.id, { rotation: angleDeg });
                    setRotateTooltip({ x: e.clientX, y: e.clientY, angle: angleDeg });
                }
            } else if (draggedVertex !== null && polygonSnapshot && room.shape === 'bubble') {
                // --- BUBBLE PHYSICS: AREA PRESERVATION ---
                const angleRad = - (room.rotation || 0) * (Math.PI / 180);
                const localDx = dxWorld * Math.cos(angleRad) - dyWorld * Math.sin(angleRad);
                const localDy = dxWorld * Math.sin(angleRad) + dyWorld * Math.cos(angleRad);

                const newPoints = [...polygonSnapshot];
                const v = newPoints[draggedVertex];

                // 1. Move the dragged vertex to mouse position
                const targetX = v.x + localDx;
                const targetY = v.y + localDy;
                newPoints[draggedVertex] = { x: targetX, y: targetY };

                // 2. Calculate current area and centroid
                const currentArea = calculateCurvedArea(newPoints);
                const targetArea = room.area * (pixelsPerMeter * pixelsPerMeter); // Target area in pixels

                if (currentArea > 100) { // Avoid division by zero or tiny polys
                    const centroid = calculateCentroid(newPoints);

                    // 3. Calculate Scale Factor needed to restore area
                    const scale = Math.sqrt(targetArea / currentArea);

                    // 4. Scale all points around centroid
                    const scaledPoints = newPoints.map(p => ({
                        x: centroid.x + (p.x - centroid.x) * scale,
                        y: centroid.y + (p.y - centroid.y) * scale
                    }));

                    // 5. Shift entire shape so dragged vertex stays at mouse cursor
                    const draggedScaled = scaledPoints[draggedVertex];
                    const shift = { x: targetX - draggedScaled.x, y: targetY - draggedScaled.y };

                    const finalPoints = scaledPoints.map(p => ({
                        x: p.x + shift.x,
                        y: p.y + shift.y
                    }));

                    updateRoom(room.id, { polygon: finalPoints });
                }

            } else if (draggedVertex !== null && polygonSnapshot) {
                // Moving Vertex (or multiple)
                const newPoints = [...polygonSnapshot];

                // Which vertices to move?
                // If dragged vertex is selected, move ALL selected.
                // Otherwise move just the dragged one.
                const indicesToMove = selectedVertices.has(draggedVertex)
                    ? Array.from(selectedVertices)
                    : [draggedVertex];

                const angleRad = - (room.rotation || 0) * (Math.PI / 180);
                const localDx = dxWorld * Math.cos(angleRad) - dyWorld * Math.sin(angleRad);
                const localDy = dxWorld * Math.sin(angleRad) + dyWorld * Math.cos(angleRad);

                indicesToMove.forEach(index => {
                    // Safe check
                    if (index >= newPoints.length) return;

                    const original = polygonSnapshot[index];

                    const rawX = original.x + localDx;
                    const rawY = original.y + localDy;

                    // Default to grid snap or raw
                    let nx = rawX;
                    let ny = rawY;

                    if (shouldSnap && appSettings.snapToGrid) {
                        nx = Math.round((rawX + room.x) / snapPixelUnit) * snapPixelUnit - room.x;
                        ny = Math.round((rawY + room.y) / snapPixelUnit) * snapPixelUnit - room.y;
                    }

                    if (shouldSnap && appSettings.snapToObjects) {
                        const tolerance = appSettings.snapTolerance / zoomScale;

                        let bestDX = tolerance;
                        let bestX = null;
                        let snapLineX = null;

                        // Snap to other vertices
                        for (let i = 0; i < newPoints.length; i++) {
                            if (indicesToMove.includes(i)) continue;
                            const other = newPoints[i];
                            const dist = Math.abs(rawX - other.x);
                            if (dist < bestDX) {
                                bestDX = dist;
                                bestX = other.x;
                                snapLineX = other.x;
                            }
                        }
                        // Snap to local origin
                        if (Math.abs(rawX) < bestDX) {
                            bestDX = Math.abs(rawX);
                            bestX = 0;
                            snapLineX = 0;
                        }

                        // Snap to Neighbors
                        if (otherRooms) {
                            const globalRawX = room.x + rawX;
                            const { x: targetsX } = getSnapTargets();
                            for (const tx of targetsX) {
                                const dist = Math.abs(globalRawX - tx);
                                if (dist < bestDX) {
                                    bestDX = dist;
                                    bestX = tx - room.x;
                                    snapLineX = bestX;
                                }
                            }
                        }

                        if (bestX !== null) {
                            nx = bestX;
                            currentSnapLines.push({ x: snapLineX });
                        }

                        let bestDY = tolerance;
                        let bestY = null;
                        let snapLineY = null;

                        for (let i = 0; i < newPoints.length; i++) {
                            if (indicesToMove.includes(i)) continue;
                            const other = newPoints[i];
                            const dist = Math.abs(rawY - other.y);
                            if (dist < bestDY) {
                                bestDY = dist;
                                bestY = other.y;
                                snapLineY = other.y;
                            }
                        }
                        if (Math.abs(rawY) < bestDY) {
                            bestDY = Math.abs(rawY);
                            bestY = 0;
                            snapLineY = 0;
                        }

                        if (otherRooms) {
                            const globalRawY = room.y + rawY;
                            const { y: targetsY } = getSnapTargets();
                            for (const ty of targetsY) {
                                const dist = Math.abs(globalRawY - ty);
                                if (dist < bestDY) {
                                    bestDY = dist;
                                    bestY = ty - room.y;
                                    snapLineY = bestY;
                                }
                            }
                        }

                        if (bestY !== null) {
                            ny = bestY;
                            currentSnapLines.push({ y: snapLineY });
                        }
                    }

                    newPoints[index] = { x: nx, y: ny };
                });

                const areaPx = room.shape === 'bubble' ? calculateCurvedArea(newPoints) : calculatePolygonArea(newPoints);
                const newArea = Number((areaPx / (pixelsPerMeter * pixelsPerMeter)).toFixed(2));
                updateRoom(room.id, { polygon: newPoints, area: newArea > 0 ? newArea : room.area });

            } else if (draggedEdge !== null && polygonSnapshot) {
                // Moving Edge
                const angleRad = - (room.rotation || 0) * (Math.PI / 180);
                const localDx = dxWorld * Math.cos(angleRad) - dyWorld * Math.sin(angleRad);
                const localDy = dxWorld * Math.sin(angleRad) + dyWorld * Math.cos(angleRad);

                const newPoints = [...polygonSnapshot];
                const idx1 = draggedEdge;
                const idx2 = (draggedEdge + 1) % polygonSnapshot.length;

                const moveAndSnap = (v: Point) => {
                    const rawX = v.x + localDx;
                    const rawY = v.y + localDy;
                    let nx = rawX;
                    let ny = rawY;

                    if (shouldSnap && appSettings.snapToGrid) {
                        nx = Math.round((rawX + room.x) / snapPixelUnit) * snapPixelUnit - room.x;
                        ny = Math.round((rawY + room.y) / snapPixelUnit) * snapPixelUnit - room.y;
                    }

                    if (shouldSnap && appSettings.snapToObjects) {
                        const tolerance = appSettings.snapTolerance / zoomScale;

                        let bestDX = tolerance;
                        let bestX = null;
                        let snapLineX = null;

                        for (let i = 0; i < newPoints.length; i++) {
                            if (i === idx1 || i === idx2) continue;
                            const other = newPoints[i];
                            const dist = Math.abs(rawX - other.x);
                            if (dist < bestDX) {
                                bestDX = dist;
                                bestX = other.x;
                                snapLineX = other.x;
                            }
                        }
                        // Snap to origin
                        if (Math.abs(rawX) < bestDX) { bestDX = Math.abs(rawX); bestX = 0; snapLineX = 0; }

                        // Snap to Neighbors
                        if (otherRooms) {
                            const globalRawX = room.x + rawX;
                            const { x: targetsX } = getSnapTargets();
                            for (const tx of targetsX) {
                                const dist = Math.abs(globalRawX - tx);
                                if (dist < bestDX) {
                                    bestDX = dist;
                                    bestX = tx - room.x;
                                    snapLineX = bestX;
                                }
                            }
                        }

                        if (bestX !== null) {
                            nx = bestX;
                            currentSnapLines.push({ x: snapLineX });
                        }

                        // Y axis
                        let bestDY = tolerance;
                        let bestY = null;
                        let snapLineY = null;

                        for (let i = 0; i < newPoints.length; i++) {
                            if (i === idx1 || i === idx2) continue;
                            const other = newPoints[i];
                            const dist = Math.abs(rawY - other.y);
                            if (dist < bestDY) {
                                bestDY = dist;
                                bestY = other.y;
                                snapLineY = other.y;
                            }
                        }
                        if (Math.abs(rawY) < bestDY) { bestDY = Math.abs(rawY); bestY = 0; snapLineY = 0; }

                        if (otherRooms) {
                            const globalRawY = room.y + rawY;
                            const { y: targetsY } = getSnapTargets();
                            for (const ty of targetsY) {
                                const dist = Math.abs(globalRawY - ty);
                                if (dist < bestDY) {
                                    bestDY = dist;
                                    bestY = ty - room.y;
                                    snapLineY = bestY;
                                }
                            }
                        }

                        if (bestY !== null) {
                            ny = bestY;
                            currentSnapLines.push({ y: snapLineY });
                        }
                    }
                    return { x: nx, y: ny };
                };

                newPoints[idx1] = moveAndSnap(newPoints[idx1]);
                newPoints[idx2] = moveAndSnap(newPoints[idx2]);

                const areaPx = room.shape === 'bubble' ? calculateCurvedArea(newPoints) : calculatePolygonArea(newPoints);
                const newArea = Number((areaPx / (pixelsPerMeter * pixelsPerMeter)).toFixed(2));
                updateRoom(room.id, { polygon: newPoints, area: newArea > 0 ? newArea : room.area });

            } else if (isTextDragging) {
                // Moving Text - Need to account for room rotation
                // Rotate the world delta vector into the room's local coordinate space
                const angleRad = - (room.rotation || 0) * (Math.PI / 180);
                const localDx = dxWorld * Math.cos(angleRad) - dyWorld * Math.sin(angleRad);
                const localDy = dxWorld * Math.sin(angleRad) + dyWorld * Math.cos(angleRad);

                const nX = startDragState.current.textX + localDx;
                const nY = startDragState.current.textY + localDy;
                updateRoom(room.id, { textPos: { x: nX, y: nY } });
            } else if (isDragging) {
                // Moving Whole Room
                let nX = startDragState.current.roomX + dxWorld;
                let nY = startDragState.current.roomY + dyWorld;

                if (shouldSnap) {
                    // Grid Snap
                    if (appSettings.snapToGrid) {
                        nX = Math.round(nX / snapPixelUnit) * snapPixelUnit;
                        nY = Math.round(nY / snapPixelUnit) * snapPixelUnit;
                    }

                    // Object Snap
                    if (appSettings.snapToObjects) {
                        const tolerance = appSettings.snapTolerance / zoomScale;
                        const { x: targetsX, y: targetsY } = getSnapTargets();

                        let bestDX = tolerance;
                        let bestX = null;
                        let snapLineX = null;

                        // Snap Left/Right edges
                        for (const tx of targetsX) {
                            const distLeft = Math.abs(nX - tx);
                            if (distLeft < bestDX) {
                                bestDX = distLeft;
                                bestX = tx;
                                snapLineX = 0;
                            }
                            const distRight = Math.abs((nX + room.width) - tx);
                            if (distRight < bestDX) {
                                bestDX = distRight;
                                bestX = tx - room.width;
                                snapLineX = room.width;
                            }
                        }

                        if (bestX !== null) {
                            nX = bestX;
                            currentSnapLines.push({ x: snapLineX });
                        }

                        let bestDY = tolerance;
                        let bestY = null;
                        let snapLineY = null;

                        // Snap Top/Bottom edges
                        for (const ty of targetsY) {
                            const distTop = Math.abs(nY - ty);
                            if (distTop < bestDY) {
                                bestDY = distTop;
                                bestY = ty;
                                snapLineY = 0;
                            }
                            const distBottom = Math.abs((nY + room.height) - ty);
                            if (distBottom < bestDY) {
                                bestDY = distBottom;
                                bestY = ty - room.height;
                                snapLineY = room.height;
                            }
                        }

                        if (bestY !== null) {
                            nY = bestY;
                            currentSnapLines.push({ y: snapLineY });
                        }
                    }
                }

                if (onMove) {
                    onMove(nX, nY);
                } else {
                    updateRoom(room.id, { x: nX, y: nY });
                }
            }

            setSnapLines(currentSnapLines);
        };

        const handlePointerUp = (e: PointerEvent) => {
            if (isDragging && onDragEnd) {
                onDragEnd(room, e);
            }

            if (isDragging && !hasMoved.current && isSelected && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
                onSelect(room.id, false);
            }

            // Trigger wobble if we were manipulating a bubble vertex
            if (draggedVertex !== null && room.shape === 'bubble') {
                setWobbleTime(1.0);
            }
            setIsDragging(false);
            setIsTextDragging(false);
            setIsRotating(false);
            setRotateTooltip(null);
            setResizeHandle(null);
            setDraggedVertex(null);
            setDraggedEdge(null);
            setSnapLines([]);
            setIsExtruding(false);
            setPolygonSnapshot(null);
            if (getSnappedPosition) getSnappedPosition(room, '');
        };

        if (isDragging || isRotating || resizeHandle || draggedVertex !== null || draggedEdge !== null || isTextDragging) {
            window.addEventListener('pointermove', handlePointerMove);
            window.addEventListener('pointerup', handlePointerUp);
            window.addEventListener('pointercancel', handlePointerUp);
        }
        return () => {
            window.removeEventListener('pointermove', handlePointerMove);
            window.removeEventListener('pointerup', handlePointerUp);
            window.removeEventListener('pointercancel', handlePointerUp);
        };
    }, [isDragging, isRotating, resizeHandle, draggedVertex, draggedEdge, isExtruding, polygonSnapshot, isTextDragging, room.id, zoomScale, updateRoom, snapEnabled, snapPixelUnit, selectedVertices, appSettings.snapWhileScaling, getSnappedPosition, onDragEnd, onMove, isSelected, onSelect, otherRooms, appSettings.snapToObjects, appSettings.snapTolerance, appSettings.snapToGrid, room.x, room.y, room.shape, room.area, pixelsPerMeter]);

    const handleResizeStart = (e: React.PointerEvent, handle: string) => {
        e.stopPropagation();
        e.preventDefault();
        onDragStart?.();
        setResizeHandle(handle);
        startDragState.current = {
            startX: e.clientX, startY: e.clientY,
            roomX: room.x, roomY: room.y, roomW: room.width, roomH: room.height,
            textX: 0, textY: 0
        };
    };

    const handleMouseDown = (e: React.PointerEvent) => {
        e.stopPropagation();
        e.preventDefault();

        // Touch optimization: Select first, then drag
        if (e.pointerType === 'touch' && !isSelected) {
            onSelect(room.id, false);
            return;
        }

        // Clear vertex selection if clicking on room body, UNLESS holding ctrl? 
        // Usually clicking body selects room, so handling vertices should be distinct.
        // User wants to move "them" (vertices).
        // If I click background of room, I am moving ROOM.
        // So yes, clear vertex selection.
        if (selectedVertices.size > 0 && !e.ctrlKey && !e.shiftKey) setSelectedVertices(new Set());

        const isMulti = e.shiftKey || e.ctrlKey || e.metaKey;
        if (isSelected && !isMulti) {
            // Don't select yet, wait to see if it's a drag
        } else {
            onSelect(room.id, isMulti);
        }
        onDragStart?.();
        setIsDragging(true);
        hasMoved.current = false;
        startDragState.current = {
            startX: e.clientX, startY: e.clientY,
            roomX: room.x, roomY: room.y, roomW: room.width, roomH: room.height,
            textX: 0, textY: 0
        };
    };

    // Polygon Handling
    const handleVertexDown = (e: React.PointerEvent, index: number) => {
        e.stopPropagation();
        e.preventDefault();
        onDragStart?.();
        setDraggedVertex(index);

        // Multi-selection logic
        const isMulti = e.ctrlKey || e.metaKey || e.shiftKey;

        setSelectedVertices(prev => {
            const next = new Set(prev);
            if (isMulti) {
                // Toggle
                if (next.has(index)) {
                    // Don't deselect on down if we might drag?
                    // Standard behavior: 
                    // - If dragging a selected item, don't toggle.
                    // - If clicking to just toggle, toggle.
                    // Hard to distinguish without mouseUp.
                    // Simple approach: Always toggle on click?
                    // But user says "I should still be able to move them after selection."
                    // If I ctrl-click selected item, it deselects. I can't drag it.
                    // Logic: If already selected, keep it selected (to allow drag).
                    // If we want to deselect, we usually click without drag?
                    // Let's implement simpler: Toggle if not dragging? 
                    // Actually, if we want to add to selection, we Ctrl+Click.

                    // If I simply want to drag a group, I click one of them (without Ctrl).
                    // But that would clear others?

                    // Let's follow standard file explorer logic:
                    // Click (No Ctrl): 
                    //   - If target IS selected: Don't clear others yet (wait for mouse up? or just keep). 
                    //   - If target NOT selected: Clear others, select target.

                    // Click (Ctrl):
                    //   - Toggle target.

                    if (next.has(index)) next.delete(index);
                    else next.add(index);

                } else {
                    next.delete(index); // Toggle logic? No wait.
                }
            } else {
                // Single Click
                // If not already selected, select exclusive
                if (!next.has(index)) {
                    next.clear();
                    next.add(index);
                }
                // If it WAS selected, we keep it and others.
                // What if I just want to select this one? MouseUp handles that?
                // Let's ignoring MouseUp logic for now to avoid complexity.
            }
            return next;
        });

        setPolygonSnapshot(activePoints);
        startDragState.current = {
            startX: e.clientX, startY: e.clientY,
            roomX: 0, roomY: 0, roomW: 0, roomH: 0,
            textX: 0, textY: 0
        };
    };

    const handleVertexContextMenu = (e: React.MouseEvent, index: number) => {
        e.preventDefault();
        e.stopPropagation();

        // Allow removing a point if we have more than 3
        if (activePoints.length > 3) {
            const newPoints = activePoints.filter((_, i) => i !== index);

            // Preserve area by scaling if needed, or just update
            // For deletion, we usually accept shape change, but let's try to keep it simple first
            // Recalculate area
            const areaPx = room.shape === 'bubble' ? calculateCurvedArea(newPoints) : calculatePolygonArea(newPoints);
            const newArea = Number((areaPx / (pixelsPerMeter * pixelsPerMeter)).toFixed(2));

            updateRoom(room.id, { polygon: newPoints, area: newArea > 0 ? newArea : room.area });
            setSelectedVertices(new Set());
        }
    };

    const handleEdgeDown = (e: React.PointerEvent, index: number) => {
        e.stopPropagation();
        e.preventDefault();
        onDragStart?.();

        // Manual Double Click Detection (PointerEvent.detail can be unreliable with preventDefault on some devices)
        const now = Date.now();
        const isDouble = lastEdgeClick.current &&
            (now - lastEdgeClick.current.time < 300) &&
            lastEdgeClick.current.index === index;
        lastEdgeClick.current = { time: now, index };

        // Clear vertex selection when starting to drag an edge
        if (selectedVertices.size > 0) setSelectedVertices(new Set());

        // Double Click Check: Insert Vertex
        if (isDouble || e.detail === 2) {
            lastEdgeClick.current = null; // Reset to prevent triple-click issues
            if (!bubbleRef.current) return;

            // Step A: Insert the new point at the exact midpoint of the curve/edge segment.
            const p1 = activePoints[index];
            const p2 = activePoints[(index + 1) % activePoints.length];
            const midX = (p1.x + p2.x) / 2;
            const midY = (p1.y + p2.y) / 2;

            // Capture original area before modification to prevent rounding jumps
            const originalAreaPx = room.shape === 'bubble' ? calculateCurvedArea(activePoints) : calculatePolygonArea(activePoints);

            const newPoints = [...activePoints];
            // Insert at index + 1 (after the start node of the edge)
            newPoints.splice(index + 1, 0, { x: midX, y: midY });

            if (room.shape === 'bubble') {
                // Step B: Before the frame renders, calculate the new curved area.
                const currentArea = calculateCurvedArea(newPoints);

                // Instantaneous Scaling: If the new point changes the area, apply global scaling factor
                if (currentArea > 100) { // Avoid division by zero or tiny polys
                    const centroid = calculateCentroid(newPoints);
                    const scale = Math.sqrt(originalAreaPx / currentArea);

                    const scaledPoints = newPoints.map(p => ({
                        x: centroid.x + (p.x - centroid.x) * scale,
                        y: centroid.y + (p.y - centroid.y) * scale
                    }));

                    updateRoom(room.id, { polygon: scaledPoints });
                } else {
                    updateRoom(room.id, { polygon: newPoints });
                }
            } else {
                const areaPx = calculatePolygonArea(newPoints);
                const newArea = Number((areaPx / (pixelsPerMeter * pixelsPerMeter)).toFixed(2));
                updateRoom(room.id, { polygon: newPoints, area: newArea > 0 ? newArea : room.area });
            }

            // Select the new vertex
            setSelectedVertices(new Set([index + 1]));
            return;
        }

        const isCtrl = e.ctrlKey || e.metaKey;
        if (selectedVertices.size > 0) setSelectedVertices(new Set()); // Clear vertex selection when dragging edge

        let initialPoints = activePoints;
        let activeIndex = index;

        if (isCtrl) {
            // Extrude Mode: Insert 2 new points to form a degenerate rect segment, then drag them.
            // Segment is P_i -> P_next
            // We become P_i -> P_new1 -> P_new2 -> P_next
            // P_new1 starts at P_i, P_new2 starts at P_next

            const p1 = activePoints[index];
            const p2 = activePoints[(index + 1) % activePoints.length];

            const newPoly = [...activePoints];
            // Splice in new points. Note: inserting after index.
            // ... p_index ... p_next ...
            // insert at index+1 and index+2
            newPoly.splice(index + 1, 0, { ...p1 }, { ...p2 });

            initialPoints = newPoly;
            activeIndex = index + 1; // We want to drag the NEW segment (indices index+1 and index+2)

            // Immediate update to spawn vertices
            updateRoom(room.id, { polygon: newPoly });
            setIsExtruding(true);
        } else {
            setIsExtruding(false);
        }

        setDraggedEdge(activeIndex);
        setPolygonSnapshot(initialPoints);
        startDragState.current = {
            startX: e.clientX, startY: e.clientY,
            roomX: 0, roomY: 0, roomW: 0, roomH: 0,
            textX: 0, textY: 0
        };
    };

    const isInteracting = isDragging || isRotating || resizeHandle !== null || draggedVertex !== null || draggedEdge !== null || isTextDragging;
    const disableTransition = isInteracting || (isSelected && isAnyDragging);

    const wrappedNameLines = useMemo(() => {
        return wrapText(room.name, bounds.width - 16, appSettings.fontSize);
    }, [room.name, bounds.width, appSettings.fontSize]);

    const textPos = room.textPos || centroid;

    const isPolygon = room.polygon || room.shape === 'bubble';

    return (
        <div
            ref={bubbleRef}
            className={`absolute ${isSketchMode || isOverlay ? 'pointer-events-none' : (isPolygon ? 'pointer-events-none' : 'pointer-events-auto')} ${isSelected ? 'z-20' : (isOverlay ? 'z-0 opacity-20 grayscale' : 'z-10')} ${isLinkingSource ? 'ring-4 ring-yellow-400 ring-offset-2 rounded-xl' : ''}`}
            style={{
                transform: `translate3d(${room.x}px, ${room.y}px, 0) rotate(${room.rotation || 0}deg)`,
                width: (room.polygon || room.shape === 'bubble') ? 0 : room.width,
                height: (room.polygon || room.shape === 'bubble') ? 0 : room.height,
                cursor: isSketchMode ? 'default' : (isDragging ? 'grabbing' : 'pointer'),
                touchAction: 'none'
            }}
            onPointerDown={isSketchMode || isOverlay ? undefined : handleMouseDown}
        >
            {/* Visual Surface */}
            <div className="relative group w-full h-full">
                {(room.polygon || room.shape === 'bubble') ? (
                    <div className="overflow-visible absolute top-0 left-0 pointer-events-none">
                        <svg className="overflow-visible pointer-events-none">
                            <path
                                d={polygonPath}
                                className={`${!room.style?.fill ? visualStyle.bg.replace(/bg-/g, 'fill-') : ''} ${!room.style?.stroke ? visualStyle.border.replace(/border-/g, 'stroke-') : ''} pointer-events-auto`}
                                strokeWidth={(room.style?.strokeWidth ?? appSettings.strokeWidth) / zoomScale}
                                strokeDasharray={room.style?.strokeDasharray ?? (diagramStyle.sketchy ? `${10 / zoomScale},${10 / zoomScale}` : "none")}
                                fillOpacity={room.style?.opacity ?? diagramStyle.opacity}
                                fill={room.style?.fill}
                                stroke={room.style?.stroke}
                                style={{
                                    filter: diagramStyle.shadow === 'shadow-md' ? 'drop-shadow(0 4px 6px rgb(0 0 0 / 0.1))' :
                                        diagramStyle.shadow === 'shadow-sm' ? 'drop-shadow(0 1px 2px rgb(0 0 0 / 0.1))' :
                                            diagramStyle.shadow === 'shadow-none' ? 'none' : 'drop-shadow(0 1px 2px rgb(0 0 0 / 0.1))',
                                    transition: 'none'
                                }}
                            />
                            {/* Polygon Edges (Hit Areas for Editing) */}
                            {isSelected && activePoints.map((p, i) => {
                                const next = activePoints[(i + 1) % activePoints.length];

                                if (room.shape === 'bubble') {
                                    const p0 = activePoints[(i - 1 + activePoints.length) % activePoints.length];
                                    const p1 = p;
                                    const p2 = next;
                                    const p3 = activePoints[(i + 2) % activePoints.length];

                                    const cp1x = p1.x + (p2.x - p0.x) / 6;
                                    const cp1y = p1.y + (p2.y - p0.y) / 6;
                                    const cp2x = p2.x - (p3.x - p1.x) / 6;
                                    const cp2y = p2.y - (p3.y - p1.y) / 6;

                                    const d = `M ${p1.x},${p1.y} C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;

                                    return (
                                        <path
                                            key={`edge-${i}`}
                                            d={d}
                                            stroke="rgba(0,0,0,0)"
                                            strokeWidth={12 / zoomScale}
                                            fill="none"
                                            className="cursor-move hover:stroke-orange-600/50 pointer-events-auto transition-colors duration-75"
                                            onMouseEnter={() => setHoveredEdge(i)}
                                            onMouseLeave={() => setHoveredEdge(null)}
                                            onPointerDown={(e) => handleEdgeDown(e, i)}
                                        />
                                    );
                                }

                                return (
                                    <line
                                        key={`edge-${i}`}
                                        x1={p.x} y1={p.y} x2={next.x} y2={next.y}
                                        stroke="rgba(0,0,0,0)"
                                        strokeWidth={12 / zoomScale}
                                        className="cursor-move hover:stroke-orange-600/50 pointer-events-auto transition-colors duration-75"
                                        onMouseEnter={() => setHoveredEdge(i)}
                                        onMouseLeave={() => setHoveredEdge(null)}
                                        onPointerDown={(e) => handleEdgeDown(e, i)}
                                    />
                                );
                            })}
                        </svg>
                        {/* Vertices */}
                        {isSelected && activePoints.map((p, i) => (
                            <div
                                key={`v-${i}`}
                                className={`absolute border rounded-full z-[80] hover:scale-150 cursor-crosshair pointer-events-auto ${selectedVertices.has(i) ? 'bg-orange-600 border-white scale-125' : 'bg-white border-orange-600'}`}
                                style={{
                                    left: p.x, top: p.y,
                                    width: 10 / zoomScale, height: 10 / zoomScale,
                                    transform: 'translate(-50%, -50%)',
                                    opacity: (hoveredVertex === i || draggedVertex === i || selectedVertices.has(i)) ? 1 : 0.5,
                                    boxShadow: selectedVertices.has(i) ? '0 0 0 2px rgba(255,255,255,0.8), 0 0 10px rgba(0,0,0,0.2)' : 'none'
                                }}
                                onMouseEnter={() => setHoveredVertex(i)}
                                onMouseLeave={() => setHoveredVertex(null)}
                                onContextMenu={(e) => handleVertexContextMenu(e, i)}
                                onPointerDown={(e) => handleVertexDown(e, i)}
                            />
                        ))}
                    </div>
                ) : (
                    <div
                        className={`absolute top-0 left-0 ${diagramStyle.shadow} ${!room.style?.fill ? visualStyle.bg : ''} ${!room.style?.stroke ? visualStyle.border : ''}`}
                        style={{
                            width: room.width, height: room.height,
                            backgroundColor: room.style?.fill,
                            borderColor: room.style?.stroke,
                            borderStyle: 'solid',
                            borderWidth: (room.style?.strokeWidth ?? appSettings.strokeWidth) / zoomScale,
                            opacity: room.style?.opacity ?? diagramStyle.opacity,
                            borderRadius: (room.style?.cornerRadius ?? appSettings.cornerRadius)
                        }}
                    />
                )}

                {/* Snap Guides (Shared for all shapes) */}
                <svg className="overflow-visible absolute top-0 left-0 w-full h-full pointer-events-none">
                    {snapLines.map((guide, i) => (
                        <React.Fragment key={i}>
                            {guide.x !== undefined && (
                                <line
                                    x1={guide.x} y1={-10000} x2={guide.x} y2={10000}
                                    stroke="#3b82f6" strokeWidth={1 / zoomScale} strokeDasharray={`${4 / zoomScale},${4 / zoomScale}`}
                                    className="pointer-events-none"
                                />
                            )}
                            {guide.y !== undefined && (
                                <line
                                    x1={-10000} y1={guide.y} x2={10000} y2={guide.y}
                                    stroke="#3b82f6" strokeWidth={1 / zoomScale} strokeDasharray={`${4 / zoomScale},${4 / zoomScale}`}
                                    className="pointer-events-none"
                                />
                            )}
                        </React.Fragment>
                    ))}
                </svg>

                {/* Handles - RESIZE ALL CORNERS (NW, NE, SW, SE) */}
                {!room.polygon && room.shape !== 'bubble' && isSelected && !isDragging && (
                    <>
                        <RenderCorner
                            cursor="nw-resize"
                            pos={{ top: '0%', left: '0%' }}
                            zoomScale={zoomScale}
                            onPointerDown={(e) => handleResizeStart(e, 'nw')}
                        />
                        <RenderCorner
                            cursor="ne-resize"
                            pos={{ top: '0%', left: '100%' }}
                            zoomScale={zoomScale}
                            onPointerDown={(e) => handleResizeStart(e, 'ne')}
                        />
                        <RenderCorner
                            cursor="sw-resize"
                            pos={{ top: '100%', left: '0%' }}
                            zoomScale={zoomScale}
                            onPointerDown={(e) => handleResizeStart(e, 'sw')}
                        />
                        <RenderCorner
                            cursor="se-resize"
                            pos={{ top: '100%', left: '100%' }}
                            zoomScale={zoomScale}
                            onPointerDown={(e) => handleResizeStart(e, 'se')}
                        />
                    </>
                )}

                {/* Rotation Handle */}
                {!room.polygon && room.shape !== 'bubble' && isSelected && !isDragging && (
                    <div
                        className="absolute left-1/2 top-0 -translate-x-1/2"
                        style={{ transform: `translate(0, 0) scale(${1 / zoomScale})` }}
                    >
                        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-px bg-orange-600 h-[30px]" />
                        <div
                            className="absolute -top-[30px] left-1/2 -translate-x-1/2 w-3 h-3 bg-white border-2 border-orange-600 rounded-full hover:bg-orange-600 shadow-lg active:scale-150"
                            style={{ cursor: ROTATE_CURSOR }}
                            onPointerDown={handleRotateStart}
                        />
                    </div>
                )}

                {/* Dimensions Display during Resize */}
                {resizeHandle && (
                    <>
                        <div
                            className="absolute top-0 left-1/2 bg-slate-900/80 text-white text-[10px] font-bold px-2 py-1 rounded-md pointer-events-none whitespace-nowrap backdrop-blur-sm z-[100]"
                            style={{
                                transform: `translate(-50%, -100%) scale(${1 / zoomScale})`,
                                transformOrigin: 'bottom center',
                                marginTop: `${-4 / zoomScale}px`
                            }}
                        >
                            {(room.width / pixelsPerMeter).toFixed(2)}m
                        </div>
                        <div
                            className="absolute top-1/2 left-0 bg-slate-900/80 text-white text-[10px] font-bold px-2 py-1 rounded-md pointer-events-none whitespace-nowrap backdrop-blur-sm z-[100]"
                            style={{
                                transform: `translate(-50%, -50%) rotate(-90deg) scale(${1 / zoomScale})`,
                                transformOrigin: 'center',
                            }}
                        >
                            {(room.height / pixelsPerMeter).toFixed(2)}m
                        </div>
                    </>
                )}

                {/* Content */}
                <div
                    className="absolute flex flex-col items-center justify-center pointer-events-none"
                    style={{
                        left: textPos.x - bounds.width / 2,
                        top: textPos.y - bounds.height / 2,
                        width: bounds.width,
                        height: bounds.height,
                        transform: `rotate(${- (room.rotation || 0)}deg)`,
                        transition: 'none'
                    }}
                    onPointerDown={handleTextMouseDown}
                >
                    <div className="relative flex flex-col items-center w-full">

                        <div
                            lang="en"
                            style={{
                                fontSize: appSettings.fontSize,
                                hyphens: 'auto',
                                WebkitHyphens: 'auto',
                                MozHyphens: 'auto',
                                msHyphens: 'auto'
                            }}
                            className={`flex flex-col items-center w-full px-2 text-center ${visualStyle.text} ${diagramStyle.fontFamily} leading-tight select-none ${room.isTextUnlocked ? 'pointer-events-auto cursor-move' : 'pointer-events-auto'}`}
                        >
                            <div className="font-bold w-full">
                                {wrappedNameLines.map((line, i) => (
                                    <div key={i}>{line}</div>
                                ))}
                            </div>
                            <span className="text-[0.8em] opacity-70 font-sans whitespace-nowrap">{Number(room.area.toFixed(2))}m²</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Rotation Tooltip */}
            {rotateTooltip && createPortal(
                <div
                    className="fixed pointer-events-none z-[100] bg-slate-900/80 text-white text-xs font-bold px-2 py-1 rounded-md backdrop-blur-sm shadow-lg border border-white/10"
                    style={{
                        left: rotateTooltip.x,
                        top: rotateTooltip.y,
                        transform: 'translate(16px, 16px)'
                    }}
                >
                    {Math.round((rotateTooltip.angle % 360 + 360) % 360)}°
                </div>,
                document.body
            )}
        </div>
    );
};

export const Bubble = React.memo(BubbleComponent);