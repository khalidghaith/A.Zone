import React, { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Room, Point, DiagramStyle, AppSettings, ZoneColor } from '../types';
import { Pencil, X, LandPlot, Link as LinkIcon, ArrowUpFromLine, ArrowDownToLine, Square } from 'lucide-react';
import { createRoundedPath } from '../utils/geometry';

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
    onDragEnd?: (room: Room, e: MouseEvent) => void;
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

const calculateCentroid = (points: Point[]): Point => {
    let x = 0, y = 0;
    for (const p of points) {
        x += p.x;
        y += p.y;
    }
    return { x: x / points.length, y: y / points.length };
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

const RenderCorner = ({ cursor, pos, zoomScale, onMouseDown }: { cursor: string, pos: React.CSSProperties, zoomScale: number, onMouseDown: (e: React.MouseEvent) => void }) => (
    <div
        className="absolute z-[70]"
        style={{ ...pos, transform: `translate(-50%, -50%) scale(${1 / zoomScale})` }}
    >
        <div
            className="w-3 h-3 bg-white border-2 border-orange-600 rounded-full hover:bg-orange-600 transition-all cursor-pointer shadow-lg active:scale-150"
            style={{ cursor }}
            onMouseDown={onMouseDown}
        />
    </div>
);

const ROTATE_CURSOR = `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' style='filter: drop-shadow(1px 1px 0px white);'><path d='M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.3'/></svg>") 12 12, auto`;

const BubbleComponent: React.FC<BubbleProps> = ({
    room, zoomScale, updateRoom, isSelected, onSelect, diagramStyle, snapEnabled, snapPixelUnit,
    getSnappedPosition, onLinkToggle, isLinkingSource, pixelsPerMeter = 20, floors, appSettings, zoneColors, onDragEnd, onDragStart, onMove, isAnyDragging
}) => {
    const [isDragging, setIsDragging] = useState(false);
    const [isRotating, setIsRotating] = useState(false);
    const [resizeHandle, setResizeHandle] = useState<string | null>(null);
    const [rotateTooltip, setRotateTooltip] = useState<{ x: number, y: number, angle: number } | null>(null);
    const [showTools, setShowTools] = useState(false);

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

    const bubbleRef = useRef<HTMLDivElement>(null);
    const startDragState = useRef({
        startX: 0, startY: 0,
        roomX: room.x, roomY: room.y, roomW: room.width, roomH: room.height
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

    const snap = (val: number) => {
        if (!snapEnabled) return val;
        return Math.round(val / snapPixelUnit) * snapPixelUnit;
    };

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

                const newArea = Number((calculatePolygonArea(newPoints) / (pixelsPerMeter * pixelsPerMeter)).toFixed(2));
                updateRoom(room.id, { polygon: newPoints, area: newArea > 0 ? newArea : room.area });
                setSelectedVertices(new Set());
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedVertices, activePoints, room.id, updateRoom]);

    const handleRotateStart = (e: React.MouseEvent) => {
        e.stopPropagation();
        onDragStart?.();
        setIsRotating(true);
        // We don't need to store start state for rotation if we calculate absolute angle from center
    };

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            const dxScreen = e.clientX - startDragState.current.startX;
            const dyScreen = e.clientY - startDragState.current.startY;
            const dxWorld = dxScreen / zoomScale;
            const dyWorld = dyScreen / zoomScale;

            if (!hasMoved.current && (Math.abs(dxScreen) > 2 || Math.abs(dyScreen) > 2)) {
                hasMoved.current = true;
            }

            if (resizeHandle) {
                const s = startDragState.current;
                const minSize = 20;
                const areaPx = s.roomW * s.roomH;

                // 1. Calculate target dimensions based on mouse delta and handle direction
                let targetW = s.roomW;
                let targetH = s.roomH;

                if (resizeHandle.includes('e')) {
                    targetW = Math.max(minSize, s.roomW + dxWorld);
                } else {
                    targetW = Math.max(minSize, s.roomW - dxWorld);
                }

                if (resizeHandle.includes('s')) {
                    targetH = Math.max(minSize, s.roomH + dyWorld);
                } else {
                    targetH = Math.max(minSize, s.roomH - dyWorld);
                }

                // 2. Snapping
                if (snapEnabled && appSettings.snapWhileScaling && getSnappedPosition) {
                    const rawX = resizeHandle.includes('e') ? s.roomX + s.roomW + dxWorld : s.roomX + dxWorld;
                    const rawY = resizeHandle.includes('s') ? s.roomY + s.roomH + dyWorld : s.roomY + dyWorld;

                    const snapped = getSnappedPosition({ ...room, x: rawX, y: rawY, width: 0, height: 0 }, room.id);

                    if (resizeHandle.includes('e')) targetW = Math.max(minSize, snapped.x - s.roomX);
                    else targetW = Math.max(minSize, (s.roomX + s.roomW) - snapped.x);

                    if (resizeHandle.includes('s')) targetH = Math.max(minSize, snapped.y - s.roomY);
                    else targetH = Math.max(minSize, (s.roomY + s.roomH) - snapped.y);
                }

                // 3. Aspect Ratio Preservation
                const ratio = targetW / targetH;
                const nW = Math.sqrt(areaPx * ratio);
                const nH = areaPx / nW;

                // 4. Adjust Position (if resizing from left or top)
                let nX = s.roomX;
                let nY = s.roomY;
                if (resizeHandle.includes('w')) nX = s.roomX + (s.roomW - nW);
                if (resizeHandle.includes('n')) nY = s.roomY + (s.roomH - nH);

                updateRoom(room.id, { width: nW, height: nH, x: nX, y: nY });

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
                    } else if (snapEnabled) {
                        angleDeg = Math.round(angleDeg / 5) * 5;
                    }

                    updateRoom(room.id, { rotation: angleDeg });
                    setRotateTooltip({ x: e.clientX, y: e.clientY, angle: angleDeg });
                }
            } else if (draggedVertex !== null && polygonSnapshot && room.shape === 'bubble') {
                // --- BUBBLE PHYSICS: AREA PRESERVATION ---
                const newPoints = [...polygonSnapshot];
                const v = newPoints[draggedVertex];
                
                // 1. Move the dragged vertex to mouse position
                const targetX = v.x + dxWorld;
                const targetY = v.y + dyWorld;
                newPoints[draggedVertex] = { x: targetX, y: targetY };

                // 2. Calculate current area and centroid
                const currentArea = calculatePolygonArea(newPoints);
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

                indicesToMove.forEach(index => {
                    // Safe check
                    if (index >= newPoints.length) return;

                    const v = newPoints[index];
                    // We apply delta from snapshot
                    // Note: logic assumes dragging relative to START.
                    // Since we use polygonSnapshot (original state), we can simply add dxWorld to original pos.

                    // Optimization: if dragging multiple, snap might behave weirdly if we snap each individually.
                    // Usually we snap the PRIMARY dragged vertex, and apply the same delta to others?
                    // Or snap all? Let's snap all for grid alignment consistency.

                    let nx = v.x + dxWorld;
                    let ny = v.y + dyWorld;

                    if (snapEnabled) {
                        nx = snap(nx);
                        ny = snap(ny);
                    }

                    newPoints[index] = { x: nx, y: ny };
                });

                const newArea = Number((calculatePolygonArea(newPoints) / (pixelsPerMeter * pixelsPerMeter)).toFixed(2));
                updateRoom(room.id, { polygon: newPoints, area: newArea > 0 ? newArea : room.area });

            } else if (draggedEdge !== null && polygonSnapshot) {
                // Moving Edge
                const newPoints = [...polygonSnapshot];
                const idx1 = draggedEdge;
                const idx2 = (draggedEdge + 1) % polygonSnapshot.length;

                if (isExtruding) {
                    const v1 = newPoints[idx1];
                    const v2 = newPoints[idx2];

                    let nx1 = v1.x + dxWorld;
                    let ny1 = v1.y + dyWorld;
                    let nx2 = v2.x + dxWorld;
                    let ny2 = v2.y + dyWorld;

                    if (snapEnabled) {
                        nx1 = snap(nx1); ny1 = snap(ny1);
                        nx2 = snap(nx2); ny2 = snap(ny2);
                    }

                    newPoints[idx1] = { x: nx1, y: ny1 };
                    newPoints[idx2] = { x: nx2, y: ny2 };

                } else {
                    // Standard Edge Drag
                    const v1 = newPoints[idx1];
                    const v2 = newPoints[idx2];

                    let nx1 = v1.x + dxWorld;
                    let ny1 = v1.y + dyWorld;
                    let nx2 = v2.x + dxWorld;
                    let ny2 = v2.y + dyWorld;

                    if (snapEnabled) {
                        nx1 = snap(nx1); ny1 = snap(ny1);
                        nx2 = snap(nx2); ny2 = snap(ny2);
                    }

                    newPoints[idx1] = { x: nx1, y: ny1 };
                    newPoints[idx2] = { x: nx2, y: ny2 };
                }

                const newArea = Number((calculatePolygonArea(newPoints) / (pixelsPerMeter * pixelsPerMeter)).toFixed(2));
                updateRoom(room.id, { polygon: newPoints, area: newArea > 0 ? newArea : room.area });

            } else if (isDragging) {
                // Moving Whole Room
                let nX = startDragState.current.roomX + dxWorld;
                let nY = startDragState.current.roomY + dyWorld;

                if (getSnappedPosition) {
                    const snapped = getSnappedPosition({ ...room, x: nX, y: nY }, room.id);
                    nX = snapped.x;
                    nY = snapped.y;
                }
                if (onMove) {
                    onMove(nX, nY);
                } else {
                    updateRoom(room.id, { x: nX, y: nY });
                }
            }
        };

        const handleMouseUp = (e: MouseEvent) => {
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
            setIsRotating(false);
            setRotateTooltip(null);
            setResizeHandle(null);
            setDraggedVertex(null);
            setDraggedEdge(null);
            setIsExtruding(false);
            setPolygonSnapshot(null);
            if (getSnappedPosition) getSnappedPosition(room, '');
        };

        if (isDragging || isRotating || resizeHandle || draggedVertex !== null || draggedEdge !== null) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        }
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging, isRotating, resizeHandle, draggedVertex, draggedEdge, isExtruding, polygonSnapshot, room.id, zoomScale, updateRoom, snapEnabled, snapPixelUnit, selectedVertices, appSettings.snapWhileScaling, getSnappedPosition, onDragEnd, onMove, isSelected, onSelect]);

    const handleResizeStart = (e: React.MouseEvent, handle: string) => {
        e.stopPropagation();
        onDragStart?.();
        setResizeHandle(handle);
        startDragState.current = {
            startX: e.clientX, startY: e.clientY,
            roomX: room.x, roomY: room.y, roomW: room.width, roomH: room.height
        };
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        e.stopPropagation();
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
            roomX: room.x, roomY: room.y, roomW: room.width, roomH: room.height
        };
    };

    // Polygon Handling
    const handleVertexDown = (e: React.MouseEvent, index: number) => {
        e.stopPropagation();
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
            roomX: 0, roomY: 0, roomW: 0, roomH: 0
        };
    };

    const handleEdgeDown = (e: React.MouseEvent, index: number) => {
        e.stopPropagation();
        onDragStart?.();

        // Clear vertex selection when starting to drag an edge
        if (selectedVertices.size > 0) setSelectedVertices(new Set());

        // Double Click Check: Insert Vertex
        if (e.detail === 2) {
            if (!bubbleRef.current) return;
            const rect = bubbleRef.current.getBoundingClientRect();
            let localX = (e.clientX - rect.left) / zoomScale;
            let localY = (e.clientY - rect.top) / zoomScale;

            if (snapEnabled) {
                localX = snap(localX);
                localY = snap(localY);
            }

            const newPoints = [...activePoints];
            // Insert at index + 1 (after the start node of the edge)
            newPoints.splice(index + 1, 0, { x: localX, y: localY });

            const newArea = Number((calculatePolygonArea(newPoints) / (pixelsPerMeter * pixelsPerMeter)).toFixed(2));
            updateRoom(room.id, { polygon: newPoints, area: newArea > 0 ? newArea : room.area });

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
            roomX: 0, roomY: 0, roomW: 0, roomH: 0
        };
    };

    const convertToPolygon = (e: React.MouseEvent) => {
        e.stopPropagation();
        
        let capturedStyle: any = undefined;
        
        if (bubbleRef.current) {
            // Find the visual rectangle div to capture its computed styles
            const rectDiv = bubbleRef.current.querySelector('div.relative > div.absolute.top-0.left-0:not(.pointer-events-none)');
            if (rectDiv) {
                const style = window.getComputedStyle(rectDiv);
                capturedStyle = {
                    fill: style.backgroundColor,
                    stroke: style.borderColor,
                    strokeWidth: parseFloat(style.borderWidth) * zoomScale,
                    opacity: parseFloat(style.opacity)
                };
            }
        }

        updateRoom(room.id, { polygon: activePoints, style: capturedStyle });
        setShowTools(false);
    };

    const convertToBubble = (e: React.MouseEvent) => {
        e.stopPropagation();
        
        // If converting from rect, make a circle-ish polygon first
        let newPoints = activePoints;
        if (!room.polygon) {
            const cx = room.width / 2;
            const cy = room.height / 2;
            const r = Math.min(room.width, room.height) / 2;
            const numPoints = 8;
            newPoints = [];
            for (let i = 0; i < numPoints; i++) {
                const theta = (i / numPoints) * Math.PI * 2;
                newPoints.push({
                    x: cx + r * Math.cos(theta),
                    y: cy + r * Math.sin(theta)
                });
            }
        }
        updateRoom(room.id, { polygon: newPoints, shape: 'bubble' });
        setShowTools(false);
    };

    const isInteracting = isDragging || isRotating || resizeHandle !== null || draggedVertex !== null || draggedEdge !== null;
    const disableTransition = isInteracting || (isSelected && isAnyDragging);

    return (
        <div
            ref={bubbleRef}
            className={`absolute ${disableTransition ? '' : 'bubble-transition'} pointer-events-auto ${isSelected ? 'z-20' : 'z-10'} ${isLinkingSource ? 'ring-4 ring-yellow-400 ring-offset-2 rounded-xl' : ''}`}
            style={{
                transform: `translate3d(${room.x}px, ${room.y}px, 0) rotate(${room.rotation || 0}deg)`,
                width: (room.polygon || room.shape === 'bubble') ? 0 : room.width,
                height: (room.polygon || room.shape === 'bubble') ? 0 : room.height,
                cursor: isDragging ? 'grabbing' : 'grab'
            }}
            onMouseDown={handleMouseDown}
        >
            {/* Visual Surface */}
            <div className="relative group w-full h-full">
                {(room.polygon || room.shape === 'bubble') ? (
                    <div className="overflow-visible absolute top-0 left-0">
                        <svg className="overflow-visible">
                            <path
                                d={polygonPath}
                                className={room.style ? '' : `${visualStyle.bg.replace('bg-', 'fill-')} ${visualStyle.border.replace('border-', 'stroke-')}`}
                                strokeWidth={(room.style?.strokeWidth ?? appSettings.strokeWidth) / zoomScale}
                                strokeDasharray={diagramStyle.sketchy ? `${10 / zoomScale},${10 / zoomScale}` : "none"}
                                fillOpacity={room.style?.opacity ?? diagramStyle.opacity}
                                fill={room.style?.fill}
                                stroke={room.style?.stroke}
                                style={{
                                    filter: diagramStyle.shadow === 'shadow-md' ? 'drop-shadow(0 4px 6px rgb(0 0 0 / 0.1))' :
                                        diagramStyle.shadow === 'shadow-sm' ? 'drop-shadow(0 1px 2px rgb(0 0 0 / 0.1))' :
                                            diagramStyle.shadow === 'shadow-none' ? 'none' : 'drop-shadow(0 1px 2px rgb(0 0 0 / 0.1))',
                                    transition: room.shape === 'bubble' && wobbleTime > 0 ? 'none' : 'd 0.3s ease'
                                }}
                            />
                            {/* Polygon Edges (Hit Areas for Editing) */}
                            {isSelected && activePoints.map((p, i) => {
                                const next = activePoints[(i + 1) % activePoints.length];
                                return (
                                    <line
                                        key={`edge-${i}`}
                                        x1={p.x} y1={p.y} x2={next.x} y2={next.y}
                                        stroke="transparent"
                                        strokeWidth={10 / zoomScale}
                                        className="cursor-move hover:stroke-orange-600/20 transition-colors"
                                        onMouseEnter={() => setHoveredEdge(i)}
                                        onMouseLeave={() => setHoveredEdge(null)}
                                        onMouseDown={(e) => handleEdgeDown(e, i)}
                                    />
                                );
                            })}
                        </svg>
                        {/* Vertices */}
                        {isSelected && activePoints.map((p, i) => (
                            <div
                                key={`v-${i}`}
                                className={`absolute border rounded-full z-[80] hover:scale-150 ${isInteracting ? '' : 'transition-all'} cursor-crosshair ${selectedVertices.has(i) ? 'bg-orange-600 border-white scale-125' : 'bg-white border-orange-600'}`}
                                style={{
                                    left: p.x, top: p.y,
                                    width: 10 / zoomScale, height: 10 / zoomScale,
                                    transform: 'translate(-50%, -50%)',
                                    opacity: (hoveredVertex === i || draggedVertex === i || selectedVertices.has(i)) ? 1 : 0.5,
                                    boxShadow: selectedVertices.has(i) ? '0 0 0 2px rgba(255,255,255,0.8), 0 0 10px rgba(0,0,0,0.2)' : 'none'
                                }}
                                onMouseEnter={() => setHoveredVertex(i)}
                                onMouseLeave={() => setHoveredVertex(null)}
                                onMouseDown={(e) => handleVertexDown(e, i)}
                            />
                        ))}
                    </div>
                ) : (
                    <div
                        className={`absolute top-0 left-0 ${diagramStyle.cornerRadius} ${visualStyle.bg} ${visualStyle.border} ${diagramStyle.shadow} ${isInteracting ? '' : 'transition-all'}`}
                        style={{ 
                            width: room.width, height: room.height, 
                            borderWidth: appSettings.strokeWidth / zoomScale, 
                            opacity: diagramStyle.opacity,
                            borderRadius: appSettings.cornerRadius / zoomScale
                        }}
                    />
                )}

                {/* Handles - RESIZE ALL CORNERS (NW, NE, SW, SE) */}
                {!room.polygon && room.shape !== 'bubble' && isSelected && !isDragging && (
                    <>
                        <RenderCorner
                            cursor="nw-resize"
                            pos={{ top: '0%', left: '0%' }}
                            zoomScale={zoomScale}
                            onMouseDown={(e) => handleResizeStart(e, 'nw')}
                        />
                        <RenderCorner
                            cursor="ne-resize"
                            pos={{ top: '0%', left: '100%' }}
                            zoomScale={zoomScale}
                            onMouseDown={(e) => handleResizeStart(e, 'ne')}
                        />
                        <RenderCorner
                            cursor="sw-resize"
                            pos={{ top: '100%', left: '0%' }}
                            zoomScale={zoomScale}
                            onMouseDown={(e) => handleResizeStart(e, 'sw')}
                        />
                        <RenderCorner
                            cursor="se-resize"
                            pos={{ top: '100%', left: '100%' }}
                            zoomScale={zoomScale}
                            onMouseDown={(e) => handleResizeStart(e, 'se')}
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
                            className="absolute -top-[30px] left-1/2 -translate-x-1/2 w-3 h-3 bg-white border-2 border-orange-600 rounded-full hover:bg-orange-600 transition-all shadow-lg active:scale-150"
                            style={{ cursor: ROTATE_CURSOR }}
                            onMouseDown={handleRotateStart}
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
                        left: centroid.x - bounds.width / 2,
                        top: centroid.y - bounds.height / 2,
                        width: bounds.width, 
                        height: bounds.height,
                        transform: `rotate(${- (room.rotation || 0)}deg)` 
                    }}
                >
                    <div className="relative flex flex-col items-center w-full">
                        
                        {/* Edit Button - Centered above text */}
                        <div className={`absolute bottom-full mb-1 transition-opacity ${isSelected ? 'opacity-100' : 'opacity-0'} pointer-events-auto`}>
                             <button onClick={(e) => { e.stopPropagation(); setShowTools(!showTools); }} className="p-1.5 bg-white dark:bg-dark-surface border border-slate-200 dark:border-dark-border rounded-full shadow-sm hover:text-orange-600 dark:text-gray-300 flex items-center justify-center hover:scale-110 transition-all">
                                {showTools ? <X size={12} /> : <Pencil size={12} />}
                            </button>
                             {showTools && (
                                <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 bg-white dark:bg-dark-surface shadow-2xl rounded-xl border border-slate-200 dark:border-dark-border flex flex-col p-1 z-50 min-w-[140px] slide-in-bottom">
                                    {(room.polygon || room.shape === 'bubble') ? (
                                        <button onClick={(e) => {
                                            e.stopPropagation();
                                            const side = Math.sqrt(room.area * 400);
                                            updateRoom(room.id, { polygon: undefined, shape: 'rect', width: side, height: side });
                                            setShowTools(false);
                                        }} className="p-2.5 hover:bg-slate-50 dark:hover:bg-white/5 text-[10px] font-bold flex items-center gap-3 whitespace-nowrap text-slate-600 dark:text-gray-300 rounded-lg transition-colors">
                                            <Square size={14} className="text-orange-600" /> Convert to Bullion
                                        </button>
                                    ) : (
                                        <>
                                            <button onClick={convertToPolygon} className="p-2.5 hover:bg-slate-50 dark:hover:bg-white/5 text-[10px] font-bold flex items-center gap-3 whitespace-nowrap text-slate-600 dark:text-gray-300 rounded-lg transition-colors">
                                                <LandPlot size={14} className="text-orange-600" /> Convert to Polygon
                                            </button>
                                            <button onClick={convertToBubble} className="p-2.5 hover:bg-slate-50 dark:hover:bg-white/5 text-[10px] font-bold flex items-center gap-3 whitespace-nowrap text-slate-600 dark:text-gray-300 rounded-lg transition-colors">
                                                <div className="w-3.5 h-3.5 rounded-full border-2 border-orange-600"></div> Convert to Bubble
                                            </button>
                                        </>
                                    )}

                                    <button onClick={() => onLinkToggle?.(room.id)} className={`p-2.5 hover:bg-slate-50 dark:hover:bg-white/5 text-[10px] font-bold flex items-center gap-3 whitespace-nowrap rounded-lg transition-colors ${isLinkingSource ? 'text-yellow-600 bg-yellow-50 dark:bg-yellow-900/20 dark:text-yellow-400' : 'text-slate-600 dark:text-gray-300'}`}>
                                        <LinkIcon size={14} className={isLinkingSource ? 'text-yellow-500' : 'text-orange-600'} />
                                        {isLinkingSource ? 'Cancel Linking' : 'Link Logic'}
                                    </button>
                                    <div className="h-px bg-slate-100 dark:bg-white/10 my-1 mx-1" />
                                    <div className="flex justify-between px-1">
                                        <button onClick={(e) => { e.stopPropagation(); const idx = floors.findIndex(f => f.id === room.floor); if (idx < floors.length - 1) updateRoom(room.id, { floor: floors[idx + 1].id }); }} className="p-2 hover:bg-slate-50 dark:hover:bg-white/5 text-slate-400 dark:text-gray-400 hover:text-orange-600 dark:hover:text-orange-600 rounded-lg" title="Level Up"><ArrowUpFromLine size={14} /></button>
                                        <button onClick={(e) => { e.stopPropagation(); const idx = floors.findIndex(f => f.id === room.floor); if (idx > 0) updateRoom(room.id, { floor: floors[idx - 1].id }); }} className="p-2 hover:bg-slate-50 dark:hover:bg-white/5 text-slate-400 dark:text-gray-400 hover:text-orange-600 dark:hover:text-orange-600 rounded-lg" title="Level Down"><ArrowDownToLine size={14} /></button>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div 
                            lang="en"
                            style={{ 
                                fontSize: appSettings.fontSize,
                                hyphens: 'auto',
                                WebkitHyphens: 'auto',
                                MozHyphens: 'auto',
                                msHyphens: 'auto'
                            }}
                            className={`flex flex-col items-center w-full px-2 text-center ${visualStyle.text} ${diagramStyle.fontFamily} leading-tight select-none pointer-events-none`}
                        >
                            <span 
                                className="font-bold w-full" 
                                style={{ 
                                    wordBreak: 'normal',
                                    overflowWrap: 'break-word', 
                                    wordWrap: 'break-word', 
                                }}
                            >
                                {room.name}
                            </span>
                            <span className="text-[0.8em] opacity-70 font-sans whitespace-nowrap">{room.area}m²</span>
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