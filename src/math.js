/** Double-precision affine geometry in document coordinates. */
export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const radians = d => d * Math.PI / 180;
export const identity = () => [1, 0, 0, 1, 0, 0];
export function multiply(a, b) {
    return [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
}
export function inverse(m) {
    const d = m[0] * m[3] - m[1] * m[2];
    if (Math.abs(d) < 1e-12)
        return null;
    return [m[3] / d, -m[1] / d, -m[2] / d, m[0] / d, (m[2] * m[5] - m[3] * m[4]) / d, (m[1] * m[4] - m[0] * m[5]) / d];
}
export const point = (m, x, y) => ({ x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] });
export function objectMatrix(o) {
    const r = radians(o.rotation || 0), c = Math.cos(r), s = Math.sin(r), sx = o.scaleX ?? 1, sy = o.scaleY ?? 1, k = Math.tan(radians(o.skewX || 0));
    const a = c * sx, b = s * sx, cc = (c * k - s) * sy, d = (s * k + c) * sy, cx = (o.w || 0) / 2, cy = (o.h || 0) / 2;
    return [a, b, cc, d, (o.x || 0) + cx - a * cx - cc * cy, (o.y || 0) + cy - b * cx - d * cy];
}
export function assignMatrix(o, m) {
    const sx = Math.hypot(m[0], m[1]), det = m[0] * m[3] - m[1] * m[2], sy = sx > 1e-9 ? det / sx : 0;
    o.rotation = Math.atan2(m[1], m[0]) * 180 / Math.PI;
    o.scaleX = sx;
    o.scaleY = sy;
    o.skewX = Math.atan2(m[0] * m[2] + m[1] * m[3], sx * sy) * 180 / Math.PI;
    if (o.skewX > 90)
        o.skewX -= 180;
    if (o.skewX < -90)
        o.skewX += 180;
    const cx = o.w / 2, cy = o.h / 2;
    o.x = m[4] - cx + m[0] * cx + m[2] * cy;
    o.y = m[5] - cy + m[1] * cx + m[3] * cy;
    return o;
}
export function bounds(o, parent = identity()) {
    const m = multiply(parent, objectMatrix(o));
    const p = [point(m, 0, 0), point(m, o.w, 0), point(m, o.w, o.h), point(m, 0, o.h)];
    return { x: Math.min(...p.map(v => v.x)), y: Math.min(...p.map(v => v.y)), right: Math.max(...p.map(v => v.x)), bottom: Math.max(...p.map(v => v.y)), corners: p };
}
export function unionBounds(objects) {
    if (!objects.length)
        return { x: 0, y: 0, w: 0, h: 0, right: 0, bottom: 0 };
    const b = objects.map(o => bounds(o));
    const x = Math.min(...b.map(v => v.x)), y = Math.min(...b.map(v => v.y)), right = Math.max(...b.map(v => v.right)), bottom = Math.max(...b.map(v => v.bottom));
    return { x, y, w: right - x, h: bottom - y, right, bottom };
}
export function hexRGBA(hex, opacity = 1) {
    if (!hex || hex === 'none' || hex === 'transparent')
        return [0, 0, 0, 0];
    let h = hex.replace('#', '');
    if (h.length === 3)
        h = h.split('').map(x => x + x).join('');
    if (!/^[0-9a-f]{6}([0-9a-f]{2})?$/i.test(h))
        return [0, 0, 0, opacity];
    return [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255, opacity * (h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1)];
}
export function mixColor(a, b, t) {
    if (a === b)
        return a;
    const x = hexRGBA(a), y = hexRGBA(b), channels = x.map((v, i) => Math.round(clamp(lerp(v, y[i], t), 0, 1) * 255).toString(16).padStart(2, '0'));
    return '#' + channels.join('');
}
export function ease(t, kind = 'linear') {
    t = clamp(t, 0, 1);
    switch (kind) {
        case 'ease-in': return t * t * t;
        case 'ease-out': return 1 - (1 - t) ** 3;
        case 'ease-in-out': return t < .5 ? 4 * t * t * t : 1 - ((-2 * t + 2) ** 3) / 2;
        case 'back': {
            const c = 1.70158;
            return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2;
        }
        case 'bounce': {
            const n = 7.5625, d = 2.75;
            if (t < 1 / d)
                return n * t * t;
            if (t < 2 / d)
                return n * (t -= 1.5 / d) * t + .75;
            if (t < 2.5 / d)
                return n * (t -= 2.25 / d) * t + .9375;
            return n * (t -= 2.625 / d) * t + .984375;
        }
        case 'step': return t < 1 ? 0 : 1;
        default: return t;
    }
}
export function distanceToSegment(p, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y, l = dx * dx + dy * dy, t = l ? clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / l, 0, 1) : 0;
    return Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t);
}
export function pointInPolygon(p, poly) { let inside = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x)
        inside = !inside;
} return inside; }
export function simplify(points, tolerance = 1.3) {
    if (points.length < 3)
        return points.map(p => ({ ...p }));
    const a = points[0], b = points.at(-1);
    let max = 0, index = 0;
    for (let i = 1; i < points.length - 1; i++) {
        const d = distanceToSegment(points[i], a, b);
        if (d > max) {
            max = d;
            index = i;
        }
    }
    if (max <= tolerance)
        return [{ ...a }, { ...b }];
    return [...simplify(points.slice(0, index + 1), tolerance).slice(0, -1), ...simplify(points.slice(index), tolerance)];
}
/** Adaptive cubic subdivision; no fixed segment count for tight curves. */
export function flattenCubic(a, b, c, d, tolerance = .6, depth = 0, out = []) {
    if (depth > 12 || Math.max(distanceToSegment(b, a, d), distanceToSegment(c, a, d)) <= tolerance) {
        out.push(d);
        return out;
    }
    const mid = (p, q) => ({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 }), ab = mid(a, b), bc = mid(b, c), cd = mid(c, d), abc = mid(ab, bc), bcd = mid(bc, cd), m = mid(abc, bcd);
    flattenCubic(a, ab, abc, m, tolerance, depth + 1, out);
    flattenCubic(m, bcd, cd, d, tolerance, depth + 1, out);
    return out;
}
export function flattenPath(o, tolerance = .6) {
    const ps = o.points || [];
    if (!ps.length)
        return [];
    const out = [{ x: ps[0].x, y: ps[0].y }], n = o.closed ? ps.length : ps.length - 1;
    for (let i = 0; i < n; i++) {
        const a = ps[i], b = ps[(i + 1) % ps.length];
        if (a.outX !== undefined || b.inX !== undefined)
            flattenCubic(a, { x: a.outX ?? a.x, y: a.outY ?? a.y }, { x: b.inX ?? b.x, y: b.inY ?? b.y }, b, tolerance, 0, out);
        else
            out.push({ x: b.x, y: b.y });
    }
    if (o.closed && out.length > 1 && Math.hypot(out[0].x - out.at(-1).x, out[0].y - out.at(-1).y) < 1e-6)
        out.pop();
    return out;
}
/** Ear-clipping for simple polygons. Self-intersections and holes are intentionally not accepted. */
export function triangulate(input) {
    let p = input.filter((v, i) => !i || Math.hypot(v.x - input[i - 1].x, v.y - input[i - 1].y) > 1e-7);
    if (p.length > 2 && Math.hypot(p[0].x - p.at(-1).x, p[0].y - p.at(-1).y) < 1e-7)
        p.pop();
    if (p.length < 3)
        return [];
    const cross = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    let area = 0;
    for (let i = 0; i < p.length; i++) {
        const q = p[(i + 1) % p.length];
        area += p[i].x * q.y - q.x * p[i].y;
    }
    if (area < 0)
        p.reverse();
    const ids = p.map((_, i) => i), tris = [];
    let guard = p.length * p.length;
    while (ids.length > 3 && guard-- > 0) {
        let found = false;
        for (let j = 0; j < ids.length; j++) {
            const a = p[ids[(j + ids.length - 1) % ids.length]], b = p[ids[j]], c = p[ids[(j + 1) % ids.length]];
            if (cross(a, b, c) <= 1e-8)
                continue;
            let blocked = false;
            for (let k = 0; k < ids.length; k++) {
                if (k === j || k === (j + 1) % ids.length || k === (j + ids.length - 1) % ids.length)
                    continue;
                const q = p[ids[k]];
                if (cross(a, b, q) >= -1e-8 && cross(b, c, q) >= -1e-8 && cross(c, a, q) >= -1e-8) {
                    blocked = true;
                    break;
                }
            }
            if (!blocked) {
                tris.push(a, b, c);
                ids.splice(j, 1);
                found = true;
                break;
            }
        }
        if (!found)
            break;
    }
    if (ids.length === 3)
        tris.push(...ids.map(i => p[i]));
    return tris;
}
export function roundedRectPoints(w, h, r = 0) {
    r = clamp(r, 0, Math.min(w, h) / 2);
    if (!r)
        return [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }];
    const p = [];
    for (const [cx, cy, start] of [[w - r, r, -90], [w - r, h - r, 0], [r, h - r, 90], [r, r, 180]])
        for (let i = 0; i <= 8; i++) {
            const a = radians(start + i * 90 / 8);
            p.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
        }
    return p;
}
export function shapePolygon(o) {
    if (o.type === 'ellipse') {
        const p = [], n = clamp(Math.ceil(Math.max(o.w, o.h) / 4), 32, 160);
        for (let i = 0; i < n; i++) {
            const a = i / n * Math.PI * 2;
            p.push({ x: o.w / 2 + Math.cos(a) * o.w / 2, y: o.h / 2 + Math.sin(a) * o.h / 2 });
        }
        return p;
    }
    if (o.type === 'path' || o.type === 'line')
        return flattenPath(o);
    return roundedRectPoints(o.w, o.h, o.radius || 0);
}
