import { Room, Connection, ZONE_COLORS, Point } from '../types';
import { downloadDXF } from './dxf';
import { getConvexHull, createRoundedPath } from './geometry';

export type ExportFormat = 'png' | 'jpeg' | 'svg' | 'dxf';
const PIXELS_PER_METER = 20;

export const handleExport = async (
    format: ExportFormat,
    projectName: string,
    rooms: Room[],
    connections: Connection[],
    currentFloor: number,
    darkMode: boolean
) => {
    if (format === 'dxf') {
        downloadDXF(projectName, rooms);
        return;
    }

    const visibleRooms = rooms.filter(r => r.isPlaced && r.floor === currentFloor);
    if (visibleRooms.length === 0) {
        alert("No visible rooms to export.");
        return;
    }

    // Calculate bounding box
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    visibleRooms.forEach(r => {
        minX = Math.min(minX, r.x);
        minY = Math.min(minY, r.y);
        maxX = Math.max(maxX, r.x + r.width);
        maxY = Math.max(maxY, r.y + r.height);
    });

    // Add padding
    const padding = 50;
    minX -= padding;
    minY -= padding;
    maxX += padding + 50; // Extra space for scale bar
    maxY += padding + 50;
    const width = maxX - minX;
    const height = maxY - minY;

    // Generate SVG Content
    let svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${minX} ${minY} ${width} ${height}">`;
    
    // Background
    // For JPEG, we use the canvas background color. For PNG/SVG, we keep it transparent.
    if (format === 'jpeg') {
        const bgColor = darkMode ? '#1a1a1a' : '#f0f2f5';
        svgContent += `<rect x="${minX}" y="${minY}" width="${width}" height="${height}" fill="${bgColor}" />`;
    }

    // Zones
    const zones: Record<string, Point[]> = {};
    const zonePadding = 10;

    visibleRooms.forEach(r => {
        if (!zones[r.zone]) zones[r.zone] = [];
        
        if (r.polygon && r.polygon.length > 0) {
            r.polygon.forEach(p => {
                zones[r.zone].push({ x: r.x + p.x - zonePadding, y: r.y + p.y - zonePadding });
                zones[r.zone].push({ x: r.x + p.x + zonePadding, y: r.y + p.y - zonePadding });
                zones[r.zone].push({ x: r.x + p.x + zonePadding, y: r.y + p.y + zonePadding });
                zones[r.zone].push({ x: r.x + p.x - zonePadding, y: r.y + p.y + zonePadding });
            });
        } else {
            zones[r.zone].push({ x: r.x - zonePadding, y: r.y - zonePadding });
            zones[r.zone].push({ x: r.x + r.width + zonePadding, y: r.y - zonePadding });
            zones[r.zone].push({ x: r.x + r.width + zonePadding, y: r.y + r.height + zonePadding });
            zones[r.zone].push({ x: r.x - zonePadding, y: r.y + r.height + zonePadding });
        }
    });

    Object.entries(zones).forEach(([zone, points]) => {
        if (points.length < 3) return;
        const hull = getConvexHull(points);
        const d = createRoundedPath(hull, 12);
        const color = getHexColorForZone(zone);
        svgContent += `<path d="${d}" fill="${color}" fill-opacity="0.5" stroke="${color}" stroke-width="2" stroke-dasharray="10,10" stroke-opacity="0.6" />`;
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
        const fill = getHexColorForZone(r.zone);
        
        if (r.polygon) {
            const points = r.polygon.map(p => `${r.x + p.x},${r.y + p.y}`).join(' ');
            svgContent += `<polygon points="${points}" fill="${fill}" stroke="#334155" stroke-width="2" fill-opacity="0.5" />`;
        } else {
            svgContent += `<rect x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}" rx="10" fill="${fill}" stroke="#334155" stroke-width="2" fill-opacity="0.5" />`;
        }

        // Text
        const cx = r.x + r.width / 2;
        const cy = r.y + r.height / 2;
        svgContent += `<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="middle" font-family="sans-serif" font-size="14" font-weight="bold" fill="#1e293b">${r.name}</text>`;
        svgContent += `<text x="${cx}" y="${cy + 16}" text-anchor="middle" dominant-baseline="middle" font-family="sans-serif" font-size="10" fill="#64748b">${r.area} m²</text>`;
    });

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

    // Convert to Image
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

    if (format === 'jpeg') {
        // Background already in SVG for JPEG, but ensure canvas is opaque if needed
        // SVG draw will cover it.
    }
    
    ctx.drawImage(img, 0, 0);
    
    const dataUrl = canvas.toDataURL(`image/${format}`);
    triggerDownload(dataUrl, `${projectName}-floor-${currentFloor}.${format}`);
};

const triggerDownload = (url: string, filename: string) => {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
};

const getHexColorForZone = (zone: string) => {
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
    if (!map[zone]) {
        const key = Object.keys(map).find(k => zone.includes(k));
        return key ? map[key] : map['Default'];
    }
    return map[zone];
};