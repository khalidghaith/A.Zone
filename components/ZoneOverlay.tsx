import React, { useMemo, useState, useEffect, useRef } from 'react';
import { Room, ZONE_COLORS, Point, AppSettings } from '../types';
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
}

export const ZoneOverlay: React.FC<ZoneOverlayProps> = ({ rooms, currentFloor, scale, onZoneDrag, onSelectZone, onDragStart, onDragEnd, appSettings }) => {
    const [draggedZone, setDraggedZone] = useState<string | null>(null);
    const lastMousePos = useRef<{ x: number, y: number } | null>(null);

    const zonePaths = useMemo(() => {
        const zones: Record<string, Point[]> = {};
        const padding = appSettings.zonePadding / scale;
        const cornerRadius = appSettings.cornerRadius / scale;

        // Group points by zone
        rooms.filter(r => r.isPlaced && r.floor === currentFloor).forEach(r => {
            if (!zones[r.zone]) zones[r.zone] = [];

            if (r.polygon && r.polygon.length > 0) {
                // Use polygon points
                r.polygon.forEach(p => {
                    // Add padding to each vertex? Or just the vertex?
                    // If we want outlining, expanding the hull is better.
                    // But here we are collecting points to BUILD the hull.
                    // A simple way is to add 4 points for each vertex expanded by padding? 
                    // Or just add the vertex and rely on the hull being tight?
                    // The previous logic added 4 corners expanded by padding.
                    // Let's add expanded points for each vertex to ensure the hull covers the padding area.
                    zones[r.zone].push({ x: r.x + p.x - padding, y: r.y + p.y - padding });
                    zones[r.zone].push({ x: r.x + p.x + padding, y: r.y + p.y - padding });
                    zones[r.zone].push({ x: r.x + p.x + padding, y: r.y + p.y + padding });
                    zones[r.zone].push({ x: r.x + p.x - padding, y: r.y + p.y + padding });
                });
            } else {
                // Standard Box
                zones[r.zone].push({ x: r.x - padding, y: r.y - padding });
                zones[r.zone].push({ x: r.x + r.width + padding, y: r.y - padding });
                zones[r.zone].push({ x: r.x + r.width + padding, y: r.y + r.height + padding });
                zones[r.zone].push({ x: r.x - padding, y: r.y + r.height + padding });
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
                color: ZONE_COLORS[zone] || ZONE_COLORS['Default']
            };
        }).filter(Boolean);
    }, [rooms, currentFloor, scale, appSettings.cornerRadius, appSettings.zonePadding]);

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (draggedZone && lastMousePos.current) {
                const dx = (e.clientX - lastMousePos.current.x) / scale;
                const dy = (e.clientY - lastMousePos.current.y) / scale;
                onZoneDrag(draggedZone, dx, dy);
                lastMousePos.current = { x: e.clientX, y: e.clientY };
            }
        };

        const handleMouseUp = () => {
            if (draggedZone) onDragEnd?.();
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
        <svg className="absolute inset-0 overflow-visible pointer-events-none z-0">
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
                        onMouseDown={(e) => handleZoneMouseDown(e, z.zone)}
                    />
                </g>
            ))}
        </svg>
    );
};
