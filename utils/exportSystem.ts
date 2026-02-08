import { Room, Connection, Point, ZoneColor, AppSettings, Annotation } from '../types';
import { getConvexHull, createRoundedPath } from './geometry';
import { SketchManager } from '../SketchManager';

export type ExportFormat = 'png' | 'jpeg' | 'svg' | 'dxf' | 'json';
const PIXELS_PER_METER = 20;

// Text wrapping helper with literal dash support
export const wrapText = (text: string, maxWidth: number, fontSize: number, fontFamily: string = 'Inter, sans-serif'): string[] => {
    if (!text) return [];
    if (typeof document === 'undefined') return [text];

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return [text];
    ctx.font = `bold ${fontSize}px ${fontFamily}`;

    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = words[0];

    for (let i = 1; i < words.length; i++) {
        const word = words[i];
        const width = ctx.measureText(currentLine + " " + word).width;
        if (width < maxWidth) {
            currentLine += " " + word;
        } else {
            lines.push(currentLine);
            currentLine = word;
        }
    }
    lines.push(currentLine);

    const finalLines: string[] = [];
    for (const line of lines) {
        if (ctx.measureText(line).width <= maxWidth) {
            finalLines.push(line);
            continue;
        }
        let remaining = line;
        while (ctx.measureText(remaining).width > maxWidth) {
            let splitIndex = remaining.length - 1;
            while (splitIndex > 0 && ctx.measureText(remaining.substring(0, splitIndex) + "-").width > maxWidth) {
                splitIndex--;
            }
            if (splitIndex <= 0) break;
            finalLines.push(remaining.substring(0, splitIndex) + "-");
            remaining = remaining.substring(splitIndex);
        }
        finalLines.push(remaining);
    }
    return finalLines;
};

// --- Geometry Helpers ---

const calculateCentroid = (points: Point[]): Point => {
    let x = 0, y = 0;
    for (const p of points) {
        x += p.x;
        y += p.y;
    }
    return { x: x / points.length, y: y / points.length };
};

// Generate Bezier commands for smooth bubble curves (Catmull-Rom to Cubic Bezier)
const getBubblePathCommands = (points: Point[]) => {
    const cmds: { type: 'M' | 'C', values: number[] }[] = [];
    if (points.length < 3) return cmds;

    cmds.push({ type: 'M', values: [points[0].x, points[0].y] });

    for (let i = 0; i < points.length; i++) {
        const p0 = points[(i - 1 + points.length) % points.length];
        const p1 = points[i];
        const p2 = points[(i + 1) % points.length];
        const p3 = points[(i + 2) % points.length];

        // Catmull-Rom control points
        const cp1x = p1.x + (p2.x - p0.x) / 6;
        const cp1y = p1.y + (p2.y - p0.y) / 6;

        const cp2x = p2.x - (p3.x - p1.x) / 6;
        const cp2y = p2.y - (p3.y - p1.y) / 6;

        cmds.push({ type: 'C', values: [cp1x, cp1y, cp2x, cp2y, p2.x, p2.y] });
    }
    return cmds;
};

const triggerDownload = (url: string, filename: string) => {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
};

export const handleExport = async (
    format: ExportFormat,
    projectName: string,
    rooms: Room[],
    connections: Connection[],
    currentFloor: number,
    darkMode: boolean,
    zoneColors: Record<string, ZoneColor>,
    floors: { id: number; label: string }[],
    appSettings: AppSettings,
    annotations?: Annotation[]
) => {
    // --- JSON Export ---
    if (format === 'json') {
        const data = {
            version: 1,
            timestamp: new Date().toISOString(),
            projectName,
            rooms,
            connections,
            floors,
            currentFloor,
            zoneColors,
            appSettings,
            annotations
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        triggerDownload(url, `${projectName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.json`);
        return;
    }

    const visibleRooms = rooms.filter(r => r.isPlaced && r.floor === currentFloor);
    if (visibleRooms.length === 0) {
        alert("No visible rooms to export.");
        return;
    }

    // 1. Calculate Bounds
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    visibleRooms.forEach(r => {
        const pts = r.polygon || [
            { x: 0, y: 0 }, { x: r.width, y: 0 },
            { x: r.width, y: r.height }, { x: 0, y: r.height }
        ];
        pts.forEach(p => {
            minX = Math.min(minX, r.x + p.x);
            minY = Math.min(minY, r.y + p.y);
            maxX = Math.max(maxX, r.x + p.x);
            maxY = Math.max(maxY, r.y + p.y);
        });
    });

    const padding = 50;
    minX -= padding;
    minY -= padding;
    maxX += padding + 50; // Extra space for scale bar
    maxY += padding + 50;
    const width = maxX - minX;
    const height = maxY - minY;
    const offsetX = -minX;
    const offsetY = -minY;

    // --- DXF Export ---
    if (format === 'dxf') {
        let dxf = `0\nSECTION\n2\nHEADER\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n`;

        visibleRooms.forEach(room => {
            // Draw Shape
            if (room.shape === 'bubble' && room.polygon) {
                // Export as High-Res Polyline to approximate curve
                const cmds = getBubblePathCommands(room.polygon);
                // We need to sample the Bezier curves. 
                // A simple way is to sample t from 0 to 1 for each C command.
                const points: Point[] = [];

                // Start point
                if (cmds.length > 0 && cmds[0].type === 'M') {
                    // M is start
                }

                // Re-iterate polygon points to generate curve samples directly
                for (let i = 0; i < room.polygon.length; i++) {
                    const p0 = room.polygon[(i - 1 + room.polygon.length) % room.polygon.length];
                    const p1 = room.polygon[i];
                    const p2 = room.polygon[(i + 1) % room.polygon.length];
                    const p3 = room.polygon[(i + 2) % room.polygon.length];

                    const cp1x = p1.x + (p2.x - p0.x) / 6;
                    const cp1y = p1.y + (p2.y - p0.y) / 6;
                    const cp2x = p2.x - (p3.x - p1.x) / 6;
                    const cp2y = p2.y - (p3.y - p1.y) / 6;

                    // Sample 10 points per segment
                    for (let t = 0; t < 1; t += 0.1) {
                        const it = 1 - t;
                        const x = it * it * it * p1.x + 3 * it * it * t * cp1x + 3 * it * t * t * cp2x + t * t * t * p2.x;
                        const y = it * it * it * p1.y + 3 * it * it * t * cp1y + 3 * it * t * t * cp2y + t * t * t * p2.y;
                        points.push({ x: room.x + x, y: room.y + y });
                    }
                }

                dxf += `0\nLWPOLYLINE\n8\n${room.zone}\n90\n${points.length}\n70\n1\n`; // Closed
                points.forEach(p => {
                    dxf += `10\n${p.x + offsetX}\n20\n${-(p.y + offsetY)}\n`; // Invert Y for DXF
                });

            } else {
                // Rect/Polygon
                const pts = room.polygon || [
                    { x: 0, y: 0 }, { x: room.width, y: 0 },
                    { x: room.width, y: room.height }, { x: 0, y: room.height }
                ];
                dxf += `0\nLWPOLYLINE\n8\n${room.zone}\n90\n${pts.length}\n70\n1\n`;
                pts.forEach(p => {
                    dxf += `10\n${room.x + p.x + offsetX}\n20\n${-(room.y + p.y + offsetY)}\n`;
                });
            }

            // Text Label
            const cx = (room.polygon ? 0 : room.width / 2) + (room.polygon ? calculateCentroid(room.polygon).x : 0);
            const cy = (room.polygon ? 0 : room.height / 2) + (room.polygon ? calculateCentroid(room.polygon).y : 0);
            const absX = room.x + cx + offsetX;
            const absY = -(room.y + cy + offsetY);

            const width = room.polygon ? (Math.max(...room.polygon.map(p => p.x)) - Math.min(...room.polygon.map(p => p.x))) : room.width;
            const lines = wrapText(room.name, width - 10, appSettings.fontSize);
            const lineHeight = appSettings.fontSize * 1.2;
            const totalHeight = lines.length * lineHeight;

            lines.forEach((line, i) => {
                const yPos = absY + (totalHeight / 2) - (i * lineHeight) - (lineHeight / 2);
                dxf += `0\nTEXT\n8\nLabels\n10\n${absX}\n20\n${yPos}\n40\n${appSettings.fontSize}\n1\n${line}\n72\n4\n11\n${absX}\n21\n${yPos}\n`;
            });
        });

        dxf += `0\nENDSEC\n0\nEOF`;
        const blob = new Blob([dxf], { type: 'application/dxf' });
        const url = URL.createObjectURL(blob);
        triggerDownload(url, `${projectName}-floor-${currentFloor}.dxf`);
        return;
    }

    // --- SVG Generation (Used for SVG, PNG, JPEG) ---
    let svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${-offsetX} ${-offsetY} ${width} ${height}">
        <style>
            .text { font-family: 'Inter', sans-serif; text-anchor: middle; dominant-baseline: middle; }
            .title { font-weight: bold; font-size: ${appSettings.fontSize}px; }
            .subtitle { font-size: ${appSettings.fontSize * 0.8}px; fill: #666; }
        </style>
        <defs>
          <marker id="marker-arrow-start" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 10 0 L 0 5 L 10 10 z" fill="context-stroke" />
          </marker>
          <marker id="marker-arrow-end" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" />
          </marker>
          <marker id="marker-circle-start" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="4" markerHeight="4">
            <circle cx="5" cy="5" r="5" fill="context-stroke" />
          </marker>
          <marker id="marker-circle-end" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="4" markerHeight="4">
            <circle cx="5" cy="5" r="5" fill="context-stroke" />
          </marker>
          <marker id="marker-square-start" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="4" markerHeight="4">
             <rect x="0" y="0" width="10" height="10" fill="context-stroke" />
          </marker>
          <marker id="marker-square-end" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="4" markerHeight="4">
             <rect x="0" y="0" width="10" height="10" fill="context-stroke" />
          </marker>
        </defs>`;

    // Background
    if (format === 'jpeg') {
        const bgColor = darkMode ? '#1a1a1a' : '#f0f2f5';
        svgContent += `<rect x="${-offsetX}" y="${-offsetY}" width="${width}" height="${height}" fill="${bgColor}" />`;
    }

    // Zones (Convex Hulls)
    const zones: Record<string, Point[]> = {};

    visibleRooms.forEach(r => {
        if (!zones[r.zone]) zones[r.zone] = [];

        if (r.polygon && r.polygon.length > 0) {
            r.polygon.forEach(p => {
                zones[r.zone].push({ x: r.x + p.x, y: r.y + p.y });
            });
        } else {
            zones[r.zone].push({ x: r.x, y: r.y });
            zones[r.zone].push({ x: r.x + r.width, y: r.y });
            zones[r.zone].push({ x: r.x + r.width, y: r.y + r.height });
            zones[r.zone].push({ x: r.x, y: r.y + r.height });
        }
    });

    Object.entries(zones).forEach(([zone, points]) => {
        if (points.length < 3) return;
        const hull = getConvexHull(points);
        const d = createRoundedPath(hull, 12);
        const color = getHexColorForZone(zone, zoneColors);
        svgContent += `<path d="${d}" fill="${color}" fill-opacity="0.1" stroke="${color}" stroke-width="2" stroke-dasharray="10,10" stroke-opacity="0.6" />`;
    });

    // Connections
    connections.forEach(conn => {
        const from = visibleRooms.find(r => r.id === conn.fromId);
        const to = visibleRooms.find(r => r.id === conn.toId);
        if (from && to) {
            const x1 = from.x + from.width / 2;
            const y1 = from.y + from.height / 2;
            const x2 = to.x + to.width / 2;
            const y2 = to.y + to.height / 2;
            svgContent += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#94a3b8" stroke-width="2" />`;
        }
    });

    // Rooms
    visibleRooms.forEach(r => {
        const fill = r.style?.fill || getHexColorForZone(r.zone, zoneColors);
        const stroke = r.style?.stroke || "#334155";
        const strokeWidth = r.style?.strokeWidth ?? appSettings.strokeWidth;
        const opacity = r.style?.opacity ?? 0.9;
        let d = "";

        if (r.shape === 'bubble' && r.polygon) {
            const cmds = getBubblePathCommands(r.polygon);
            cmds.forEach(cmd => {
                if (cmd.type === 'M') d += `M ${cmd.values[0]} ${cmd.values[1]} `;
                if (cmd.type === 'C') d += `C ${cmd.values[0]} ${cmd.values[1]}, ${cmd.values[2]} ${cmd.values[3]}, ${cmd.values[4]} ${cmd.values[5]} `;
            });
            d += "Z";
        } else if (r.polygon) {
            d = `M ${r.polygon[0].x} ${r.polygon[0].y} ` + r.polygon.slice(1).map(p => `L ${p.x} ${p.y}`).join(" ") + " Z";
        } else {
            const radius = r.style?.cornerRadius || 0;
            if (radius > 0) {
                const w = r.width;
                const h = r.height;
                const rEff = Math.min(radius, w / 2, h / 2);
                d = `M ${rEff} 0 H ${w - rEff} Q ${w} 0 ${w} ${rEff} V ${h - rEff} Q ${w} ${h} ${w - rEff} ${h} H ${rEff} Q 0 ${h} 0 ${h - rEff} V ${rEff} Q 0 0 ${rEff} 0 Z`;
            } else {
                d = `M 0 0 H ${r.width} V ${r.height} H 0 Z`;
            }
        }

        const cx = (r.polygon ? 0 : r.width / 2) + (r.polygon ? calculateCentroid(r.polygon).x : 0);
        const cy = (r.polygon ? 0 : r.height / 2) + (r.polygon ? calculateCentroid(r.polygon).y : 0);

        const width = (r.polygon && r.polygon.length > 0) ?
            (Math.max(...r.polygon.map(p => p.x)) - Math.min(...r.polygon.map(p => p.x))) :
            r.width;
        const lines = wrapText(r.name, width - 16, appSettings.fontSize);
        const lineHeight = appSettings.fontSize * 1.2;
        const startY = (cy - 6) - ((lines.length - 1) * lineHeight) / 2;

        svgContent += `
        <g transform="translate(${r.x}, ${r.y})">
            <path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" fill-opacity="${opacity}" />
            <text x="${cx}" y="${startY}" class="text title" fill="#1e293b">
                ${lines.map((line, i) => `<tspan x="${cx}" dy="${i === 0 ? 0 : lineHeight}">${line}</tspan>`).join('')}
            </text>
            <text x="${cx}" y="${cy + 8 + (lines.length > 1 ? (lines.length * lineHeight) / 2 : 0)}" class="text subtitle">${r.area} m²</text>
        </g>`;
    });

    // Annotations
    if (annotations) {
        annotations.filter(ann => ann.floor === currentFloor).forEach(ann => {
            if (ann.type === 'text') {
                const textAlign = ann.style.textAlign === 'center' ? 'middle' : ann.style.textAlign === 'right' ? 'end' : 'start';
                svgContent += `<text x="${ann.points[0].x}" y="${ann.points[0].y}" fill="${ann.style.stroke}" font-size="${ann.style.fontSize || 14}" font-family="${ann.style.fontFamily || 'Inter, sans-serif'}" font-weight="${ann.style.fontWeight || 'normal'}" text-anchor="${textAlign}" dominant-baseline="middle">${ann.style.text}</text>`;
                return;
            }

            const path = SketchManager.generatePath(ann);
            const markerStart = SketchManager.getMarkerUrl('start', ann.style.startCap);
            const markerEnd = SketchManager.getMarkerUrl('end', ann.style.endCap);
            svgContent += `<path d="${path}" stroke="${ann.style.stroke}" stroke-width="${ann.style.strokeWidth}" stroke-dasharray="${ann.style.strokeDash || 'none'}" fill="none" stroke-linecap="round" stroke-linejoin="round" marker-start="${markerStart}" marker-end="${markerEnd}" />`;
        });
    }

    // Scale Bar (Bottom Right)
    const scaleBarLength = 10 * PIXELS_PER_METER; // 10 meters
    const scaleBarX = maxX - 50 - scaleBarLength;
    const scaleBarY = maxY - 50;
    const textColor = (format === 'jpeg' && darkMode) ? '#94a3b8' : '#64748b';
    const strokeColor = (format === 'jpeg' && darkMode) ? '#94a3b8' : '#64748b';

    svgContent += `<g transform="translate(${scaleBarX}, ${scaleBarY})">
        <text x="${scaleBarLength / 2}" y="-8" text-anchor="middle" font-family="sans-serif" font-size="10" font-weight="bold" fill="${textColor}">10 meters</text>
        <line x1="0" y1="0" x2="${scaleBarLength}" y2="0" stroke="${strokeColor}" stroke-width="2" />
        <line x1="0" y1="-4" x2="0" y2="4" stroke="${strokeColor}" stroke-width="2" />
        <line x1="${scaleBarLength}" y1="-4" x2="${scaleBarLength}" y2="4" stroke="${strokeColor}" stroke-width="2" />
    </g>`;

    svgContent += `</svg>`;

    if (format === 'svg') {
        const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        triggerDownload(url, `${projectName}-floor-${currentFloor}.svg`);
        return;
    }

    // --- PNG / JPEG Export ---
    const img = new Image();
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgContent)));

    await new Promise((resolve) => { img.onload = resolve; });

    // High Resolution Export (approx 300 DPI relative to screen 72 DPI -> 4.16x)
    const scaleFactor = 4;

    const canvas = document.createElement('canvas');
    canvas.width = width * scaleFactor;
    canvas.height = height * scaleFactor;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.scale(scaleFactor, scaleFactor);
    ctx.translate(offsetX, offsetY); // Adjust for negative coordinates in SVG viewBox

    if (format === 'jpeg') {
        // Background already in SVG for JPEG, but ensure canvas is opaque if needed
        ctx.fillStyle = darkMode ? '#1a1a1a' : '#f0f2f5';
        ctx.fillRect(-offsetX, -offsetY, width, height);
    }

    ctx.drawImage(img, -offsetX, -offsetY, width, height);

    const dataUrl = canvas.toDataURL(`image/${format}`);
    triggerDownload(dataUrl, `${projectName}-floor-${currentFloor}.${format}`);
};

export const getHexColorForZone = (zone: string, zoneColors: Record<string, ZoneColor>) => {
    // 1. Try to resolve from zoneColors config first
    if (zoneColors[zone]) {
        const bgClass = zoneColors[zone].bg;
        const tailwindMap: Record<string, string> = {
            'bg-blue-100': '#dbeafe',
            'bg-green-100': '#dcfce7',
            'bg-orange-100': '#ffedd5',
            'bg-purple-100': '#f3e8ff',
            'bg-pink-100': '#fce7f3',
            'bg-slate-100': '#f1f5f9',
            'bg-red-100': '#fee2e2',
            'bg-yellow-100': '#fef9c3',
            'bg-teal-100': '#ccfbf1',
            'bg-indigo-100': '#e0e7ff',
            'bg-cyan-100': '#cffafe',
            'bg-lime-100': '#ecfccb',
            'bg-emerald-100': '#d1fae5',
            'bg-sky-100': '#e0f2fe',
            'bg-violet-100': '#ede9fe',
            'bg-fuchsia-100': '#fae8ff',
            'bg-rose-100': '#ffe4e6',
            'bg-gray-100': '#f3f4f6',
            'bg-neutral-100': '#f5f5f5',
            'bg-stone-100': '#f5f5f4',
            'bg-zinc-100': '#f4f4f5',
            'bg-amber-100': '#fef3c7',
        };
        if (tailwindMap[bgClass]) return tailwindMap[bgClass];
    }

    // Simple mapping based on standard tailwind colors often used
    const map: Record<string, string> = {
        'Public': '#dbeafe', // blue-100
        'Private': '#fce7f3', // pink-100
        'Service': '#f3f4f6', // slate-100
        'Circulation': '#ffedd5', // orange-100
        'Outdoor': '#dcfce7', // green-100
        'Default': '#f1f5f9' // slate-100
    };
    // Try to match partial keys if exact match fails
    // For dynamic zones, we might need a better way to get hex from tailwind classes or just generate a hash color
    // For now, fallback to a hash-based color or default if not in standard map
    if (map[zone]) return map[zone];

    // Fallback for custom zones - generate a consistent color from string
    let hash = 0;
    for (let i = 0; i < zone.length; i++) {
        hash = zone.charCodeAt(i) + ((hash << 5) - hash);
    }
    const c = (hash & 0x00FFFFFF).toString(16).toUpperCase();
    return '#' + "00000".substring(0, 6 - c.length) + c;
};

export const getHexBorderForZone = (zone: string, zoneColors?: Record<string, ZoneColor>) => {
    if (zoneColors && zoneColors[zone]) {
        // Try to derive border from text color or explicit border if available
        const classKey = zoneColors[zone].border || zoneColors[zone].text?.replace('text-', 'border-') || 'border-slate-500';
        const tailwindMap: Record<string, string> = {
            'border-blue-500': '#3b82f6',
            'border-blue-600': '#2563eb',
            'border-green-500': '#22c55e',
            'border-green-600': '#16a34a',
            'border-orange-500': '#f97316',
            'border-orange-600': '#ea580c',
            'border-purple-500': '#a855f7',
            'border-purple-600': '#9333ea',
            'border-pink-500': '#ec4899',
            'border-pink-600': '#db2777',
            'border-slate-500': '#64748b',
            'border-slate-600': '#475569',
            'border-red-500': '#ef4444',
            'border-red-600': '#dc2626',
            'border-yellow-500': '#eab308',
            'border-yellow-600': '#ca8a04',
            'border-gray-500': '#6b7280',
            'border-gray-600': '#4b5563',
        };
        if (tailwindMap[classKey]) return tailwindMap[classKey];
    }

    const map: Record<string, string> = {
        'Public': '#3b82f6', // blue-500
        'Private': '#ec4899', // pink-500
        'Service': '#64748b', // slate-500
        'Circulation': '#f97316', // orange-500
        'Outdoor': '#22c55e', // green-500
        'Default': '#64748b' // slate-500
    };
    if (map[zone]) return map[zone];
    return '#64748b';
};