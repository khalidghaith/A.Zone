import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Room, ZONE_COLORS, Point, DiagramStyle, AppSettings } from '../types';
import { Pencil, X, LandPlot, Link as LinkIcon, ArrowUpFromLine, ArrowDownToLine, Box } from 'lucide-react';
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
    isLinkingSource?: boolean;
    pixelsPerMeter: number;
    floors: { id: number; label: string }[];
    appSettings: AppSettings;
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

const BubbleComponent: React.FC<BubbleProps> = ({
    room, zoomScale, updateRoom, isSelected, onSelect, diagramStyle, snapEnabled, snapPixelUnit,
    getSnappedPosition, onLinkToggle, isLinkingSource, pixelsPerMeter = 20, floors, appSettings
}) => {
    const [isDragging, setIsDragging] = useState(false);
    const [resizeHandle, setResizeHandle] = useState<string | null>(null);
    const [showTools, setShowTools] = useState(false);

    // Polygon Editing State
    const [hoveredVertex, setHoveredVertex] = useState<number | null>(null);
    const [hoveredEdge, setHoveredEdge] = useState<number | null>(null);
    const [draggedVertex, setDraggedVertex] = useState<number | null>(null);
    const [draggedEdge, setDraggedEdge] = useState<number | null>(null);
    const [isExtruding, setIsExtruding] = useState(false);
    const [polygonSnapshot, setPolygonSnapshot] = useState<Point[] | null>(null);

    const [selectedVertices, setSelectedVertices] = useState<Set<number>>(new Set());

    const bubbleRef = useRef<HTMLDivElement>(null);
    const startDragState = useRef({
        startX: 0, startY: 0,
        roomX: room.x, roomY: room.y, roomW: room.width, roomH: room.height
    });

    const getZoneStyle = (z: string) => {
        const key = Object.keys(ZONE_COLORS).find(k => z.toLowerCase().includes(k.toLowerCase()));
        return key ? ZONE_COLORS[key] : ZONE_COLORS['Default'];
    };
    const visualStyle = getZoneStyle(room.zone);

    const activePoints = useMemo(() => room.polygon || [
        { x: 0, y: 0 }, { x: room.width, y: 0 }, { x: room.width, y: room.height }, { x: 0, y: room.height }
    ], [room.polygon, room.width, room.height]);

    const polygonPath = useMemo(() => createRoundedPath(activePoints, appSettings.cornerRadius), [activePoints, appSettings.cornerRadius]);

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

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            const dxScreen = e.clientX - startDragState.current.startX;
            const dyScreen = e.clientY - startDragState.current.startY;
            const dxWorld = dxScreen / zoomScale;
            const dyWorld = dyScreen / zoomScale;

            if (resizeHandle) {
                const s = startDragState.current;
                const minSize = 20;
                let nW = s.roomW;
                let nH = s.roomH;

                if (resizeHandle === 'se') {
                    const areaPx = s.roomW * s.roomH;
                    let targetW = Math.max(minSize, s.roomW + dxWorld);
                    let targetH = Math.max(minSize, s.roomH + dyWorld);

                    if (snapEnabled && appSettings.snapWhileScaling) {
                        // Try to snap the bottom-right corner
                        // We construct a dummy room representing the new bottom-right corner to use getSnappedPosition
                        // This is a bit hacky but reuses the logic.
                        // We want to snap the point (roomX + targetW, roomY + targetH)
                        if (getSnappedPosition) {
                            const currentRight = s.roomX + targetW;
                            const currentBottom = s.roomY + targetH;
                            const snapped = getSnappedPosition({ ...room, x: currentRight, y: currentBottom, width: 0, height: 0 }, room.id);
                            targetW = Math.max(minSize, snapped.x - s.roomX);
                            targetH = Math.max(minSize, snapped.y - s.roomY);
                        }
                    }

                    const ratio = targetW / targetH;
                    nW = Math.sqrt(areaPx * ratio);
                    nH = areaPx / nW;
                    updateRoom(room.id, { width: nW, height: nH });
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
                updateRoom(room.id, { x: nX, y: nY });
            }
        };

        const handleMouseUp = () => {
            setIsDragging(false);
            setResizeHandle(null);
            setDraggedVertex(null);
            setDraggedEdge(null);
            setIsExtruding(false);
            setPolygonSnapshot(null);
            if (getSnappedPosition) getSnappedPosition(room, '');
        };

        if (isDragging || resizeHandle || draggedVertex !== null || draggedEdge !== null) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        }
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging, resizeHandle, draggedVertex, draggedEdge, isExtruding, polygonSnapshot, room.id, zoomScale, updateRoom, snapEnabled, snapPixelUnit, selectedVertices, appSettings.snapWhileScaling, getSnappedPosition]);

    const handleResizeStart = (e: React.MouseEvent, handle: string) => {
        e.stopPropagation();
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

        onSelect(room.id, e.shiftKey || e.ctrlKey || e.metaKey);
        setIsDragging(true);
        startDragState.current = {
            startX: e.clientX, startY: e.clientY,
            roomX: room.x, roomY: room.y, roomW: room.width, roomH: room.height
        };
    };

    // Polygon Handling
    const handleVertexDown = (e: React.MouseEvent, index: number) => {
        e.stopPropagation();
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

    const RenderCorner = ({ cursor, pos }: { cursor: string, pos: React.CSSProperties }) => (
        <div
            className="absolute z-[70]"
            style={{ ...pos, transform: `translate(-50%, -50%) scale(${1 / zoomScale})` }}
        >
            <div
                className="w-3 h-3 bg-white border-2 border-primary rounded-full hover:bg-primary transition-all cursor-pointer shadow-lg active:scale-150"
                style={{ cursor }}
                onMouseDown={(e) => handleResizeStart(e, cursor.replace('-resize', ''))}
            />
        </div>
    );

    const isInteracting = isDragging || resizeHandle !== null || draggedVertex !== null || draggedEdge !== null;

    return (
        <div
            ref={bubbleRef}
            className={`absolute ${isInteracting ? '' : 'bubble-transition'} pointer-events-auto ${isSelected ? 'z-20' : 'z-10'} ${isLinkingSource ? 'ring-4 ring-yellow-400 ring-offset-2 rounded-xl' : ''}`}
            style={{
                transform: `translate3d(${room.x}px, ${room.y}px, 0)`,
                width: room.polygon ? 0 : room.width,
                height: room.polygon ? 0 : room.height,
                cursor: isDragging ? 'grabbing' : 'grab'
            }}
            onMouseDown={handleMouseDown}
        >
            {/* Visual Surface */}
            <div className="relative group">
                {room.polygon ? (
                    <div className="overflow-visible absolute top-0 left-0">
                        <svg className="overflow-visible">
                            <path
                                d={polygonPath}
                                className={`${visualStyle.bg.replace('bg-', 'fill-')} ${visualStyle.border.replace('border-', 'stroke-')}`}
                                strokeWidth={appSettings.strokeWidth / zoomScale}
                                strokeDasharray={diagramStyle.sketchy ? `${10 / zoomScale},${10 / zoomScale}` : "none"}
                                fillOpacity={diagramStyle.opacity}
                                style={{
                                    filter: diagramStyle.shadow === 'shadow-md' ? 'drop-shadow(0 4px 6px rgb(0 0 0 / 0.1))' :
                                        diagramStyle.shadow === 'shadow-sm' ? 'drop-shadow(0 1px 2px rgb(0 0 0 / 0.1))' :
                                            diagramStyle.shadow === 'shadow-none' ? 'none' : 'drop-shadow(0 1px 2px rgb(0 0 0 / 0.1))'
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
                                        className="cursor-move hover:stroke-primary/20 transition-colors"
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
                                className={`absolute border rounded-full z-[80] hover:scale-150 ${isInteracting ? '' : 'transition-all'} cursor-crosshair ${selectedVertices.has(i) ? 'bg-primary border-white scale-125' : 'bg-white border-primary'}`}
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

                {/* Handles - RESIZE ONLY SE */}
                {!room.polygon && isSelected && !isDragging && (
                    <RenderCorner cursor="se-resize" pos={{ top: '100%', left: '100%' }} />
                )}

                {/* Dimensions Display during Resize */}
                {resizeHandle && (
                    <>
                        <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-slate-900/80 text-white text-[10px] font-bold px-2 py-1 rounded-md pointer-events-none whitespace-nowrap backdrop-blur-sm z-[100]" style={{ transform: `scale(${1 / zoomScale})` }}>
                            {(room.width / pixelsPerMeter).toFixed(2)}m
                        </div>
                        <div className="absolute top-1/2 -left-8 -translate-y-1/2 -translate-x-full bg-slate-900/80 text-white text-[10px] font-bold px-2 py-1 rounded-md pointer-events-none whitespace-nowrap backdrop-blur-sm z-[100]" style={{ transform: `scale(${1 / zoomScale})` }}>
                            {(room.height / pixelsPerMeter).toFixed(2)}m
                        </div>
                    </>
                )}

                {/* Content */}
                <div
                    className="absolute top-0 left-0 flex flex-col items-center justify-center pointer-events-none"
                    style={{ width: room.width, height: room.height }}
                >
                    <div style={{ transform: `scale(${1 / zoomScale})`, fontSize: appSettings.fontSize }} className={`flex flex-col items-center p-2 text-center ${visualStyle.text} ${diagramStyle.fontFamily}`}>
                        <span className="font-bold text-xs whitespace-nowrap">{room.name}</span>
                        <span className="text-[10px] opacity-60 font-mono">{room.area}m²</span>
                    </div>
                </div>

                {/* Mini Toolset */}
                <div
                    className={`absolute top-0 right-0 -mr-8 transition-opacity origin-top-left ${isSelected ? 'opacity-100' : 'opacity-0'}`}
                    style={{ transform: `scale(${1 / zoomScale})` }}
                >
                    <button onClick={(e) => { e.stopPropagation(); setShowTools(!showTools); }} className="p-1 bg-white dark:bg-dark-surface border border-slate-200 dark:border-dark-border rounded-full shadow-sm hover:text-primary dark:text-gray-300">
                        {showTools ? <X size={12} /> : <Pencil size={12} />}
                    </button>
                    {showTools && (
                        <div className="absolute top-8 right-0 bg-white dark:bg-dark-surface shadow-2xl rounded-xl border border-slate-200 dark:border-dark-border flex flex-col p-1 z-50 min-w-[140px] slide-in-bottom">
                            {room.polygon ? (
                                <button onClick={(e) => {
                                    e.stopPropagation();
                                    // Convert to Bubble
                                    // Calculate area to maintain size
                                    // Area = width * height (approx)
                                    // We have room.area (m2).
                                    // W = sqrt(area * 400) (since 20px/m, 400px2/m2)
                                    const side = Math.sqrt(room.area * 400);
                                    updateRoom(room.id, { polygon: null, width: side, height: side });
                                    setShowTools(false);
                                }} className="p-2.5 hover:bg-slate-50 dark:hover:bg-white/5 text-[10px] font-bold flex items-center gap-3 whitespace-nowrap text-slate-600 dark:text-gray-300 rounded-lg transition-colors">
                                    <Box size={14} className="text-primary" /> Convert to Bubble
                                </button>
                            ) : (
                                <button onClick={(e) => {
                                    e.stopPropagation();
                                    updateRoom(room.id, { polygon: activePoints });
                                    setShowTools(false);
                                }} className="p-2.5 hover:bg-slate-50 dark:hover:bg-white/5 text-[10px] font-bold flex items-center gap-3 whitespace-nowrap text-slate-600 dark:text-gray-300 rounded-lg transition-colors">
                                    <LandPlot size={14} className="text-primary" /> Convert to Polygon
                                </button>
                            )}

                            <button onClick={() => onLinkToggle?.(room.id)} className={`p-2.5 hover:bg-slate-50 dark:hover:bg-white/5 text-[10px] font-bold flex items-center gap-3 whitespace-nowrap rounded-lg transition-colors ${isLinkingSource ? 'text-yellow-600 bg-yellow-50 dark:bg-yellow-900/20 dark:text-yellow-400' : 'text-slate-600 dark:text-gray-300'}`}>
                                <LinkIcon size={14} className={isLinkingSource ? 'text-yellow-500' : 'text-primary'} />
                                {isLinkingSource ? 'Cancel Linking' : 'Link Logic'}
                            </button>
                            <div className="h-px bg-slate-100 dark:bg-white/10 my-1 mx-1" />
                            <div className="flex justify-between px-1">
                                <button onClick={(e) => { e.stopPropagation(); const idx = floors.findIndex(f => f.id === room.floor); if (idx < floors.length - 1) updateRoom(room.id, { floor: floors[idx + 1].id }); }} className="p-2 hover:bg-slate-50 dark:hover:bg-white/5 text-slate-400 dark:text-gray-400 hover:text-primary dark:hover:text-primary rounded-lg" title="Level Up"><ArrowUpFromLine size={14} /></button>
                                <button onClick={(e) => { e.stopPropagation(); const idx = floors.findIndex(f => f.id === room.floor); if (idx > 0) updateRoom(room.id, { floor: floors[idx - 1].id }); }} className="p-2 hover:bg-slate-50 dark:hover:bg-white/5 text-slate-400 dark:text-gray-400 hover:text-primary dark:hover:text-primary rounded-lg" title="Level Down"><ArrowDownToLine size={14} /></button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export const Bubble = React.memo(BubbleComponent);