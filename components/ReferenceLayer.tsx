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

    // Synchronize refs for event listeners
    const isDraggingRef = useRef(false);
    const selectedImageIdRef = useRef<string | null>(null);
    const dragStartPosRef = useRef<Point>({ x: 0, y: 0 });
    const imageStartPosRef = useRef<Point>({ x: 0, y: 0 });
    const localDragPosRef = useRef<Point | null>(null);

    useEffect(() => {
        selectedImageIdRef.current = selectedImageId;
        localDragPosRef.current = localDragPos;
    }, [selectedImageId, localDragPos]);

    useEffect(() => {
        const handleGlobalMouseMove = (e: MouseEvent) => {
            if (!isDraggingRef.current || !selectedImageIdRef.current) return;

            const worldPos = toWorld(e.clientX, e.clientY);
            const dx = worldPos.x - dragStartPosRef.current.x;
            const dy = worldPos.y - dragStartPosRef.current.y;

            const nextPos = {
                x: imageStartPosRef.current.x + dx,
                y: imageStartPosRef.current.y + dy
            };
            setLocalDragPos(nextPos);
        };

        const handleGlobalMouseUp = () => {
            if (isDraggingRef.current && selectedImageIdRef.current && localDragPosRef.current) {
                onUpdateImage(selectedImageIdRef.current, {
                    x: localDragPosRef.current.x,
                    y: localDragPosRef.current.y
                });
            }
            isDraggingRef.current = false;
            setLocalDragPos(null);
            document.body.style.cursor = '';
        };

        if (localDragPos !== null) {
            window.addEventListener('mousemove', handleGlobalMouseMove);
            window.addEventListener('mouseup', handleGlobalMouseUp);
        }

        return () => {
            window.removeEventListener('mousemove', handleGlobalMouseMove);
            window.removeEventListener('mouseup', handleGlobalMouseUp);
        };
    }, [localDragPos !== null, toWorld, onUpdateImage]);

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

    return (
        <g>
            {images.filter(img => img.floor === currentFloor).map(img => {
                const isSelected = selectedImageId === img.id;

                // Use local drag position if currently dragging this image
                const isCurrentlyDragging = isSelected && localDragPos !== null;
                const displayX = isCurrentlyDragging ? localDragPos.x : img.x;
                const displayY = isCurrentlyDragging ? localDragPos.y : img.y;

                const displayWidth = img.width * img.scale;
                const displayHeight = img.height * img.scale;

                return (
                    <g key={img.id} transform={`translate(${displayX}, ${displayY}) rotate(${img.rotation}, ${displayWidth / 2}, ${displayHeight / 2})`}>
                        <image
                            href={img.url}
                            width={displayWidth}
                            height={displayHeight}
                            opacity={img.opacity}
                            style={{
                                cursor: img.isLocked ? 'default' : isScalingMode ? 'crosshair' : 'move',
                                pointerEvents: isReferenceMode ? 'all' : 'none'
                            }}
                            onMouseDown={(e) => handleMouseDown(e, img)}
                        />
                        {/* Selection Highlight */}
                        {isSelected && !img.isLocked && (
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
