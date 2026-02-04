import { Room } from '../types';

export const applyMagneticPhysics = (rooms: Room[]): Room[] => {
    // Clone rooms to avoid mutation
    const nextRooms = rooms.map(r => ({ ...r }));
    const strength = 0.5; // Attraction strength
    const repulsion = 2.0; // Repulsion to prevent overlap
    const minDistance = 5; // Pixel buffer

    let moved = false;

    // Pairwise comparison
    for (let i = 0; i < nextRooms.length; i++) {
        const a = nextRooms[i];
        if (!a.isPlaced) continue;

        let fx = 0;
        let fy = 0;

        for (let j = 0; j < nextRooms.length; j++) {
            if (i === j) continue;
            const b = nextRooms[j];
            if (!b.isPlaced || a.floor !== b.floor) continue;

            const centerA = { x: a.x + a.width / 2, y: a.y + a.height / 2 };
            const centerB = { x: b.x + b.width / 2, y: b.y + b.height / 2 };

            const dx = centerB.x - centerA.x;
            const dy = centerB.y - centerA.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist === 0) continue;

            const dirX = dx / dist;
            const dirY = dy / dist;

            // Attraction (same zone)
            if (a.zone === b.zone) {
                // Ideally they should touch, so target distance is sum of half-sizes? 
                // Approximating bubbles as circles for physics or simple box physics.
                // Let's use simple center attraction but clamp it so they don't overlap too much.
                // Or better: Box collision response.

                // Force proportional to distance (spring)
                // We want them to group.
                fx += dirX * strength;
                fy += dirY * strength;
            }

            // Repulsion (all nodes, to avoid overlap)
            // Calculate overlap
            const overlapX = (a.width / 2 + b.width / 2) - Math.abs(dx);
            const overlapY = (a.height / 2 + b.height / 2) - Math.abs(dy);

            if (Math.abs(dx) < (a.width + b.width) / 2 && Math.abs(dy) < (a.height + b.height) / 2) {
                // Determine smallest overlap axis for resolution
                if (overlapX < overlapY) {
                    fx -= Math.sign(dx) * repulsion * overlapX;
                } else {
                    fy -= Math.sign(dy) * repulsion * overlapY;
                }
            }
        }

        if (Math.abs(fx) > 0.1 || Math.abs(fy) > 0.1) {
            a.x += fx;
            a.y += fy;
            moved = true;
        }
    }

    return moved ? nextRooms : rooms; // Return original if no change to avoid render loop if strictly equal check used
};
