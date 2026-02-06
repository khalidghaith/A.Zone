import { Room } from '../types';

export const arrangeRooms = (rooms: Room[], currentFloor: number, spacing: number = 20): Room[] => {
    const roomsToArrange = rooms.filter(r => !r.isPlaced || r.floor === currentFloor);
    
    if (roomsToArrange.length === 0) return rooms;

    // Sort by zone then area (descending)
    const sortedRooms = [...roomsToArrange].sort((a, b) => {
        if (a.zone !== b.zone) return a.zone.localeCompare(b.zone);
        return b.area - a.area;
    });

    const placedRects: { x: number, y: number, w: number, h: number }[] = [];
    const newPlacedRooms: Room[] = [];

    const checkOverlap = (x: number, y: number, w: number, h: number) => {
        for (const r of placedRects) {
            if (x < r.x + r.w + spacing && x + w + spacing > r.x &&
                y < r.y + r.h + spacing && y + h + spacing > r.y) {
                return true;
            }
        }
        return false;
    };

    sortedRooms.forEach(room => {
        let width = room.width;
        let height = room.height;
        let offsetX = 0;
        let offsetY = 0;

        if (room.polygon) {
            const xs = room.polygon.map(p => p.x);
            const ys = room.polygon.map(p => p.y);
            const minX = Math.min(...xs);
            const maxX = Math.max(...xs);
            const minY = Math.min(...ys);
            const maxY = Math.max(...ys);
            width = maxX - minX;
            height = maxY - minY;
            offsetX = minX;
            offsetY = minY;
        }

        let bestX = 0;
        let bestY = 0;
        let angle = 0;
        let radius = 0;

        // Spiral search for position
        for (let i = 0; i < 5000; i++) {
            const x = Math.cos(angle) * radius;
            const y = Math.sin(angle) * radius;
            
            // Try to center the bounding box at (x,y)
            const candidateX = x - width / 2;
            const candidateY = y - height / 2;

            if (!checkOverlap(candidateX, candidateY, width, height)) {
                bestX = candidateX;
                bestY = candidateY;
                break;
            }

            angle += 0.5;
            radius = 5 * angle;
        }

        placedRects.push({ x: bestX, y: bestY, w: width, h: height });
        // Adjust room position so its bounding box is at bestX, bestY
        newPlacedRooms.push({ ...room, x: bestX - offsetX, y: bestY - offsetY, isPlaced: true, floor: currentFloor });
    });

    return rooms.map(r => {
        const updated = newPlacedRooms.find(nr => nr.id === r.id);
        return updated || r;
    });
};