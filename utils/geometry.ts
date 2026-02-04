import { Point } from '../types';

// Cross product of vectors OA and OB
// A positive cross product indicates a counter-clockwise turn, 0 indicates a collinear points, and negative indicates a clockwise turn.
const cross = (o: Point, a: Point, b: Point) => {
    return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
};

// Monotone Chain Algorithm for Convex Hull
export const getConvexHull = (points: Point[]): Point[] => {
    if (points.length <= 1) return points;

    // Sort points lexicographically (by x, then by y)
    const sorted = [...points].sort((a, b) => a.x === b.x ? a.y - b.y : a.x - b.x);

    // Build lower hull
    const lower: Point[] = [];
    for (const p of sorted) {
        while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
            lower.pop();
        }
        lower.push(p);
    }

    // Build upper hull
    const upper: Point[] = [];
    for (let i = sorted.length - 1; i >= 0; i--) {
        const p = sorted[i];
        while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
            upper.pop();
        }
        upper.push(p);
    }

    // Concatenate lower and upper hull
    // The last point of lower and upper are duplicates of the start points of the other list, so remove them.
    lower.pop();
    upper.pop();

    return [...lower, ...upper];
};

// Generate a smooth path from hull points (Catmull-Rom or Bezier refinement can be added here, 
// but for "fluid" look, simply using SVG's smooth curve commands (Q or S) or just rounded line joins works well.
// Here we will do a simple rounded corner approach).
export const getHullPath = (points: Point[], padding: number = 20): string => {
    if (points.length < 3) return "";

    // Simple path for now
    const d = points.map((p, i) => {
        return `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`;
    }).join(' ');

    return d + " Z";
};

// SVG Fillet utility
export const createRoundedPath = (points: Point[], radius: number) => {
    if (points.length < 3) return "";
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
        const sX = p1.x + (v1.x / l1) * r;
        const sY = p1.y + (v1.y / l1) * r;
        const eX = p1.x + (v2.x / l2) * r;
        const eY = p1.y + (v2.y / l2) * r;
        path += (i === 0 ? `M ${sX},${sY}` : ` L ${sX},${sY}`) + ` Q ${p1.x},${p1.y} ${eX},${eY}`;
    }
    return path + " Z";
};
