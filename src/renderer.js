import { clamp, identity, point, hexRGBA, shapePolygon, triangulate, objectMatrix } from './math.js';
import { flattenScene, createObject } from './model.js';
export function geometryKey(o) { return JSON.stringify([o.type, o.w, o.h, o.radius, o.fill, o.fillEnd, o.stroke, o.strokeWidth, o.points, o.closed, o.text, o.fontSize, o.fontFamily, o.fontWeight, o.italic, o.align, o.assetId]); }
export function traceShape(ctx, o) {
    ctx.beginPath();
    if (o.type === 'ellipse') {
        ctx.ellipse(o.w / 2, o.h / 2, Math.abs(o.w / 2), Math.abs(o.h / 2), 0, 0, Math.PI * 2);
        return;
    }
    if (o.type === 'path' || o.type === 'line') {
        const p = o.points || [];
        if (!p.length)
            return;
        ctx.moveTo(p[0].x, p[0].y);
        const n = o.closed ? p.length : p.length - 1;
        for (let i = 0; i < n; i++) {
            const a = p[i], b = p[(i + 1) % p.length];
            if (a.outX !== undefined || b.inX !== undefined)
                ctx.bezierCurveTo(a.outX ?? a.x, a.outY ?? a.y, b.inX ?? b.x, b.inY ?? b.y, b.x, b.y);
            else
                ctx.lineTo(b.x, b.y);
        }
        if (o.closed)
            ctx.closePath();
        return;
    }
    ctx.roundRect(0, 0, o.w, o.h, clamp(o.radius || 0, 0, Math.min(o.w, o.h) / 2));
}
export function drawPrimitive(ctx, o, assetImages) {
    if (o.type === 'text') {
        ctx.fillStyle = o.fill === 'none' ? 'transparent' : o.fill;
        ctx.font = `${o.italic ? 'italic ' : ''}${o.fontWeight || 400} ${o.fontSize || 32}px "${(o.fontFamily || 'Arial').replace(/["\\]/g, '')}"`;
        ctx.textBaseline = 'top';
        ctx.textAlign = o.align || 'left';
        const x = o.align === 'center' ? o.w / 2 : o.align === 'right' ? o.w : 0;
        for (const [i, line] of (o.text || '').split('\n').entries())
            ctx.fillText(line, x, i * (o.fontSize || 32) * 1.2);
        return;
    }
    if (o.type === 'image') {
        const img = assetImages.get(o.assetId);
        if (img)
            ctx.drawImage(img, 0, 0, o.w, o.h);
        return;
    }
    traceShape(ctx, o);
    if (o.fill !== 'none' && o.fill !== 'transparent' && o.type !== 'line') {
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
        ctx.miterLimit = 4;
        ctx.lineCap = 'round';
        ctx.stroke();
    }
}
export class AssetImages {
    constructor(onChange = () => { }) { this.images = new Map(); this.pending = new Map(); this.sources = new Map(); this.onChange = onChange; }
    async prepare(project) { const jobs = []; for (const a of project.assets) {
        if (this.sources.get(a.id) === a.src)
            continue;
        this.sources.set(a.id, a.src);
        const promise = new Promise(resolve => { const img = new Image(); img.onload = () => { this.images.set(a.id, img); this.onChange(); resolve(); }; img.onerror = () => { this.sources.delete(a.id); resolve(); }; img.src = a.src; });
        this.pending.set(a.id, promise);
        jobs.push(promise);
    } await Promise.all(jobs); }
}
export function renderCanvasFrame(ctx, project, frame, images, newSize = true) {
    if (newSize) {
        ctx.canvas.width = project.width;
        ctx.canvas.height = project.height;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, project.width, project.height);
    if (project.background !== 'none' && project.background !== 'transparent') {
        ctx.fillStyle = project.background;
        ctx.fillRect(0, 0, project.width, project.height);
    }
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, project.width, project.height);
    ctx.clip();
    for (const item of flattenScene(project, frame)) {
        ctx.save();
        ctx.transform(...item.matrix);
        ctx.globalAlpha = item.opacity;
        drawPrimitive(ctx, item.object, images);
        ctx.restore();
    }
    ctx.restore();
}
function visibleEntry(entry, p) { const o = entry.object, m = entry.matrix, ps = [point(m, 0, 0), point(m, o.w, 0), point(m, o.w, o.h), point(m, 0, o.h)], pad = o.strokeWidth || 0; return Math.max(...ps.map(q => q.x)) + pad >= 0 && Math.min(...ps.map(q => q.x)) - pad <= p.width && Math.max(...ps.map(q => q.y)) + pad >= 0 && Math.min(...ps.map(q => q.y)) - pad <= p.height; }
function sceneEntries(project, frame, options = {}) {
    const bg = { object: createObject('rect', { id: 'stage-background', w: project.width, h: project.height, fill: project.background }), matrix: identity(), opacity: 1, path: 'background' };
    const flat = [bg];
    if (options.onion) {
        for (const f of [frame - 3, frame + 3])
            if (f >= 0 && f < project.duration) {
                const onion = { ...project, layers: project.layers.filter(l => !l.locked && l.keys.length > 1) };
                flat.push(...flattenScene(onion, f, { opacity: .12 }).map(e => ({ ...e, path: 'onion' + f + e.path })));
            }
    }
    flat.push(...flattenScene(project, frame));
    return flat.filter(e => visibleEntry(e, project));
}
class TextureAtlas {
    constructor(device, onDirty) {
        this.device = device;
        this.onDirty = onDirty;
        this.size = Math.min(4096, device.limits.maxTextureDimension2D);
        this.x = 2;
        this.y = 2;
        this.row = 0;
        this.items = new Map();
        this.version = 0;
        this.texture = device.createTexture({ label: 'Celesta text and bitmap atlas', size: [this.size, this.size], format: 'rgba8unorm', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT });
    }
    get(o, images) {
        const key = o.type === 'image' ? 'image:' + o.assetId : JSON.stringify(['text', o.text, o.fontSize, o.fontFamily, o.fontWeight, o.italic, o.align, o.w, o.h]);
        if (this.items.has(key))
            return this.items.get(key);
        let source, w, h;
        if (o.type === 'image') {
            source = images.get(o.assetId);
            if (!source)
                return null;
            const scale = Math.min(1, 1024 / source.width, 1024 / source.height);
            w = Math.max(1, Math.ceil(source.width * scale));
            h = Math.max(1, Math.ceil(source.height * scale));
        }
        else {
            const scale = Math.min(2, 1600 / Math.max(o.w, 1), 512 / Math.max(o.h, 1));
            w = Math.max(1, Math.ceil(o.w * scale));
            h = Math.max(1, Math.ceil(o.h * scale));
        }
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        const ctx = c.getContext('2d');
        if (source)
            ctx.drawImage(source, 0, 0, w, h);
        else {
            ctx.scale(w / o.w, h / o.h);
            drawPrimitive(ctx, { ...o, fill: '#ffffff' }, images);
        }
        if (this.x + w + 2 > this.size) {
            this.x = 2;
            this.y += this.row + 4;
            this.row = 0;
        }
        if (this.y + h + 2 > this.size)
            throw new Error('The text/bitmap atlas is full; switching to Canvas 2D to preserve the complete artwork.');
        const item = { u0: this.x / this.size, v0: this.y / this.size, u1: (this.x + w) / this.size, v1: (this.y + h) / this.size };
        this.device.queue.copyExternalImageToTexture({ source: c }, { texture: this.texture, origin: [this.x, this.y], premultipliedAlpha: false }, [w, h]);
        this.x += w + 4;
        this.row = Math.max(this.row, h);
        this.items.set(key, item);
        this.version++;
        return item;
    }
    destroy() { this.texture.destroy(); }
}
class MeshCache {
    constructor(atlas, images) { this.cache = new Map(); this.atlas = atlas; this.images = images; }
    get(o) {
        const key = geometryKey(o);
        if (this.cache.has(key))
            return this.cache.get(key);
        const vertices = [];
        const vertex = (p, color, uv = [0, 0], textured = 0) => vertices.push(p.x, p.y, ...color, ...uv, 0, textured);
        if (o.type === 'image' || o.type === 'text') {
            const uv = this.atlas.get(o, this.images);
            if (!uv)
                return new Float32Array();
            const col = o.type === 'text' ? hexRGBA(o.fill) : [1, 1, 1, 1];
            for (const [x, y, u, v] of [[0, 0, uv.u0, uv.v0], [o.w, 0, uv.u1, uv.v0], [o.w, o.h, uv.u1, uv.v1], [0, 0, uv.u0, uv.v0], [o.w, o.h, uv.u1, uv.v1], [0, o.h, uv.u0, uv.v1]])
                vertex({ x, y }, col, [u, v], 1);
        }
        else {
            const poly = shapePolygon(o), closed = !['path', 'line'].includes(o.type) || o.closed, fill = hexRGBA(o.fill), end = o.fillEnd ? hexRGBA(o.fillEnd) : fill;
            if (fill[3] && o.type !== 'line' && poly.length > 2) {
                let triangles;
                if (o.type === 'ellipse') {
                    triangles = [];
                    const center = { x: o.w / 2, y: o.h / 2 };
                    for (let i = 0; i < poly.length; i++)
                        triangles.push(center, poly[i], poly[(i + 1) % poly.length]);
                }
                else
                    triangles = triangulate(poly);
                for (const p of triangles) {
                    const t = clamp(p.y / (o.h || 1), 0, 1);
                    vertex(p, fill.map((c, i) => c + (end[i] - c) * t));
                }
            }
            const stroke = hexRGBA(o.stroke);
            if (stroke[3] && o.strokeWidth > 0 && poly.length > 1) {
                const half = o.strokeWidth / 2, n = poly.length, edges = [];
                for (let i = 0; i < n - (closed ? 0 : 1); i++) {
                    const a = poly[i], b = poly[(i + 1) % n], len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
                    edges.push({ x: -(b.y - a.y) / len, y: (b.x - a.x) / len });
                }
                const pairs = poly.map((p, i) => { let a = edges[(i + edges.length - 1) % edges.length], b = edges[i % edges.length]; if (!closed && i === 0)
                    a = b = edges[0]; if (!closed && i === n - 1)
                    a = b = edges.at(-1); let nx = a.x + b.x, ny = a.y + b.y, len = Math.hypot(nx, ny); if (len < 1e-5) {
                    nx = b.x;
                    ny = b.y;
                    len = 1;
                } nx /= len; ny /= len; const amount = half / Math.max(.25, nx * b.x + ny * b.y); return [{ x: p.x + nx * amount, y: p.y + ny * amount }, { x: p.x - nx * amount, y: p.y - ny * amount }]; });
                for (let i = 0; i < n - (closed ? 0 : 1); i++) {
                    const a = pairs[i], b = pairs[(i + 1) % n];
                    for (const q of [a[0], a[1], b[1], a[0], b[1], b[0]])
                        vertex(q, stroke);
                }
                if (!closed) {
                    for (const [p, other] of [[poly[0], poly[1]], [poly.at(-1), poly.at(-2)]]) {
                        const a = Math.atan2(p.y - other.y, p.x - other.x) - Math.PI / 2;
                        for (let j = 0; j < 10; j++) {
                            vertex(p, stroke);
                            vertex({ x: p.x + Math.cos(a + j * Math.PI / 10) * half, y: p.y + Math.sin(a + j * Math.PI / 10) * half }, stroke);
                            vertex({ x: p.x + Math.cos(a + (j + 1) * Math.PI / 10) * half, y: p.y + Math.sin(a + (j + 1) * Math.PI / 10) * half }, stroke);
                        }
                    }
                }
            }
        }
        const result = new Float32Array(vertices);
        if (this.cache.size > 4096)
            this.cache.clear();
        this.cache.set(key, result);
        return result;
    }
}
const stageShader = `
struct Camera { viewport: vec4f, view: vec4f };
struct ObjectTransform { linear: vec4f, offset: vec4f };
@group(0) @binding(0) var<uniform> camera: Camera;
@group(0) @binding(1) var<storage, read> objects: array<ObjectTransform>;
@group(0) @binding(2) var atlas: texture_2d<f32>;
@group(0) @binding(3) var atlasSampler: sampler;
struct VIn { @location(0) position: vec2f, @location(1) color: vec4f, @location(2) uv: vec2f, @location(3) index: f32, @location(4) textured: f32 };
struct VOut { @builtin(position) position: vec4f, @location(0) color: vec4f, @location(1) uv: vec2f, @location(2) @interpolate(flat) textured: f32 };
@vertex fn vs(v: VIn) -> VOut {
  let o=objects[u32(v.index)];let p=vec2f(o.linear.x*v.position.x+o.linear.z*v.position.y,o.linear.y*v.position.x+o.linear.w*v.position.y)+o.offset.xy;
  let screen=p*camera.view.z+camera.view.xy;var out:VOut;
  out.position=vec4f(screen.x/camera.viewport.x*2.0-1.0,1.0-screen.y/camera.viewport.y*2.0,0.0,1.0);
  out.color=vec4f(v.color.rgb,v.color.a*o.offset.z);out.uv=v.uv;out.textured=v.textured;return out;
}
@fragment fn fs(v:VOut)->@location(0) vec4f {
  let sampled=textureSample(atlas,atlasSampler,v.uv);let tex=select(vec4f(1.0),sampled,v.textured>0.5);let c=v.color*tex;return vec4f(c.rgb*c.a,c.a);
}`;
export class StageRenderer {
    constructor(canvas, onStatus = () => { }, onInvalidate = () => { }) { this.canvas = canvas; this.onStatus = onStatus; this.onInvalidate = onInvalidate; this.assets = new AssetImages(onInvalidate); this.kind = 'initializing'; this.stats = { drawCalls: 0, triangles: 0, objects: 0, submitMs: 0 }; this.gpuErrors = []; this.lastSignature = ''; this.dead = false; }
    async init(forceCanvas = false) {
        if (!forceCanvas && navigator.gpu) {
            try {
                const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
                if (!adapter)
                    throw new Error('No WebGPU adapter was returned.');
                this.device = await adapter.requestDevice();
                const device = this.device;
                device.addEventListener('uncapturederror', e => { this.gpuErrors.push(e.error.message); console.error('WebGPU:', e.error); this.fallback(e.error.message); });
                device.lost.then(info => { if (!this.dead)
                    this.fallback('GPU device lost: ' + info.message); });
                this.context = this.canvas.getContext('webgpu');
                if (!this.context)
                    throw new Error('WebGPU canvas context unavailable.');
                this.format = navigator.gpu.getPreferredCanvasFormat();
                this.context.configure({ device, format: this.format, alphaMode: 'premultiplied' });
                this.atlas = new TextureAtlas(device, () => this.lastSignature = '');
                this.mesh = new MeshCache(this.atlas, this.assets.images);
                this.cameraBuffer = device.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
                this.transformBuffer = device.createBuffer({ size: 32768, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
                this.transformCapacity = 32768;
                this.vertexBuffer = device.createBuffer({ size: 262144, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
                this.vertexCapacity = 262144;
                const shader = device.createShaderModule({ label: 'Celesta retained vector pipeline', code: stageShader });
                const info = await shader.getCompilationInfo();
                const errs = info.messages.filter(m => m.type === 'error');
                if (errs.length)
                    throw new Error(errs.map(m => m.message).join('\n'));
                this.pipeline = await device.createRenderPipelineAsync({ label: 'Celesta 4x MSAA vector batch', layout: 'auto', vertex: { module: shader, entryPoint: 'vs', buffers: [{ arrayStride: 40, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x2' }, { shaderLocation: 1, offset: 8, format: 'float32x4' }, { shaderLocation: 2, offset: 24, format: 'float32x2' }, { shaderLocation: 3, offset: 32, format: 'float32' }, { shaderLocation: 4, offset: 36, format: 'float32' }] }] }, fragment: { module: shader, entryPoint: 'fs', targets: [{ format: this.format, blend: { color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' }, alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' } } }] }, primitive: { topology: 'triangle-list', cullMode: 'none' }, multisample: { count: 4 } });
                this.sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge' });
                this.rebind();
                this.kind = 'WebGPU';
                this.onStatus(this.kind);
                return;
            }
            catch (error) {
                this.fallback(error.message);
                return;
            }
        }
        this.fallback(forceCanvas ? 'Canvas 2D requested.' : 'WebGPU is unavailable in this browser or context.');
    }
    rebind() { this.bindGroup = this.device.createBindGroup({ layout: this.pipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: this.cameraBuffer } }, { binding: 1, resource: { buffer: this.transformBuffer } }, { binding: 2, resource: this.atlas.texture.createView() }, { binding: 3, resource: this.sampler }] }); }
    fallback(reason) {
        if (this.kind === 'Canvas 2D')
            return;
        this.dead = true;
        this.msaa?.destroy();
        this.atlas?.destroy();
        this.vertexBuffer?.destroy();
        this.transformBuffer?.destroy();
        this.cameraBuffer?.destroy();
        this.device?.destroy();
        const replacement = this.canvas.cloneNode(false);
        this.canvas.replaceWith(replacement);
        this.canvas = replacement;
        this.ctx = this.canvas.getContext('2d', { alpha: false });
        this.kind = 'Canvas 2D';
        this.reason = reason;
        this.onStatus(this.kind, reason);
        this.onInvalidate();
    }
    resize(w, h, dpr) {
        const pw = Math.max(1, Math.round(w * dpr)), ph = Math.max(1, Math.round(h * dpr));
        if (this.canvas.width === pw && this.canvas.height === ph)
            return;
        this.canvas.width = pw;
        this.canvas.height = ph;
        if (this.kind === 'WebGPU') {
            this.msaa?.destroy();
            this.msaa = this.device.createTexture({ size: [pw, ph], sampleCount: 4, format: this.format, usage: GPUTextureUsage.RENDER_ATTACHMENT });
        }
    }
    render(project, frame, view, options = {}) {
        if (this.kind === 'initializing')
            return;
        const start = performance.now();
        this.assets.prepare(project);
        const entries = sceneEntries(project, frame, options);
        this.stats.objects = entries.length - 1;
        if (this.kind === 'WebGPU') {
            try {
                this.drawGPU(entries, project, view);
            }
            catch (error) {
                console.error(error);
                this.fallback(error.message);
                this.drawCanvas(entries, project, view);
            }
        }
        else
            this.drawCanvas(entries, project, view);
        this.stats.submitMs = performance.now() - start;
    }
    drawGPU(entries, p, view) {
        const device = this.device, signature = entries.map(e => e.path + geometryKey(e.object)).join('|');
        if (signature !== this.lastSignature) {
            const meshes = entries.map(e => this.mesh.get(e.object));
            const length = meshes.reduce((a, m) => a + m.length, 0);
            const vertices = new Float32Array(length);
            let off = 0;
            meshes.forEach((mesh, i) => { vertices.set(mesh, off); for (let j = off + 8; j < off + mesh.length; j += 10)
                vertices[j] = i; off += mesh.length; });
            if (vertices.byteLength > this.vertexCapacity) {
                this.vertexBuffer.destroy();
                this.vertexCapacity = 2 ** Math.ceil(Math.log2(vertices.byteLength));
                this.vertexBuffer = device.createBuffer({ size: this.vertexCapacity, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
            }
            if (vertices.length)
                device.queue.writeBuffer(this.vertexBuffer, 0, vertices);
            this.vertexCount = vertices.length / 10;
            this.lastSignature = signature;
        }
        const transforms = new Float32Array(Math.max(8, entries.length * 8));
        entries.forEach((e, i) => transforms.set([...e.matrix.slice(0, 4), e.matrix[4], e.matrix[5], e.opacity, 0], i * 8));
        if (transforms.byteLength > this.transformCapacity) {
            this.transformBuffer.destroy();
            this.transformCapacity = 2 ** Math.ceil(Math.log2(transforms.byteLength));
            this.transformBuffer = device.createBuffer({ size: this.transformCapacity, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
            this.rebind();
        }
        device.queue.writeBuffer(this.transformBuffer, 0, transforms);
        const dpr = view.dpr;
        device.queue.writeBuffer(this.cameraBuffer, 0, new Float32Array([this.canvas.width, this.canvas.height, 0, 0, view.ox * dpr, view.oy * dpr, view.zoom * dpr, 0]));
        if (!this.msaa)
            this.msaa = device.createTexture({ size: [this.canvas.width, this.canvas.height], sampleCount: 4, format: this.format, usage: GPUTextureUsage.RENDER_ATTACHMENT });
        const encoder = device.createCommandEncoder(), pass = encoder.beginRenderPass({ colorAttachments: [{ view: this.msaa.createView(), resolveTarget: this.context.getCurrentTexture().createView(), clearValue: { r: .106, g: .11, b: .125, a: 1 }, loadOp: 'clear', storeOp: 'discard' }] });
        const x = clamp(Math.floor(view.ox * dpr), 0, this.canvas.width), y = clamp(Math.floor(view.oy * dpr), 0, this.canvas.height), right = clamp(Math.ceil((view.ox + p.width * view.zoom) * dpr), 0, this.canvas.width), bottom = clamp(Math.ceil((view.oy + p.height * view.zoom) * dpr), 0, this.canvas.height);
        if (right > x && bottom > y && this.vertexCount) {
            pass.setScissorRect(x, y, right - x, bottom - y);
            pass.setPipeline(this.pipeline);
            pass.setBindGroup(0, this.bindGroup);
            pass.setVertexBuffer(0, this.vertexBuffer);
            pass.draw(this.vertexCount);
        }
        pass.end();
        device.queue.submit([encoder.finish()]);
        this.stats.drawCalls = this.vertexCount ? 1 : 0;
        this.stats.triangles = (this.vertexCount || 0) / 3;
    }
    drawCanvas(entries, p, view) {
        const ctx = this.ctx, d = view.dpr;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#1b1c20';
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        ctx.save();
        ctx.setTransform(view.zoom * d, 0, 0, view.zoom * d, view.ox * d, view.oy * d);
        ctx.beginPath();
        ctx.rect(0, 0, p.width, p.height);
        ctx.clip();
        for (const e of entries) {
            ctx.save();
            ctx.transform(...e.matrix);
            ctx.globalAlpha = e.opacity;
            drawPrimitive(ctx, e.object, this.assets.images);
            ctx.restore();
        }
        ctx.restore();
        this.stats.drawCalls = entries.length;
        this.stats.triangles = 0;
    }
}
