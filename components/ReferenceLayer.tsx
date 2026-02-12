import React, { useRef, useState, useEffect } from 'react';
import { ReferenceImage, Point, ReferenceScaleState } from '../types';

interface ReferenceLayerProps {
    images: ReferenceImage[];
    currentFloor: number;
    scale: number;
    offset: Point;
    selectedImageId: string | null;
    onSelectImage: (id: string | null) => void;
    onUpdateImage: (id: string, updates: Partial<ReferenceImage>) => void;
    isScalingMode: boolean;
    scalingState: ReferenceScaleState | null;
    onScalingPointClick: (p: Point) => void;
    toWorld: (x: number, y: number) => Point;
    isReferenceMode: boolean;
}

export const ReferenceLayer: React.FC<ReferenceLayerProps> = ({
    images,
    currentFloor,
    scale,
    selectedImageId,
    onSelectImage,
    onUpdateImage,
    isScalingMode,
    scalingState,
    onScalingPointClick,
    toWorld,
    isReferenceMode
}) => {
    // Performance optimization: Local position during drag
    const [localDragPos, setLocalDragPos] = useState<Point | null>(null);
    const [cursorPos, setCursorPos] = useState<Point | null>(null);
    const [localResizeState, setLocalResizeState] = useState<{ scale: number, x: number, y: number } | null>(null);

    // Synchronize refs for event listeners
    const isDraggingRef = useRef(false);
    const isResizingRef = useRef(false);
    const selectedImageIdRef = useRef<string | null>(null);
    const dragStartPosRef = useRef<Point>({ x: 0, y: 0 });
    const imageStartPosRef = useRef<Point>({ x: 0, y: 0 });
    const localDragPosRef = useRef<Point | null>(null);
    const localResizeStateRef = useRef<{ scale: number, x: number, y: number } | null>(null);

    // Resize refs
    const resizeStartDistRef = useRef<number>(0);
    const resizeImageStartRef = useRef<{ x: number, y: number, width: number, height: number, scale: number } | null>(null);
    const resizeCenterRef = useRef<Point>({ x: 0, y: 0 });

    useEffect(() => {
        selectedImageIdRef.current = selectedImageId;
        localDragPosRef.current = localDragPos;
        localResizeStateRef.current = localResizeState;
    }, [selectedImageId, localDragPos, localResizeState]);

    useEffect(() => {
        const handleGlobalMouseMove = (e: MouseEvent) => {
            if (isDraggingRef.current && selectedImageIdRef.current) {
                const worldPos = toWorld(e.clientX, e.clientY);
                const dx = worldPos.x - dragStartPosRef.current.x;
                const dy = worldPos.y - dragStartPosRef.current.y;

                const nextPos = {
                    x: imageStartPosRef.current.x + dx,
                    y: imageStartPosRef.current.y + dy
                };
                setLocalDragPos(nextPos);
            } else if (isResizingRef.current && selectedImageIdRef.current && resizeImageStartRef.current) {
                const worldPos = toWorld(e.clientX, e.clientY);
                const center = resizeCenterRef.current;
                const dx = worldPos.x - center.x;
                const dy = worldPos.y - center.y;
                const currentDist = Math.sqrt(dx * dx + dy * dy);

                if (resizeStartDistRef.current > 0) {
                    const scaleFactor = currentDist / resizeStartDistRef.current;
                    const startImg = resizeImageStartRef.current;
                    const newScale = Math.max(0.01, startImg.scale * scaleFactor);

                    // Calculate new position to keep center fixed
                    const s = startImg.scale;
                    const sPrime = newScale;
                    const w = startImg.width;
                    const h = startImg.height;

                    const newX = startImg.x + (w / 2) * (s - sPrime);
                    const newY = startImg.y + (h / 2) * (s - sPrime);

                    setLocalResizeState({ scale: newScale, x: newX, y: newY });
                }
            }
        };

        const handleGlobalMouseUp = () => {
            if (isDraggingRef.current && selectedImageIdRef.current && localDragPosRef.current) {
                onUpdateImage(selectedImageIdRef.current, {
                    x: localDragPosRef.current.x,
                    y: localDragPosRef.current.y
                });
            }
            if (isResizingRef.current && selectedImageIdRef.current && localResizeStateRef.current) {
                onUpdateImage(selectedImageIdRef.current, {
                    scale: localResizeStateRef.current.scale,
                    x: localResizeStateRef.current.x,
                    y: localResizeStateRef.current.y
                });
            }
            isDraggingRef.current = false;
            isResizingRef.current = false;
            setLocalDragPos(null);
            setLocalResizeState(null);
            document.body.style.cursor = '';
        };

        if (localDragPos !== null || localResizeState !== null) {
            window.addEventListener('mousemove', handleGlobalMouseMove);
            window.addEventListener('mouseup', handleGlobalMouseUp);
        }

        return () => {
            window.removeEventListener('mousemove', handleGlobalMouseMove);
            window.removeEventListener('mouseup', handleGlobalMouseUp);
        };
    }, [localDragPos !== null || localResizeState !== null, toWorld, onUpdateImage]);

    // Track cursor for scaling preview line
    useEffect(() => {
        if (!isScalingMode) {
            setCursorPos(null);
            return;
        }
        const handleMove = (e: MouseEvent) => {
            setCursorPos(toWorld(e.clientX, e.clientY));
        };
        window.addEventListener('mousemove', handleMove);
        return () => window.removeEventListener('mousemove', handleMove);
    }, [isScalingMode, toWorld]);

    const handleMouseDown = (e: React.MouseEvent, img: ReferenceImage) => {
        if (!isReferenceMode) return;

        // Allow selecting locked images to unlock them
        e.stopPropagation();
        onSelectImage(img.id);

        if (img.isLocked) return;

        if (isScalingMode) {
            e.stopPropagation();
            onScalingPointClick(toWorld(e.clientX, e.clientY));
            return;
        }

        isDraggingRef.current = true;
        const worldPos = toWorld(e.clientX, e.clientY);
        dragStartPosRef.current = worldPos;
        imageStartPosRef.current = { x: img.x, y: img.y };
        setLocalDragPos({ x: img.x, y: img.y });
        document.body.style.cursor = 'grabbing';
    };

    const handleResizeStart = (e: React.MouseEvent, img: ReferenceImage) => {
        e.stopPropagation();
        e.preventDefault();
        if (img.isLocked) return;

        isResizingRef.current = true;
        resizeImageStartRef.current = { ...img };

        const displayWidth = img.width * img.scale;
        const displayHeight = img.height * img.scale;
        const centerX = img.x + displayWidth / 2;
        const centerY = img.y + displayHeight / 2;
        resizeCenterRef.current = { x: centerX, y: centerY };

        const worldPos = toWorld(e.clientX, e.clientY);
        const dx = worldPos.x - centerX;
        const dy = worldPos.y - centerY;
        resizeStartDistRef.current = Math.sqrt(dx * dx + dy * dy);

        setLocalResizeState({ scale: img.scale, x: img.x, y: img.y });
    };

    return (
        <g>
            {images.filter(img => img.floor === currentFloor).map(img => {
                const isSelected = selectedImageId === img.id;

                // Use local drag position if currently dragging this image
                const isCurrentlyDragging = isSelected && localDragPos !== null;
                const isCurrentlyResizing = isSelected && localResizeState !== null;

                const displayX = isCurrentlyDragging ? localDragPos!.x : (isCurrentlyResizing ? localResizeState!.x : img.x);
                const displayY = isCurrentlyDragging ? localDragPos!.y : (isCurrentlyResizing ? localResizeState!.y : img.y);
                const currentScale = isCurrentlyResizing ? localResizeState!.scale : img.scale;

                const displayWidth = img.width * currentScale;
                const displayHeight = img.height * currentScale;

                return (
                    <g key={img.id} transform={`translate(${displayX}, ${displayY}) rotate(${img.rotation}, ${displayWidth / 2}, ${displayHeight / 2})`}>
                        <image
                            href={img.url}
                            width={displayWidth}
                            height={displayHeight}
                            opacity={img.opacity}
                            style={{
                                cursor: img.isLocked ? 'default' : isScalingMode ? 'crosshair' : 'pointer',
                                pointerEvents: isReferenceMode ? 'all' : 'none'
                            }}
                            onMouseDown={(e) => handleMouseDown(e, img)}
                        />
                        {/* Selection Highlight */}
                        {isSelected && !img.isLocked && (
                            <>
                                <rect
                                    x={-2 / scale}
                                    y={-2 / scale}
                                    width={displayWidth + 4 / scale}
                                    height={displayHeight + 4 / scale}
                                    fill="none"
                                    stroke="#f97316"
                                    strokeWidth={2 / scale}
                                    style={{ pointerEvents: 'none' }}
                                />
                                {/* Resize Handles */}
                                <circle cx={0} cy={0} r={6 / scale} fill="white" stroke="#f97316" strokeWidth={2 / scale} style={{ cursor: 'nwse-resize', pointerEvents: 'all' }} onMouseDown={(e) => handleResizeStart(e, img)} />
                                <circle cx={displayWidth} cy={0} r={6 / scale} fill="white" stroke="#f97316" strokeWidth={2 / scale} style={{ cursor: 'nesw-resize', pointerEvents: 'all' }} onMouseDown={(e) => handleResizeStart(e, img)} />
                                <circle cx={0} cy={displayHeight} r={6 / scale} fill="white" stroke="#f97316" strokeWidth={2 / scale} style={{ cursor: 'nesw-resize', pointerEvents: 'all' }} onMouseDown={(e) => handleResizeStart(e, img)} />
                                <circle cx={displayWidth} cy={displayHeight} r={6 / scale} fill="white" stroke="#f97316" strokeWidth={2 / scale} style={{ cursor: 'nwse-resize', pointerEvents: 'all' }} onMouseDown={(e) => handleResizeStart(e, img)} />
                            </>
                        )}
                    </g>
                );
            })}

            {/* Scaling Overlay - Rendered in World Space */}
            {isScalingMode && scalingState && (
                <g pointerEvents="none">
                    {/* Preview Line (P1 to Cursor) */}
                    {scalingState.step === 'point2' && scalingState.points.length === 1 && cursorPos && (
                        <line
                            x1={scalingState.points[0].x} y1={scalingState.points[0].y}
                            x2={cursorPos.x} y2={cursorPos.y}
                            stroke="#f97316" strokeWidth={2 / scale} strokeDasharray="5,5"
                        />
                    )}
                    {/* Final Line (P1 to P2) */}
                    {scalingState.points.length === 2 && (
                        <line
                            x1={scalingState.points[0].x} y1={scalingState.points[0].y}
                            x2={scalingState.points[1].x} y2={scalingState.points[1].y}
                            stroke="#f97316" strokeWidth={2 / scale}
                        />
                    )}
                    {/* Points */}
                    {scalingState.points.map((p, i) => (
                        <circle key={i} cx={p.x} cy={p.y} r={4 / scale} fill="#f97316" stroke="white" strokeWidth={2 / scale} />
                    ))}
                </g>
            )}
        </g>
    );
};
