import { identity, multiply, objectMatrix, assignMatrix, unionBounds, clamp } from './math.js';
import { flattenScene, createObject, uid } from './model.js';
import { renderCanvasFrame } from './renderer.js';
export const escapeXML = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
export function pathData(o) { const p = o.points || []; if (!p.length)
    return ''; let d = `M ${p[0].x} ${p[0].y}`; for (let i = 0, n = o.closed ? p.length : p.length - 1; i < n; i++) {
    const a = p[i], b = p[(i + 1) % p.length];
    d += a.outX !== undefined || b.inX !== undefined ? ` C ${a.outX ?? a.x} ${a.outY ?? a.y} ${b.inX ?? b.x} ${b.inY ?? b.y} ${b.x} ${b.y}` : ` L ${b.x} ${b.y}`;
} return d + (o.closed ? ' Z' : ''); }
export function exportSVG(project, frame, { background = true } = {}) {
    const defs = [], body = [], assets = new Map(project.assets.map(a => [a.id, a]));
    let n = 0;
    if (background && project.background !== 'none')
        body.push(`<rect width="100%" height="100%" fill="${escapeXML(project.background)}"/>`);
    for (const e of flattenScene(project, frame)) {
        const o = e.object;
        let fill = escapeXML(o.fill || 'none');
        if (o.fillEnd) {
            const id = 'g' + n++;
            defs.push(`<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1" gradientUnits="objectBoundingBox"><stop stop-color="${fill}"/><stop offset="1" stop-color="${escapeXML(o.fillEnd)}"/></linearGradient>`);
            fill = `url(#${id})`;
        }
        const attrs = `transform="matrix(${e.matrix.join(' ')})" opacity="${e.opacity}" fill="${fill}" stroke="${escapeXML(o.stroke || 'none')}" stroke-width="${o.strokeWidth || 0}" stroke-linejoin="miter" stroke-linecap="round"`;
        let element = '';
        if (o.type === 'rect')
            element = `<rect width="${o.w}" height="${o.h}" rx="${o.radius || 0}" ${attrs}/>`;
        else if (o.type === 'ellipse')
            element = `<ellipse cx="${o.w / 2}" cy="${o.h / 2}" rx="${o.w / 2}" ry="${o.h / 2}" ${attrs}/>`;
        else if (o.type === 'path' || o.type === 'line')
            element = `<path d="${pathData(o)}" ${attrs}/>`;
        else if (o.type === 'text') {
            const x = o.align === 'center' ? o.w / 2 : o.align === 'right' ? o.w : 0;
            const anchor = o.align === 'center' ? 'middle' : o.align === 'right' ? 'end' : 'start';
            element = `<text ${attrs} font-family="${escapeXML(o.fontFamily || 'Arial')}" font-size="${o.fontSize || 32}" font-weight="${o.fontWeight || 400}" font-style="${o.italic ? 'italic' : 'normal'}" dominant-baseline="text-before-edge" text-anchor="${anchor}">${(o.text || '').split('\n').map((line, i) => `<tspan x="${x}" y="${i * (o.fontSize || 32) * 1.2}">${escapeXML(line)}</tspan>`).join('')}</text>`;
        }
        else if (o.type === 'image') {
            const a = assets.get(o.assetId);
            if (a)
                element = `<image width="${o.w}" height="${o.h}" href="${escapeXML(a.src)}" ${attrs}/>`;
        }
        body.push(element);
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${project.width}" height="${project.height}" viewBox="0 0 ${project.width} ${project.height}"><title>${escapeXML(project.name)}</title><defs>${defs.join('')}<clipPath id="stage"><rect width="${project.width}" height="${project.height}"/></clipPath></defs><g clip-path="url(#stage)">${body.join('')}</g></svg>`;
}
export function downloadBlob(blob, name) { const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 30000); }
export const safeFilename = name => String(name).replace(/[^a-z0-9_-]+/gi, '-').replace(/^-|-$/g, '') || 'animation';
export function canvasBlob(canvas, type = 'image/png', quality = .95) { return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('The browser could not encode this canvas.')), type, quality)); }
// Self-contained player: exported documents have no CDN, server or framework dependency.
function standalonePlayer(project) {
    const canvas = document.querySelector('canvas'), ctx = canvas.getContext('2d'), play = document.querySelector('#play'), range = document.querySelector('input'), label = document.querySelector('#time');
    canvas.width = project.width;
    canvas.height = project.height;
    range.max = project.duration - 1;
    const images = new Map();
    let frame = 0, running = true, last = performance.now(), elapsed = 0;
    const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
    const ease = (t, k) => { switch (k) {
        case 'ease-in': return t * t * t;
        case 'ease-out': return 1 - (1 - t) ** 3;
        case 'ease-in-out': return t < .5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
        case 'back': return 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2;
        case 'step': return t < 1 ? 0 : 1;
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
        default: return t;
    } };
    const rgba = s => { if (!s || s === 'none' || s === 'transparent')
        return [0, 0, 0, 0]; let h = s.slice(1); if (h.length === 3)
        h = h.split('').map(x => x + x).join(''); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)).concat(h.length === 8 ? parseInt(h.slice(6, 8), 16) : 255); };
    const color = (a, b, t) => a === b ? a : '#' + rgba(a).map((x, i) => clamp(Math.round(x + (rgba(b)[i] - x) * t), 0, 255).toString(16).padStart(2, '0')).join('');
    const interpolate = (a, b, t, shape) => { if (!b || a.type !== b.type)
        return a; const o = { ...a }; for (const k of ['x', 'y', 'w', 'h', 'scaleX', 'scaleY', 'rotation', 'skewX', 'opacity', 'strokeWidth', 'radius', 'fontSize'])
        if (typeof a[k] === 'number' && typeof b[k] === 'number')
            o[k] = a[k] + (b[k] - a[k]) * t; o.w = Math.max(.01, o.w); o.h = Math.max(.01, o.h); o.opacity = clamp(o.opacity ?? 1, 0, 1); for (const k of ['fill', 'stroke', 'fillEnd'])
        if (a[k] && b[k])
            o[k] = color(a[k], b[k], t); if (a.children)
        o.children = a.children.map(c => interpolate(c, (b.children || []).find(v => v.id === c.id), t, shape)); if (shape && a.points && b.points && a.points.length === b.points.length)
        o.points = a.points.map((p, i) => { const q = { ...p }; for (const k of ['x', 'y', 'inX', 'inY', 'outX', 'outY'])
            if (typeof p[k] === 'number' && typeof b.points[i][k] === 'number')
                q[k] = p[k] + (b.points[i][k] - p[k]) * t; return q; }); return o; };
    function draw(o, depth = 0) {
        if (depth > 16)
            return;
        ctx.save();
        const cx = o.w / 2, cy = o.h / 2;
        ctx.translate(o.x + cx, o.y + cy);
        ctx.rotate((o.rotation || 0) * Math.PI / 180);
        ctx.transform(1, 0, Math.tan((o.skewX || 0) * Math.PI / 180), 1, 0, 0);
        ctx.scale(o.scaleX ?? 1, o.scaleY ?? 1);
        ctx.translate(-cx, -cy);
        ctx.globalAlpha *= o.opacity ?? 1;
        if (o.type === 'group' || o.type === 'symbol') {
            const children = o.children || project.symbols.find(s => s.id === o.symbolId)?.objects || [];
            children.forEach(c => draw(c, depth + 1));
        }
        else if (o.type === 'text') {
            ctx.fillStyle = o.fill === 'none' ? 'transparent' : o.fill;
            ctx.font = `${o.italic ? 'italic ' : ''}${o.fontWeight || 400} ${o.fontSize || 32}px "${(o.fontFamily || 'Arial').replace(/["\\]/g, '')}"`;
            ctx.textBaseline = 'top';
            ctx.textAlign = o.align || 'left';
            const x = o.align === 'center' ? o.w / 2 : o.align === 'right' ? o.w : 0;
            (o.text || '').split('\n').forEach((s, i) => ctx.fillText(s, x, i * (o.fontSize || 32) * 1.2));
        }
        else if (o.type === 'image') {
            const image = images.get(o.assetId);
            if (image)
                ctx.drawImage(image, 0, 0, o.w, o.h);
        }
        else {
            ctx.beginPath();
            if (o.type === 'ellipse')
                ctx.ellipse(o.w / 2, o.h / 2, o.w / 2, o.h / 2, 0, 0, Math.PI * 2);
            else if (o.type === 'path' || o.type === 'line') {
                const p = o.points || [];
                if (p.length) {
                    ctx.moveTo(p[0].x, p[0].y);
                    for (let i = 0, n = o.closed ? p.length : p.length - 1; i < n; i++) {
                        const a = p[i], b = p[(i + 1) % p.length];
                        if (a.outX !== undefined || b.inX !== undefined)
                            ctx.bezierCurveTo(a.outX ?? a.x, a.outY ?? a.y, b.inX ?? b.x, b.inY ?? b.y, b.x, b.y);
                        else
                            ctx.lineTo(b.x, b.y);
                    }
                    if (o.closed)
                        ctx.closePath();
                }
            }
            else
                ctx.roundRect(0, 0, o.w, o.h, clamp(o.radius || 0, 0, Math.min(o.w, o.h) / 2));
            if (o.fill && o.fill !== 'none' && o.fill !== 'transparent' && o.type !== 'line') {
                if (o.fillEnd) {
                    const g = ctx.createLinearGradient(0, 0, 0, o.h || 1);
                    g.addColorStop(0, o.fill);
                    g.addColorStop(1, o.fillEnd);
                    ctx.fillStyle = g;
                }
                else
                    ctx.fillStyle = o.fill;
                ctx.fill();
            }
            if (o.stroke && o.stroke !== 'none' && o.strokeWidth > 0) {
                ctx.strokeStyle = o.stroke;
                ctx.lineWidth = o.strokeWidth;
                ctx.lineJoin = 'miter';
                ctx.lineCap = 'round';
                ctx.stroke();
            }
        }
        ctx.restore();
    }
    function render() { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height); if (project.background !== 'none' && project.background !== 'transparent') {
        ctx.fillStyle = project.background;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    } for (const l of project.layers) {
        if (!l.visible)
            continue;
        let index = -1;
        for (let i = 0; i < l.keys.length; i++)
            if (l.keys[i].frame <= frame)
                index = i;
        const k = l.keys[index], next = l.keys[index + 1];
        if (!k)
            continue;
        let objects = k.objects;
        if (next && k.tween !== 'none') {
            const t = ease((frame - k.frame) / (next.frame - k.frame), k.ease);
            objects = k.objects.map(o => interpolate(o, next.objects.find(b => b.id === o.id), t, k.tween === 'shape'));
        }
        ctx.save();
        ctx.globalAlpha = l.opacity ?? 1;
        objects.forEach(o => draw(o));
        ctx.restore();
    } range.value = frame; label.textContent = `${String(frame + 1).padStart(3, '0')} / ${project.duration}`; }
    play.onclick = () => { running = !running; play.textContent = running ? 'Pause' : 'Play'; last = performance.now(); };
    range.oninput = () => { frame = +range.value; elapsed = frame / project.fps; render(); };
    document.addEventListener('keydown', e => { if (e.code === 'Space' && e.target !== range) {
        e.preventDefault();
        play.click();
    } });
    function tick(now) { if (running) {
        elapsed += (now - last) / 1000;
        const next = Math.floor(elapsed * project.fps) % project.duration;
        if (next !== frame) {
            frame = next;
            render();
        }
    } last = now; requestAnimationFrame(tick); }
    Promise.all(project.assets.map(a => new Promise(resolve => { const image = new Image(); image.onload = () => { images.set(a.id, image); resolve(); }; image.onerror = resolve; image.src = a.src; }))).then(() => { render(); last = performance.now(); requestAnimationFrame(tick); });
}
export function exportHTML(project) { const data = JSON.stringify(project).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029'); return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeXML(project.name)} — Celesta</title><style>*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-content:center;background:#191a1e;color:#d9d5e1;font:13px system-ui}main{width:min(94vw,1280px)}canvas{width:100%;display:block;box-shadow:0 20px 80px #0005}footer{display:flex;align-items:center;gap:18px;padding:20px 0}button{border:1px solid #55515f;background:#302a40;color:#e5d9ff;border-radius:7px;padding:8px 20px;cursor:pointer}input{flex:1;accent-color:#aa8fe4}span{font-variant-numeric:tabular-nums}small{color:#92889f}h1{font-size:13px;font-weight:500;margin:0 0 18px}</style><main><h1>${escapeXML(project.name)}</h1><canvas></canvas><footer><button id="play">Pause</button><input aria-label="Frame" type="range" min="0" value="0"><span id="time"></span><small>Made in Celesta</small></footer></main><script>(${standalonePlayer.toString()})(${data});<\/script></html>`; }
export async function exportVideo(project, images, onProgress, signal) {
    if (typeof MediaRecorder === 'undefined')
        throw new Error('Video recording is unavailable in this browser. Use PNG sequence export.');
    const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'].find(t => MediaRecorder.isTypeSupported(t));
    if (!mime)
        throw new Error('No supported video encoder. Use PNG sequence export.');
    const canvas = document.createElement('canvas');
    canvas.width = project.width;
    canvas.height = project.height;
    const ctx = canvas.getContext('2d'), stream = canvas.captureStream(project.fps), chunks = [], recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 12000000 });
    renderCanvasFrame(ctx, project, 0, images, false);
    return new Promise((resolve, reject) => {
        let raf, settled = false;
        const cleanup = () => { cancelAnimationFrame(raf); stream.getTracks().forEach(t => t.stop()); signal?.removeEventListener('abort', abort); };
        const abort = () => { if (settled)
            return; settled = true; if (recorder.state !== 'inactive')
            recorder.stop(); cleanup(); reject(new DOMException('Export cancelled', 'AbortError')); };
        signal?.addEventListener('abort', abort, { once: true });
        recorder.ondataavailable = e => { if (e.data.size)
            chunks.push(e.data); };
        recorder.onerror = e => { settled = true; cleanup(); reject(e.error || new Error('Video encoder failed.')); };
        recorder.onstop = () => { if (settled)
            return; settled = true; cleanup(); resolve({ blob: new Blob(chunks, { type: mime }), extension: mime.includes('mp4') ? 'mp4' : 'webm' }); };
        recorder.start();
        const start = performance.now();
        let previous = -1;
        const tick = now => { if (settled)
            return; const frame = Math.floor((now - start) / 1000 * project.fps); if (frame >= project.duration) {
            recorder.stop();
            return;
        } if (frame !== previous) {
            renderCanvasFrame(ctx, project, frame, images, false);
            onProgress((frame + 1) / project.duration);
            previous = frame;
        } raf = requestAnimationFrame(tick); };
        raf = requestAnimationFrame(tick);
    });
}
const crcTable = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++)
        c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
} return t; })();
export function crc32(bytes) { let crc = 0xffffffff; for (const b of bytes)
    crc = crcTable[(crc ^ b) & 255] ^ (crc >>> 8); return (crc ^ 0xffffffff) >>> 0; }
export function createZip(files) {
    const chunks = [], central = [];
    let offset = 0;
    const enc = new TextEncoder();
    for (const { name, data } of files) {
        const n = enc.encode(name), crc = crc32(data), head = new Uint8Array(30 + n.length), h = new DataView(head.buffer);
        h.setUint32(0, 0x04034b50, true);
        h.setUint16(4, 20, true);
        h.setUint16(6, 0x800, true);
        h.setUint32(14, crc, true);
        h.setUint32(18, data.length, true);
        h.setUint32(22, data.length, true);
        h.setUint16(26, n.length, true);
        head.set(n, 30);
        chunks.push(head, data);
        const dir = new Uint8Array(46 + n.length), d = new DataView(dir.buffer);
        d.setUint32(0, 0x02014b50, true);
        d.setUint16(4, 20, true);
        d.setUint16(6, 20, true);
        d.setUint16(8, 0x800, true);
        d.setUint32(16, crc, true);
        d.setUint32(20, data.length, true);
        d.setUint32(24, data.length, true);
        d.setUint16(28, n.length, true);
        d.setUint32(42, offset, true);
        dir.set(n, 46);
        central.push(dir);
        offset += head.length + data.length;
    }
    const size = central.reduce((s, b) => s + b.length, 0), end = new Uint8Array(22), e = new DataView(end.buffer);
    e.setUint32(0, 0x06054b50, true);
    e.setUint16(8, files.length, true);
    e.setUint16(10, files.length, true);
    e.setUint32(12, size, true);
    e.setUint32(16, offset, true);
    return new Blob([...chunks, ...central, end], { type: 'application/zip' });
}
export async function exportSequence(project, images, onProgress, signal) {
    const canvas = document.createElement('canvas');
    canvas.width = project.width;
    canvas.height = project.height;
    const ctx = canvas.getContext('2d'), files = [];
    let total = 0;
    for (let f = 0; f < project.duration; f++) {
        if (signal?.aborted)
            throw new DOMException('Export cancelled', 'AbortError');
        renderCanvasFrame(ctx, project, f, images, false);
        const blob = await canvasBlob(canvas), data = new Uint8Array(await blob.arrayBuffer());
        total += data.length;
        if (total > 512 * 1024 * 1024)
            throw new Error('Sequence exceeded the 512 MiB in-memory export limit. Reduce duration or resolution.');
        files.push({ name: `frames/frame-${String(f + 1).padStart(4, '0')}.png`, data });
        onProgress((f + 1) / project.duration);
        if (f % 4 === 0)
            await new Promise(r => setTimeout(r, 0));
    }
    files.push({ name: 'manifest.json', data: new TextEncoder().encode(JSON.stringify({ name: project.name, width: project.width, height: project.height, fps: project.fps, frames: project.duration }, null, 2)) });
    return createZip(files);
}
