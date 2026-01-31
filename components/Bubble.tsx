import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Room, ZONE_COLORS, Point, DiagramStyle } from '../types';
import { Sun, Link as LinkIcon, Pencil, X, Ban, LandPlot, ArrowUpFromLine, ArrowDownToLine } from 'lucide-react';

interface BubbleProps {
  room: Room;
  pixelsPerMeter: number;
  zoomScale: number; 
  updateRoom: (id: string, updates: Partial<Room>) => void;
  onFloorChange: (id: string, delta: number) => void;
  isSelected: boolean;
  onSelect: (id: string, multi: boolean) => void;
  is3D: boolean;
  showSunWarning: boolean;
  onConnectionStart: (id: string) => void;
  isConnecting: boolean;
  snapEnabled: boolean;
  snapPixelUnit: number;
  unitSystem: 'metric' | 'imperial';
  isConnectionSource?: boolean;
  otherRooms: Room[]; 
  diagramStyle: DiagramStyle;
}

// Shoelace formula for area
const calculatePolygonArea = (points: Point[], pixelsPerMeter: number): number => {
    let area = 0;
    for (let i = 0; i < points.length; i++) {
        const j = (i + 1) % points.length;
        area += points[i].x * points[j].y;
        area -= points[j].x * points[i].y;
    }
    const areaPx = Math.abs(area) / 2;
    return areaPx / (pixelsPerMeter * pixelsPerMeter);
};

// Helper to create rounded path (Fillets)
const createRoundedPath = (points: Point[], radius: number) => {
  if (points.length < 3) return `M ${points.map(p => `${p.x},${p.y}`).join(' L ')} Z`;

  let path = "";
  const len = points.length;

  for (let i = 0; i < len; i++) {
    const p0 = points[(i - 1 + len) % len];
    const p1 = points[i];
    const p2 = points[(i + 1) % len];

    const v1 = { x: p0.x - p1.x, y: p0.y - p1.y };
    const v2 = { x: p2.x - p1.x, y: p2.y - p1.y };

    const l1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y);
    const l2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y);

    const r = Math.min(radius, l1 / 2, l2 / 2);

    const startX = p1.x + (v1.x / l1) * r;
    const startY = p1.y + (v1.y / l1) * r;

    const endX = p1.x + (v2.x / l2) * r;
    const endY = p1.y + (v2.y / l2) * r;

    if (i === 0) {
      path += `M ${startX},${startY}`;
    } else {
      path += ` L ${startX},${startY}`;
    }

    path += ` Q ${p1.x},${p1.y} ${endX},${endY}`;
  }

  path += " Z";
  return path;
};

const BubbleComponent: React.FC<BubbleProps> = ({ 
  room, 
  pixelsPerMeter, 
  zoomScale,
  updateRoom, 
  onFloorChange,
  isSelected,
  onSelect,
  is3D,
  showSunWarning,
  onConnectionStart,
  isConnecting,
  snapEnabled,
  snapPixelUnit,
  unitSystem,
  isConnectionSource = false,
  otherRooms = [],
  diagramStyle
}) => {
  const bubbleRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [resizeHandle, setResizeHandle] = useState<string | null>(null);
  const [showTools, setShowTools] = useState(false);
  const [isEditingOutline, setIsEditingOutline] = useState(false);
  
  // Polygon Editing State
  const [draggingVertexIndex, setDraggingVertexIndex] = useState<number | null>(null);
  const [draggingEdgeIndex, setDraggingEdgeIndex] = useState<number | null>(null);
  const [hoveredEdgeIndex, setHoveredEdgeIndex] = useState<number | null>(null);
  const [hoveredVertexIndex, setHoveredVertexIndex] = useState<number | null>(null);

  // Snapping Visualization
  const [activeSnapLines, setActiveSnapLines] = useState<{x: number | null, y: number | null}>({x: null, y: null});
  const [alignmentLines, setAlignmentLines] = useState<{x?: number, y?: number}[]>([]);

  const startDragState = useRef({ 
    startX: 0, 
    startY: 0, 
    roomX: 0, 
    roomY: 0,
    roomW: 0,
    roomH: 0,
    initialPoints: [] as Point[]
  });

  const getZoneStyle = (z: string) => {
    const key = Object.keys(ZONE_COLORS).find(k => z.toLowerCase().includes(k.toLowerCase()));
    return key ? ZONE_COLORS[key] : ZONE_COLORS['Default'];
  };
  const baseStyle = getZoneStyle(room.zone);
  
  const visualStyle = useMemo(() => {
      if (diagramStyle.colorMode === 'monochrome') {
          return { bg: 'bg-slate-100', border: 'border-slate-800', text: 'text-slate-900' };
      }
      if (diagramStyle.colorMode === 'pastel') {
          return baseStyle;
      }
      return baseStyle;
  }, [baseStyle, diagramStyle.colorMode]);

  const ensurePolygon = () => {
      if (room.polygon && room.polygon.length > 0) return room.polygon;
      return [
          { x: 0, y: 0 },
          { x: room.width, y: 0 },
          { x: room.width, y: room.height },
          { x: 0, y: room.height }
      ];
  };

  const activePoints = useMemo(() => room.polygon || [
      { x: 0, y: 0 },
      { x: room.width, y: 0 },
      { x: room.width, y: room.height },
      { x: 0, y: room.height }
  ], [room.polygon, room.width, room.height]);

  const toggleEditMode = () => {
      if (!isEditingOutline) {
          const poly = ensurePolygon();
          updateRoom(room.id, { polygon: poly });
          setIsEditingOutline(true);
          setShowTools(false);
      } else {
          setIsEditingOutline(false);
      }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return; 
    if (is3D) return; 
    
    if (showTools && !(e.target as HTMLElement).closest('.bubble-tools')) {
        setShowTools(false);
    }

    if (isConnecting && !isConnectionSource) {
        e.stopPropagation();
        onConnectionStart(room.id);
        return;
    }

    e.stopPropagation();
    
    if (e.detail === 2) {
        toggleEditMode();
        return;
    }

    const isMulti = e.ctrlKey || e.metaKey || e.shiftKey;
    onSelect(room.id, isMulti);
    
    setIsDragging(true);
    
    startDragState.current = {
      startX: e.clientX,
      startY: e.clientY,
      roomX: room.x,
      roomY: room.y,
      roomW: room.width,
      roomH: room.height,
      initialPoints: []
    };
  };

  const handleVertexMouseDown = (e: React.MouseEvent, index: number) => {
      e.stopPropagation();
      e.preventDefault();
      setDraggingVertexIndex(index);
      startDragState.current = {
          startX: e.clientX,
          startY: e.clientY,
          roomX: 0, roomY: 0, roomW: 0, roomH: 0,
          initialPoints: [...ensurePolygon()]
      };
  };

  const handleEdgeMouseDown = (e: React.MouseEvent, index: number) => {
      e.stopPropagation();
      e.preventDefault();
      let poly = [...ensurePolygon()];
      let activeIndex = index;
      if (e.ctrlKey || e.metaKey) {
          const p1 = poly[index];
          const p2 = poly[(index + 1) % poly.length];
          poly.splice(index + 1, 0, { ...p1 }, { ...p2 });
          activeIndex = index + 1;
          updateRoom(room.id, { polygon: poly });
      }
      setDraggingEdgeIndex(activeIndex);
      startDragState.current = {
          startX: e.clientX,
          startY: e.clientY,
          roomX: 0, roomY: 0, roomW: 0, roomH: 0,
          initialPoints: poly
      };
  };

  const handleEdgeDoubleClick = (e: React.MouseEvent, index: number) => {
      e.stopPropagation();
      e.preventDefault();
      const poly = [...ensurePolygon()];
      const rect = bubbleRef.current?.getBoundingClientRect();
      if (!rect) return;
      const clickX = (e.clientX - rect.left) / zoomScale;
      const clickY = (e.clientY - rect.top) / zoomScale;
      poly.splice(index + 1, 0, { x: clickX, y: clickY });
      updateRoom(room.id, { polygon: poly });
      setDraggingVertexIndex(index + 1);
      startDragState.current = {
          startX: e.clientX,
          startY: e.clientY,
          roomX: 0, roomY: 0, roomW: 0, roomH: 0,
          initialPoints: poly
      };
  };

  const snap = (val: number) => {
    if (!snapEnabled) return val;
    return Math.round(val / snapPixelUnit) * snapPixelUnit;
  };

  const getSnapTargets = (ignoreIndices: number[]) => {
      const targetsX: number[] = [];
      const targetsY: number[] = [];
      const currentPoly = startDragState.current.initialPoints;
      currentPoly.forEach((p, i) => {
          if (!ignoreIndices.includes(i)) {
              targetsX.push(p.x + room.x);
              targetsY.push(p.y + room.y);
          }
      });
      otherRooms.forEach(r => {
          targetsX.push(r.x, r.x + r.width);
          targetsY.push(r.y, r.y + r.height);
          if (r.polygon) {
              r.polygon.forEach(p => {
                  targetsX.push(r.x + p.x);
                  targetsY.push(r.y + p.y);
              });
          }
      });
      return { targetsX, targetsY };
  };

  const calculateSmartSnap = (val: number, targets: number[], currentRoomBase: number) => {
      const threshold = 10 / zoomScale;
      let snapped = val;
      let guide = null;
      const absVal = currentRoomBase + val;
      for (const t of targets) {
          if (Math.abs(absVal - t) < threshold) {
              snapped = t - currentRoomBase;
              guide = t; 
              break; 
          }
      }
      return { val: snapped, guide };
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const dxScreen = e.clientX - startDragState.current.startX;
      const dyScreen = e.clientY - startDragState.current.startY;
      const dxWorld = dxScreen / zoomScale;
      const dyWorld = dyScreen / zoomScale;

      let newAlignmentLines: {x?: number, y?: number}[] = [];

      if (resizeHandle) {
          const s = startDragState.current;
          const minSize = 20;

          let newX = s.roomX;
          let newY = s.roomY;
          let newW = s.roomW;
          let newH = s.roomH;

          // Simple Resizing Logic (Standard)
          if (resizeHandle === 'e') {
              newW = Math.max(minSize, s.roomW + dxWorld);
              if (snapEnabled) newW = snap(newW);
          } else if (resizeHandle === 'w') {
              const proposedW = s.roomW - dxWorld;
              if (proposedW >= minSize) {
                  newW = proposedW;
                  if (snapEnabled) {
                     // Snap logic for left edge is tricky, we snap the resulting X position
                     const snappedX = snap(s.roomX + dxWorld);
                     const diff = snappedX - (s.roomX + dxWorld);
                     newW = snap(newW - diff);
                     newX = snappedX;
                  } else {
                     newX = s.roomX + dxWorld;
                  }
              }
          } else if (resizeHandle === 's') {
              newH = Math.max(minSize, s.roomH + dyWorld);
              if (snapEnabled) newH = snap(newH);
          } else if (resizeHandle === 'n') {
             const proposedH = s.roomH - dyWorld;
             if (proposedH >= minSize) {
                 newH = proposedH;
                 if (snapEnabled) {
                    const snappedY = snap(s.roomY + dyWorld);
                    const diff = snappedY - (s.roomY + dyWorld);
                    newH = snap(newH - diff);
                    newY = snappedY;
                 } else {
                    newY = s.roomY + dyWorld;
                 }
             }
          }
          
          // Recalculate Area based on new W/H
          const newArea = (newW * newH) / (pixelsPerMeter * pixelsPerMeter);
          
          updateRoom(room.id, { x: newX, y: newY, width: newW, height: newH, area: Number(newArea.toFixed(2)) });
      }
      else if (draggingVertexIndex !== null) {
          const newPoints = [...startDragState.current.initialPoints];
          const point = newPoints[draggingVertexIndex];
          let nx = point.x + dxWorld;
          let ny = point.y + dyWorld;
          const { targetsX, targetsY } = getSnapTargets([draggingVertexIndex]);
          const snapX = calculateSmartSnap(nx, targetsX, room.x);
          const snapY = calculateSmartSnap(ny, targetsY, room.y);

          if (snapX.guide !== null) { nx = snapX.val; newAlignmentLines.push({ x: snapX.guide }); }
          else if (snapEnabled) { nx = Math.round((room.x + nx) / snapPixelUnit) * snapPixelUnit - room.x; }

          if (snapY.guide !== null) { ny = snapY.val; newAlignmentLines.push({ y: snapY.guide }); }
          else if (snapEnabled) { ny = Math.round((room.y + ny) / snapPixelUnit) * snapPixelUnit - room.y; }

          newPoints[draggingVertexIndex] = { x: nx, y: ny };
          const newArea = calculatePolygonArea(newPoints, pixelsPerMeter);
          const xs = newPoints.map(p => p.x); const ys = newPoints.map(p => p.y);
          updateRoom(room.id, { polygon: newPoints, area: Number(newArea.toFixed(2)), width: Math.max(room.width, Math.max(...xs)), height: Math.max(room.height, Math.max(...ys)) });
      }
      else if (draggingEdgeIndex !== null) {
          const newPoints = [...startDragState.current.initialPoints];
          const i1 = draggingEdgeIndex;
          const i2 = (draggingEdgeIndex + 1) % newPoints.length;
          let dx = dxWorld; let dy = dyWorld;
          if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0;
          if (snapEnabled) { dx = snap(dx); dy = snap(dy); }

          newPoints[i1] = { x: newPoints[i1].x + dx, y: newPoints[i1].y + dy };
          newPoints[i2] = { x: newPoints[i2].x + dx, y: newPoints[i2].y + dy };
          const newArea = calculatePolygonArea(newPoints, pixelsPerMeter);
           const xs = newPoints.map(p => p.x); const ys = newPoints.map(p => p.y);
          updateRoom(room.id, { polygon: newPoints, area: Number(newArea.toFixed(2)), width: Math.max(room.width, Math.max(...xs)), height: Math.max(room.height, Math.max(...ys)) });
      }
      else if (isDragging) {
        let rawX = startDragState.current.roomX + dxWorld;
        let rawY = startDragState.current.roomY + dyWorld;
        const w = startDragState.current.roomW;
        const h = startDragState.current.roomH;

        const threshold = 10 / zoomScale;
        let snappedX: number | null = null;
        let snappedY: number | null = null;
        let minDX = threshold;
        let minDY = threshold;

        const targetXs: number[] = [];
        const targetYs: number[] = [];
        otherRooms.forEach(r => {
            targetXs.push(r.x, r.x + r.width/2, r.x + r.width);
            targetYs.push(r.y, r.y + r.height/2, r.y + r.height);
        });

        const myXs = [rawX, rawX + w/2, rawX + w];
        const myXOffsets = [0, w/2, w]; 
        for (let i = 0; i < myXs.length; i++) {
            for (const tx of targetXs) {
                const diff = Math.abs(myXs[i] - tx);
                if (diff < minDX) { minDX = diff; snappedX = tx - myXOffsets[i]; }
            }
        }
        const myYs = [rawY, rawY + h/2, rawY + h];
        const myYOffsets = [0, h/2, h];
        for (let i = 0; i < myYs.length; i++) {
            for (const ty of targetYs) {
                const diff = Math.abs(myYs[i] - ty);
                if (diff < minDY) { minDY = diff; snappedY = ty - myYOffsets[i]; }
            }
        }

        if (snappedX !== null) rawX = snappedX; else if (snapEnabled) rawX = snap(rawX);
        if (snappedY !== null) rawY = snappedY; else if (snapEnabled) rawY = snap(rawY);

        setActiveSnapLines({ x: snappedX !== null ? snappedX : null, y: snappedY !== null ? snappedY : null });
        updateRoom(room.id, { x: rawX, y: rawY });
      }

      setAlignmentLines(newAlignmentLines);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setResizeHandle(null);
      setDraggingVertexIndex(null);
      setDraggingEdgeIndex(null);
      setActiveSnapLines({x: null, y: null});
      setAlignmentLines([]);
    };

    if (isDragging || resizeHandle || draggingVertexIndex !== null || draggingEdgeIndex !== null) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, resizeHandle, draggingVertexIndex, draggingEdgeIndex, room.id, zoomScale, updateRoom, snapEnabled, snapPixelUnit, otherRooms, room.x, room.y]);
  
  const handleResizeStart = (e: React.MouseEvent, handle: string) => {
    e.stopPropagation();
    e.preventDefault();
    if (is3D || room.polygon) return;
    setResizeHandle(handle);
    startDragState.current = {
      startX: e.clientX, startY: e.clientY,
      roomX: room.x, roomY: room.y, roomW: room.width, roomH: room.height, initialPoints: []
    };
  };

  const darken = (cls: string) => cls.replace('100', '200').replace('200', '300');
  const zHeight = Math.sqrt(room.area) * 2; 

  const areaDisplay = unitSystem === 'imperial' 
      ? `${Math.round(room.area * 10.7639)} ft²` 
      : `${room.area} m²`;

  const isCustomShape = !!room.polygon;

  const polygonPath = useMemo(() => {
      if (!activePoints.length) return '';
      return createRoundedPath(activePoints, 8); 
  }, [activePoints]);

  const handleSize = 24 / zoomScale; 
  const handleThickness = 6 / zoomScale;

  // Render Handle Component (Pill Shape)
  const RenderHandle = ({ cursor, pos, isVertical }: { cursor: string, pos: React.CSSProperties, isVertical: boolean }) => (
      <div 
        className={`absolute bg-white border border-slate-300 rounded-full z-50 hover:bg-primary hover:border-primary transition-colors shadow-sm flex items-center justify-center`}
        style={{ 
            width: isVertical ? handleThickness : handleSize, 
            height: isVertical ? handleSize : handleThickness, 
            ...pos, 
            cursor 
        }}
        onMouseDown={(e) => handleResizeStart(e, cursor.replace('-resize', ''))}
      >
          <div className={`bg-slate-300 ${isVertical ? 'w-px h-3' : 'h-px w-3'}`} />
      </div>
  );

  const hairline = 1 / zoomScale;

  return (
    <div
      ref={bubbleRef}
      data-room-id={room.id}
      className={`absolute transition-shadow group pointer-events-auto
        ${isSelected && !is3D ? 'z-20' : 'z-0'}
        ${isConnecting && !isConnectionSource ? 'cursor-crosshair' : ''}
      `}
      style={{
        transform: `translate3d(${room.x}px, ${room.y}px, 0)`,
        width: isCustomShape ? 0 : room.width, 
        height: isCustomShape ? 0 : room.height,
        cursor: is3D ? 'default' : isDragging ? 'grabbing' : isConnecting && !isConnectionSource ? 'crosshair' : 'grab',
        transition: isDragging || resizeHandle || draggingVertexIndex!==null || draggingEdgeIndex!==null ? 'none' : 'width 0.1s, height 0.1s',
        transformStyle: 'preserve-3d',
      }}
      onMouseDown={handleMouseDown}
      onDoubleClick={handleMouseDown} 
    >
        {/* Guides */}
        {activeSnapLines.x !== null && !is3D && (<div className="absolute top-0 bottom-0 bg-red-500 -z-10 h-[200vh] -top-[100vh]" style={{left: activeSnapLines.x - room.x, width: hairline}} />)}
        {activeSnapLines.y !== null && !is3D && (<div className="absolute left-0 right-0 bg-red-500 -z-10 w-[200vw] -left-[100vw]" style={{top: activeSnapLines.y - room.y, height: hairline}} />)}

        {!is3D && (
            <div className="relative">
                {isCustomShape ? (
                    <svg className="overflow-visible absolute top-0 left-0">
                        <path 
                            d={polygonPath}
                            className={`${visualStyle.bg.replace('bg-', 'fill-')} ${visualStyle.border.replace('border-', 'stroke-')}`}
                            strokeWidth={diagramStyle.borderWidth / zoomScale}
                            strokeLinejoin="round"
                            strokeLinecap="round"
                            fillOpacity={diagramStyle.opacity}
                        />
                    </svg>
                ) : (
                   <div className={`absolute top-0 left-0 w-full h-full ${diagramStyle.cornerRadius} ${visualStyle.bg} ${visualStyle.border} ${diagramStyle.shadow} border-solid backdrop-blur-sm transition-all`}
                        style={{ width: room.width, height: room.height, borderWidth: diagramStyle.borderWidth / zoomScale, opacity: diagramStyle.opacity }} 
                   />
                )}

                {/* --- 4-Edge Scaling Handles (Pills) --- */}
                {!isCustomShape && isSelected && !isDragging && (
                    <>
                        <RenderHandle cursor="n-resize" pos={{ top: -handleThickness/2, left: '50%', transform: 'translateX(-50%)' }} isVertical={false} />
                        <RenderHandle cursor="s-resize" pos={{ bottom: -handleThickness/2, left: '50%', transform: 'translateX(-50%)' }} isVertical={false} />
                        <RenderHandle cursor="w-resize" pos={{ left: -handleThickness/2, top: '50%', transform: 'translateY(-50%)' }} isVertical={true} />
                        <RenderHandle cursor="e-resize" pos={{ right: -handleThickness/2, top: '50%', transform: 'translateY(-50%)' }} isVertical={true} />
                    </>
                )}

                {/* Editing Overlay (Custom Shape) */}
                {isEditingOutline && (
                    <svg className="overflow-visible absolute top-0 left-0 pointer-events-none">
                         <path d={polygonPath} fill="none" stroke="#2563eb" strokeWidth={2 / zoomScale} strokeDasharray={`${4/zoomScale},${4/zoomScale}`} strokeLinejoin="round" />
                         {activePoints.map((p, i) => {
                             const nextP = activePoints[(i + 1) % activePoints.length];
                             return (
                                 <g key={i}>
                                     <line 
                                        x1={p.x} y1={p.y} x2={nextP.x} y2={nextP.y} 
                                        stroke={hoveredEdgeIndex === i || draggingEdgeIndex === i ? 'rgba(37, 99, 235, 0.5)' : 'transparent'} 
                                        strokeWidth={hoveredEdgeIndex === i ? 12 / zoomScale : 8 / zoomScale} 
                                        className={`pointer-events-auto cursor-row-resize ${draggingEdgeIndex === i ? 'cursor-grabbing' : ''}`}
                                        onMouseDown={(e) => handleEdgeMouseDown(e, i)}
                                        onDoubleClick={(e) => handleEdgeDoubleClick(e, i)}
                                        onMouseEnter={() => setHoveredEdgeIndex(i)} onMouseLeave={() => setHoveredEdgeIndex(null)}
                                    />
                                     <circle 
                                        cx={p.x} cy={p.y} r={hoveredVertexIndex === i || draggingVertexIndex === i ? 8 / zoomScale : 6 / zoomScale} 
                                        fill="white" stroke="#2563eb" strokeWidth={2 / zoomScale} 
                                        className="pointer-events-auto cursor-move"
                                        onMouseDown={(e) => handleVertexMouseDown(e, i)} 
                                        onMouseEnter={() => setHoveredVertexIndex(i)} onMouseLeave={() => setHoveredVertexIndex(null)}
                                     />
                                 </g>
                             )
                         })}
                    </svg>
                )}

                <div 
                    className="absolute top-0 left-0 flex flex-col items-center justify-center text-center pointer-events-none overflow-hidden"
                    style={{ 
                        width: isCustomShape ? Math.max(...activePoints.map(p => p.x)) : room.width, 
                        height: isCustomShape ? Math.max(...activePoints.map(p => p.y)) : room.height 
                    }}
                >
                    <div style={{ transform: `scale(${1/zoomScale})`, transformOrigin: 'center' }} className={`flex flex-col items-center p-2 ${visualStyle.text} ${diagramStyle.fontFamily}`}>
                         <div className={`mb-1 transition-opacity ${isSelected || showTools ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} pointer-events-auto`}>
                             <button
                                onClick={(e) => { e.stopPropagation(); setShowTools(!showTools); }}
                                className={`w-6 h-6 bg-white border border-slate-200 rounded-full shadow-sm flex items-center justify-center text-slate-500 hover:text-primary hover:border-primary transition-all ${showTools ? 'text-primary border-primary' : ''}`}
                                title="Edit Options"
                             >
                                {showTools ? <X size={12} /> : <Pencil size={12} />}
                             </button>
                        </div>

                        <span className="font-bold text-xs md:text-sm leading-tight select-none block whitespace-nowrap">{room.name}</span>
                        <span className={`text-[10px] opacity-70 select-none block ${isCustomShape ? 'text-purple-700 font-bold' : ''}`}>
                            {areaDisplay}
                        </span>

                        {isEditingOutline && (
                            <span className="mt-1 bg-blue-100 text-blue-700 text-[9px] px-1 py-0.5 rounded border border-blue-200 shadow-sm whitespace-nowrap">
                                Ctrl+Drag edge to Extrude
                            </span>
                        )}
                    </div>
                </div>

                {showSunWarning && (
                    <div className="absolute top-1 left-1 text-orange-500 bg-white/80 rounded-full p-0.5 shadow-sm" title="West Facing (Hot Afternoon Sun)">
                        <Sun size={12} fill="currentColor" />
                    </div>
                )}
                
                {showTools && (
                    <div 
                        className="bubble-tools absolute top-0 left-1/2 -translate-y-full -mt-2 flex flex-col gap-1 bg-white border border-slate-200 p-1 rounded-md shadow-lg z-50 pointer-events-auto"
                        style={{ transform: `translateX(-50%) scale(${1/zoomScale})`, transformOrigin: 'bottom center' }}
                        onMouseDown={(e) => e.stopPropagation()}
                    >
                        <button 
                            onClick={() => { toggleEditMode(); setShowTools(false); }}
                            className={`p-1.5 hover:bg-slate-100 rounded text-slate-600 flex items-center gap-2 whitespace-nowrap text-[10px] font-medium ${isEditingOutline ? 'bg-blue-50 text-blue-600' : ''}`}
                        >
                            <LandPlot size={12} /> {isEditingOutline ? 'Finish Editing Outline' : 'Modify Outline'}
                        </button>
                        <div className="h-px bg-slate-100 my-0.5" />
                        <button onClick={() => onFloorChange(room.id, 1)} className="p-1.5 hover:bg-slate-100 rounded text-slate-600 flex items-center gap-2 whitespace-nowrap text-[10px] font-medium">
                            <ArrowUpFromLine size={12} /> Move Up Floor
                        </button>
                        <button onClick={() => onFloorChange(room.id, -1)} className="p-1.5 hover:bg-slate-100 rounded text-slate-600 flex items-center gap-2 whitespace-nowrap text-[10px] font-medium">
                            <ArrowDownToLine size={12} /> Move Down Floor
                        </button>
                        <div className="h-px bg-slate-100 my-0.5" />
                        {isConnectionSource ? (
                             <button onClick={() => { onConnectionStart(room.id); setShowTools(false); }} className="p-1.5 hover:bg-red-50 text-red-600 rounded flex items-center gap-2 whitespace-nowrap text-[10px] font-medium"><Ban size={12} /> Cancel Connect</button>
                        ) : (
                             <button onClick={() => { onConnectionStart(room.id); setShowTools(false); }} className="p-1.5 hover:bg-slate-100 rounded text-slate-600 flex items-center gap-2 whitespace-nowrap text-[10px] font-medium"><LinkIcon size={12} /> Connect</button>
                        )}
                    </div>
                )}
            </div>
        )}

        {is3D && !isCustomShape && (
            <>
                <div className={`absolute inset-0 flex flex-col items-center justify-center border-2 ${visualStyle.bg} ${visualStyle.border} ${visualStyle.text}`} 
                     style={{ transform: `translateZ(${zHeight}px)`, width: room.width, height: room.height }}>
                    <span className="font-bold text-[10px] leading-tight select-none truncate px-1">{room.name}</span>
                </div>
                <div className={`absolute bottom-0 left-0 w-full ${darken(visualStyle.bg)} border-b border-l border-r border-slate-400 opacity-80`}
                     style={{ width: room.width, height: zHeight, transformOrigin: 'bottom', transform: 'rotateX(-90deg)' }} />
                <div className={`absolute top-0 right-0 h-full ${darken(visualStyle.bg)} border-t border-b border-r border-slate-400 opacity-60`}
                     style={{ width: zHeight, height: room.height, transformOrigin: 'right', transform: 'rotateY(90deg)' }} />
                <div className={`absolute top-0 left-0 h-full ${darken(visualStyle.bg)} border-t border-b border-l border-slate-400 opacity-60`}
                     style={{ width: zHeight, height: room.height, transformOrigin: 'left', transform: 'rotateY(-90deg)' }} />
                <div className={`absolute top-0 left-0 w-full ${darken(visualStyle.bg)} border-t border-l border-r border-slate-400 opacity-80`}
                     style={{ width: room.width, height: zHeight, transformOrigin: 'top', transform: 'rotateX(90deg)' }} />
            </>
        )}
        {is3D && isCustomShape && (
             <div style={{ transform: `translateZ(${zHeight}px)` }}>
                 <svg className="overflow-visible">
                    <path 
                        d={polygonPath}
                        className={`${visualStyle.bg.replace('bg-', 'fill-')} ${visualStyle.border.replace('border-', 'stroke-')}`}
                        fillOpacity={0.9}
                        strokeWidth={1}
                        strokeLinejoin="round"
                        strokeLinecap="round"
                    />
                    <text x={room.width/2} y={room.height/2} textAnchor="middle" fontSize={10} className="fill-black font-bold">{room.name}</text>
                </svg>
             </div>
        )}
    </div>
  );
};

export const Bubble = React.memo(BubbleComponent);