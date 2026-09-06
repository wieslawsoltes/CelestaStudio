import { clamp, lerp, ease, mixColor, identity, multiply, objectMatrix, inverse, point, bounds, pointInPolygon, distanceToSegment, shapePolygon, hexRGBA } from './math.js';
export const clone = value => structuredClone(value);
export const uid = (prefix = 'o') => prefix + '-' + (globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2));
export const layerPalette = ['#a78bfa', '#7fc9ba', '#e7b47e', '#de91ac', '#8daedf', '#bcc48a'];
export function createObject(type, props = {}) { return { id: uid(), type, name: type[0].toUpperCase() + type.slice(1), x: 0, y: 0, w: 100, h: 100, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, opacity: 1, fill: '#9b82e9', stroke: 'none', strokeWidth: 2, ...props }; }
export function createLayer(name = 'Layer 1', objects = [], color = layerPalette[0]) { return { id: uid('l'), name, color, visible: true, locked: false, opacity: 1, keys: [{ frame: 0, objects, tween: 'none', ease: 'ease-in-out' }] }; }
export function createProject() { return { format: 'celesta', version: 1, name: 'Untitled animation', width: 1280, height: 720, fps: 24, duration: 96, background: '#f8f4ed', layers: [createLayer()], symbols: [], assets: [], guides: [] }; }
export function keyAt(layer, frame) { let lo = 0, hi = layer.keys.length - 1, best = -1; while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (layer.keys[mid].frame <= frame) {
        best = mid;
        lo = mid + 1;
    }
    else
        hi = mid - 1;
} return { key: layer.keys[best] || null, next: layer.keys[best + 1] || null, index: best }; }
export function interpolateObject(a, b, t, shape = false) {
    if (!b || a.type !== b.type)
        return clone(a);
    const o = { ...a };
    for (const k of ['x', 'y', 'w', 'h', 'scaleX', 'scaleY', 'rotation', 'skewX', 'opacity', 'strokeWidth', 'radius', 'fontSize'])
        if (typeof a[k] === 'number' && typeof b[k] === 'number')
            o[k] = lerp(a[k], b[k], t);
    for (const k of ['fill', 'stroke', 'fillEnd'])
        if (a[k] && b[k])
            o[k] = mixColor(a[k], b[k], t);
    if (a.children) {
        const map = new Map((b.children || []).map(v => [v.id, v]));
        o.children = a.children.map(c => interpolateObject(c, map.get(c.id), t, shape));
    }
    if (shape && a.points && b.points && a.points.length === b.points.length)
        o.points = a.points.map((p, i) => { const q = b.points[i], r = { ...p }; for (const k of ['x', 'y', 'inX', 'inY', 'outX', 'outY'])
            if (typeof p[k] === 'number' && typeof q[k] === 'number')
                r[k] = lerp(p[k], q[k], t); return r; });
    o.w = Math.max(.01, o.w);
    o.h = Math.max(.01, o.h);
    o.opacity = clamp(o.opacity, 0, 1);
    return o;
}
export function evaluateLayer(layer, frame) { const { key, next } = keyAt(layer, frame); if (!key)
    return []; if (!next || key.tween === 'none' || frame === key.frame)
    return clone(key.objects); const t = ease((frame - key.frame) / (next.frame - key.frame), key.ease), map = new Map(next.objects.map(o => [o.id, o])); return key.objects.map(o => interpolateObject(o, map.get(o.id), t, key.tween === 'shape')); }
export function ensureKey(layer, frame, blank = false) { const existing = layer.keys.find(k => k.frame === frame); if (existing) {
    if (blank)
        existing.objects = [];
    return existing;
} const previous = keyAt(layer, frame).key; const k = { frame, objects: blank ? [] : evaluateLayer(layer, frame), tween: previous?.tween || 'none', ease: previous?.ease || 'ease-in-out' }; layer.keys.push(k); layer.keys.sort((a, b) => a.frame - b.frame); return k; }
export function evaluateScene(project, frame, includeHidden = false) { return project.layers.filter(l => includeHidden || l.visible).flatMap(l => evaluateLayer(l, frame).map(object => ({ object, layer: l }))); }
export function flattenScene(project, frame, options = {}) {
    const flat = [], symbols = new Map(project.symbols.map(s => [s.id, s]));
    const visit = (o, parent, alpha, layer, depth, path) => {
        if (depth > 16)
            return;
        const m = multiply(parent, objectMatrix(o)), opacity = alpha * (o.opacity ?? 1);
        if (o.type === 'group') {
            for (const c of o.children || [])
                visit(c, m, opacity, layer, depth + 1, path + '/' + c.id);
        }
        else if (o.type === 'symbol') {
            const s = symbols.get(o.symbolId);
            if (s)
                for (const c of s.objects)
                    visit(c, m, opacity, layer, depth + 1, path + '/' + c.id);
        }
        else
            flat.push({ object: o, matrix: m, opacity, layer, path });
    };
    for (const l of project.layers) {
        if (!l.visible && !options.includeHidden)
            continue;
        for (const o of evaluateLayer(l, frame))
            visit(o, identity(), (l.opacity ?? 1) * (options.opacity ?? 1), l, 0, l.id + '/' + o.id);
    }
    return flat;
}
export function hitObject(project, o, p, parent = identity(), tolerance = 4, depth = 0) {
    if (depth > 16)
        return false;
    const m = multiply(parent, objectMatrix(o)), inv = inverse(m);
    if (!inv)
        return false;
    const q = point(inv, p.x, p.y), sx = Math.hypot(m[0], m[1]) || 1, sy = Math.hypot(m[2], m[3]) || 1, t = tolerance / Math.min(sx, sy);
    if (o.type === 'group')
        return (o.children || []).some(c => hitObject(project, c, p, m, tolerance, depth + 1));
    if (o.type === 'symbol') {
        const s = project.symbols.find(v => v.id === o.symbolId);
        return !!s && s.objects.some(c => hitObject(project, c, p, m, tolerance, depth + 1));
    }
    if (o.type === 'text' || o.type === 'image')
        return q.x >= -t && q.x <= o.w + t && q.y >= -t && q.y <= o.h + t;
    const poly = shapePolygon(o), closed = !['path', 'line'].includes(o.type) || o.closed;
    if (closed && hexRGBA(o.fill)[3] > 0 && pointInPolygon(q, poly))
        return true;
    if (o.stroke !== 'none' && o.strokeWidth > 0)
        for (let i = 0; i < poly.length - (closed ? 0 : 1); i++)
            if (distanceToSegment(q, poly[i], poly[(i + 1) % poly.length]) < t + o.strokeWidth / 2)
                return true;
    return false;
}
export function hitTest(project, frame, p, tolerance = 4) { for (let i = project.layers.length - 1; i >= 0; i--) {
    const l = project.layers[i];
    if (!l.visible || l.locked)
        continue;
    const objects = evaluateLayer(l, frame);
    for (let j = objects.length - 1; j >= 0; j--)
        if (hitObject(project, objects[j], p, identity(), tolerance))
            return { object: objects[j], layer: l };
} return null; }
/** Bounded transactional history. Pointer drags commit exactly one entry. */
export class History {
    constructor(read, write, onChange = () => { }) { this.read = read; this.write = write; this.onChange = onChange; this.past = []; this.future = []; this.pending = null; this.bytes = 0; this.limit = 64 * 1024 * 1024; }
    begin(label) { if (this.pending)
        return; this.pending = { label, before: JSON.stringify(this.read()) }; }
    commit() { if (!this.pending)
        return false; const { label, before } = this.pending; this.pending = null; const after = JSON.stringify(this.read()); if (before === after)
        return false; const entry = { label, before, after, size: 2 * (before.length + after.length) }; this.past.push(entry); this.bytes += entry.size; this.future = []; while (this.past.length > 100 || (this.bytes > this.limit && this.past.length > 1)) {
        this.bytes -= this.past.shift().size;
    } this.onChange(label); return true; }
    cancel() { if (!this.pending)
        return; const before = this.pending.before; this.pending = null; this.write(JSON.parse(before)); }
    transaction(label, fn) { this.begin(label); try {
        fn();
        return this.commit();
    }
    catch (error) {
        this.cancel();
        throw error;
    } }
    undo() { if (this.pending)
        this.cancel(); const entry = this.past.pop(); if (!entry)
        return; this.bytes -= entry.size; this.future.push(entry); this.write(JSON.parse(entry.before)); this.onChange('Undo ' + entry.label); }
    redo() { const entry = this.future.pop(); if (!entry)
        return; this.past.push(entry); this.bytes += entry.size; this.write(JSON.parse(entry.after)); this.onChange('Redo ' + entry.label); }
    clear() { this.past = []; this.future = []; this.pending = null; this.bytes = 0; }
}
/** Reject unknown executable content; construct a fresh, versioned document. */
export function validateProject(raw) {
    if (!raw || raw.format !== 'celesta' || raw.version !== 1)
        throw new Error('Not a supported Celesta v1 project.');
    const finite = (v, def, lo = -1e7, hi = 1e7) => Number.isFinite(Number(v)) ? clamp(Number(v), lo, hi) : def;
    const text = (v, def = '') => typeof v === 'string' ? v.slice(0, 20000) : def;
    const color = (v, def = '#9b82e9') => typeof v === 'string' && (/^(#[0-9a-f]{3}|#[0-9a-f]{6}|#[0-9a-f]{8})$/i.test(v) || ['none', 'transparent'].includes(v)) ? v : def;
    let count = 0, pointCount = 0;
    const types = new Set(['rect', 'ellipse', 'path', 'line', 'text', 'group', 'symbol', 'image']);
    const shape = (o, depth = 0) => {
        if (!o || !types.has(o.type) || depth > 16 || ++count > 50000)
            throw new Error('Unsupported shape or document complexity limit exceeded.');
        const r = createObject(o.type, { id: text(o.id) || uid(), name: text(o.name, o.type) });
        for (const k of ['x', 'y', 'w', 'h', 'scaleX', 'scaleY', 'rotation', 'skewX', 'opacity', 'strokeWidth', 'radius', 'fontSize'])
            if (o[k] !== undefined)
                r[k] = finite(o[k], k.startsWith('scale') ? 1 : 0);
        r.w = Math.max(.01, r.w);
        r.h = Math.max(.01, r.h);
        r.opacity = clamp(r.opacity, 0, 1);
        r.strokeWidth = clamp(r.strokeWidth, 0, 2000);
        r.fill = color(o.fill);
        r.stroke = color(o.stroke, 'none');
        if (o.fillEnd)
            r.fillEnd = color(o.fillEnd);
        r.closed = !!o.closed;
        if (o.points) {
            if (!Array.isArray(o.points) || (pointCount += o.points.length) > 200000)
                throw new Error('Path vertex limit exceeded.');
            r.points = o.points.map(p => { const q = { x: finite(p.x, 0), y: finite(p.y, 0) }; for (const k of ['inX', 'inY', 'outX', 'outY'])
                if (p[k] !== undefined)
                    q[k] = finite(p[k], 0); return q; });
        }
        if (o.type === 'text') {
            r.text = text(o.text);
            r.fontFamily = text(o.fontFamily, 'Arial').slice(0, 100);
            r.fontWeight = finite(o.fontWeight, 400, 100, 900);
            r.fontSize = finite(o.fontSize, 32, 1, 2000);
            r.italic = !!o.italic;
            r.align = ['left', 'center', 'right'].includes(o.align) ? o.align : 'left';
        }
        if (o.type === 'group')
            r.children = Array.isArray(o.children) ? o.children.map(c => shape(c, depth + 1)) : [];
        if (o.type === 'symbol')
            r.symbolId = text(o.symbolId);
        if (o.type === 'image')
            r.assetId = text(o.assetId);
        return r;
    };
    const p = createProject();
    p.name = text(raw.name, 'Untitled animation').slice(0, 200);
    p.width = Math.round(finite(raw.width, 1280, 64, 8192));
    p.height = Math.round(finite(raw.height, 720, 64, 8192));
    p.fps = finite(raw.fps, 24, 1, 120);
    p.duration = Math.round(finite(raw.duration, 96, 1, 3600));
    p.background = color(raw.background, '#f8f4ed');
    if (!Array.isArray(raw.layers) || !raw.layers.length || raw.layers.length > 128)
        throw new Error('A project must contain 1–128 layers.');
    p.layers = raw.layers.map((l, i) => { const layer = createLayer(text(l.name, 'Layer ' + (i + 1)), [], color(l.color, layerPalette[i % 6])); layer.id = text(l.id) || uid('l'); layer.visible = l.visible !== false; layer.locked = !!l.locked; layer.opacity = finite(l.opacity, 1, 0, 1); if (!Array.isArray(l.keys) || l.keys.length > 3600)
        throw new Error('Invalid keyframes.'); const seen = new Set(); layer.keys = l.keys.map(k => { const frame = Math.round(finite(k.frame, 0, 0, p.duration - 1)); if (seen.has(frame))
        throw new Error('Duplicate keyframe.'); seen.add(frame); if (!Array.isArray(k.objects))
        throw new Error('Invalid keyframe objects.'); return { frame, objects: k.objects.map(o => shape(o)), tween: ['none', 'motion', 'shape'].includes(k.tween) ? k.tween : 'none', ease: ['linear', 'ease-in', 'ease-out', 'ease-in-out', 'back', 'bounce', 'step'].includes(k.ease) ? k.ease : 'linear' }; }).sort((a, b) => a.frame - b.frame); return layer; });
    if ((raw.symbols || []).length > 512 || (raw.assets || []).length > 512)
        throw new Error('Asset limit exceeded.');
    p.symbols = (raw.symbols || []).map(s => ({ id: text(s.id) || uid('s'), name: text(s.name, 'Symbol'), w: finite(s.w, 100, .01, 8192), h: finite(s.h, 100, .01, 8192), objects: (s.objects || []).map(o => shape(o)) }));
    p.assets = (raw.assets || []).map(a => { if (typeof a.src !== 'string' || !/^data:image\/(png|jpeg|webp|gif);base64,[a-zA-Z0-9+/=\s]+$/.test(a.src) || a.src.length > 24 * 1024 * 1024)
        throw new Error('Only embedded PNG, JPEG, WebP, or GIF images are accepted.'); return { id: text(a.id) || uid('asset'), name: text(a.name, 'Image'), src: a.src, w: finite(a.w, 100, 1, 16384), h: finite(a.h, 100, 1, 16384) }; });
    const layerIds = new Set(), symbolIds = new Set(), owners = new Map();
    for (const l of p.layers) {
        if (layerIds.has(l.id))
            throw new Error('Duplicate layer identifier.');
        layerIds.add(l.id);
        for (const k of l.keys) {
            const seen = new Set();
            const check = objects => { for (const o of objects) {
                if (seen.has(o.id))
                    throw new Error('Duplicate object identifier in a keyframe.');
                seen.add(o.id);
                if (o.children)
                    check(o.children);
            } };
            check(k.objects);
            for (const o of k.objects) {
                if (owners.has(o.id) && owners.get(o.id) !== l.id)
                    throw new Error('Object identifiers must not be shared by different layers.');
                owners.set(o.id, l.id);
            }
        }
    }
    for (const s of p.symbols) {
        if (symbolIds.has(s.id))
            throw new Error('Duplicate symbol identifier.');
        symbolIds.add(s.id);
    }
    const symbolMap = new Map(p.symbols.map(s => [s.id, s]));
    const visit = (objects, trail, depth) => { if (depth > 16)
        throw new Error('Symbol nesting limit exceeded.'); for (const o of objects) {
        if (o.type === 'group')
            visit(o.children, trail, depth + 1);
        if (o.type === 'symbol') {
            if (trail.has(o.symbolId))
                throw new Error('Recursive symbol reference.');
            const s = symbolMap.get(o.symbolId);
            if (!s)
                throw new Error('Missing symbol definition.');
            visit(s.objects, new Set([...trail, o.symbolId]), depth + 1);
        }
    } };
    for (const s of p.symbols)
        visit(s.objects, new Set([s.id]), 0);
    for (const l of p.layers)
        for (const k of l.keys)
            visit(k.objects, new Set(), 0);
    return p;
}
export class ProjectStore {
    constructor() { this.db = null; this.available = true; }
    async open() { try {
        this.db = await new Promise((resolve, reject) => { const r = indexedDB.open('celesta-studio', 1); r.onupgradeneeded = () => r.result.createObjectStore('documents'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    }
    catch {
        this.available = false;
    } return this; }
    async read() { if (!this.db)
        return null; return new Promise(resolve => { const r = this.db.transaction('documents').objectStore('documents').get('autosave'); r.onsuccess = () => resolve(r.result || null); r.onerror = () => resolve(null); }); }
    async save(project) { if (!this.db)
        throw new Error('Browser storage is unavailable. Save a project file instead.'); const data = clone(project); return new Promise((resolve, reject) => { const tx = this.db.transaction('documents', 'readwrite'); tx.objectStore('documents').put(data, 'autosave'); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); }); }
}
