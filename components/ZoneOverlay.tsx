import React, { useMemo, useState, useEffect, useRef } from 'react';
import { Room, Point, AppSettings, ZoneColor } from '../types';
import { getConvexHull, createRoundedPath } from '../utils/geometry';

interface ZoneOverlayProps {
    rooms: Room[];
    currentFloor: number;
    scale: number;
    onZoneDrag: (zone: string, dx: number, dy: number) => void;
    onSelectZone?: (zone: string) => void;
    onDragStart?: () => void;
    onDragEnd?: () => void;
    appSettings: AppSettings;
    zoneColors: Record<string, ZoneColor>;
}

export const ZoneOverlay: React.FC<ZoneOverlayProps> = ({ rooms, currentFloor, scale, onZoneDrag, onSelectZone, onDragStart, onDragEnd, appSettings, zoneColors }) => {
    const [draggedZone, setDraggedZone] = useState<string | null>(null);
    const lastMousePos = useRef<{ x: number, y: number } | null>(null);

    const zonePaths = useMemo(() => {
        const zones: Record<string, Point[]> = {};
        const padding = appSettings.zonePadding / scale;
        const cornerRadius = appSettings.cornerRadius / scale;

        // Group points by zone
        rooms.filter(r => r.isPlaced && r.floor === currentFloor).forEach(r => {
            if (!zones[r.zone]) zones[r.zone] = [];
            const angle = r.rotation || 0;
            const rad = (angle * Math.PI) / 180;
            const cos = Math.cos(rad);
            const sin = Math.sin(rad);

            if (r.polygon && r.polygon.length > 0) {
                // Use polygon points
                r.polygon.forEach(p => {
                    // Rotate point around (0,0) local origin
                    const rx = p.x * cos - p.y * sin;
                    const ry = p.x * sin + p.y * cos;
                    const wx = r.x + rx;
                    const wy = r.y + ry;

                    zones[r.zone].push({ x: wx - padding, y: wy - padding });
                    zones[r.zone].push({ x: wx + padding, y: wy - padding });
                    zones[r.zone].push({ x: wx + padding, y: wy + padding });
                    zones[r.zone].push({ x: wx - padding, y: wy + padding });
                });
            } else {
                // Standard Box
                const cx = r.x + r.width / 2;
                const cy = r.y + r.height / 2;

                const corners = [
                    { x: r.x - padding, y: r.y - padding },
                    { x: r.x + r.width + padding, y: r.y - padding },
                    { x: r.x + r.width + padding, y: r.y + r.height + padding },
                    { x: r.x - padding, y: r.y + r.height + padding }
                ];

                corners.forEach(c => {
                    const dx = c.x - cx;
                    const dy = c.y - cy;
                    zones[r.zone].push({
                        x: cx + dx * cos - dy * sin,
                        y: cy + dx * sin + dy * cos
                    });
                });
            }
        });

        // Calculate hull for each zone
        return Object.entries(zones).map(([zone, points]) => {
            if (points.length < 3) return null;
            const hull = getConvexHull(points);

            // Use createRoundedPath to get rounded corners "like the bubbles"
            // Bubbles use rounded-xl ~ 12px.
            const d = createRoundedPath(hull, cornerRadius + padding);

            return {
                zone,
                path: d,
                color: zoneColors[zone] || zoneColors['Default']
            };
        }).filter(Boolean);
    }, [rooms, currentFloor, scale, appSettings.cornerRadius, appSettings.zonePadding, zoneColors]);

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (draggedZone && lastMousePos.current) {
                const dx = (e.clientX - lastMousePos.current.x) / scale;
                const dy = (e.clientY - lastMousePos.current.y) / scale;
                onZoneDrag(draggedZone, dx, dy);
                lastMousePos.current = { x: e.clientX, y: e.clientY };
            }
        };

        const handleMouseUp = (e: MouseEvent) => {
            if (draggedZone) onDragEnd?.(e);
            setDraggedZone(null);
            lastMousePos.current = null;
        };

        if (draggedZone) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        }

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [draggedZone, scale, onZoneDrag]);

    const handleZoneMouseDown = (e: React.MouseEvent, zone: string) => {
        e.stopPropagation(); // Prevent canvas panning
        setDraggedZone(zone);
        lastMousePos.current = { x: e.clientX, y: e.clientY };
        onDragStart?.();
        if (onSelectZone) onSelectZone(zone);
    };

    return (
        <svg className="absolute inset-0 overflow-visible pointer-events-none z-10">
            {zonePaths.map((z: any) => (
                <g key={z.zone} className="">
                    {/* Stroke */}
                    <path
                        d={z.path}
                        className={`${z.color.border.replace('border-', 'stroke-')} opacity-60 transition-colors`}
                        strokeWidth={appSettings.strokeWidth / scale}
                        strokeLinejoin="round"
                        strokeLinecap="round"
                        strokeDasharray={`${10 / scale}, ${10 / scale}`}
                        fill="none"
                    />
                    {/* Interactive Fill */}
                    <path
                        d={z.path}
                        className={`${z.color.bg.replace('bg-', 'fill-')} hover:opacity-60 cursor-grab active:cursor-grabbing pointer-events-auto transition-colors`}
                        style={{ fillOpacity: appSettings.zoneTransparency }}
                        stroke="none"
                        fill="transparent"
                        onMouseDown={(e) => handleZoneMouseDown(e, z.zone)}
                    />
                </g>
            ))}
        </svg>
    );
};
