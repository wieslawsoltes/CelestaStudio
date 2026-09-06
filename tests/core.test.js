import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { multiply, inverse, identity, objectMatrix, assignMatrix, point, ease, triangulate, flattenCubic, simplify, mixColor, hexRGBA, shapePolygon, unionBounds } from '../src/math.js';
import { createObject, createLayer, createProject, clone, keyAt, ensureKey, evaluateLayer, flattenScene, hitTest, History, validateProject } from '../src/model.js';
import { createDemo } from '../src/demo.js';
import { parseSVGPath, normalizePathObject } from '../src/importer.js';
import { exportSVG, exportHTML, createZip, crc32 } from '../src/exporter.js';
const near = (a, b, eps = 1e-7) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);
const matrixNear = (a, b) => a.forEach((v, i) => near(v, b[i], 1e-6));
test('Affine multiplication and inversion preserve points', () => { const a = [2, .5, -.7, 3, 90, -41], m = multiply(a, inverse(a)); matrixNear(m, identity()); const p = point(inverse(a), ...Object.values(point(a, 63, -20))); near(p.x, 63); near(p.y, -20); assert.equal(inverse([0, 0, 0, 0, 1, 1]), null); });
test('Affine decomposition round-trips rotation, skew, scaling and reflection', () => { for (let i = 0; i < 150; i++) {
    const o = createObject('rect', { x: i * 3 - 100, y: i - 60, w: 10 + i, h: 40 + i, rotation: i * 17 - 380, scaleX: .2 + (i % 6), scaleY: (i % 2 ? -1 : 1) * (.1 + i % 9), skewX: (i % 70) - 35 });
    const m = objectMatrix(o), copy = clone(o);
    assignMatrix(copy, m);
    matrixNear(objectMatrix(copy), m);
} });
test('Arbitrary composed affine transforms round-trip after grouping', () => { const parent = createObject('group', { x: 150, y: 80, w: 200, h: 100, rotation: 31, scaleX: 2, scaleY: .4 }), child = createObject('rect', { x: 20, y: 30, w: 40, h: 20, rotation: -42 }); const m = multiply(objectMatrix(parent), objectMatrix(child)); assignMatrix(child, m); matrixNear(objectMatrix(child), m); });
test('Easing has exact endpoints and finite samples', () => { for (const kind of ['linear', 'ease-in', 'ease-out', 'ease-in-out', 'back', 'bounce', 'step']) {
    near(ease(0, kind), 0);
    near(ease(1, kind), 1);
    for (let i = 0; i <= 100; i++)
        assert.ok(Number.isFinite(ease(i / 100, kind)));
} });
test('Color interpolation clamps overshooting curves', () => { assert.equal(mixColor('#000000', '#ffffff', 2), '#ffffffff'); assert.equal(mixColor('#000000', '#ffffff', -1), '#000000ff'); assert.deepEqual(hexRGBA('#abc'), [170 / 255, 187 / 255, 204 / 255, 1]); });
test('Concave polygon tessellation preserves area and winding independence', () => { const polygon = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 40 }, { x: 40, y: 40 }, { x: 40, y: 100 }, { x: 0, y: 100 }]; for (const p of [polygon, [...polygon].reverse()]) {
    const t = triangulate(p);
    assert.equal(t.length, 12);
    let area = 0;
    for (let i = 0; i < t.length; i += 3) {
        const [a, b, c] = t.slice(i, i + 3);
        area += Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) / 2;
    }
    near(area, 6400);
} });
test('Cubic subdivision and freehand simplification are bounded', () => { const p = flattenCubic({ x: 0, y: 0 }, { x: 0, y: 100 }, { x: 100, y: 100 }, { x: 100, y: 0 }); assert.ok(p.length > 6 && p.length < 100); assert.deepEqual(p.at(-1), { x: 100, y: 0 }); assert.equal(simplify([{ x: 0, y: 0 }, { x: 4, y: .01 }, { x: 10, y: 0 }], 1).length, 2); });
test('Frame lookup returns the preceding key and next key', () => { const l = createLayer(); l.keys.push({ frame: 9, objects: [], tween: 'none' }); assert.equal(keyAt(l, 5).key.frame, 0); assert.equal(keyAt(l, 5).next.frame, 9); assert.equal(keyAt(l, -1).key, null); assert.equal(keyAt(l, 100).next, null); });
test('Motion tween interpolation preserves IDs and does not mutate keys', () => { const a = createObject('rect', { x: 0, y: 0, rotation: 0 }), b = { ...a, x: 100, y: 50, rotation: 360 }; const l = createLayer('Test', [a]); l.keys[0].tween = 'motion'; l.keys[0].ease = 'linear'; l.keys.push({ frame: 10, objects: [b], tween: 'none', ease: 'linear' }); const middle = evaluateLayer(l, 5)[0]; near(middle.x, 50); near(middle.y, 25); near(middle.rotation, 180); assert.equal(middle.id, a.id); middle.x = 999; assert.equal(l.keys[0].objects[0].x, 0); });
test('Auto-keyframe captures an interpolated pose and is idempotent', () => { const a = createObject('rect'), b = { ...a, x: 100 }; const l = createLayer('Test', [a]); Object.assign(l.keys[0], { tween: 'motion', ease: 'linear' }); l.keys.push({ frame: 10, objects: [b], tween: 'none' }); const k = ensureKey(l, 5); near(k.objects[0].x, 50); assert.equal(k, ensureKey(l, 5)); assert.equal(l.keys.length, 3); assert.equal(ensureKey(l, 5, true).objects.length, 0); });
test('Shape tween interpolates matching Bézier anchors and control handles', () => { const a = createObject('path', { points: [{ x: 0, y: 0, outX: 10, outY: 0 }, { x: 20, y: 20 }], closed: false }), b = clone(a); b.points[1].x = 60; b.points[0].outX = 30; const l = createLayer('Shape', [a]); Object.assign(l.keys[0], { tween: 'shape', ease: 'linear' }); l.keys.push({ frame: 10, objects: [b], tween: 'none' }); const mid = evaluateLayer(l, 5)[0]; near(mid.points[1].x, 40); near(mid.points[0].outX, 20); });
test('Incompatible path topology holds original anchors while transforming', () => { const a = createObject('path', { points: [{ x: 0, y: 0 }, { x: 20, y: 20 }] }), b = clone(a); b.x = 100; b.points.push({ x: 50, y: 60 }); const l = createLayer('Shape', [a]); Object.assign(l.keys[0], { tween: 'shape', ease: 'linear' }); l.keys.push({ frame: 10, objects: [b], tween: 'none' }); const mid = evaluateLayer(l, 5)[0]; assert.equal(mid.points.length, 2); near(mid.x, 50); });
test('Overshoot easing cannot create negative dimensions or alpha', () => { const a = createObject('rect', { w: 100, opacity: 1 }), b = { ...a, w: .1, opacity: 0 }; const l = createLayer('Back', [a]); Object.assign(l.keys[0], { tween: 'motion', ease: 'back' }); l.keys.push({ frame: 100, objects: [b] }); const o = evaluateLayer(l, 70)[0]; assert.ok(o.w > 0); assert.ok(o.opacity >= 0 && o.opacity <= 1); });
test('Hidden and locked layers participate correctly in rendering and hit testing', () => { const p = createProject(), a = createObject('rect', { x: 0, y: 0, w: 50, h: 50 }); p.layers[0].keys[0].objects = [a]; assert.equal(hitTest(p, 0, { x: 10, y: 10 }).object.id, a.id); p.layers[0].locked = true; assert.equal(hitTest(p, 0, { x: 10, y: 10 }), null); assert.equal(flattenScene(p, 0).length, 1); p.layers[0].visible = false; assert.equal(flattenScene(p, 0).length, 0); });
test('Symbols inherit affine transforms and opacity', () => { const p = createProject(), child = createObject('rect', { x: 10, y: 15, w: 20, h: 20, opacity: .5 }); p.symbols = [{ id: 's', name: 'S', w: 100, h: 100, objects: [child] }]; const s = createObject('symbol', { symbolId: 's', x: 100, y: 200, w: 100, h: 100, opacity: .4 }); p.layers[0].keys[0].objects = [s]; const item = flattenScene(p, 0)[0]; near(item.opacity, .2); near(item.matrix[4], 110); near(item.matrix[5], 215); });
test('Transactional history coalesces drags, ignores no-ops, supports cancel/undo/redo', () => { let state = { x: 0 }; const h = new History(() => state, s => state = s); h.begin('drag'); for (let i = 0; i < 100; i++)
    state.x = i; h.commit(); assert.equal(h.past.length, 1); h.undo(); assert.equal(state.x, 0); h.redo(); assert.equal(state.x, 99); h.transaction('noop', () => { }); assert.equal(h.past.length, 1); h.begin('cancel'); state.x = 500; h.cancel(); assert.equal(state.x, 99); });
test('History bounds entry count', () => { let state = { x: 0 }; const h = new History(() => state, s => state = s); for (let i = 1; i <= 130; i++)
    h.transaction('edit', () => state.x = i); assert.equal(h.past.length, 100); });
test('Demo round-trips through strict project validation', () => { const p = createDemo(), validated = validateProject(JSON.parse(JSON.stringify(p))); assert.equal(validated.name, p.name); assert.equal(validated.layers.length, 6); assert.equal(validated.symbols.length, 3); for (let i = 0; i < 96; i++) {
    const entries = flattenScene(validated, i);
    assert.ok(entries.length > 45);
    for (const e of entries)
        assert.ok(e.matrix.every(Number.isFinite));
} });
test('Validation rejects recursive symbols, duplicate keys, and foreign executable content', () => { const p = createProject(); p.symbols = [{ id: 's', name: 'Cycle', w: 10, h: 10, objects: [createObject('symbol', { symbolId: 's' })] }]; assert.throws(() => validateProject(p), /Recursive/); const q = createProject(); q.layers[0].keys.push(clone(q.layers[0].keys[0])); assert.throws(() => validateProject(q), /Duplicate keyframe/); const r = createProject(); r.assets = [{ id: 'a', src: 'https://example.com/a.png' }]; assert.throws(() => validateProject(r), /embedded/); assert.throws(() => validateProject({ format: 'fla', version: 1 }), /supported/); });
test('Validation rejects ambiguous object identifiers across layers', () => { const p = createProject(), o = createObject('rect'); p.layers[0].keys[0].objects = [o]; p.layers.push(createLayer('Second', [clone(o)])); assert.throws(() => validateProject(p), /different layers/); });
test('SVG path parser supports relative lines, cubics, smooth and quadratic curves', () => { const paths = parseSVGPath('M10 20 l30 0 h20 v30 q10 20 30 0 t30 0 c1 2 3 4 5 6 s7 8 9 10 z'); assert.equal(paths.length, 1); assert.equal(paths[0].closed, true); assert.ok(paths[0].points.length >= 8); assert.ok(paths[0].points.some(p => p.inX !== undefined)); });
test('SVG elliptical arcs become cubic segments with correct endpoints', () => { const [path] = parseSVGPath('M 0 50 A 50 50 0 1 1 100 50'); near(path.points.at(-1).x, 100); near(path.points.at(-1).y, 50); assert.ok(path.points[0].outX !== undefined); });
test('SVG path parser rejects malformed and unknown commands', () => { assert.throws(() => parseSVGPath('M 1'), /Malformed/); assert.throws(() => parseSVGPath('M0 0 X1 2'), /Unsupported/); });
test('Path normalization preserves document coordinates', () => { const o = createObject('path', { x: 0, y: 0, points: [{ x: 40, y: 70, outX: 55, outY: 50 }, { x: 100, y: 80 }] }); normalizePathObject(o); assert.equal(o.x, 40); assert.equal(o.y, 50); near(o.points[0].x + o.x, 40); near(o.points[0].outY + o.y, 50); });
test('SVG export escapes content and emits geometry, text, gradients and a clip', () => { const p = createDemo(); p.name = '<script>&'; const svg = exportSVG(p, 20); assert.match(svg, /<title>&lt;script&gt;&amp;<\/title>/); assert.match(svg, /<linearGradient/); assert.match(svg, /<text /); assert.match(svg, /<path /); assert.match(svg, /<clipPath/); assert.doesNotMatch(svg, /<script>/); });
test('Animated HTML is complete, parseable, self-contained and script-safe', () => { const p = createDemo(); p.name = '</script><script>alert(1)</script>'; const html = exportHTML(p); assert.match(html, /<\/script><\/html>$/); const match = html.match(/<script>([\s\S]*)<\/script>/); assert.ok(match); assert.doesNotThrow(() => new vm.Script(match[1])); assert.doesNotMatch(match[1], /<\/script>/); assert.ok(match[1].includes('\\u003c')); });
test('ZIP CRC32 and local/central headers are correct', async () => { const bytes = new TextEncoder().encode('123456789'); assert.equal(crc32(bytes), 0xcbf43926); const zip = await createZip([{ name: 'test.txt', data: bytes }]).arrayBuffer(); const d = new DataView(zip); assert.equal(d.getUint32(0, true), 0x04034b50); assert.equal(d.getUint32(14, true), 0xcbf43926); assert.equal(d.getUint32(zip.byteLength - 22, true), 0x06054b50); assert.equal(d.getUint16(zip.byteLength - 14, true), 1); });
