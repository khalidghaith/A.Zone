import React, { useState, useRef, useEffect } from 'react';
import { Annotation, AnnotationType, Point } from '../types';
import { SketchManager, PenTool } from '../SketchManager';

interface AnnotationLayerProps {
    annotations: Annotation[];
    isSketchMode: boolean;
    activeType: AnnotationType | 'eraser' | 'select';
    properties: any;
    currentFloor: number;
    scale: number;
    offset: { x: number, y: number };
    onAddAnnotation: (ann: Annotation) => void;
    onUpdateAnnotation?: (id: string, updates: Partial<Annotation>) => void;
    onDeleteAnnotation?: (id: string) => void;
    selectedAnnotationId?: string | null;
    onSelectAnnotation?: (id: string | null) => void;
    onInteractionStart?: () => void;
}

export const AnnotationLayer: React.FC<AnnotationLayerProps> = ({
    annotations, isSketchMode, activeType, properties, currentFloor, scale, offset, onAddAnnotation, onDeleteAnnotation, onUpdateAnnotation, selectedAnnotationId, onSelectAnnotation, onInteractionStart
}) => {
    const [points, setPoints] = useState<Point[]>([]);
    const [handles, setHandles] = useState<Point[]>([]);
    const [tempPoint, setTempPoint] = useState<Point | null>(null);
    const [step, setStep] = useState(0);
    const [isDragging, setIsDragging] = useState(false);
    const isDrawing = useRef(false);

    // Bezier Pen Tool State
    const [activeNodeIdx, setActiveNodeIdx] = useState<number | null>(null);
    const [dragHandleType, setDragHandleType] = useState<'anchor' | 'in' | 'out' | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const isDraggingAnnotation = useRef(false);
    const dragStartPos = useRef<Point | null>(null);
    const mouseDownTimestamp = useRef<number>(0);
    const isCreatingNode = useRef(false);

    // Text Editing State
    const [editingTextId, setEditingTextId] = useState<string | null>(null);
    const [textInputValue, setTextInputValue] = useState("");
    const [textInputPos, setTextInputPos] = useState<Point | null>(null);
    const textInputRef = useRef<HTMLTextAreaElement>(null);

    // Ref to track editing ID synchronously to avoid race conditions between onBlur and onMouseDown
    const editingIdRef = useRef<string | null>(null);
    // Sync ref with state
    useEffect(() => { editingIdRef.current = editingTextId; }, [editingTextId]);

    // Transform screen coordinates to world coordinates
    const toWorld = (clientX: number, clientY: number) => {
        if (!containerRef.current) return { x: 0, y: 0 };
        const rect = containerRef.current.getBoundingClientRect();
        return {
            x: (clientX - rect.left - offset.x) / scale,
            y: (clientY - rect.top - offset.y) / scale
        };
    };

    // Reset tool state
    const resetTool = () => {
        setPoints([]);
        setHandles([]);
        setTempPoint(null);
        setStep(0);
        setIsDragging(false);
        isDrawing.current = false;
        setActiveNodeIdx(null);
        setDragHandleType(null);
        isCreatingNode.current = false;
        // Don't clear selection on tool reset, only on explicit deselect
    };

    // Handle Escape key to cancel drawing
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                resetTool();
                if (editingTextId) {
                    commitText();
                }
                onSelectAnnotation?.(null);
            }
            if (e.key === 'Enter' && (activeType === 'polyline' || activeType === 'bezier') && points.length > 1) {
                onAddAnnotation({
                    id: `ann-${Date.now()}`,
                    type: 'polyline',
                    points: points,
                    floor: currentFloor,
                    style: properties
                });
                resetTool();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [activeType, points, currentFloor, properties, onAddAnnotation, editingTextId]);

    const handleMouseDown = (e: React.MouseEvent) => {
        if (!isSketchMode) return;

        // Eraser logic is handled by onClick on individual annotations.
        // We just prevent default to stop canvas panning and return.
        if (activeType === 'eraser') {
            e.preventDefault();
            return;
        }

        // Right click check
        if (e.button === 2) {
            return;
        }

        e.stopPropagation();
        e.preventDefault();
        mouseDownTimestamp.current = Date.now();

        const point = toWorld(e.clientX, e.clientY);

        // --- Select Tool Logic (Canvas Click) ---
        if (activeType === 'select') {
            // If we are clicking a handle, that logic is handled by the handle's onMouseDown (stopPropagation)
            // If we reach here, we are clicking empty space or the body of an annotation (if not stopped)
            if (!dragHandleType) {
                onSelectAnnotation?.(null);
            }
            return;
        }

        isDrawing.current = true;

        // --- Text Tool ---
        if (activeType === 'text') {
            // If already editing, commit
            if (editingIdRef.current) {
                commitText();
                return;
            }

            // Start new text
            setEditingTextId('new');
            setTextInputPos(point);
            setTextInputValue("");
            isDrawing.current = false;

            // Focus next tick
            setTimeout(() => textInputRef.current?.focus(), 10);
            return;
        }

        // --- Line Tool (Click-Start, Click-End) ---
        if (activeType === 'line') {
            if (points.length === 0) {
                setPoints([point]);
                setTempPoint(point);
            } else {
                onAddAnnotation({
                    id: `ann-${Date.now()}`,
                    type: 'line',
                    points: [points[0], point],
                    floor: currentFloor,
                    style: properties
                });
                resetTool();
            }
            return;
        }

        // --- Polyline Tool (Click to add points) ---
        if (activeType === 'polyline') {
            if (points.length === 0) {
                setPoints([point]);
                setTempPoint(point);
            } else {
                // Check if closing (5px tolerance)
                const startPoint = points[0];
                const dist = Math.hypot(point.x - startPoint.x, point.y - startPoint.y);
                if (dist < 5 / scale) {
                    onAddAnnotation({
                        id: `ann-${Date.now()}`,
                        type: 'polyline',
                        points: points,
                        floor: currentFloor,
                        style: properties,
                        ...({ closed: true } as any)
                    });
                    resetTool();
                    return;
                }
                setPoints(prev => [...prev, point]);
                setTempPoint(point);
            }
            return;
        }

        // --- Arc Tool (3-Point: Start -> Mid -> End) ---
        if (activeType === 'arc') {
            if (step === 0) {
                setPoints([point]);
                setTempPoint(point);
                setStep(1);
            } else if (step === 1) {
                setPoints(prev => [...prev, point]);
                setStep(2);
            } else if (step === 2) {
                const finalPoints = [...points, point];
                onAddAnnotation({
                    id: `ann-${Date.now()}`,
                    type: 'arc',
                    points: finalPoints,
                    floor: currentFloor,
                    style: properties
                });
                resetTool();
            }
            return;
        }

        // --- Bezier Pen Tool ---
        if (activeType === 'bezier') {
            // Check for closing path (5px tolerance)
            if (points.length >= 6) {
                const startAnchor = points[0];
                const dist = Math.hypot(point.x - startAnchor.x, point.y - startAnchor.y);
                if (dist < 5 / scale) {
                    onAddAnnotation({
                        id: `ann-${Date.now()}`,
                        type: 'bezier',
                        points: points,
                        floor: currentFloor,
                        style: properties,
                        ...({ closed: true } as any)
                    });
                    resetTool();
                    return;
                }
            }

            // Hit test for existing nodes (Anchor, In, Out)
            // We check anchors first, then handles
            const hitRadius = 8 / scale;
            let clickedNodeIdx = -1;
            let clickedHandle: 'anchor' | 'in' | 'out' | null = null;

            for (let i = 0; i < points.length; i += 3) {
                const anchor = points[i];
                const handleIn = points[i + 1];
                const handleOut = points[i + 2];

                if (Math.hypot(anchor.x - point.x, anchor.y - point.y) < hitRadius) { clickedNodeIdx = i; clickedHandle = 'anchor'; break; }
                if (Math.hypot(handleIn.x - point.x, handleIn.y - point.y) < hitRadius) { clickedNodeIdx = i; clickedHandle = 'in'; break; }
                if (Math.hypot(handleOut.x - point.x, handleOut.y - point.y) < hitRadius) { clickedNodeIdx = i; clickedHandle = 'out'; break; }
            }

            if (clickedNodeIdx !== -1 && clickedHandle) {
                // Select existing node/handle
                setActiveNodeIdx(clickedNodeIdx);
                setDragHandleType(clickedHandle);
                isCreatingNode.current = false;
            } else {
                // Add new node
                const newNode = PenTool.createNode(point);
                const newPoints = [...points, ...newNode];
                setPoints(newPoints);
                setActiveNodeIdx(newPoints.length - 3); // Index of the new anchor
                setDragHandleType('out'); // Default to dragging out-handle on creation
                isCreatingNode.current = true;
            }
            return;
        }

        // --- Standard 2-Point Tools (Line, Arrow, Rect, Circle) ---
        if (points.length === 0) {
            setPoints([point]);
            setTempPoint(point);
        }
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!isSketchMode) return;
        const point = toWorld(e.clientX, e.clientY);

        // --- Select Tool Dragging (Whole Annotation) ---
        if (activeType === 'select' && isDraggingAnnotation.current && selectedAnnotationId) {
            const currentPos = dragStartPos.current || point;
            const delta = {
                x: point.x - currentPos.x,
                y: point.y - currentPos.y
            };

            dragStartPos.current = point;

            const selectedAnn = annotations.find(a => a.id === selectedAnnotationId);
            if (selectedAnn) {
                const newPoints = selectedAnn.points.map(p => ({
                    x: p.x + delta.x,
                    y: p.y + delta.y
                }));
                onUpdateAnnotation?.(selectedAnnotationId, { points: newPoints });
            }
            return;
        }

        // --- Select Tool Dragging ---
        if (activeType === 'select' && isDrawing.current && selectedAnnotationId && activeNodeIdx !== null) {
            const selectedAnn = annotations.find(a => a.id === selectedAnnotationId);
            if (selectedAnn) {
                let newPoints = [...selectedAnn.points];
                if (selectedAnn.type === 'bezier') {
                    if (dragHandleType === 'anchor') {
                        const delta = { x: point.x - newPoints[activeNodeIdx].x, y: point.y - newPoints[activeNodeIdx].y };
                        newPoints = PenTool.moveNode(newPoints, activeNodeIdx, delta);
                    } else if (dragHandleType) {
                        newPoints = PenTool.updateHandle(newPoints, activeNodeIdx, dragHandleType, point, e.altKey);
                    }
                } else {
                    // Polyline/Line/Arc - just move the point
                    newPoints[activeNodeIdx] = point;
                }
                onUpdateAnnotation?.(selectedAnnotationId, { points: newPoints });
            }
            return;
        }

        if (activeType === 'polyline' || activeType === 'line') {
            if (points.length > 0) {
                setTempPoint(point);
            }
        } else if (activeType === 'arc') {
            if (step > 0) {
                setTempPoint(point);
            }
        } else if (activeType === 'bezier') {
            if (isDrawing.current) {
                if (activeNodeIdx !== null && dragHandleType) {
                    // If creating a new node, require 1s hold before dragging handles
                    if (isCreatingNode.current && Date.now() - mouseDownTimestamp.current < 300) {
                        return;
                    }

                    let newPoints = [...points];

                    if (dragHandleType === 'anchor') {
                        // Move anchor (and handles)
                        const currentAnchor = points[activeNodeIdx];
                        const delta = { x: point.x - currentAnchor.x, y: point.y - currentAnchor.y };
                        newPoints = PenTool.moveNode(newPoints, activeNodeIdx, delta);
                    } else {
                        // Move Handle
                        newPoints = PenTool.updateHandle(newPoints, activeNodeIdx, dragHandleType, point, e.altKey);
                    }
                    setPoints(newPoints);
                }
            } else if (points.length > 0) {
                // Preview line to next point
                setTempPoint(point);
            } else {
                // Moving mouse between P1 and P2 (Preview)
                setTempPoint(point);
            }
        } else {
            // Standard 2-Point Tools
            if (isDrawing.current && points.length > 0) {
                setTempPoint(point);
            }
        }
    };

    const handleMouseUp = (e: React.MouseEvent) => {
        if (!isSketchMode) return;
        const point = toWorld(e.clientX, e.clientY);
        isDrawing.current = false;

        if (activeType === 'select') {
            setActiveNodeIdx(null);
            setDragHandleType(null);
            isDraggingAnnotation.current = false;
            setIsDragging(false);
            dragStartPos.current = null;
            return;
        }

        // --- Bezier Tool Logic ---
        if (activeType === 'bezier') {
            // Stop dragging handles but keep the tool active for next point
            setDragHandleType(null);
            // Don't reset tool, allow continuing path
            // To finish, user presses Enter or Escape (handled in useEffect)
            return;
        }

        // --- Polyline, Arc, Line (Handled in MouseDown or ContextMenu, Line is click-click only) ---
        if (activeType === 'polyline' || activeType === 'arc' || activeType === 'line') {
            return;
        }

        // --- Standard 2-Point Tools Finish ---
        if (points.length > 0) {
            const finalPoints = [points[0], point];
            // Prevent zero-length creation
            const dist = Math.sqrt(Math.pow(finalPoints[1].x - finalPoints[0].x, 2) + Math.pow(finalPoints[1].y - finalPoints[0].y, 2));

            if (dist > 1) {
                onAddAnnotation({
                    id: `ann-${Date.now()}`,
                    type: activeType,
                    points: finalPoints,
                    floor: currentFloor,
                    style: properties
                });
            }
            resetTool();
        }
    };

    const handleDoubleClick = (e: React.MouseEvent) => {
        if (activeType === 'polyline' && points.length > 1) {
            onAddAnnotation({
                id: `ann-${Date.now()}`,
                type: 'polyline',
                points: points,
                floor: currentFloor,
                style: properties
            });
            resetTool();
        }
    };

    const handleContextMenu = (e: React.MouseEvent) => {
        e.preventDefault();
        if (activeType === 'polyline' && points.length > 1) {
            onAddAnnotation({
                id: `ann-${Date.now()}`,
                type: 'polyline',
                points: points,
                floor: currentFloor,
                style: properties
            });
            resetTool();
        } else if (activeType === 'bezier' && points.length >= 6) {
            onAddAnnotation({
                id: `ann-${Date.now()}`,
                type: 'bezier',
                points: points,
                floor: currentFloor,
                style: properties
            });
            resetTool();
        } else {
            resetTool();
        }
    };

    const commitText = () => {
        const currentEditingId = editingIdRef.current;
        if (!currentEditingId || !textInputPos) return;

        // Clear ref immediately to prevent double commits
        editingIdRef.current = null;

        if (textInputValue.trim()) {
            if (currentEditingId === 'new') {
                onAddAnnotation({
                    id: `ann-${Date.now()}`,
                    type: 'text',
                    points: [textInputPos],
                    floor: currentFloor,
                    style: { ...properties, text: textInputValue }
                });
            } else {
                onInteractionStart?.();
                onUpdateAnnotation?.(currentEditingId, {
                    style: { ...properties, text: textInputValue }
                });
            }
        } else if (currentEditingId !== 'new') {
            onDeleteAnnotation?.(currentEditingId);
        }
        setEditingTextId(null);
        setTextInputValue("");
    };

    const handleRemovePoint = (annId: string, pointIndex: number) => {
        const ann = annotations.find(a => a.id === annId);
        if (!ann) return;

        let newPoints = [...ann.points];
        if (ann.type === 'bezier') {
            // Remove node (Anchor + In + Out)
            // Ensure we align to the anchor (index should be divisible by 3)
            const nodeIndex = pointIndex - (pointIndex % 3);
            newPoints.splice(nodeIndex, 3);
        } else {
            newPoints.splice(pointIndex, 1);
        }

        if (newPoints.length === 0) {
            onDeleteAnnotation?.(annId);
        } else {
            onInteractionStart?.();
            onUpdateAnnotation?.(annId, { points: newPoints });
        }
        setActiveNodeIdx(null);
        setDragHandleType(null);
    };

    // Helper to generate preview path
    const getPreviewPath = () => {
        if (points.length === 0 && !tempPoint) return '';

        const previewPoints = tempPoint ? [...points, tempPoint] : points;

        // Special case for Bezier Preview
        if (activeType === 'bezier') {
            let pathStr = '';
            if (points.length > 0) {
                pathStr = SketchManager.generatePath({
                    id: 'temp-preview',
                    type: 'bezier',
                    points: points,
                    floor: currentFloor,
                    style: properties
                });
            }

            if (points.length > 0 && tempPoint) {
                const lastAnchor = points[points.length - 3];
                // If pathStr is empty (single node), start it, otherwise append
                pathStr = (pathStr || `M ${lastAnchor.x} ${lastAnchor.y}`) + ` L ${tempPoint.x} ${tempPoint.y}`;
            }
            return pathStr;
        }

        return SketchManager.generatePath({
            id: 'temp',
            type: activeType,
            points: previewPoints,
            floor: currentFloor,
            style: properties
        });
    };

    return (
        <div
            ref={containerRef}
            className="w-full h-full"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onDoubleClick={handleDoubleClick}
            onContextMenu={handleContextMenu}
        >
            <svg className="w-full h-full overflow-visible">
                <defs>
                    <marker id="marker-arrow-start" markerWidth="12" markerHeight="12" refX="6" refY="6" orient="auto">
                        <path d="M 11 1 L 6 6 L 11 11 z" fill="context-stroke" stroke="context-stroke" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
                    </marker>
                    <marker id="marker-arrow-end" markerWidth="12" markerHeight="12" refX="6" refY="6" orient="auto">
                        <path d="M 1 1 L 6 6 L 1 11 z" fill="context-stroke" stroke="context-stroke" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
                    </marker>
                    <marker id="marker-open-arrow-start" markerWidth="12" markerHeight="12" refX="6" refY="6" orient="auto">
                        <path d="M 11 1 L 6 6 L 11 11" fill="none" stroke="context-stroke" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
                    </marker>
                    <marker id="marker-open-arrow-end" markerWidth="12" markerHeight="12" refX="6" refY="6" orient="auto">
                        <path d="M 1 1 L 6 6 L 1 11" fill="none" stroke="context-stroke" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
                    </marker>
                    <marker id="marker-circle-start" markerWidth="8" markerHeight="8" refX="4" refY="4">
                        <circle cx="4" cy="4" r="3" fill="context-stroke" />
                    </marker>
                    <marker id="marker-circle-end" markerWidth="8" markerHeight="8" refX="4" refY="4">
                        <circle cx="4" cy="4" r="3" fill="context-stroke" />
                    </marker>
                    <marker id="marker-square-start" markerWidth="8" markerHeight="8" refX="4" refY="4">
                        <rect x="1" y="1" width="6" height="6" fill="context-stroke" />
                    </marker>
                    <marker id="marker-square-end" markerWidth="8" markerHeight="8" refX="4" refY="4">
                        <rect x="1" y="1" width="6" height="6" fill="context-stroke" />
                    </marker>
                </defs>

                <g transform={`translate(${offset.x}, ${offset.y}) scale(${scale})`}>
                    {/* Existing Annotations */}
                    {annotations.filter(a => a.floor === currentFloor).map(ann => {
                        const isEraser = activeType === 'eraser' && isSketchMode;
                        const isSelect = activeType === 'select' && isSketchMode;
                        const isSelected = selectedAnnotationId === ann.id;

                        const interactionProps = isEraser ? {
                            style: { pointerEvents: 'all' as const, cursor: 'crosshair' },
                            onClick: (e: React.MouseEvent) => {
                                e.stopPropagation();
                                onDeleteAnnotation?.(ann.id);
                            }
                        } : isSelect ? {
                            style: {
                                pointerEvents: 'all' as const,
                                cursor: isDragging ? 'grabbing' : 'pointer'
                            },
                            onMouseDown: (e: React.MouseEvent) => {
                                e.stopPropagation(); // Prevent canvas deselect
                                onInteractionStart?.();
                                isDraggingAnnotation.current = true;
                                setIsDragging(true);
                                dragStartPos.current = toWorld(e.clientX, e.clientY);
                                onSelectAnnotation?.(ann.id);
                            },
                            onClick: (e: React.MouseEvent) => {
                                e.stopPropagation();
                                onSelectAnnotation?.(ann.id);
                            },
                            onDoubleClick: (e: React.MouseEvent) => {
                                if (ann.type === 'text') {
                                    e.stopPropagation();
                                    setEditingTextId(ann.id);
                                    setTextInputPos(ann.points[0]);
                                    setTextInputValue(ann.style.text || "");
                                    setTimeout(() => textInputRef.current?.focus(), 10);
                                }
                            }
                        } : {
                            style: { pointerEvents: 'none' as const }
                        };

                        if (ann.type === 'text') {
                            // Don't render text if it's currently being edited
                            if (editingTextId === ann.id) return null;

                            return (
                                <text
                                    key={ann.id}
                                    x={ann.points[0].x}
                                    y={ann.points[0].y}
                                    fill={ann.style.stroke}
                                    fontSize={ann.style.fontSize || 16}
                                    fontFamily={ann.style.fontFamily || "sans-serif"}
                                    fontWeight={ann.style.fontWeight || "normal"}
                                    fontStyle={ann.style.fontStyle || "normal"}
                                    textDecoration={ann.style.textDecoration || "none"}
                                    dominantBaseline="middle"
                                    textAnchor="middle"
                                    className={`select-none ${isEraser ? 'hover:!fill-red-500' : ''} ${isSelected ? 'fill-orange-500' : ''}`}
                                    {...interactionProps}
                                >
                                    {ann.style.text}
                                </text>
                            );
                        }

                        const pathD = SketchManager.generatePath(ann);
                        const markerStart = SketchManager.getMarkerUrl('start', ann.style.startCap);
                        const markerEnd = SketchManager.getMarkerUrl('end', ann.style.endCap);

                        if (isEraser || isSelect) {
                            return (
                                <g
                                    key={ann.id}
                                    className="group"
                                    {...interactionProps}
                                >
                                    {/* Visible Path */}
                                    <path
                                        d={pathD}
                                        stroke={isSelected ? '#f97316' : ann.style.stroke}
                                        strokeWidth={ann.style.strokeWidth}
                                        strokeDasharray={ann.style.strokeDash}
                                        fill="none"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        markerStart={markerStart}
                                        markerEnd={markerEnd}
                                        className={`${isEraser ? 'group-hover:opacity-50 group-hover:!stroke-red-500 group-hover:!stroke-[4px]' : ''}`}
                                        style={{ pointerEvents: 'none' }}
                                    />
                                    {/* Hit Area Path (Invisible, wider) */}
                                    <path
                                        d={pathD}
                                        stroke="transparent"
                                        strokeWidth={Math.max(ann.style.strokeWidth, 20)}
                                        fill="none"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        markerStart={markerStart}
                                        markerEnd={markerEnd}
                                    />
                                </g>
                            );
                        }

                        return (
                            <path
                                key={ann.id}
                                d={pathD}
                                stroke={ann.style.stroke}
                                strokeWidth={ann.style.strokeWidth}
                                strokeDasharray={ann.style.strokeDash}
                                fill={ann.type === 'polyline' || ann.type === 'rect' || ann.type === 'circle' ? 'none' : 'none'} // Can add fill support later
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                markerStart={markerStart}
                                markerEnd={markerEnd}
                                style={{ pointerEvents: 'none' }}
                            />
                        );
                    })}

                    {/* Selection Controls (Anchors & Handles) */}
                    {selectedAnnotationId && activeType === 'select' && (() => {
                        const ann = annotations.find(a => a.id === selectedAnnotationId);
                        if (!ann) return null;

                        return (
                            <g>
                                {ann.type === 'bezier' ? (
                                    // Bezier Controls
                                    ann.points.map((p, i) => {
                                        if (i % 3 === 0) { // Anchor
                                            const handleIn = ann.points[i + 1];
                                            const handleOut = ann.points[i + 2];
                                            return (
                                                <React.Fragment key={i}>
                                                    {/* Lines to Handles */}
                                                    <line x1={p.x} y1={p.y} x2={handleIn.x} y2={handleIn.y} stroke="#3b82f6" strokeWidth={1 / scale} />
                                                    <line x1={p.x} y1={p.y} x2={handleOut.x} y2={handleOut.y} stroke="#3b82f6" strokeWidth={1 / scale} />

                                                    {/* Anchor Point */}
                                                    <rect
                                                        x={p.x - 4 / scale} y={p.y - 4 / scale} width={8 / scale} height={8 / scale}
                                                        fill="#fff" stroke="#3b82f6" strokeWidth={1 / scale}
                                                        style={{ cursor: isDragging && dragHandleType === 'anchor' && activeNodeIdx === i ? 'grabbing' : 'move' }}
                                                        onMouseDown={(e) => {
                                                            e.stopPropagation();
                                                            onInteractionStart?.();
                                                            isDrawing.current = true;
                                                            setIsDragging(true);
                                                            setActiveNodeIdx(i);
                                                            setDragHandleType('anchor');
                                                        }}
                                                        onContextMenu={(e) => {
                                                            e.preventDefault();
                                                            e.stopPropagation();
                                                            handleRemovePoint(ann.id, i);
                                                        }}
                                                    />

                                                    {/* Handle Points */}
                                                    <circle
                                                        cx={handleIn.x} cy={handleIn.y} r={3 / scale}
                                                        fill="#3b82f6"
                                                        style={{ cursor: isDragging && dragHandleType === 'in' && activeNodeIdx === i ? 'grabbing' : 'crosshair' }}
                                                        onMouseDown={(e) => {
                                                            e.stopPropagation();
                                                            onInteractionStart?.();
                                                            isDrawing.current = true;
                                                            setIsDragging(true);
                                                            setActiveNodeIdx(i);
                                                            setDragHandleType('in');
                                                        }}
                                                    />
                                                    <circle
                                                        cx={handleOut.x} cy={handleOut.y} r={3 / scale}
                                                        fill="#3b82f6"
                                                        style={{ cursor: isDragging && dragHandleType === 'out' && activeNodeIdx === i ? 'grabbing' : 'crosshair' }}
                                                        onMouseDown={(e) => {
                                                            e.stopPropagation();
                                                            onInteractionStart?.();
                                                            isDrawing.current = true;
                                                            setIsDragging(true);
                                                            setActiveNodeIdx(i);
                                                            setDragHandleType('out');
                                                        }}
                                                    />
                                                </React.Fragment>
                                            );
                                        }
                                        return null;
                                    })
                                ) : (
                                    // Standard Points (Polyline, Line, Arc)
                                    ann.points.map((p, i) => (
                                        <rect
                                            key={i}
                                            x={p.x - 4 / scale} y={p.y - 4 / scale} width={8 / scale} height={8 / scale}
                                            fill="#fff" stroke="#3b82f6" strokeWidth={1 / scale}
                                            style={{ cursor: isDragging && dragHandleType === 'anchor' && activeNodeIdx === i ? 'grabbing' : 'move' }}
                                            onMouseDown={(e) => {
                                                e.stopPropagation();
                                                onInteractionStart?.();
                                                isDrawing.current = true;
                                                setIsDragging(true);
                                                setActiveNodeIdx(i);
                                                setDragHandleType('anchor'); // Reuse 'anchor' for generic point
                                            }}
                                            onContextMenu={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                handleRemovePoint(ann.id, i);
                                            }}
                                        />
                                    ))
                                )}
                            </g>
                        );
                    })()}

                    {/* Current Drawing Preview */}
                    {(points.length > 0 || tempPoint) && (
                        <g>
                            <path
                                d={getPreviewPath()}
                                stroke={properties.stroke}
                                strokeWidth={properties.strokeWidth}
                                strokeDasharray={properties.strokeDash}
                                fill="none"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                opacity={0.6}
                                markerStart={SketchManager.getMarkerUrl('start', properties.startCap)}
                                markerEnd={SketchManager.getMarkerUrl('end', properties.endCap)}
                            />

                            {/* Visual Guides for Bezier Handles (Pen Tool) */}
                            {activeType === 'bezier' && (
                                <g>
                                    {/* Draw lines connecting anchors to handles */}
                                    {points.map((p, i) => {
                                        if (i % 3 === 0) { // Anchor
                                            const handleIn = points[i + 1];
                                            const handleOut = points[i + 2];
                                            return (
                                                <React.Fragment key={i}>
                                                    {/* Line to Handle In */}
                                                    <line x1={p.x} y1={p.y} x2={handleIn.x} y2={handleIn.y} stroke="#3b82f6" strokeWidth={1 / scale} />
                                                    {/* Line to Handle Out */}
                                                    <line x1={p.x} y1={p.y} x2={handleOut.x} y2={handleOut.y} stroke="#3b82f6" strokeWidth={1 / scale} />

                                                    {/* Anchor Point (Square) */}
                                                    <rect x={p.x - 3 / scale} y={p.y - 3 / scale} width={6 / scale} height={6 / scale} fill="#fff" stroke="#3b82f6" strokeWidth={1 / scale} />

                                                    {/* Handle Points (Circles) */}
                                                    <circle cx={handleIn.x} cy={handleIn.y} r={2.5 / scale} fill="#3b82f6" />
                                                    <circle cx={handleOut.x} cy={handleOut.y} r={2.5 / scale} fill="#3b82f6" />
                                                </React.Fragment>
                                            );
                                        }
                                        return null;
                                    })}
                                </g>
                            )}
                            {/* Visual Guides for Arc Control Points */}
                            {(activeType === 'arc') && points.map((p, i) => (
                                <circle key={`p-${i}`} cx={p.x} cy={p.y} r={4 / scale} fill="red" opacity={0.5} />
                            ))}
                        </g>
                    )}
                </g>
            </svg>

            {/* HTML Overlay for Text Input (More robust than foreignObject) */}
            {editingTextId && textInputPos && (
                <div
                    style={{
                        position: 'absolute',
                        left: 0,
                        top: 0,
                        width: '100%',
                        height: '100%',
                        pointerEvents: 'none',
                        overflow: 'hidden'
                    }}
                >
                    <div
                        style={{
                            position: 'absolute',
                            left: 0,
                            top: 0,
                            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
                            transformOrigin: 'top left',
                            width: '100%',
                            height: '100%'
                        }}
                    >
                        <div
                            style={{
                                position: 'absolute',
                                left: textInputPos.x,
                                top: textInputPos.y,
                                transform: 'translate(-50%, -50%)',
                                width: 'max-content',
                                pointerEvents: 'auto'
                            }}
                            onMouseDown={(e) => e.stopPropagation()}
                        >
                            <textarea
                                ref={textInputRef}
                                value={textInputValue}
                                onChange={e => setTextInputValue(e.target.value)}
                                onBlur={commitText}
                                onKeyDown={e => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        commitText();
                                    }
                                    if (e.key === 'Escape') {
                                        commitText();
                                    }
                                }}
                                style={{
                                    background: 'transparent',
                                    border: '1px dashed #f97316',
                                    outline: 'none',
                                    color: properties.stroke,
                                    fontSize: `${properties.fontSize || 16}px`,
                                    fontFamily: properties.fontFamily || 'sans-serif',
                                    fontWeight: properties.fontWeight || 'normal',
                                    fontStyle: properties.fontStyle || 'normal',
                                    textDecoration: properties.textDecoration || 'none',
                                    minWidth: '50px',
                                    textAlign: 'center',
                                    resize: 'none',
                                    overflow: 'hidden',
                                    whiteSpace: 'pre',
                                    padding: 0,
                                    margin: 0
                                }}
                                rows={Math.max(1, textInputValue.split('\n').length)}
                                cols={Math.max(5, ...textInputValue.split('\n').map(l => l.length))}
                            />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
