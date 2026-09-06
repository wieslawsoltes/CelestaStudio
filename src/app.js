import { clamp, lerp, identity, multiply, inverse, point, objectMatrix, assignMatrix, bounds, unionBounds, ease, simplify } from './math.js';
import { clone, uid, createObject, createLayer, createProject, layerPalette, keyAt, evaluateLayer, evaluateScene, ensureKey, hitTest, History, validateProject, ProjectStore } from './model.js';
import { createDemo } from './demo.js';
import { icon } from './icons.js';
import { StageRenderer, renderCanvasFrame } from './renderer.js';
import { escapeXML, exportSVG, exportHTML, downloadBlob, safeFilename, canvasBlob, exportVideo, exportSequence } from './exporter.js';
import { importSVG, normalizePathObject } from './importer.js';
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const esc = escapeXML;
const toolDefinitions = [['select', 'Selection', 'V'], ['transform', 'Free transform', 'Q'], ['node', 'Edit path nodes', 'A'], ['pen', 'Pen', 'P'], ['brush', 'Brush', 'B'], ['line', 'Line', 'N'], ['rect', 'Rectangle', 'R'], ['ellipse', 'Ellipse', 'O'], ['text', 'Text', 'T'], ['bucket', 'Paint fill', 'G'], ['eraser', 'Erase object', 'E'], ['hand', 'Hand', 'H'], ['zoom', 'Zoom', 'Z']];
const menuDefinitions = {
    File: [['new', 'New animation', '⌘ N', 'plus'], ['open', 'Open / import…', '⌘ O', 'folder'], ['save', 'Save project', '⌘ S', 'save'], ['rename', 'Rename document…', '', 'text'], null, ['export', 'Export…', '⌘ E', 'export'], ['preview', 'Preview animation', '⌘ Enter', 'play'], null, ['demo', 'Open demo project', '', 'sparkles']],
    Edit: [['undo', 'Undo', '⌘ Z', 'undo'], ['redo', 'Redo', '⌘ ⇧ Z', 'redo'], null, ['cut', 'Cut', '⌘ X'], ['copy', 'Copy', '⌘ C'], ['paste', 'Paste', '⌘ V'], ['duplicate', 'Duplicate', '⌘ D'], ['delete', 'Delete', '⌫', 'trash'], null, ['select-all', 'Select all', '⌘ A'], ['deselect', 'Deselect', 'Esc']],
    View: [['fit', 'Fit stage', '⌘ 0', 'fit'], ['zoom-in', 'Zoom in', '⌘ +', 'zoom'], ['zoom-out', 'Zoom out', '⌘ −'], ['actual-size', '100% zoom'], null, ['grid', 'Toggle grid', "⌘ '", 'grid'], ['snap', 'Snap to 10 px grid', '', 'magnet'], ['onion', 'Onion skin', '⇧ O', 'onion'], ['motion-path', 'Show motion paths', '', 'tween']],
    Insert: [['keyframe', 'Keyframe', 'F6', 'key'], ['blank-keyframe', 'Blank keyframe', 'F7', 'diamond'], ['remove-keyframe', 'Remove keyframe'], null, ['add-layer', 'New layer', '', 'layer'], ['convert-symbol', 'Convert to symbol…', 'F8', 'symbol'], ['open', 'Import artwork…', '⌘ O', 'image']],
    Modify: [['group', 'Group', '⌘ G', 'layer'], ['ungroup', 'Ungroup', '⌘ ⇧ G'], ['convert-symbol', 'Convert to symbol…', 'F8', 'symbol'], ['edit-symbol', 'Edit symbol'], null, ['bring-front', 'Bring to front', '⌘ ⇧ ]'], ['send-back', 'Send to back', '⌘ ⇧ ['], ['flip-horizontal', 'Flip horizontal', '', 'flip'], ['flip-vertical', 'Flip vertical'], null, ['reset-transform', 'Reset transform', '', 'rotate']],
    Animate: [['play', 'Play / pause', 'Space', 'play'], ['first', 'First frame', 'Home', 'first'], ['last', 'Last frame', 'End', 'last'], null, ['tween', 'Create motion tween', '', 'tween'], ['shape-tween', 'Create shape tween'], ['remove-tween', 'Remove tween'], ['extend', 'Extend by 24 frames'], null, ['autokey', 'Toggle auto keyframe', '', 'key'], ['loop', 'Toggle loop', '', 'loop']],
    Help: [['help', 'Keyboard shortcuts', '?', 'keyboard'], ['about', 'About Celesta', '', 'sparkles']]
};
class CelestaApp {
    constructor() {
        this.doc = createDemo();
        this.frame = 0;
        this.activeLayer = this.doc.layers.find(l => l.name === 'Explorer').id;
        this.selection = [this.doc.layers.find(l => l.id === this.activeLayer).keys[0].objects[0].id];
        this.tool = 'select';
        this.fill = '#a08ad1';
        this.stroke = '#635676';
        this.strokeWidth = 3;
        this.autoKey = true;
        this.onion = false;
        this.loop = true;
        this.grid = false;
        this.snap = false;
        this.motionPath = false;
        this.playing = false;
        this.previewPlaying = false;
        this.view = { zoom: 1, ox: 0, oy: 0, dpr: Math.min(window.devicePixelRatio || 1, 2) };
        this.autoFit = true;
        this.dirty = true;
        this.uiDirty = true;
        this.raf = 0;
        this.lastStats = 0;
        this.timelineScale = 1;
        this.timelineScroll = 0;
        this.layerScroll = 0;
        this.panel = 'properties';
        this.propertyMode = 'object';
        this.clipboard = null;
        this.keyClipboard = null;
        this.drag = null;
        this.penDraft = null;
        this.nodeIndex = -1;
        this.symbolContext = null;
        this.exportController = null;
        this.saveRevision = 0;
        this.viewport = $('#stage-viewport');
        this.overlay = $('#overlay-canvas');
        this.overlayCtx = this.overlay.getContext('2d');
        this.timelineCanvas = $('#timeline-canvas');
        this.timelineCtx = this.timelineCanvas.getContext('2d');
        this.dialog = $('#app-dialog');
        this.history = this.makeHistory();
        this.renderer = new StageRenderer($('#stage-canvas'), (kind, reason) => this.rendererStatus(kind, reason), () => { this.renderer.lastSignature = ''; this.invalidate(); });
        this.bindUI();
        this.resizeObserver = new ResizeObserver(() => this.resize());
        this.resizeObserver.observe(this.viewport);
        this.resizeObserver.observe($('#timeline-track-area'));
        this.refresh();
        this.ready = this.initialize();
        globalThis.celesta = this;
    }
    makeHistory() { return new History(() => this.doc, doc => { this.doc = doc; this.sanitizeSelection(); this.refresh(); }, () => { this.markChanged(); this.sanitizeSelection(); this.refresh(); }); }
    async initialize() { await this.renderer.init(new URLSearchParams(location.search).get('renderer') === 'canvas'); this.resize(); await this.renderer.assets.prepare(this.doc); this.invalidate(); this.store = await new ProjectStore().open(); const saved = await this.store.read(); if (saved) {
        try {
            const restored = validateProject(saved);
            this.doc = restored;
            this.activeLayer = this.doc.layers.at(-1).id;
            this.selection = [];
            this.frame = 0;
            this.history.clear();
            this.autoFit = true;
            this.resize();
            this.refresh();
            this.toast('Restored your last animation.');
        }
        catch (error) {
            console.warn('Autosave could not be restored:', error);
        }
    } if (!this.store.available) {
        $('#save-state').innerHTML = '<span class="status-dot"></span>File save available';
    } this.initialized = true; return this; }
    rendererStatus(kind, reason) { $('#renderer-label').textContent = kind; $('#gpu-pill').classList.toggle('fallback', kind === 'Canvas 2D'); $('#gpu-pill').title = kind === 'WebGPU' ? 'WebGPU · retained vector geometry · 4× MSAA · GPU affine transforms' : reason || kind; this.invalidate(); }
    bindUI() {
        $$('[data-icon]').forEach(el => el.innerHTML = icon(el.dataset.icon));
        $('#drawing-tools').innerHTML = toolDefinitions.map(([id, name, key], i) => `${i === 3 || i === 9 || i === 11 ? '<div class="rail-divider"></div>' : ''}<button class="tool-button ${id === this.tool ? 'active' : ''}" data-tool="${id}" title="${name} (${key})" aria-label="${name}" aria-pressed="${id === this.tool}">${icon(id)}</button>`).join('');
        $('#main-menu').innerHTML = Object.keys(menuDefinitions).map(name => `<button data-menu="${name}" aria-haspopup="menu">${name}</button>`).join('');
        document.addEventListener('click', event => {
            const tool = event.target.closest('[data-tool]');
            if (tool) {
                this.setTool(tool.dataset.tool);
                return;
            }
            const menu = event.target.closest('[data-menu]');
            if (menu) {
                const r = menu.getBoundingClientRect();
                this.openMenu(menuDefinitions[menu.dataset.menu], r.left, r.bottom + 4);
                return;
            }
            const panel = event.target.closest('[data-panel]');
            if (panel) {
                this.panel = panel.dataset.panel;
                this.renderInspector();
                return;
            }
            const mode = event.target.closest('[data-mode]');
            if (mode) {
                this.propertyMode = mode.dataset.mode;
                this.renderInspector();
                return;
            }
            const swatch = event.target.closest('[data-swatch]');
            if (swatch) {
                this.fill = swatch.dataset.swatch;
                $('#rail-fill').value = this.fill;
                this.setProperty('fill', this.fill);
                return;
            }
            const action = event.target.closest('[data-action]');
            if (action) {
                event.preventDefault();
                this.hideMenu();
                this.action(action.dataset.action, event);
                return;
            }
            const item = event.target.closest('[data-symbol]');
            if (item) {
                this.librarySelection = item.dataset.symbol;
                this.renderInspector();
            }
        });
        document.addEventListener('pointerdown', e => { if (!e.target.closest('#menu-popup') && !e.target.closest('[data-menu]'))
            this.hideMenu(); });
        document.addEventListener('keydown', e => this.keydown(e));
        document.addEventListener('visibilitychange', () => { if (document.hidden && this.playing)
            this.stop(); });
        $('#brand-home').addEventListener('click', e => { e.preventDefault(); this.action('about'); });
        $('#inspector-content').addEventListener('change', e => this.inspectorChange(e));
        $('#inspector-content').addEventListener('dblclick', e => { const item = e.target.closest('[data-symbol]'); if (item)
            this.insertSymbol(item.dataset.symbol); });
        $('#inspector-content').addEventListener('input', e => { if (e.target.id === 'library-search') {
            this.librarySearch = e.target.value;
            this.renderLibraryItems();
        } });
        $('#rail-fill').addEventListener('input', e => { this.fill = e.target.value; });
        $('#rail-stroke').addEventListener('input', e => { this.stroke = e.target.value; });
        $('#frame-input').addEventListener('change', e => this.setFrame(Number(e.target.value) - 1));
        this.overlay.addEventListener('pointerdown', e => this.pointerDown(e));
        this.overlay.addEventListener('pointermove', e => this.pointerMove(e));
        this.overlay.addEventListener('pointerup', e => this.pointerUp(e));
        this.overlay.addEventListener('pointercancel', e => this.pointerCancel(e));
        this.overlay.addEventListener('dblclick', e => this.doubleClick(e));
        this.overlay.addEventListener('contextmenu', e => { e.preventDefault(); if (this.penDraft) {
            this.finishPen();
            return;
        } const hit = hitTest(this.doc, this.frame, this.toWorld(e), 4 / this.view.zoom); if (hit && !this.selection.includes(hit.object.id)) {
            this.selection = [hit.object.id];
            this.activeLayer = hit.layer.id;
            this.refresh();
        } this.openMenu([['cut', 'Cut', '⌘ X'], ['copy', 'Copy', '⌘ C'], ['paste', 'Paste', '⌘ V'], ['duplicate', 'Duplicate', '⌘ D'], null, ...menuDefinitions.Modify.slice(0, 4), null, ['delete', 'Delete', '⌫', 'trash']], e.clientX, e.clientY); });
        this.viewport.addEventListener('wheel', e => { e.preventDefault(); const r = this.viewport.getBoundingClientRect(); if (e.ctrlKey || e.metaKey || e.altKey)
            this.zoomAt(Math.exp(-e.deltaY * .008), e.clientX - r.left, e.clientY - r.top);
        else {
            this.view.ox -= e.shiftKey ? e.deltaY : e.deltaX;
            this.view.oy -= e.shiftKey ? 0 : e.deltaY;
            this.autoFit = false;
            this.invalidate();
        } }, { passive: false });
        this.timelineCanvas.addEventListener('pointerdown', e => this.timelineDown(e));
        this.timelineCanvas.addEventListener('pointermove', e => this.timelineMove(e));
        this.timelineCanvas.addEventListener('pointerup', e => this.timelineUp(e));
        this.timelineCanvas.addEventListener('pointercancel', () => { if (this.timelineDrag?.mode === 'key')
            this.history.cancel(); this.timelineDrag = null; this.refresh(); });
        this.timelineCanvas.addEventListener('dblclick', e => { const pos = this.timelinePosition(e); if (pos.x < this.timelineLayout.left) {
            if (pos.layer)
                this.renameLayer(pos.layer);
        }
        else if (pos.layer) {
            this.activeLayer = pos.layer.id;
            this.setFrame(pos.frame);
            this.action('keyframe');
        } });
        this.timelineCanvas.addEventListener('contextmenu', e => { e.preventDefault(); const pos = this.timelinePosition(e); if (pos.layer) {
            this.activeLayer = pos.layer.id;
            if (pos.x >= this.timelineLayout.left)
                this.setFrame(pos.frame);
            this.selection = [];
            this.refresh();
        } this.openMenu(pos.x < this.timelineLayout.left ? [['rename-layer', 'Rename layer…'], ['add-layer', 'New layer', '', 'plus'], ['delete-layer', 'Delete layer', '', 'trash'], ['layer-up', 'Move up'], ['layer-down', 'Move down']] : [['keyframe', 'Insert keyframe', 'F6', 'key'], ['blank-keyframe', 'Blank keyframe', 'F7'], ['remove-keyframe', 'Remove keyframe'], null, ['tween', 'Create motion tween', '', 'tween'], ['shape-tween', 'Create shape tween'], ['remove-tween', 'Remove tween'], null, ['copy-keyframe', 'Copy keyframe'], ['paste-keyframe', 'Paste keyframe']], e.clientX, e.clientY); });
        this.timelineCanvas.addEventListener('wheel', e => { e.preventDefault(); if (e.ctrlKey || e.metaKey) {
            this.timelineScale = clamp(this.timelineScale * Math.exp(-e.deltaY * .008), 1, 10);
        }
        else if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
            this.timelineScroll += e.deltaX || e.deltaY;
        }
        else {
            this.layerScroll += e.deltaY;
        } this.drawTimeline(); }, { passive: false });
        const split = $('#timeline-splitter');
        split.addEventListener('pointerdown', e => { split.setPointerCapture(e.pointerId); this.splitDrag = { y: e.clientY, height: $('#timeline').getBoundingClientRect().height }; });
        split.addEventListener('pointermove', e => { if (!this.splitDrag)
            return; const h = clamp(this.splitDrag.height + this.splitDrag.y - e.clientY, 150, this.viewport.clientHeight + this.splitDrag.height - 170); document.documentElement.style.setProperty('--timeline-height', h + 'px'); this.resize(); });
        split.addEventListener('pointerup', () => this.splitDrag = null);
        split.addEventListener('keydown', e => { if (['ArrowUp', 'ArrowDown'].includes(e.key)) {
            e.preventDefault();
            document.documentElement.style.setProperty('--timeline-height', clamp($('#timeline').clientHeight + (e.key === 'ArrowUp' ? 20 : -20), 150, 500) + 'px');
            this.resize();
        } });
        $('#file-input').addEventListener('change', e => { const f = e.target.files[0]; if (f)
            this.importFile(f); e.target.value = ''; });
        this.viewport.addEventListener('dragover', e => { e.preventDefault(); $('#drop-overlay').classList.remove('hidden'); });
        this.viewport.addEventListener('dragleave', e => { if (!this.viewport.contains(e.relatedTarget))
            $('#drop-overlay').classList.add('hidden'); });
        this.viewport.addEventListener('drop', e => { e.preventDefault(); $('#drop-overlay').classList.add('hidden'); const symbol = e.dataTransfer.getData('application/x-celesta-symbol'); if (symbol) {
            this.insertSymbol(symbol, this.toWorld(e));
            return;
        } if (e.dataTransfer.files.length)
            this.importFile(e.dataTransfer.files[0], this.toWorld(e)); });
        $('#inspector-content').addEventListener('dragstart', e => { const item = e.target.closest('[data-symbol]'); if (item) {
            e.dataTransfer.setData('application/x-celesta-symbol', item.dataset.symbol);
            e.dataTransfer.effectAllowed = 'copy';
        } });
        this.dialog.addEventListener('click', e => { if (e.target === this.dialog) {
            const r = this.dialog.getBoundingClientRect();
            if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)
                this.closeDialog();
        } });
        this.dialog.addEventListener('cancel', e => { e.preventDefault(); this.closeDialog(); });
        document.addEventListener('paste', e => { if (this.isTyping(e.target) || this.dialog.open)
            return; const image = [...(e.clipboardData?.files || [])].find(f => f.type.startsWith('image/')); if (image) {
            e.preventDefault();
            this.importFile(image);
        } });
        window.addEventListener('beforeunload', e => { if (this.exportController) {
            e.preventDefault();
            e.returnValue = 'Export is running.';
        } });
    }
    invalidate(ui = false) { this.dirty = true; if (ui)
        this.uiDirty = true; if (!this.raf)
        this.raf = requestAnimationFrame(now => this.tick(now)); }
    tick(now) {
        this.raf = 0;
        if (this.playing) {
            const elapsed = (now - this.playStart) / 1000, next = this.playFrame + Math.floor(elapsed * this.doc.fps);
            if (next >= this.doc.duration && !this.loop) {
                this.frame = this.doc.duration - 1;
                this.stop();
            }
            else {
                const f = next % this.doc.duration;
                if (f !== this.frame) {
                    this.frame = f;
                    this.dirty = true;
                    this.updateClock();
                    this.drawTimeline();
                }
            }
        }
        if (this.dirty) {
            this.dirty = false;
            this.renderer.render(this.doc, this.frame, this.view, { onion: this.onion && !this.playing });
            this.drawOverlay();
            if (this.uiDirty) {
                this.uiDirty = false;
                this.renderInspector();
                this.drawTimeline();
            }
            if (now - this.lastStats > 250) {
                this.lastStats = now;
                const s = this.renderer.stats;
                $('#render-stats').textContent = this.renderer.kind === 'WebGPU' ? `${s.objects} objects · ${s.triangles.toLocaleString()} triangles · ${s.submitMs.toFixed(1)} ms submit` : `${s.objects} objects · ${s.submitMs.toFixed(1)} ms render`;
            }
        }
        if (this.previewPlaying)
            this.tickPreview(now);
        if (this.playing || this.previewPlaying)
            this.invalidate();
    }
    resize() { const r = this.viewport.getBoundingClientRect(); this.view.dpr = Math.min(devicePixelRatio || 1, 2); this.renderer.resize(r.width, r.height, this.view.dpr); this.overlay.width = Math.round(r.width * this.view.dpr); this.overlay.height = Math.round(r.height * this.view.dpr); if (this.autoFit)
        this.fit(false); this.drawTimeline(); this.invalidate(); }
    fit(refresh = true) { const r = this.viewport.getBoundingClientRect(), z = clamp(Math.min((r.width - 88) / this.doc.width, (r.height - 74) / this.doc.height), .035, 4); this.view.zoom = z; this.view.ox = (r.width - this.doc.width * z) / 2; this.view.oy = (r.height - this.doc.height * z) / 2; this.autoFit = true; this.updateZoom(); if (refresh)
        this.invalidate(); }
    updateZoom() { $('#zoom-display').innerHTML = `${Math.round(this.view.zoom * 100)}% ${icon('down', 10)}`; }
    zoomAt(factor, x = this.viewport.clientWidth / 2, y = this.viewport.clientHeight / 2) { const z = clamp(this.view.zoom * factor, .025, 32), ratio = z / this.view.zoom; this.view.ox = x - (x - this.view.ox) * ratio; this.view.oy = y - (y - this.view.oy) * ratio; this.view.zoom = z; this.autoFit = false; this.updateZoom(); this.invalidate(); }
    toScreen(p) { return { x: p.x * this.view.zoom + this.view.ox, y: p.y * this.view.zoom + this.view.oy }; }
    toWorld(e) { const r = this.viewport.getBoundingClientRect(); return { x: (e.clientX - r.left - this.view.ox) / this.view.zoom, y: (e.clientY - r.top - this.view.oy) / this.view.zoom }; }
    screenEvent(e) { const r = this.viewport.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
    snapPoint(p) { return this.snap ? { x: Math.round(p.x / 10) * 10, y: Math.round(p.y / 10) * 10 } : p; }
    selectedEntries() { const ids = new Set(this.selection); return evaluateScene(this.doc, this.frame).filter(e => ids.has(e.object.id)); }
    selectedObjects() { return this.selectedEntries().map(e => e.object); }
    sanitizeSelection() { const available = new Set(evaluateScene(this.doc, this.frame).filter(e => !e.layer.locked).map(e => e.object.id)); this.selection = this.selection.filter(id => available.has(id)); if (!this.doc.layers.find(l => l.id === this.activeLayer))
        this.activeLayer = this.doc.layers.at(-1)?.id; this.frame = clamp(this.frame, 0, this.doc.duration - 1); }
    active() { return this.doc.layers.find(l => l.id === this.activeLayer) || this.doc.layers.at(-1); }
    editableLayer() { let l = this.active(); if (l.locked || !l.visible) {
        l = createLayer('Layer ' + (this.doc.layers.length + 1), [], layerPalette[this.doc.layers.length % 6]);
        this.doc.layers.push(l);
        this.activeLayer = l.id;
        this.toast('Created an unlocked drawing layer.');
    } return l; }
    editKey(layer) { return this.autoKey ? ensureKey(layer, this.frame) : (keyAt(layer, this.frame).key || ensureKey(layer, this.frame)); }
    editableSelected() { const targets = []; const ids = new Set(this.selection); for (const layer of this.doc.layers) {
        if (layer.locked || !layer.visible)
            continue;
        const idsInLayer = evaluateLayer(layer, this.frame).filter(o => ids.has(o.id)).map(o => o.id);
        if (!idsInLayer.length)
            continue;
        const key = this.editKey(layer);
        for (const o of key.objects)
            if (idsInLayer.includes(o.id))
                targets.push({ object: o, layer, key });
    } return targets; }
    edit(label, fn) { this.stop(); if (this.penDraft)
        this.finishPen(); this.history.transaction(label, fn); this.refresh(); }
    markChanged() { this.saveRevision++; const revision = this.saveRevision; $('#document-dot').style.visibility = 'visible'; $('#save-state').innerHTML = '<span class="status-dot"></span>Saving locally…'; clearTimeout(this.saveTimer); this.saveTimer = setTimeout(async () => { if (!this.store)
        return; try {
        await this.store.save(this.persistableProject());
        if (revision === this.saveRevision) {
            $('#document-dot').style.visibility = 'hidden';
            $('#save-state').innerHTML = '<span class="status-dot"></span>All changes saved';
        }
    }
    catch {
        $('#save-state').innerHTML = '<span class="status-dot"></span>Save a project file';
    } }, 450); }
    persistableProject() { if (!this.symbolContext)
        return this.doc; const p = clone(this.symbolContext.project), s = p.symbols.find(s => s.id === this.symbolContext.symbolId); s.objects = this.doc.layers.flatMap(l => clone(l.keys[0]?.objects || [])); s.w = this.doc.width; s.h = this.doc.height; for (const a of this.doc.assets)
        if (!p.assets.some(v => v.id === a.id))
            p.assets.push(clone(a)); for (const symbol of this.doc.symbols)
        if (!p.symbols.some(v => v.id === symbol.id))
            p.symbols.push(clone(symbol)); return p; }
    refresh() { this.uiDirty = false; this.sanitizeSelection(); $('#document-name').textContent = this.symbolContext ? this.symbolContext.project.name : this.doc.name; document.title = `${this.symbolContext ? this.symbolContext.project.name : this.doc.name} — Celesta`; $('#stage-dimensions').textContent = `${this.doc.width} × ${this.doc.height}`; $('#stage-label').textContent = this.symbolContext ? 'SYMBOL EDITING' : 'SCENE 1'; $('#scene-name').textContent = this.symbolContext ? this.doc.name : 'Scene 1'; $('#leave-symbol').classList.toggle('hidden', !this.symbolContext); $('#library-count').textContent = this.doc.symbols.length; this.updateClock(); this.renderInspector(); this.drawTimeline(); this.invalidate(); }
    setFrame(frame) { this.uiDirty = false; this.stop(); this.frame = clamp(Math.round(frame) || 0, 0, this.doc.duration - 1); this.sanitizeSelection(); this.updateClock(); this.renderInspector(); this.drawTimeline(); this.invalidate(); }
    updateClock() { $('#frame-input').value = this.frame + 1; $('#frame-input').max = this.doc.duration; $('#duration-label').textContent = this.doc.duration; $('#fps-label').textContent = this.doc.fps + ' fps'; const sec = this.frame / this.doc.fps; $('#seconds-label').textContent = `${String(Math.floor(sec / 60)).padStart(2, '0')}:${(sec % 60).toFixed(2).padStart(5, '0')}`; }
    setTool(tool) {
        if (this.penDraft)
            this.finishPen();
        this.tool = tool;
        $$('[data-tool]').forEach(b => { const active = b.dataset.tool === tool; b.classList.toggle('active', active); b.setAttribute('aria-pressed', active); });
        $('#status-tool').textContent = toolDefinitions.find(t => t[0] === tool)?.[1] || tool;
        const hints = { select: 'Click to select · Shift to add · Drag to move', transform: 'Drag handles to scale · Drag the top handle to rotate', node: 'Select a path · Drag anchors and Bézier handles', pen: 'Click anchors · Drag for curves · Enter to finish · Click first point to close', brush: 'Draw freely · Shift for straighter strokes', rect: 'Drag to draw · Shift for square · Alt from center', ellipse: 'Drag to draw · Shift for circle · Alt from center', line: 'Drag a line · Shift constrains its angle', text: 'Click to add text · Double-click text to edit', bucket: 'Click an object to apply the current fill', eraser: 'Click an object to erase it from this keyframe', hand: 'Drag to pan · Ctrl / ⌘ + wheel to zoom', zoom: 'Click to zoom in · Alt-click to zoom out' };
        $('#status-hint').textContent = hints[tool];
        this.overlay.style.cursor = tool === 'hand' ? 'grab' : tool === 'text' ? 'text' : ['pen', 'brush', 'rect', 'ellipse', 'line', 'node'].includes(tool) ? 'crosshair' : tool === 'zoom' ? 'zoom-in' : 'default';
        this.invalidate();
    }
    toast(message, error = false) { const div = document.createElement('div'); div.className = 'toast' + (error ? ' error' : ''); div.innerHTML = icon(error ? 'close' : 'check') + `<span>${esc(message)}</span>`; $('#toast-container').append(div); setTimeout(() => div.remove(), error ? 6500 : 3500); }
    openMenu(items, x, y) { const menu = $('#menu-popup'); menu.innerHTML = items.map(item => item ? `<button role="menuitem" data-action="${item[0]}"><span>${item[3] ? icon(item[3], 14) : ''}</span><span>${esc(item[1])}</span>${item[2] ? `<kbd>${esc(item[2])}</kbd>` : ''}</button>` : '<div class="menu-separator"></div>').join(''); menu.classList.remove('hidden'); const r = menu.getBoundingClientRect(); menu.style.left = clamp(x, 5, innerWidth - r.width - 5) + 'px'; menu.style.top = clamp(y, 5, innerHeight - r.height - 5) + 'px'; }
    hideMenu() { $('#menu-popup').classList.add('hidden'); }
    isTyping(target) { return !!target?.closest('input,textarea,select,[contenteditable=true]'); }
    handlePositions() { const objects = this.selectedObjects(); if (!objects.length)
        return null; const b = unionBounds(objects), l = this.toScreen({ x: b.x, y: b.y }), r = this.toScreen({ x: b.right, y: b.bottom }), cx = (l.x + r.x) / 2, cy = (l.y + r.y) / 2; return { bounds: b, points: { nw: { x: l.x, y: l.y }, n: { x: cx, y: l.y }, ne: { x: r.x, y: l.y }, e: { x: r.x, y: cy }, se: { x: r.x, y: r.y }, s: { x: cx, y: r.y }, sw: { x: l.x, y: r.y }, w: { x: l.x, y: cy }, rotate: { x: cx, y: l.y - 23 } } }; }
    hitHandle(screen) { if (!['select', 'transform'].includes(this.tool) || this.playing)
        return null; const handles = this.handlePositions(); if (!handles)
        return null; for (const [name, p] of Object.entries(handles.points))
        if (Math.hypot(p.x - screen.x, p.y - screen.y) < 7)
            return { name, ...handles }; return null; }
    hitNode(screen) { const o = this.selectedObjects()[0]; if (this.tool !== 'node' || !o?.points)
        return null; const m = objectMatrix(o); for (let i = o.points.length - 1; i >= 0; i--) {
        const p = o.points[i];
        for (const part of ['in', 'out', 'anchor']) {
            if (part !== 'anchor' && p[part + 'X'] === undefined)
                continue;
            const w = part === 'anchor' ? p : { x: p[part + 'X'], y: p[part + 'Y'] }, s = this.toScreen(point(m, w.x, w.y));
            if (Math.hypot(s.x - screen.x, s.y - screen.y) < 7)
                return { index: i, part };
        }
    } return null; }
    pointerDown(e) {
        if (e.button === 2)
            return;
        e.preventDefault();
        this.viewport.focus({ preventScroll: true });
        this.stop();
        this.overlay.setPointerCapture(e.pointerId);
        const world = this.snapPoint(this.toWorld(e)), screen = this.screenEvent(e);
        this.hoverWorld = world;
        if (e.button === 1 || this.tool === 'hand') {
            this.drag = { mode: 'pan', start: screen, ox: this.view.ox, oy: this.view.oy, pointerId: e.pointerId };
            this.overlay.style.cursor = 'grabbing';
            return;
        }
        if (this.tool === 'zoom') {
            this.zoomAt(e.altKey ? .8 : 1.25, screen.x, screen.y);
            return;
        }
        if (this.tool === 'pen') {
            if (this.penDraft && e.detail > 1) {
                this.finishPen();
                return;
            }
            if (this.penDraft && this.penDraft.points.length >= 3) {
                const start = this.toScreen({ x: this.penDraft.x + this.penDraft.points[0].x, y: this.penDraft.y + this.penDraft.points[0].y });
                if (Math.hypot(start.x - screen.x, start.y - screen.y) < 10) {
                    this.penDraft.closed = true;
                    this.penDraft.fill = this.fill;
                    this.finishPen();
                    return;
                }
            }
            if (!this.penDraft) {
                this.history.begin('Draw Bézier path');
                const l = this.editableLayer(), key = this.editKey(l);
                this.penDraft = createObject('path', { name: 'Bézier path', w: this.doc.width, h: this.doc.height, fill: 'none', stroke: this.stroke === 'none' ? this.fill : this.stroke, strokeWidth: this.strokeWidth, points: [], closed: false });
                key.objects.push(this.penDraft);
                this.selection = [this.penDraft.id];
            }
            const p = { x: world.x - this.penDraft.x, y: world.y - this.penDraft.y };
            this.penDraft.points.push(p);
            this.drag = { mode: 'pen', point: p, start: world, pointerId: e.pointerId };
            this.invalidate();
            return;
        }
        if (this.tool === 'text') {
            this.showTextDialog(null, world);
            return;
        }
        if (['rect', 'ellipse', 'line', 'brush'].includes(this.tool)) {
            this.history.begin('Draw ' + this.tool);
            const l = this.editableLayer(), key = this.editKey(l);
            let o;
            if (this.tool === 'brush')
                o = createObject('path', { name: 'Brush stroke', x: 0, y: 0, w: this.doc.width, h: this.doc.height, points: [world], fill: 'none', stroke: this.fill, strokeWidth: this.strokeWidth, closed: false });
            else if (this.tool === 'line')
                o = createObject('line', { name: 'Line', x: 0, y: 0, w: this.doc.width, h: this.doc.height, points: [world, { ...world }], fill: 'none', stroke: this.stroke === 'none' ? this.fill : this.stroke, strokeWidth: this.strokeWidth, closed: false });
            else
                o = createObject(this.tool, { name: this.tool === 'rect' ? 'Rectangle' : 'Ellipse', x: world.x, y: world.y, w: .01, h: .01, fill: this.fill, stroke: 'none', strokeWidth: this.strokeWidth, radius: 0 });
            key.objects.push(o);
            this.selection = [o.id];
            this.drag = { mode: 'draw', type: this.tool, object: o, start: world, pointerId: e.pointerId };
            this.invalidate(true);
            return;
        }
        const node = this.hitNode(screen);
        if (node) {
            this.history.begin('Edit Bézier node');
            const entry = this.editableSelected()[0];
            this.nodeIndex = node.index;
            this.drag = { mode: 'node', object: entry.object, node, start: world, baseline: clone(entry.object), pointerId: e.pointerId };
            this.invalidate();
            return;
        }
        const handle = this.hitHandle(screen);
        if (handle) {
            this.history.begin(handle.name === 'rotate' ? 'Rotate selection' : 'Scale selection');
            const targets = this.editableSelected();
            this.drag = { mode: handle.name === 'rotate' ? 'rotate' : 'scale', handle: handle.name, bounds: handle.bounds, start: world, targets, baseline: targets.map(t => clone(t.object)), pointerId: e.pointerId };
            this.invalidate(true);
            return;
        }
        const hit = hitTest(this.doc, this.frame, world, 4 / this.view.zoom);
        if (this.tool === 'bucket') {
            if (hit) {
                this.edit('Paint fill', () => { this.selection = [hit.object.id]; this.activeLayer = hit.layer.id; const o = this.editableSelected()[0]?.object; if (!o)
                    return; if (o.type === 'group') {
                    const colorChildren = children => children.forEach(c => { if (c.children)
                        colorChildren(c.children);
                    else if (c.fill !== 'none')
                        c.fill = this.fill; });
                    colorChildren(o.children);
                }
                else if (o.type === 'symbol')
                    this.toast('Edit the symbol to change its shared artwork.');
                else
                    o.fill = this.fill; });
            }
            return;
        }
        if (this.tool === 'eraser') {
            if (hit) {
                this.selection = [hit.object.id];
                this.activeLayer = hit.layer.id;
                this.action('delete');
            }
            return;
        }
        if (hit) {
            if (e.shiftKey) {
                if (this.selection.includes(hit.object.id)) {
                    this.selection = this.selection.filter(id => id !== hit.object.id);
                    this.refresh();
                    return;
                }
                this.selection.push(hit.object.id);
            }
            else if (!this.selection.includes(hit.object.id))
                this.selection = [hit.object.id];
            this.activeLayer = hit.layer.id;
            this.propertyMode = 'object';
            if (this.tool === 'node') {
                this.refresh();
                return;
            }
            this.history.begin('Move selection');
            const targets = this.editableSelected();
            this.drag = { mode: 'move', start: world, targets, baseline: targets.map(t => clone(t.object)), pointerId: e.pointerId };
            this.refresh();
        }
        else {
            const before = e.shiftKey ? [...this.selection] : [];
            if (!e.shiftKey)
                this.selection = [];
            this.drag = { mode: 'marquee', start: world, current: world, before, pointerId: e.pointerId };
            this.refresh();
        }
    }
    pointerMove(e) {
        const world = this.toWorld(e), snapped = this.snapPoint(world), screen = this.screenEvent(e);
        this.hoverWorld = world;
        $('#stage-coordinates').textContent = `X ${Math.round(world.x)} · Y ${Math.round(world.y)}`;
        if (!this.drag) {
            const handle = this.hitHandle(screen);
            if (handle) {
                this.overlay.style.cursor = handle.name === 'rotate' ? 'grab' : ['nw', 'se'].includes(handle.name) ? 'nwse-resize' : ['ne', 'sw'].includes(handle.name) ? 'nesw-resize' : ['e', 'w'].includes(handle.name) ? 'ew-resize' : 'ns-resize';
            }
            else
                this.overlay.style.cursor = this.tool === 'hand' ? 'grab' : this.tool === 'text' ? 'text' : this.tool === 'zoom' ? (e.altKey ? 'zoom-out' : 'zoom-in') : ['pen', 'brush', 'rect', 'ellipse', 'line', 'node'].includes(this.tool) ? 'crosshair' : 'default';
            if (this.penDraft || this.tool === 'brush')
                this.invalidate();
            return;
        }
        const d = this.drag;
        if (d.pointerId !== e.pointerId)
            return;
        if (d.mode === 'pan') {
            this.view.ox = d.ox + screen.x - d.start.x;
            this.view.oy = d.oy + screen.y - d.start.y;
            this.autoFit = false;
        }
        else if (d.mode === 'pen') {
            const dx = snapped.x - d.start.x, dy = snapped.y - d.start.y;
            if (Math.hypot(dx, dy) > 2 / this.view.zoom) {
                d.point.outX = d.point.x + dx;
                d.point.outY = d.point.y + dy;
                d.point.inX = d.point.x - dx;
                d.point.inY = d.point.y - dy;
            }
        }
        else if (d.mode === 'draw') {
            const o = d.object;
            if (d.type === 'brush') {
                const events = e.getCoalescedEvents?.() || [e];
                for (const ev of events.length ? events : [e]) {
                    const p = this.toWorld(ev), last = o.points.at(-1);
                    if (Math.hypot(p.x - last.x, p.y - last.y) > 1 / this.view.zoom)
                        o.points.push(p);
                }
            }
            else if (d.type === 'line') {
                let p = snapped;
                if (e.shiftKey) {
                    const a = Math.round(Math.atan2(p.y - d.start.y, p.x - d.start.x) / (Math.PI / 4)) * Math.PI / 4, len = Math.hypot(p.x - d.start.x, p.y - d.start.y);
                    p = { x: d.start.x + Math.cos(a) * len, y: d.start.y + Math.sin(a) * len };
                }
                o.points[1] = p;
            }
            else {
                let dx = snapped.x - d.start.x, dy = snapped.y - d.start.y;
                if (e.shiftKey) {
                    const size = Math.max(Math.abs(dx), Math.abs(dy));
                    dx = Math.sign(dx || 1) * size;
                    dy = Math.sign(dy || 1) * size;
                }
                o.x = Math.min(d.start.x, d.start.x + dx);
                o.y = Math.min(d.start.y, d.start.y + dy);
                o.w = Math.max(.01, Math.abs(dx));
                o.h = Math.max(.01, Math.abs(dy));
                if (e.altKey) {
                    o.x = d.start.x - Math.abs(dx);
                    o.y = d.start.y - Math.abs(dy);
                    o.w = Math.max(.01, 2 * Math.abs(dx));
                    o.h = Math.max(.01, 2 * Math.abs(dy));
                }
            }
        }
        else if (d.mode === 'move') {
            let dx = snapped.x - d.start.x, dy = snapped.y - d.start.y;
            if (e.shiftKey) {
                if (Math.abs(dx) > Math.abs(dy))
                    dy = 0;
                else
                    dx = 0;
            }
            d.targets.forEach((t, i) => { t.object.x = d.baseline[i].x + dx; t.object.y = d.baseline[i].y + dy; });
        }
        else if (d.mode === 'scale') {
            const b = d.bounds, h = d.handle, ax = h.includes('w') ? b.right : h.includes('e') ? b.x : b.x + b.w / 2, ay = h.includes('n') ? b.bottom : h.includes('s') ? b.y : b.y + b.h / 2, px = h.includes('w') ? b.x : h.includes('e') ? b.right : ax, py = h.includes('n') ? b.y : h.includes('s') ? b.bottom : ay;
            let sx = px !== ax ? (snapped.x - ax) / (px - ax) : 1, sy = py !== ay ? (snapped.y - ay) / (py - ay) : 1;
            if (e.shiftKey) {
                const magnitude = Math.max(Math.abs(sx), Math.abs(sy));
                sx = Math.sign(sx || 1) * magnitude;
                sy = Math.sign(sy || 1) * magnitude;
            }
            if (Math.abs(sx) < .005)
                sx = .005;
            if (Math.abs(sy) < .005)
                sy = .005;
            const matrix = [sx, 0, 0, sy, ax * (1 - sx), ay * (1 - sy)];
            d.targets.forEach((t, i) => assignMatrix(t.object, multiply(matrix, objectMatrix(d.baseline[i]))));
        }
        else if (d.mode === 'rotate') {
            const b = d.bounds, c = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
            let r = Math.atan2(world.y - c.y, world.x - c.x) - Math.atan2(d.start.y - c.y, d.start.x - c.x);
            if (e.shiftKey)
                r = Math.round(r / (Math.PI / 12)) * Math.PI / 12;
            const cs = Math.cos(r), sn = Math.sin(r), m = [cs, sn, -sn, cs, c.x - cs * c.x + sn * c.y, c.y - sn * c.x - cs * c.y];
            d.targets.forEach((t, i) => assignMatrix(t.object, multiply(m, objectMatrix(d.baseline[i]))));
        }
        else if (d.mode === 'node') {
            const inv = inverse(objectMatrix(d.baseline));
            if (inv) {
                const pos = point(inv, world.x, world.y), p = d.object.points[d.node.index], original = d.baseline.points[d.node.index];
                if (d.node.part === 'anchor') {
                    const dx = pos.x - original.x, dy = pos.y - original.y;
                    p.x = pos.x;
                    p.y = pos.y;
                    for (const part of ['in', 'out'])
                        if (original[part + 'X'] !== undefined) {
                            p[part + 'X'] = original[part + 'X'] + dx;
                            p[part + 'Y'] = original[part + 'Y'] + dy;
                        }
                }
                else {
                    p[d.node.part + 'X'] = pos.x;
                    p[d.node.part + 'Y'] = pos.y;
                    if (!e.altKey) {
                        const opposite = d.node.part === 'in' ? 'out' : 'in';
                        p[opposite + 'X'] = 2 * p.x - pos.x;
                        p[opposite + 'Y'] = 2 * p.y - pos.y;
                    }
                }
            }
        }
        else if (d.mode === 'marquee')
            d.current = world;
        this.invalidate();
        if (['move', 'scale', 'rotate', 'draw', 'node'].includes(d.mode))
            this.updatePropertyValues();
    }
    pointerUp(e) {
        const d = this.drag;
        if (!d || d.pointerId !== e.pointerId)
            return;
        this.drag = null;
        if (d.mode === 'draw') {
            if (d.type === 'brush') {
                d.object.points = simplify(d.object.points, 1.2 / this.view.zoom);
                if (d.object.points.length === 1)
                    d.object.points.push({ x: d.object.points[0].x + .05, y: d.object.points[0].y });
                normalizePathObject(d.object);
            }
            else if (d.type === 'line')
                normalizePathObject(d.object);
            else if (d.object.w < 2 && d.object.h < 2) {
                d.object.w = 120;
                d.object.h = 90;
            }
            this.history.commit();
            this.setTool('select');
        }
        else if (d.mode === 'marquee') {
            const a = d.start, b = d.current, r = { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), right: Math.max(a.x, b.x), bottom: Math.max(a.y, b.y) }, ids = evaluateScene(this.doc, this.frame).filter(({ object, layer }) => { if (layer.locked)
                return false; const q = bounds(object); return q.x < r.right && q.right > r.x && q.y < r.bottom && q.bottom > r.y; }).map(e => e.object.id);
            this.selection = [...new Set([...d.before, ...ids])];
        }
        else if (!['pan', 'pen'].includes(d.mode))
            this.history.commit();
        if (d.mode === 'pan')
            this.overlay.style.cursor = 'grab';
        this.refresh();
    }
    pointerCancel(e) { if (this.drag?.pointerId === e.pointerId) {
        if (!['pan', 'marquee'].includes(this.drag.mode))
            this.history.cancel();
        this.drag = null;
        this.penDraft = null;
        this.refresh();
    } }
    finishPen() { if (!this.penDraft)
        return; const o = this.penDraft; this.penDraft = null; this.drag = null; if (o.points.length < 2) {
        this.history.cancel();
        this.selection = [];
    }
    else {
        normalizePathObject(o);
        this.history.commit();
    } this.refresh(); }
    doubleClick(e) { if (this.tool === 'pen') {
        this.finishPen();
        return;
    } const hit = hitTest(this.doc, this.frame, this.toWorld(e), 4 / this.view.zoom); if (!hit)
        return; this.selection = [hit.object.id]; this.activeLayer = hit.layer.id; if (hit.object.type === 'text')
        this.showTextDialog(hit.object);
    else if (hit.object.type === 'symbol')
        this.enterSymbol(hit.object.symbolId);
    else if (hit.object.type === 'path') {
        this.setTool('node');
        this.refresh();
    } }
    drawOverlay() {
        const ctx = this.overlayCtx, dpr = this.view.dpr, w = this.overlay.width / dpr, h = this.overlay.height / dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, w, h);
        const z = this.view.zoom, ox = this.view.ox, oy = this.view.oy;
        if (this.grid) {
            ctx.save();
            ctx.beginPath();
            ctx.rect(ox, oy, this.doc.width * z, this.doc.height * z);
            ctx.clip();
            let spacing = 10;
            while (spacing * z < 12)
                spacing *= 2;
            ctx.strokeStyle = '#46385125';
            ctx.lineWidth = .7;
            ctx.beginPath();
            for (let x = Math.max(0, Math.ceil(-ox / (spacing * z)) * spacing); x <= Math.min(this.doc.width, (w - ox) / z); x += spacing) {
                ctx.moveTo(ox + x * z, oy);
                ctx.lineTo(ox + x * z, oy + this.doc.height * z);
            }
            for (let y = Math.max(0, Math.ceil(-oy / (spacing * z)) * spacing); y <= Math.min(this.doc.height, (h - oy) / z); y += spacing) {
                ctx.moveTo(ox, oy + y * z);
                ctx.lineTo(ox + this.doc.width * z, oy + y * z);
            }
            ctx.stroke();
            ctx.restore();
        }
        ctx.strokeStyle = '#9581c342';
        ctx.lineWidth = .7;
        ctx.strokeRect(ox - .5, oy - .5, this.doc.width * z + 1, this.doc.height * z + 1);
        if (this.playing)
            return;
        if (this.motionPath) {
            for (const { object, layer } of this.selectedEntries()) {
                if (layer.keys.length < 2)
                    continue;
                ctx.strokeStyle = '#9772b9aa';
                ctx.setLineDash([3, 4]);
                ctx.beginPath();
                let begun = false;
                for (let f = 0; f < this.doc.duration; f += 2) {
                    const o = evaluateLayer(layer, f).find(o => o.id === object.id);
                    if (!o)
                        continue;
                    const s = this.toScreen(point(objectMatrix(o), o.w / 2, o.h / 2));
                    if (!begun) {
                        ctx.moveTo(s.x, s.y);
                        begun = true;
                    }
                    else
                        ctx.lineTo(s.x, s.y);
                }
                ctx.stroke();
                ctx.setLineDash([]);
                for (const k of layer.keys) {
                    const o = k.objects.find(o => o.id === object.id);
                    if (!o)
                        continue;
                    const s = this.toScreen(point(objectMatrix(o), o.w / 2, o.h / 2));
                    ctx.fillStyle = '#f2e8fa';
                    ctx.strokeStyle = '#9871be';
                    ctx.beginPath();
                    ctx.arc(s.x, s.y, 3, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.stroke();
                }
            }
        }
        const objects = this.selectedObjects();
        if (objects.length && !this.penDraft && this.tool !== 'node') {
            const handles = this.handlePositions(), b = handles.bounds, p = this.toScreen({ x: b.x, y: b.y });
            ctx.strokeStyle = '#a888d3';
            ctx.lineWidth = 1;
            ctx.setLineDash([]);
            ctx.strokeRect(p.x, p.y, b.w * z, b.h * z);
            const hp = handles.points;
            ctx.beginPath();
            ctx.moveTo(hp.n.x, hp.n.y);
            ctx.lineTo(hp.rotate.x, hp.rotate.y);
            ctx.stroke();
            for (const [name, q] of Object.entries(hp)) {
                ctx.fillStyle = '#f7f0fc';
                ctx.strokeStyle = '#9470bd';
                if (name === 'rotate') {
                    ctx.beginPath();
                    ctx.arc(q.x, q.y, 3.5, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.stroke();
                }
                else {
                    ctx.fillRect(q.x - 2.5, q.y - 2.5, 5, 5);
                    ctx.strokeRect(q.x - 2.5, q.y - 2.5, 5, 5);
                }
            }
            if (objects.length === 1 && objects[0].name) {
                const text = objects[0].name;
                ctx.font = '9px Arial';
                const tw = ctx.measureText(text).width + 10;
                ctx.fillStyle = '#8766a5';
                ctx.beginPath();
                ctx.roundRect(p.x, p.y + b.h * z + 7, tw, 17, 3);
                ctx.fill();
                ctx.fillStyle = '#f3e9fb';
                ctx.fillText(text, p.x + 5, p.y + b.h * z + 19);
            }
        }
        if (this.tool === 'node' || this.penDraft) {
            const o = this.penDraft || objects[0];
            if (o?.points) {
                const m = objectMatrix(o);
                for (let i = 0; i < o.points.length; i++) {
                    const p = o.points[i], s = this.toScreen(point(m, p.x, p.y));
                    for (const part of ['in', 'out']) {
                        if (p[part + 'X'] === undefined)
                            continue;
                        const c = this.toScreen(point(m, p[part + 'X'], p[part + 'Y']));
                        ctx.strokeStyle = '#9974c6';
                        ctx.lineWidth = 1;
                        ctx.beginPath();
                        ctx.moveTo(s.x, s.y);
                        ctx.lineTo(c.x, c.y);
                        ctx.stroke();
                        ctx.beginPath();
                        ctx.arc(c.x, c.y, 3, 0, Math.PI * 2);
                        ctx.fillStyle = '#ece0fb';
                        ctx.fill();
                        ctx.stroke();
                    }
                    ctx.fillStyle = i === this.nodeIndex ? '#9870c5' : '#f9efff';
                    ctx.strokeStyle = '#9069b7';
                    ctx.fillRect(s.x - 3, s.y - 3, 6, 6);
                    ctx.strokeRect(s.x - 3, s.y - 3, 6, 6);
                }
                if (this.penDraft && this.hoverWorld) {
                    const last = o.points.at(-1);
                    if (last) {
                        const a = this.toScreen(point(m, last.x, last.y)), b = this.toScreen(this.hoverWorld);
                        ctx.strokeStyle = '#bba0d5';
                        ctx.setLineDash([4, 4]);
                        ctx.beginPath();
                        ctx.moveTo(a.x, a.y);
                        ctx.lineTo(b.x, b.y);
                        ctx.stroke();
                        ctx.setLineDash([]);
                    }
                }
            }
        }
        if (this.drag?.mode === 'marquee') {
            const a = this.toScreen(this.drag.start), b = this.toScreen(this.drag.current);
            ctx.fillStyle = '#a88bd31b';
            ctx.strokeStyle = '#b094d1';
            ctx.lineWidth = 1;
            ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
            ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
        }
        if (this.tool === 'brush' && this.hoverWorld) {
            const p = this.toScreen(this.hoverWorld);
            ctx.beginPath();
            ctx.arc(p.x, p.y, Math.max(2, this.strokeWidth * z / 2), 0, Math.PI * 2);
            ctx.strokeStyle = '#b8a1cf';
            ctx.lineWidth = 1;
            ctx.stroke();
        }
    }
    drawTimeline() {
        const canvas = this.timelineCanvas, box = $('#timeline-track-area').getBoundingClientRect();
        if (box.width < 1 || box.height < 1)
            return;
        const dpr = Math.min(devicePixelRatio || 1, 2);
        if (canvas.width !== Math.round(box.width * dpr) || canvas.height !== Math.round(box.height * dpr)) {
            canvas.width = Math.round(box.width * dpr);
            canvas.height = Math.round(box.height * dpr);
        }
        const ctx = this.timelineCtx, w = box.width, h = box.height;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = '#23242a';
        ctx.fillRect(0, 0, w, h);
        const left = w < 650 ? 139 : w < 950 ? 176 : 205, row = 26, header = 27, fw = Math.max(7, (w - left - 18) / this.doc.duration) * this.timelineScale, layers = [...this.doc.layers].reverse();
        this.timelineScroll = clamp(this.timelineScroll, 0, Math.max(0, this.doc.duration * fw - (w - left - 10)));
        this.layerScroll = clamp(this.layerScroll, 0, Math.max(0, layers.length * row - (h - header)));
        const scroll = this.timelineScroll, ls = this.layerScroll;
        this.timelineLayout = { left, row, header, fw, scroll, layers, layerScroll: ls };
        ctx.fillStyle = '#2b2b32';
        ctx.fillRect(0, 0, left, h);
        ctx.fillStyle = '#292930';
        ctx.fillRect(left, 0, w - left, header);
        ctx.font = '9px Arial';
        ctx.fillStyle = '#8d8799';
        ctx.fillText('LAYERS', 13, 17);
        ctx.font = '8px Arial';
        ctx.fillStyle = '#686274';
        ctx.fillText(String(layers.length).padStart(2, '0'), left - 62, 17);
        ctx.save();
        ctx.beginPath();
        ctx.rect(left, 0, w - left, h);
        ctx.clip();
        const frameX = f => left + f * fw - scroll;
        const first = Math.max(0, Math.floor(scroll / fw)), last = Math.min(this.doc.duration - 1, Math.ceil((w - left + scroll) / fw));
        for (let f = first; f <= last; f++) {
            const x = frameX(f), major = f === 0 || (f + 1) % 12 === 0;
            ctx.strokeStyle = major ? '#69607155' : '#ffffff09';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(Math.round(x) + .5, header);
            ctx.lineTo(Math.round(x) + .5, h);
            ctx.stroke();
            if (major) {
                ctx.font = '8px Arial';
                ctx.textAlign = 'center';
                ctx.fillStyle = '#9d91ac';
                ctx.fillText(String(f + 1), x + fw / 2, 16);
            }
        }
        ctx.textAlign = 'left';
        layers.forEach((layer, i) => {
            const y = header + i * row - ls;
            if (y + row < header || y > h)
                return;
            ctx.save();
            ctx.beginPath();
            ctx.rect(left, header, w - left, h - header);
            ctx.clip();
            if (layer.id === this.activeLayer) {
                ctx.fillStyle = '#50405b44';
                ctx.fillRect(left, y, w - left, row);
            }
            const keys = layer.keys;
            keys.forEach((key, j) => {
                const end = keys[j + 1]?.frame ?? this.doc.duration, x = frameX(key.frame) + 1, right = frameX(end) - 1;
                if (right < left || x > w)
                    return;
                const tween = key.tween !== 'none' && keys[j + 1];
                ctx.globalAlpha = layer.visible ? 1 : .35;
                ctx.fillStyle = tween ? layer.color + '55' : key.objects.length ? '#61566c55' : '#33303a';
                ctx.fillRect(x, y + 5, Math.max(1, right - x), row - 10);
                if (tween && right - x > 28) {
                    ctx.strokeStyle = layer.color + 'b5';
                    ctx.lineWidth = .8;
                    ctx.beginPath();
                    ctx.moveTo(x + 9, y + row / 2);
                    ctx.lineTo(right - 6, y + row / 2);
                    ctx.lineTo(right - 10, y + row / 2 - 3);
                    ctx.moveTo(right - 6, y + row / 2);
                    ctx.lineTo(right - 10, y + row / 2 + 3);
                    ctx.stroke();
                }
                const cx = frameX(key.frame) + fw / 2, cy = y + row / 2;
                ctx.fillStyle = layer.id === this.activeLayer ? '#dac2f5' : '#c9b8d6';
                ctx.strokeStyle = layer.color;
                ctx.lineWidth = 1;
                if (key.objects.length) {
                    ctx.beginPath();
                    ctx.moveTo(cx, cy - 3.5);
                    ctx.lineTo(cx + 3.5, cy);
                    ctx.lineTo(cx, cy + 3.5);
                    ctx.lineTo(cx - 3.5, cy);
                    ctx.closePath();
                    ctx.fill();
                }
                else {
                    ctx.beginPath();
                    ctx.arc(cx, cy, 3, 0, Math.PI * 2);
                    ctx.stroke();
                }
                ctx.globalAlpha = 1;
            });
            ctx.strokeStyle = '#14121999';
            ctx.beginPath();
            ctx.moveTo(left, y + row + .5);
            ctx.lineTo(w, y + row + .5);
            ctx.stroke();
            ctx.restore();
        });
        const ph = frameX(this.frame) + fw / 2;
        ctx.strokeStyle = '#c59aec';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(Math.round(ph) + .5, 22);
        ctx.lineTo(Math.round(ph) + .5, h);
        ctx.stroke();
        ctx.fillStyle = '#b58dd9';
        ctx.beginPath();
        ctx.moveTo(ph - 7, 0);
        ctx.lineTo(ph + 7, 0);
        ctx.lineTo(ph + 7, 18);
        ctx.lineTo(ph, 25);
        ctx.lineTo(ph - 7, 18);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#2b1d38';
        ctx.font = '8px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(String(this.frame + 1), ph, 13);
        ctx.textAlign = 'left';
        ctx.restore();
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, header, left, h - header);
        ctx.clip();
        layers.forEach((layer, i) => {
            const y = header + i * row - ls;
            if (y + row < header || y > h)
                return;
            ctx.fillStyle = layer.id === this.activeLayer ? '#42364d' : '#2b2b32';
            ctx.fillRect(0, y, left, row);
            ctx.strokeStyle = '#1d1922';
            ctx.beginPath();
            ctx.moveTo(0, y + row + .5);
            ctx.lineTo(left, y + row + .5);
            ctx.stroke();
            if (layer.id === this.activeLayer) {
                ctx.fillStyle = '#b392d7';
                ctx.fillRect(0, y, 2, row);
            }
            ctx.fillStyle = layer.color;
            ctx.beginPath();
            ctx.roundRect(13, y + 10, 6, 6, 1.5);
            ctx.fill();
            ctx.font = '10px Arial';
            ctx.fillStyle = layer.visible ? (layer.id === this.activeLayer ? '#e1cdef' : '#bbb0c7') : '#766b81';
            let name = layer.name;
            while (ctx.measureText(name).width > left - 88 && name.length > 1)
                name = name.slice(0, -2) + '…';
            ctx.fillText(name, 29, y + 17);
            const ex = left - 37, ey = y + 13;
            ctx.strokeStyle = layer.visible ? '#94849f' : '#60536b';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(ex - 5, ey);
            ctx.quadraticCurveTo(ex, ey - 6, ex + 5, ey);
            ctx.quadraticCurveTo(ex, ey + 6, ex - 5, ey);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(ex, ey, 1.5, 0, Math.PI * 2);
            ctx.stroke();
            if (!layer.visible) {
                ctx.beginPath();
                ctx.moveTo(ex - 5, ey - 5);
                ctx.lineTo(ex + 5, ey + 5);
                ctx.stroke();
            }
            const lx = left - 16;
            ctx.strokeStyle = layer.locked ? '#b39abb' : '#615667';
            ctx.strokeRect(lx - 3, y + 12, 6, 6);
            ctx.beginPath();
            ctx.arc(lx, y + 12, 2.5, Math.PI, layer.locked ? 0 : Math.PI * .2);
            ctx.stroke();
        });
        ctx.restore();
        ctx.strokeStyle = '#151218';
        ctx.beginPath();
        ctx.moveTo(left - .5, 0);
        ctx.lineTo(left - .5, h);
        ctx.moveTo(0, header - .5);
        ctx.lineTo(w, header - .5);
        ctx.stroke();
        $('#timeline-zoom-meter').style.width = (10 + this.timelineScale * 9) + '%';
    }
    timelinePosition(e) { const r = this.timelineCanvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, t = this.timelineLayout; return { x, y, frame: clamp(Math.floor((x - t.left + t.scroll) / t.fw), 0, this.doc.duration - 1), layer: y >= t.header ? t.layers[Math.floor((y - t.header + t.layerScroll) / t.row)] : null }; }
    timelineDown(e) {
        if (e.button !== 0)
            return;
        e.preventDefault();
        this.stop();
        this.timelineCanvas.focus({ preventScroll: true });
        this.timelineCanvas.setPointerCapture(e.pointerId);
        const p = this.timelinePosition(e), t = this.timelineLayout;
        if (p.x < t.left) {
            if (!p.layer)
                return;
            this.activeLayer = p.layer.id;
            this.selection = [];
            if (p.x > t.left - 27) {
                this.edit('Toggle layer lock', () => p.layer.locked = !p.layer.locked);
            }
            else if (p.x > t.left - 49) {
                this.edit('Toggle layer visibility', () => p.layer.visible = !p.layer.visible);
            }
            else {
                this.selection = evaluateLayer(p.layer, this.frame).map(o => o.id);
                this.propertyMode = 'frame';
                this.refresh();
            }
            return;
        }
        if (p.layer)
            this.activeLayer = p.layer.id;
        this.setFrame(p.frame);
        const key = p.layer?.keys.find(k => k.frame === p.frame), center = t.left + p.frame * t.fw - t.scroll + t.fw / 2;
        if (key && Math.abs(p.x - center) < 6 && p.layer && !p.layer.locked) {
            this.history.begin('Move keyframe');
            this.timelineDrag = { mode: 'key', key, layer: p.layer, start: e.clientX, originalFrame: key.frame, targetFrame: key.frame, targetLayer: p.layer, pointerId: e.pointerId, moved: false };
        }
        else
            this.timelineDrag = { mode: 'scrub', pointerId: e.pointerId };
    }
    timelineMove(e) { if (!this.timelineDrag || e.pointerId !== this.timelineDrag.pointerId)
        return; const d = this.timelineDrag, p = this.timelinePosition(e); if (d.mode === 'scrub') {
        this.setFrame(p.frame);
        return;
    } if (Math.abs(e.clientX - d.start) > 4) {
        d.moved = true;
        d.targetFrame = p.frame;
        d.targetLayer = p.layer && !p.layer.locked ? p.layer : d.layer;
        this.frame = p.frame;
        this.updateClock();
        this.drawTimeline();
        this.invalidate();
    } }
    timelineUp(e) { const d = this.timelineDrag; if (!d || d.pointerId !== e.pointerId)
        return; this.timelineDrag = null; if (d.mode === 'key') {
        if (d.moved) {
            const collision = d.targetLayer.keys.some(k => k.frame === d.targetFrame && k !== d.key);
            if (collision) {
                this.history.cancel();
                this.frame = d.originalFrame;
                this.toast('That frame already contains a keyframe.');
            }
            else {
                d.layer.keys = d.layer.keys.filter(k => k !== d.key);
                if (d.targetLayer !== d.layer) {
                    d.key.objects.forEach(o => this.reidentify(o));
                    this.selection = d.key.objects.map(o => o.id);
                }
                d.key.frame = d.targetFrame;
                d.targetLayer.keys.push(d.key);
                d.targetLayer.keys.sort((a, b) => a.frame - b.frame);
                this.activeLayer = d.targetLayer.id;
                this.history.commit();
            }
        }
        else
            this.history.cancel();
    } this.refresh(); }
    field(label, prop, value, suffix = '', scope = 'prop') { return `<label class="field"><span>${label}</span><input data-${scope}="${prop}" type="number" step="${prop === 'opacity' ? 1 : .1}" value="${Number.isFinite(value) ? +value.toFixed(2) : 0}" aria-label="${esc(prop)}"><em>${suffix}</em></label>`; }
    renderInspector() {
        const root = $('#inspector-content'), scroll = root.scrollTop;
        $$('[data-panel]').forEach(el => { el.classList.toggle('active', el.dataset.panel === this.panel); el.setAttribute('aria-selected', el.dataset.panel === this.panel); });
        if (this.panel === 'library') {
            this.renderLibrary();
            root.scrollTop = scroll;
            return;
        }
        const objects = this.selectedObjects(), o = objects[0], layer = this.active(), at = keyAt(layer, this.frame), key = at.key;
        let mode = this.propertyMode;
        if (!objects.length && mode === 'object')
            mode = 'document';
        let html = `<div class="inspector-section"><div class="inspector-pills"><button data-mode="object" class="${mode === 'object' ? 'active' : ''}">Object</button><button data-mode="frame" class="${mode === 'frame' ? 'active' : ''}">Frame</button><button data-mode="document" class="${mode === 'document' ? 'active' : ''}">Document</button></div>`;
        if (mode === 'object' && o) {
            const typeLabel = { symbol: 'Graphic symbol instance', group: 'Vector group', path: 'Editable vector path', rect: 'Rectangle primitive', ellipse: 'Ellipse primitive', line: 'Vector line', text: 'Editable text', image: 'Embedded bitmap' }[o.type];
            html += `<div class="selection-heading"><span class="selection-glyph">${icon(objects.length > 1 ? 'layer' : o.type === 'symbol' ? 'symbol' : o.type === 'text' ? 'text' : o.type === 'image' ? 'image' : 'diamond')}</span><div class="selection-title">${objects.length === 1 ? `<input class="object-name-input" data-prop="name" aria-label="Object name" value="${esc(o.name)}">` : `<strong>${objects.length} objects selected</strong>`}<small>${objects.length > 1 ? 'Multiple selection' : typeLabel}</small></div><span class="selection-counter">${objects.length.toString().padStart(2, '0')}</span></div></div>`;
            html += `<div class="inspector-section"><h3 class="section-heading"><span>${icon('down')}Position & size</span><button class="tiny-button" data-action="reset-transform" title="Reset scale, rotation, and skew" aria-label="Reset transform">${icon('rotate', 13)}</button></h3><div class="fields-grid">${this.field('X', 'x', o.x, 'px')}${this.field('Y', 'y', o.y, 'px')}${this.field('W', 'width', o.w * Math.abs(o.scaleX ?? 1), 'px')}${this.field('H', 'height', o.h * Math.abs(o.scaleY ?? 1), 'px')}${this.field('↻', 'rotation', o.rotation || 0, '°')}${this.field('◌', 'opacity', (o.opacity ?? 1) * 100, '%')}</div><div class="align-buttons">${['left', 'center', 'right', 'top', 'middle', 'bottom'].map(a => `<button data-action="align-${a}" title="Align ${a}" aria-label="Align ${a}">${icon(a)}</button>`).join('')}</div></div>`;
            if (objects.length === 1 && o.type === 'symbol') {
                const s = this.doc.symbols.find(s => s.id === o.symbolId);
                html += `<div class="inspector-section"><h3 class="section-heading"><span>${icon('down')}Symbol instance</span><small>SHARED ARTWORK</small></h3><div class="symbol-info">${icon('symbol')}<span>${esc(s?.name || 'Missing symbol')}</span></div><button class="full-button" data-action="edit-symbol">${icon('pen')}Edit symbol</button><p class="inspector-caption">Edit the original artwork once. Every instance updates with it.</p></div>`;
            }
            else if (objects.length === 1 && o.type === 'group') {
                html += `<div class="inspector-section"><h3 class="section-heading"><span>${icon('down')}Group</span><small>${o.children.length} CHILDREN</small></h3><button class="full-button" data-action="ungroup">${icon('layer')}Ungroup artwork</button><button class="full-button" data-action="convert-symbol">${icon('symbol')}Convert to symbol</button></div>`;
            }
            else if (o.type !== 'image') {
                const hex = (v, fallback) => /^#[a-f0-9]{6,8}$/i.test(v || '') ? v.slice(0, 7) : fallback;
                html += `<div class="inspector-section"><h3 class="section-heading"><span>${icon('down')}Appearance</span><button class="tiny-button ${o.fillEnd ? 'active' : ''}" data-action="toggle-gradient" title="Toggle vertical gradient" aria-label="Toggle gradient">${icon('settings')}</button></h3><div class="appearance-row"><label>Fill</label><label class="color-picker-wrap"><input type="color" data-prop="fill" value="${hex(o.fill, '#a08ad1')}" aria-label="Fill color"><span>${o.fill === 'none' ? 'None' : esc(o.fill)}</span></label><button class="none-color ${o.fill === 'none' ? 'active' : ''}" data-action="no-fill" title="No fill" aria-label="No fill"></button></div>${o.fillEnd ? `<div class="appearance-row"><label>End</label><label class="color-picker-wrap"><input type="color" data-prop="fillEnd" value="${hex(o.fillEnd, '#65517e')}" aria-label="Gradient end"><span>${esc(o.fillEnd)}</span></label></div>` : ''}<div class="appearance-row"><label>Stroke</label><label class="color-picker-wrap"><input type="color" data-prop="stroke" value="${hex(o.stroke, '#635676')}" aria-label="Stroke color"><span>${o.stroke === 'none' ? 'None' : esc(o.stroke)}</span></label>${this.field('', 'strokeWidth', o.strokeWidth || 0, 'px')}<button class="none-color ${o.stroke === 'none' ? 'active' : ''}" data-action="no-stroke" title="No stroke" aria-label="No stroke"></button></div>${o.type === 'rect' ? `<div class="fields-grid">${this.field('R', 'radius', o.radius || 0, 'px')}</div>` : ''}<div class="swatches">${['#e9d5c5', '#edac89', '#df7767', '#d1aecf', '#a28bc7', '#6e5c87', '#a8c7b8', '#3d344d'].map(c => `<button data-swatch="${c}" style="background:${c}" title="${c}" aria-label="Fill ${c}"></button>`).join('')}</div></div>`;
            }
            if (objects.length === 1 && o.type === 'text') {
                html += `<div class="inspector-section"><h3 class="section-heading"><span>${icon('down')}Typography</span></h3><textarea class="text-content" data-prop="text" aria-label="Text content">${esc(o.text)}</textarea><select class="font-select" data-prop="fontFamily" aria-label="Font family">${['Arial', 'Georgia', 'Verdana', 'Trebuchet MS', 'Courier New', 'Times New Roman', 'system-ui'].map(f => `<option ${f === o.fontFamily ? 'selected' : ''}>${f}</option>`).join('')}</select><div class="fields-grid">${this.field('T', 'fontSize', o.fontSize || 32, 'px')}<select data-prop="fontWeight" aria-label="Font weight">${[400, 500, 600, 700, 800].map(n => `<option value="${n}" ${n === o.fontWeight ? 'selected' : ''}>${n}</option>`).join('')}</select></div><div class="align-buttons">${['left', 'center', 'right'].map(a => `<button data-action="text-${a}" title="Align text ${a}">${icon(a)}</button>`).join('')}<button data-action="text-italic" title="Italic" style="font-family:Georgia;font-style:italic" class="${o.italic ? 'active' : ''}">I</button></div></div>`;
            }
            html += this.frameInspector(key, at.next, true);
        }
        else if (mode === 'frame') {
            html += `<div class="selection-heading"><span class="selection-glyph">${icon('key')}</span><div class="selection-title"><strong>Frame ${this.frame + 1}</strong><small>${esc(layer.name)} · ${evaluateLayer(layer, this.frame).length} objects</small></div><span class="selection-counter">${key?.frame === this.frame ? 'KEY' : 'SPAN'}</span></div></div>`;
            html += this.frameInspector(key, at.next, false);
            html += `<div class="inspector-section"><h3 class="section-heading"><span>${icon('down')}Keyframe actions</span></h3><button class="full-button" data-action="keyframe">${icon('plus')}Insert keyframe · F6</button><button class="full-button" data-action="blank-keyframe">${icon('diamond')}Insert blank keyframe · F7</button><button class="full-button" data-action="remove-keyframe">${icon('trash')}Remove keyframe</button><p class="inspector-caption">Drag a diamond on the timeline to move a keyframe. Shift + scroll pans the timeline horizontally.</p></div>`;
        }
        else {
            html += `<div class="selection-heading"><span class="selection-glyph">${icon('layer')}</span><div class="selection-title"><strong>${esc(this.doc.name)}</strong><small>HTML5 vector animation</small></div></div><div class="document-card"><span class="doc-thumb"></span><div><strong>${this.doc.width} × ${this.doc.height}</strong><small>${this.doc.fps} FPS · ${(this.doc.duration / this.doc.fps).toFixed(2)} SECONDS</small></div></div></div><div class="inspector-section"><h3 class="section-heading"><span>${icon('down')}Document settings</span></h3><div class="fields-grid">${this.field('W', 'width', this.doc.width, 'px', 'doc')}${this.field('H', 'height', this.doc.height, 'px', 'doc')}${this.field('◷', 'fps', this.doc.fps, 'fps', 'doc')}${this.field('◇', 'duration', this.doc.duration, 'fr', 'doc')}</div><div class="appearance-row" style="margin-top:16px"><label>Stage</label><label class="color-picker-wrap"><input data-doc="background" type="color" value="${/^#[0-9a-f]{6}/i.test(this.doc.background) ? this.doc.background.slice(0, 7) : '#f7f3eb'}" aria-label="Stage background"><span>${esc(this.doc.background)}</span></label><button class="none-color ${this.doc.background === 'none' ? 'active' : ''}" data-action="transparent-stage" title="Transparent stage" aria-label="Transparent stage"></button></div></div><div class="inspector-section"><h3 class="section-heading"><span>${icon('down')}Start something wonderful</span></h3><p class="empty-selection">Draw on the stage, bring in your artwork, or drag a symbol from the Library.</p><button class="full-button" data-action="open">${icon('image')}Import artwork</button><button class="full-button" data-action="add-layer">${icon('layer')}Add a layer</button><p class="inspector-caption">Everything stays in your browser. Save a .celesta.json project to keep a portable copy.</p></div><div class="inspector-section"><h3 class="section-heading"><span>${icon('down')}Publish</span></h3><button class="full-button" data-action="export">${icon('export')}Export animation</button></div>`;
        }
        root.innerHTML = html;
        root.scrollTop = scroll;
    }
    frameInspector(key, next, compact) { const hasMotion = key && key.tween !== 'none' && next; const kind = key?.ease || 'ease-in-out'; const points = Array.from({ length: 51 }, (_, i) => { const t = i / 50; return `${i === 0 ? 'M' : 'L'} ${(t * 175 + 5).toFixed(1)} ${(38 - ease(t, kind) * 31).toFixed(1)}`; }).join(' '); return `<div class="inspector-section"><h3 class="section-heading"><span>${icon('down')}${compact ? 'Motion' : 'Tween settings'}</span><span class="mini-badge">${hasMotion ? 'TWEEN' : key ? 'KEYFRAME' : 'EMPTY'}</span></h3><div class="select-field"><label>Animation</label><select data-frame="tween" aria-label="Tween type"><option value="none" ${!key || key.tween === 'none' ? 'selected' : ''}>Frame by frame</option><option value="motion" ${key?.tween === 'motion' ? 'selected' : ''}>Motion tween</option><option value="shape" ${key?.tween === 'shape' ? 'selected' : ''}>Shape tween</option></select></div><div class="select-field"><label>Easing</label><select data-frame="ease" aria-label="Easing curve">${[['linear', 'Linear'], ['ease-in', 'Ease in'], ['ease-out', 'Ease out'], ['ease-in-out', 'Ease in & out'], ['back', 'Back out'], ['bounce', 'Bounce out'], ['step', 'Stepped']].map(([value, label]) => `<option value="${value}" ${kind === value ? 'selected' : ''}>${label}</option>`).join('')}</select></div><div class="ease-preview"><svg viewBox="0 0 232 44"><path d="M5 38H180 M5 7V38" stroke="#665074" stroke-width=".6" fill="none"/><path d="${points}" stroke="#b396d1" stroke-width="1.5" fill="none"/><circle cx="5" cy="38" r="2.3" fill="#c6aae5"/><circle cx="180" cy="7" r="2.3" fill="#c6aae5"/></svg><span>${hasMotion ? `FRAME ${key.frame + 1}–${next.frame + 1}` : 'EASING CURVE'}</span></div>${!next ? '<p class="inspector-caption">Add another keyframe to create a tween span.</p>' : ''}</div>`; }
    updatePropertyValues() { const o = this.selectedObjects()[0]; if (!o)
        return; for (const input of $$('[data-prop]', $('#inspector-content'))) {
        if (input === document.activeElement || input.type !== 'number')
            continue;
        const key = input.dataset.prop;
        let v = key === 'width' ? o.w * Math.abs(o.scaleX) : key === 'height' ? o.h * Math.abs(o.scaleY) : key === 'opacity' ? o.opacity * 100 : o[key];
        if (Number.isFinite(v))
            input.value = +v.toFixed(2);
    } }
    setProperty(prop, value) {
        if (!this.selection.length)
            return;
        this.edit('Change ' + prop, () => {
            for (const { object: o } of this.editableSelected()) {
                if (prop === 'width') {
                    o.scaleX = Math.sign(o.scaleX || 1) * clamp(Number(value) || 1, .01, 1e6) / o.w;
                }
                else if (prop === 'height') {
                    o.scaleY = Math.sign(o.scaleY || 1) * clamp(Number(value) || 1, .01, 1e6) / o.h;
                }
                else if (prop === 'opacity')
                    o.opacity = clamp(Number(value) / 100, 0, 1);
                else if (['x', 'y', 'rotation', 'strokeWidth', 'radius', 'fontSize', 'fontWeight'].includes(prop)) {
                    let n = Number(value);
                    if (!Number.isFinite(n))
                        continue;
                    if (['strokeWidth', 'radius'].includes(prop))
                        n = clamp(n, 0, 2000);
                    if (prop === 'fontSize')
                        n = clamp(n, 1, 2000);
                    o[prop] = clamp(n, -1e6, 1e6);
                }
                else
                    o[prop] = value;
            }
        });
    }
    inspectorChange(e) {
        const el = e.target;
        if (el.dataset.prop) {
            this.setProperty(el.dataset.prop, el.value);
            return;
        }
        if (el.dataset.doc) {
            const k = el.dataset.doc;
            this.edit('Document ' + k, () => { if (k === 'background')
                this.doc.background = el.value;
            else {
                let n = Math.round(Number(el.value));
                if (!Number.isFinite(n))
                    return;
                if (k === 'duration') {
                    const last = Math.max(0, ...this.doc.layers.flatMap(l => l.keys.map(k => k.frame)));
                    if (n <= last) {
                        this.toast(`The last keyframe is at frame ${last + 1}. Move or remove it before shortening the timeline.`, true);
                        return;
                    }
                    n = clamp(n, 1, 3600);
                }
                else if (k === 'fps')
                    n = clamp(n, 1, 120);
                else
                    n = clamp(n, 64, 8192);
                this.doc[k] = n;
            } });
            this.autoFit = true;
            this.resize();
            this.refresh();
            return;
        }
        if (el.dataset.frame) {
            if (this.active().locked) {
                this.toast('Unlock this layer before editing its keyframes.');
                this.renderInspector();
                return;
            }
            this.edit('Change tween ' + el.dataset.frame, () => { const key = keyAt(this.active(), this.frame).key || ensureKey(this.active(), this.frame); key[el.dataset.frame] = el.value; });
        }
    }
    renderLibrary() { const root = $('#inspector-content'); root.innerHTML = `<div class="library-header"><div class="library-search">${icon('search')}<input id="library-search" placeholder="Find a symbol or asset…" aria-label="Search library" value="${esc(this.librarySearch || '')}"></div></div><div class="library-caption">SYMBOLS <small>${this.doc.symbols.length} ITEMS</small></div><div id="library-items"></div><div class="library-actions"><button class="full-button" data-action="new-symbol">${icon('plus')}New symbol</button><button class="full-button" data-action="convert-symbol">${icon('symbol')}Convert selection to symbol</button><button class="full-button" data-action="open">${icon('image')}Import artwork</button></div><p class="library-note">Drag a symbol onto the stage, or double-click to add it. Double-click an instance on the stage to edit its shared artwork.</p>`; this.renderLibraryItems(); }
    renderLibraryItems() {
        const root = $('#library-items');
        if (!root)
            return;
        const filter = (this.librarySearch || '').toLowerCase();
        root.innerHTML = this.doc.symbols.filter(s => s.name.toLowerCase().includes(filter) && s.id !== this.symbolContext?.symbolId).map(s => {
            const project = { ...this.doc, width: Math.max(1, s.w), height: Math.max(1, s.h), background: 'none', layers: [createLayer('Preview', clone(s.objects))] };
            const svg = exportSVG(project, 0, { background: false });
            return `<div class="library-item ${s.id === this.librarySelection ? 'selected' : ''}" data-symbol="${esc(s.id)}" draggable="true" tabindex="0"><div class="symbol-thumb"><img draggable="false" src="data:image/svg+xml,${encodeURIComponent(svg)}" alt=""></div><div><strong>${esc(s.name)}</strong><small>Graphic · ${Math.round(s.w)} × ${Math.round(s.h)}</small></div><button class="tiny-button" data-action="insert-symbol" data-symbol-id="${esc(s.id)}" title="Insert symbol" aria-label="Insert ${esc(s.name)}">${icon('plus')}</button></div>`;
        }).join('') + this.doc.assets.filter(a => a.name.toLowerCase().includes(filter)).map(a => `<div class="library-item"><div class="symbol-thumb"><img src="${a.src}" alt="" draggable="false"></div><div><strong>${esc(a.name)}</strong><small>Bitmap · ${a.w} × ${a.h}</small></div><button class="tiny-button" data-action="insert-asset" data-asset-id="${esc(a.id)}" title="Insert bitmap">${icon('plus')}</button></div>`).join('');
        if (!root.innerHTML)
            root.innerHTML = '<p class="library-note">No matching assets. Add a symbol or import artwork.</p>';
    }
    async action(name, event) {
        try {
            if (name.startsWith('align-')) {
                this.alignSelection(name.slice(6));
                return;
            }
            if (name.startsWith('text-')) {
                const prop = name.slice(5);
                this.setProperty(prop === 'italic' ? 'italic' : 'align', prop === 'italic' ? !this.selectedObjects()[0]?.italic : prop);
                return;
            }
            if (name.startsWith('export-')) {
                await this.runExport(name.slice(7));
                return;
            }
            switch (name) {
                case 'undo':
                    this.stop();
                    this.penDraft = null;
                    this.drag = null;
                    this.history.undo();
                    break;
                case 'redo':
                    this.stop();
                    this.history.redo();
                    break;
                case 'play':
                    this.playing ? this.stop() : this.play();
                    break;
                case 'first':
                    this.setFrame(0);
                    break;
                case 'last':
                    this.setFrame(this.doc.duration - 1);
                    break;
                case 'prev':
                    this.setFrame(this.frame - 1);
                    break;
                case 'next':
                    this.setFrame(this.frame + 1);
                    break;
                case 'loop':
                    this.loop = !this.loop;
                    $('#loop-button').classList.toggle('active', this.loop);
                    break;
                case 'onion':
                    this.onion = !this.onion;
                    $('#onion-button').classList.toggle('active', this.onion);
                    this.invalidate();
                    break;
                case 'motion-path':
                    this.motionPath = !this.motionPath;
                    $('#motion-path-button').classList.toggle('active', this.motionPath);
                    this.invalidate();
                    break;
                case 'grid':
                    this.grid = !this.grid;
                    $('#grid-button').classList.toggle('active', this.grid);
                    this.invalidate();
                    break;
                case 'snap':
                    this.snap = !this.snap;
                    this.toast('Grid snapping ' + (this.snap ? 'enabled · 10 px' : 'disabled'));
                    break;
                case 'autokey':
                    this.autoKey = !this.autoKey;
                    $('#autokey-button').classList.toggle('active', this.autoKey);
                    this.toast(this.autoKey ? 'Edits create a keyframe at the current frame.' : 'Edits update the preceding keyframe.');
                    break;
                case 'fit':
                    this.fit();
                    break;
                case 'zoom-in':
                    this.zoomAt(1.25);
                    break;
                case 'zoom-out':
                    this.zoomAt(.8);
                    break;
                case 'actual-size':
                    this.zoomAt(1 / this.view.zoom);
                    break;
                case 'zoom-menu': {
                    const r = $('#zoom-display').getBoundingClientRect();
                    this.openMenu([['fit', 'Fit stage', '⌘ 0'], ['actual-size', '100%'], ['zoom-in', 'Zoom in', '⌘ +'], ['zoom-out', 'Zoom out', '⌘ −']], r.right - 180, r.bottom + 5);
                    break;
                }
                case 'timeline-zoom-in':
                    this.timelineScale = clamp(this.timelineScale * 1.4, 1, 10);
                    this.drawTimeline();
                    break;
                case 'timeline-zoom-out':
                    this.timelineScale = clamp(this.timelineScale / 1.4, 1, 10);
                    this.drawTimeline();
                    break;
                case 'copy':
                    if (!this.selection.length) {
                        this.toast('Select artwork to copy.');
                        break;
                    }
                    this.clipboard = clone(this.selectedObjects());
                    this.toast('Artwork copied.');
                    break;
                case 'cut':
                    if (this.selection.length) {
                        this.clipboard = clone(this.selectedObjects());
                        this.deleteSelection();
                    }
                    break;
                case 'paste':
                    if (!this.clipboard) {
                        this.toast('Copy some artwork first, or paste an image from the clipboard.');
                        break;
                    }
                    this.pasteObjects(this.clipboard);
                    break;
                case 'duplicate':
                    if (this.selection.length)
                        this.pasteObjects(this.selectedObjects());
                    break;
                case 'delete':
                    this.deleteSelection();
                    break;
                case 'select-all':
                    this.selection = evaluateScene(this.doc, this.frame).filter(e => !e.layer.locked).map(e => e.object.id);
                    this.refresh();
                    break;
                case 'deselect':
                    this.selection = [];
                    this.refresh();
                    break;
                case 'add-layer':
                    this.edit('Add layer', () => { const l = createLayer('Layer ' + (this.doc.layers.length + 1), [], layerPalette[this.doc.layers.length % 6]); this.doc.layers.push(l); this.activeLayer = l.id; this.selection = []; });
                    break;
                case 'delete-layer':
                    this.edit('Delete layer', () => { if (this.doc.layers.length === 1)
                        this.active().keys = [{ frame: 0, objects: [], tween: 'none', ease: 'linear' }];
                    else
                        this.doc.layers = this.doc.layers.filter(l => l.id !== this.activeLayer); this.activeLayer = this.doc.layers.at(-1).id; this.selection = []; });
                    break;
                case 'layer-up':
                case 'layer-down':
                    this.edit('Reorder layer', () => { const i = this.doc.layers.findIndex(l => l.id === this.activeLayer), j = clamp(i + (name === 'layer-up' ? 1 : -1), 0, this.doc.layers.length - 1); [this.doc.layers[i], this.doc.layers[j]] = [this.doc.layers[j], this.doc.layers[i]]; });
                    break;
                case 'rename-layer':
                    this.renameLayer(this.active());
                    break;
                case 'keyframe':
                case 'blank-keyframe':
                    if (this.active().locked) {
                        this.toast('Unlock the layer before adding a keyframe.');
                        break;
                    }
                    this.edit(name === 'keyframe' ? 'Insert keyframe' : 'Insert blank keyframe', () => { const previous = new Set(this.selection), key = ensureKey(this.active(), this.frame, name === 'blank-keyframe'); this.selection = key.objects.filter(o => !previous.size || previous.has(o.id)).map(o => o.id); });
                    break;
                case 'remove-keyframe':
                    if (this.active().locked) {
                        this.toast('Unlock the layer before removing a keyframe.');
                        break;
                    }
                    this.edit('Remove keyframe', () => { this.active().keys = this.active().keys.filter(k => k.frame !== this.frame); this.selection = []; });
                    break;
                case 'copy-keyframe': {
                    const k = keyAt(this.active(), this.frame).key;
                    this.keyClipboard = { frame: 0, objects: evaluateLayer(this.active(), this.frame), tween: k?.tween || 'none', ease: k?.ease || 'linear', source: this.activeLayer };
                    this.toast('Keyframe copied.');
                    break;
                }
                case 'paste-keyframe':
                    if (!this.keyClipboard) {
                        this.toast('Copy a keyframe first.');
                        break;
                    }
                    if (this.active().locked) {
                        this.toast('Unlock the target layer.');
                        break;
                    }
                    this.edit('Paste keyframe', () => { const k = ensureKey(this.active(), this.frame); k.objects = clone(this.keyClipboard.objects); if (this.keyClipboard.source !== this.activeLayer)
                        k.objects.forEach(o => this.reidentify(o)); k.tween = this.keyClipboard.tween; k.ease = this.keyClipboard.ease; this.selection = k.objects.map(o => o.id); });
                    break;
                case 'tween':
                case 'shape-tween':
                case 'remove-tween':
                    this.createTween(name === 'tween' ? 'motion' : name === 'shape-tween' ? 'shape' : 'none');
                    break;
                case 'extend':
                    this.edit('Extend timeline', () => this.doc.duration = Math.min(3600, this.doc.duration + 24));
                    break;
                case 'group':
                    this.groupSelection();
                    break;
                case 'ungroup':
                    this.ungroupSelection();
                    break;
                case 'bring-front':
                case 'send-back':
                    this.edit('Change stacking order', () => { const entries = this.editableSelected(), keys = new Set(entries.map(e => e.key)), ids = new Set(this.selection); for (const k of keys) {
                        const selected = k.objects.filter(o => ids.has(o.id)), others = k.objects.filter(o => !ids.has(o.id));
                        k.objects = name === 'bring-front' ? [...others, ...selected] : [...selected, ...others];
                    } });
                    break;
                case 'flip-horizontal':
                case 'flip-vertical':
                    this.edit('Flip selection', () => { for (const { object } of this.editableSelected())
                        object[name === 'flip-horizontal' ? 'scaleX' : 'scaleY'] *= -1; });
                    break;
                case 'reset-transform':
                    this.edit('Reset transform', () => { for (const { object } of this.editableSelected()) {
                        object.scaleX = object.scaleY = 1;
                        object.rotation = object.skewX = 0;
                    } });
                    break;
                case 'no-fill':
                    this.setProperty('fill', 'none');
                    break;
                case 'no-stroke':
                    this.setProperty('stroke', 'none');
                    break;
                case 'toggle-gradient':
                    this.edit('Toggle gradient', () => { for (const { object } of this.editableSelected()) {
                        if (object.fillEnd)
                            delete object.fillEnd;
                        else
                            object.fillEnd = '#6e5c87';
                    } });
                    break;
                case 'swap-colors':
                    [this.fill, this.stroke] = [this.stroke, this.fill];
                    $('#rail-fill').value = this.fill;
                    $('#rail-stroke').value = this.stroke;
                    break;
                case 'transparent-stage':
                    this.edit('Transparent stage', () => this.doc.background = this.doc.background === 'none' ? '#f7f3eb' : 'none');
                    break;
                case 'convert-symbol':
                    this.convertSymbol();
                    break;
                case 'new-symbol':
                    this.showForm('New symbol', 'Create reusable vector artwork.', `<label class="dialog-field"><span>Name</span><input name="name" value="New symbol" required maxlength="100"></label><div class="dialog-grid"><label class="dialog-field"><span>Width</span><input name="width" type="number" min="64" max="2048" value="240" required></label><label class="dialog-field"><span>Height</span><input name="height" type="number" min="64" max="2048" value="240" required></label></div>`, data => { let sid; this.edit('Create symbol', () => { const s = { id: uid('s'), name: data.get('name'), w: +data.get('width'), h: +data.get('height'), objects: [] }; sid = s.id; this.doc.symbols.push(s); }); this.enterSymbol(sid); }, 'Create symbol');
                    break;
                case 'insert-symbol': {
                    const id = event?.target.closest('[data-symbol-id]')?.dataset.symbolId || this.librarySelection;
                    if (id)
                        this.insertSymbol(id);
                    else
                        this.toast('Choose a symbol from the Library.');
                    break;
                }
                case 'insert-asset': {
                    const id = event?.target.closest('[data-asset-id]')?.dataset.assetId;
                    if (id)
                        this.insertAsset(id);
                    break;
                }
                case 'edit-symbol': {
                    const o = this.selectedObjects()[0];
                    if (o?.type === 'symbol')
                        this.enterSymbol(o.symbolId);
                    else if (this.librarySelection)
                        this.enterSymbol(this.librarySelection);
                    else
                        this.toast('Select a symbol instance to edit.');
                    break;
                }
                case 'leave-symbol':
                    this.leaveSymbol();
                    break;
                case 'new':
                    this.newDocumentDialog();
                    break;
                case 'demo':
                    this.showForm('Open the demo project', 'This replaces the current workspace. Save a project file first to keep a portable copy.', '<p class="dialog-note">Explore a fully editable motion scene with layered vector artwork, graphic symbols, and eased keyframes.</p>', () => this.replaceProject(createDemo()), 'Open demo');
                    break;
                case 'open':
                    $('#file-input').click();
                    break;
                case 'save': {
                    if (this.penDraft)
                        this.finishPen();
                    const p = this.persistableProject();
                    downloadBlob(new Blob([JSON.stringify(p, null, 2)], { type: 'application/json' }), safeFilename(p.name) + '.celesta.json');
                    this.toast('Project file saved.');
                    break;
                }
                case 'rename':
                    this.showForm('Rename animation', 'Give your next idea a name.', `<label class="dialog-field"><span>Name</span><input name="name" value="${esc(this.doc.name)}" maxlength="200" required></label>`, data => this.edit('Rename document', () => this.doc.name = data.get('name').trim() || 'Untitled animation'), 'Rename');
                    break;
                case 'export':
                    this.showExport();
                    break;
                case 'preview':
                    this.showPreview();
                    break;
                case 'preview-toggle':
                    if (this.preview) {
                        this.previewPlaying = !this.previewPlaying;
                        this.preview.start = performance.now();
                        this.preview.startFrame = this.preview.frame;
                        $('#preview-play').innerHTML = icon(this.previewPlaying ? 'pause' : 'play');
                        this.invalidate();
                    }
                    break;
                case 'cancel-export':
                    this.exportController?.abort();
                    this.closeDialog();
                    break;
                case 'dialog-close':
                    this.closeDialog();
                    break;
                case 'help':
                    this.showHelp();
                    break;
                case 'about':
                    this.showAbout();
                    break;
                default: console.warn('Unknown action', name);
            }
        }
        catch (error) {
            console.error(error);
            this.toast(error.message || String(error), true);
        }
    }
    play() { if (this.penDraft)
        this.finishPen(); if (this.frame >= this.doc.duration - 1)
        this.frame = 0; this.playing = true; this.playStart = performance.now(); this.playFrame = this.frame; $('#play-button').innerHTML = icon('pause'); $('#play-button').setAttribute('aria-label', 'Pause'); this.invalidate(); }
    stop() { if (!this.playing)
        return; this.playing = false; $('#play-button').innerHTML = icon('play'); $('#play-button').setAttribute('aria-label', 'Play'); this.invalidate(); }
    reidentify(o) { o.id = uid(); if (o.children)
        o.children.forEach(c => this.reidentify(c)); return o; }
    deleteSelection() { if (!this.selection.length)
        return; this.edit('Delete artwork', () => { const ids = new Set(this.selection), keys = new Set(this.editableSelected().map(e => e.key)); for (const k of keys)
        k.objects = k.objects.filter(o => !ids.has(o.id)); this.selection = []; }); }
    pasteObjects(objects) { this.edit('Duplicate artwork', () => { const l = this.editableLayer(), key = this.editKey(l), copies = clone(objects).map(o => { this.reidentify(o); o.x += 20; o.y += 20; return o; }); key.objects.push(...copies); this.selection = copies.map(o => o.id); this.propertyMode = 'object'; }); }
    createTween(type) { if (this.active().locked) {
        this.toast('Unlock this layer before editing its tween.');
        return;
    } let added = false; this.edit(type === 'none' ? 'Remove tween' : 'Create ' + type + ' tween', () => { const layer = this.active(); const key = keyAt(layer, this.frame).key || ensureKey(layer, this.frame); key.tween = type; if (type !== 'none' && !layer.keys.some(k => k.frame > key.frame)) {
        let f = Math.min(this.doc.duration - 1, key.frame + 23);
        if (f === key.frame) {
            this.doc.duration = clamp(this.doc.duration + 24, 1, 3600);
            f = this.doc.duration - 1;
        }
        if (f > key.frame) {
            const end = ensureKey(layer, f);
            end.tween = 'none';
            added = true;
        }
    } }); this.propertyMode = 'frame'; this.renderInspector(); if (added)
        this.toast('End keyframe created. Select it and change the artwork to set the end pose.'); }
    alignSelection(direction) { if (!this.selection.length)
        return; this.edit('Align ' + direction, () => { const targets = this.editableSelected(), objects = targets.map(t => t.object), b = objects.length > 1 ? unionBounds(objects) : { x: 0, y: 0, right: this.doc.width, bottom: this.doc.height, w: this.doc.width, h: this.doc.height }; for (const { object: o } of targets) {
        const a = bounds(o);
        if (direction === 'left')
            o.x += b.x - a.x;
        if (direction === 'center')
            o.x += (b.x + b.right - a.x - a.right) / 2;
        if (direction === 'right')
            o.x += b.right - a.right;
        if (direction === 'top')
            o.y += b.y - a.y;
        if (direction === 'middle')
            o.y += (b.y + b.bottom - a.y - a.bottom) / 2;
        if (direction === 'bottom')
            o.y += b.bottom - a.bottom;
    } }); }
    groupSelection() { if (this.selection.length < 2) {
        this.toast('Select at least two objects to group.');
        return;
    } this.edit('Group artwork', () => { const entries = this.editableSelected(), objects = entries.map(e => clone(e.object)), b = unionBounds(objects); objects.forEach(o => { o.x -= b.x; o.y -= b.y; }); const g = createObject('group', { name: 'Group', x: b.x, y: b.y, w: b.w, h: b.h, children: objects, fill: 'none' }); this.replaceSelection(entries, g); }); }
    replaceSelection(entries, object) { const ids = new Set(this.selection), keys = new Set(entries.map(e => e.key)); for (const k of keys)
        k.objects = k.objects.filter(o => !ids.has(o.id)); const target = entries.at(-1); target.key.objects.push(object); this.activeLayer = target.layer.id; this.selection = [object.id]; }
    ungroupSelection() { if (!this.selectedObjects().some(o => ['group', 'symbol'].includes(o.type))) {
        this.toast('Select a group or symbol to break apart.');
        return;
    } this.edit('Break apart artwork', () => { const entries = this.editableSelected(), ids = []; for (const entry of entries) {
        const o = entry.object;
        let children = o.children;
        if (o.type === 'symbol')
            children = this.doc.symbols.find(s => s.id === o.symbolId)?.objects;
        if (!children) {
            ids.push(o.id);
            continue;
        }
        const m = objectMatrix(o), copies = clone(children);
        copies.forEach(c => { if (o.type === 'symbol')
            this.reidentify(c); assignMatrix(c, multiply(m, objectMatrix(c))); c.opacity = (c.opacity ?? 1) * (o.opacity ?? 1); ids.push(c.id); });
        const i = entry.key.objects.findIndex(c => c.id === o.id);
        entry.key.objects.splice(i, 1, ...copies);
    } this.selection = ids; }); }
    convertSymbol() { if (!this.selection.length) {
        this.toast('Select artwork to convert into a symbol.');
        return;
    } this.showForm('Convert to symbol', 'Create a shared, reusable graphic from your selection.', `<label class="dialog-field"><span>Symbol name</span><input name="name" value="${esc(this.selectedObjects()[0]?.name || 'New symbol')}" required maxlength="100"></label>`, data => { this.edit('Convert to symbol', () => { const entries = this.editableSelected(), objects = entries.map(e => clone(e.object)), b = unionBounds(objects); objects.forEach(o => { o.x -= b.x; o.y -= b.y; }); const s = { id: uid('s'), name: data.get('name'), w: Math.max(1, b.w), h: Math.max(1, b.h), objects }; this.doc.symbols.push(s); const instance = createObject('symbol', { name: s.name, symbolId: s.id, x: b.x, y: b.y, w: s.w, h: s.h, fill: 'none' }); this.replaceSelection(entries, instance); }); }, 'Create symbol'); }
    symbolReferences(id, target, seen = new Set()) { if (id === target)
        return true; if (seen.has(id))
        return false; seen.add(id); const s = this.doc.symbols.find(s => s.id === id); if (!s)
        return false; const visit = objects => objects.some(o => o.type === 'symbol' ? this.symbolReferences(o.symbolId, target, seen) : o.children ? visit(o.children) : false); return visit(s.objects); }
    insertSymbol(id, position) { const s = this.doc.symbols.find(s => s.id === id); if (!s)
        return; if (this.symbolContext && this.symbolReferences(id, this.symbolContext.symbolId)) {
        this.toast('A symbol cannot contain itself, directly or indirectly.', true);
        return;
    } const c = position || { x: this.doc.width / 2, y: this.doc.height / 2 }, scale = Math.min(1, this.doc.width * .6 / s.w, this.doc.height * .6 / s.h); this.edit('Insert symbol', () => { const key = this.editKey(this.editableLayer()), o = createObject('symbol', { name: s.name, symbolId: s.id, w: s.w, h: s.h, x: c.x - s.w / 2, y: c.y - s.h / 2, scaleX: scale, scaleY: scale }); key.objects.push(o); this.selection = [o.id]; this.propertyMode = 'object'; }); this.setTool('select'); }
    enterSymbol(id) { if (this.symbolContext) {
        this.toast('Return to Scene 1 before opening another symbol.');
        return;
    } const s = this.doc.symbols.find(s => s.id === id); if (!s)
        return; this.stop(); this.symbolContext = { project: this.doc, symbolId: id, frame: this.frame, selection: [...this.selection], activeLayer: this.activeLayer, history: this.history }; const isolated = createProject(); isolated.name = s.name; isolated.width = s.w; isolated.height = s.h; isolated.duration = 1; isolated.fps = this.doc.fps; isolated.background = '#f7f3eb'; isolated.symbols = clone(this.doc.symbols); isolated.assets = clone(this.doc.assets); isolated.layers = [createLayer('Symbol artwork', clone(s.objects))]; this.doc = isolated; this.frame = 0; this.selection = []; this.activeLayer = isolated.layers[0].id; this.history = this.makeHistory(); this.propertyMode = 'object'; this.autoFit = true; this.resize(); this.refresh(); this.toast('Editing shared symbol artwork. Return to Scene 1 to apply changes.'); }
    leaveSymbol() { if (!this.symbolContext)
        return; if (this.penDraft)
        this.finishPen(); const context = this.symbolContext, edited = this.doc; this.symbolContext = null; this.doc = context.project; this.frame = context.frame; this.selection = context.selection; this.activeLayer = context.activeLayer; this.history = context.history; this.edit('Edit symbol artwork', () => { const s = this.doc.symbols.find(s => s.id === context.symbolId); s.name = edited.name; s.objects = edited.layers.flatMap(l => clone(l.keys[0]?.objects || [])); s.w = edited.width; s.h = edited.height; for (const a of edited.assets)
        if (!this.doc.assets.some(v => v.id === a.id))
            this.doc.assets.push(a); for (const symbol of edited.symbols)
        if (!this.doc.symbols.some(v => v.id === symbol.id))
            this.doc.symbols.push(symbol); }); this.autoFit = true; this.resize(); this.refresh(); }
    insertAsset(id, position) { const a = this.doc.assets.find(a => a.id === id); if (!a)
        return; const c = position || { x: this.doc.width / 2, y: this.doc.height / 2 }, scale = Math.min(1, this.doc.width * .7 / a.w, this.doc.height * .7 / a.h); this.edit('Insert bitmap', () => { const o = createObject('image', { name: a.name, assetId: a.id, x: c.x - a.w / 2, y: c.y - a.h / 2, w: a.w, h: a.h, scaleX: scale, scaleY: scale, fill: 'none' }); this.editKey(this.editableLayer()).objects.push(o); this.selection = [o.id]; }); this.setTool('select'); }
    async importFile(file, position) {
        try {
            if (file.size > 32 * 1024 * 1024)
                throw new Error('Files are limited to 32 MiB.');
            if (/\.(json|celesta)$/i.test(file.name)) {
                const p = validateProject(JSON.parse(await file.text()));
                this.replaceProject(p);
                this.toast('Project opened.');
                return;
            }
            if (file.type === 'image/svg+xml' || /\.svg$/i.test(file.name)) {
                const { object, warnings } = importSVG(await file.text()), c = position || { x: this.doc.width / 2, y: this.doc.height / 2 }, scale = Math.min(1, this.doc.width * .75 / object.w, this.doc.height * .75 / object.h);
                object.name = file.name.replace(/\.svg$/i, '');
                object.x = c.x - object.w / 2;
                object.y = c.y - object.h / 2;
                object.scaleX = object.scaleY = scale;
                this.edit('Import SVG', () => { this.editKey(this.editableLayer()).objects.push(object); this.selection = [object.id]; });
                this.setTool('select');
                this.toast(warnings.length ? 'SVG imported. ' + warnings.join(' ') : 'SVG imported as editable vector artwork.', !!warnings.length);
                return;
            }
            if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type))
                throw new Error('Open a .celesta.json project, SVG, PNG, JPEG, WebP, or GIF.');
            if (file.size > 16 * 1024 * 1024)
                throw new Error('Bitmap imports are limited to 16 MiB each.');
            const src = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(reader.error); reader.readAsDataURL(file); });
            const image = new Image();
            await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = () => reject(new Error('Could not decode this image.')); image.src = src; });
            if (image.width > 16384 || image.height > 16384)
                throw new Error('Imported images must be at most 16384 pixels per side.');
            if (JSON.stringify(this.persistableProject()).length + src.length > 30 * 1024 * 1024)
                throw new Error('This bitmap would exceed the portable project size limit. Resize or compress it first.');
            const a = { id: uid('asset'), name: file.name || 'Pasted image', src, w: image.naturalWidth, h: image.naturalHeight };
            const c = position || { x: this.doc.width / 2, y: this.doc.height / 2 }, scale = Math.min(1, this.doc.width * .7 / a.w, this.doc.height * .7 / a.h);
            this.edit('Import bitmap', () => { this.doc.assets.push(a); const o = createObject('image', { name: a.name, assetId: a.id, x: c.x - a.w / 2, y: c.y - a.h / 2, w: a.w, h: a.h, scaleX: scale, scaleY: scale, fill: 'none' }); this.editKey(this.editableLayer()).objects.push(o); this.selection = [o.id]; });
            await this.renderer.assets.prepare(this.doc);
            this.renderer.lastSignature = '';
            this.setTool('select');
            this.refresh();
            this.toast('Bitmap imported and embedded in the project.');
        }
        catch (error) {
            this.toast(error.message || 'Import failed.', true);
        }
    }
    replaceProject(project) { this.stop(); this.penDraft = null; this.symbolContext = null; this.doc = project; this.frame = 0; this.activeLayer = project.layers.find(l => l.name === 'Explorer')?.id || project.layers.at(-1).id; this.selection = []; this.clipboard = null; this.history = this.makeHistory(); this.autoFit = true; this.timelineScale = 1; this.timelineScroll = 0; this.layerScroll = 0; this.propertyMode = 'object'; this.markChanged(); this.resize(); this.refresh(); }
    showForm(title, description, body, onSubmit, submit = 'Save') { this.stop(); this.closeDialog(); this.dialog.classList.remove('preview-dialog'); $('#dialog-content').innerHTML = `<form id="dialog-form"><div class="dialog-header"><div><h2>${esc(title)}</h2><p>${esc(description)}</p></div><button type="button" class="tiny-button" data-action="dialog-close" aria-label="Close dialog">${icon('close')}</button></div><div class="dialog-body">${body}</div><div class="dialog-footer"><button class="secondary-button" type="button" data-action="dialog-close">Cancel</button><button class="primary-button" type="submit">${esc(submit)}</button></div></form>`; $('#dialog-form').addEventListener('submit', async (e) => { e.preventDefault(); try {
        const result = await onSubmit(new FormData(e.currentTarget));
        if (result !== false)
            this.closeDialog();
    }
    catch (error) {
        this.toast(error.message, true);
    } }); this.dialog.showModal(); const input = $('input:not([type=color]),textarea', this.dialog); if (input) {
        input.focus();
        if (input.type !== 'number')
            input.select();
    } }
    showDialog(title, description, body, footer = '') { this.stop(); this.closeDialog(); this.dialog.classList.remove('preview-dialog'); $('#dialog-content').innerHTML = `<div class="dialog-header"><div><h2>${esc(title)}</h2><p>${esc(description)}</p></div><button class="tiny-button" data-action="dialog-close" aria-label="Close dialog">${icon('close')}</button></div><div class="dialog-body">${body}</div>${footer ? `<div class="dialog-footer">${footer}</div>` : ''}`; this.dialog.showModal(); }
    closeDialog() { if (this.exportController) {
        this.exportController.abort();
        this.exportController = null;
    } this.previewPlaying = false; this.preview = null; if (this.dialog.open)
        this.dialog.close(); this.dialog.classList.remove('preview-dialog'); }
    newDocumentDialog() { this.showForm('A new beginning.', 'Start a new vector animation.', `<label class="dialog-field"><span>Document name</span><input name="name" value="Untitled animation" maxlength="200" required></label><div class="dialog-grid"><label class="dialog-field"><span>Width · pixels</span><input name="width" type="number" min="64" max="8192" value="1280" required></label><label class="dialog-field"><span>Height · pixels</span><input name="height" type="number" min="64" max="8192" value="720" required></label><label class="dialog-field"><span>Frame rate</span><select name="fps"><option>12</option><option selected>24</option><option>25</option><option>30</option><option>60</option></select></label><label class="dialog-field"><span>Duration · frames</span><input name="duration" type="number" min="1" max="3600" value="96" required></label></div><label class="dialog-field"><span>Stage color</span><input name="background" type="color" value="#f7f3eb" style="height:33px;width:100%"></label><p class="dialog-note">The current workspace will be replaced. Save a project file first to keep it.</p>`, data => { const p = createProject(); p.name = data.get('name').trim(); p.width = +data.get('width'); p.height = +data.get('height'); p.fps = +data.get('fps'); p.duration = +data.get('duration'); p.background = data.get('background'); this.replaceProject(p); this.setTool('select'); }, 'Create animation'); }
    renameLayer(layer) { if (!layer)
        return; this.showForm('Rename layer', 'Keep your timeline organized.', `<label class="dialog-field"><span>Layer name</span><input name="name" value="${esc(layer.name)}" required maxlength="100"></label>`, data => this.edit('Rename layer', () => layer.name = data.get('name').trim()), 'Rename'); }
    showTextDialog(existing, position) { this.showForm(existing ? 'Edit your words.' : 'Say something.', 'Editable type, on the stage.', `<label class="dialog-field"><span>Text</span><textarea name="text" required>${esc(existing?.text || 'Hello, possibility.')}</textarea></label><div class="dialog-grid"><label class="dialog-field"><span>Font family</span><select name="fontFamily">${['Arial', 'Georgia', 'Verdana', 'Trebuchet MS', 'Courier New'].map(f => `<option ${f === (existing?.fontFamily || 'Arial') ? 'selected' : ''}>${f}</option>`).join('')}</select></label><label class="dialog-field"><span>Font size · pixels</span><input name="fontSize" type="number" min="1" max="1000" value="${existing?.fontSize || 56}" required></label></div>`, data => { const text = data.get('text'), fontFamily = data.get('fontFamily'), fontSize = +data.get('fontSize'), measure = document.createElement('canvas').getContext('2d'); measure.font = `${existing?.fontWeight || 400} ${fontSize}px "${fontFamily}"`; const w = Math.max(10, ...text.split('\n').map(s => measure.measureText(s).width + 4)), h = Math.max(fontSize * 1.25, text.split('\n').length * fontSize * 1.2); this.edit(existing ? 'Edit text' : 'Insert text', () => { if (existing) {
        this.selection = [existing.id];
        const o = this.editableSelected()[0]?.object;
        if (o)
            Object.assign(o, { text, fontFamily, fontSize, w, h });
    }
    else {
        const p = position || { x: this.doc.width / 2 - w / 2, y: this.doc.height / 2 - h / 2 }, o = createObject('text', { name: text.split('\n')[0].slice(0, 50), x: p.x, y: p.y, w, h, text, fontFamily, fontSize, fontWeight: 400, fill: this.fill });
        this.editKey(this.editableLayer()).objects.push(o);
        this.selection = [o.id];
    } }); this.setTool('select'); }, existing ? 'Apply changes' : 'Add text'); }
    showExport() { const formats = [['html', 'play', 'Animated HTML', 'A self-contained player for any static host.', 'HTML'], ['video', 'image', 'Video', 'Real-time browser recording, without audio.', 'WEBM / MP4'], ['png', 'image', 'Current frame', 'Full-resolution, lossless artwork.', 'PNG'], ['svg', 'pen', 'Vector artwork', 'Editable vectors from the current frame.', 'SVG'], ['sequence', 'layer', 'PNG sequence', 'Every frame plus a timing manifest.', 'ZIP'], ['project', 'save', 'Celesta project', 'Editable layers, symbols, and keyframes.', 'JSON']]; this.showDialog('Let it out into the world.', 'Export your animation. All processing happens in your browser.', `<div class="export-options">${formats.map(([type, ic, title, desc, tag]) => `<button class="export-option" data-action="export-${type}"><span>${icon(ic, 22)}</span><div><strong>${title}</strong><small>${desc}</small><span class="format-badge">${tag}</span></div></button>`).join('')}</div><p class="dialog-note" style="margin-top:18px">${this.doc.width} × ${this.doc.height} · ${this.doc.fps} fps · ${this.doc.duration} frames · ${(this.doc.duration / this.doc.fps).toFixed(2)} seconds<br>Video export is real-time and can drop frames under load. The PNG sequence is the deterministic, frame-exact option.</p>`); }
    async runExport(type) {
        if (this.penDraft)
            this.finishPen();
        const project = clone(type === 'project' ? this.persistableProject() : this.doc), name = safeFilename(project.name), frame = this.frame;
        this.showDialog('Making your export.', 'Your artwork is being rendered locally.', `<div class="export-progress"><progress id="export-progress" max="1" value="0"></progress><p id="export-message">Preparing ${type.toUpperCase()}…</p></div>`, `<button class="secondary-button" data-action="cancel-export">Cancel export</button>`);
        const controller = new AbortController();
        this.exportController = controller;
        const progress = value => { const el = $('#export-progress'); if (el)
            el.value = value; const message = $('#export-message'); if (message)
            message.textContent = `Rendering ${Math.round(value * 100)}% · ${type.toUpperCase()}`; };
        try {
            await this.renderer.assets.prepare(project);
            if (controller.signal.aborted)
                return;
            let blob, filename;
            if (type === 'project') {
                blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
                filename = name + '.celesta.json';
            }
            else if (type === 'svg') {
                blob = new Blob([exportSVG(project, frame)], { type: 'image/svg+xml' });
                filename = name + `-frame-${frame + 1}.svg`;
            }
            else if (type === 'html') {
                blob = new Blob([exportHTML(project)], { type: 'text/html' });
                filename = name + '.html';
            }
            else {
                if (project.width * project.height > 16777216)
                    throw new Error('Raster export is limited to 16 megapixels per frame. Reduce the document dimensions, or export SVG / HTML.');
                if (type === 'png') {
                    const c = document.createElement('canvas');
                    renderCanvasFrame(c.getContext('2d'), project, frame, this.renderer.assets.images);
                    blob = await canvasBlob(c);
                    filename = name + `-frame-${frame + 1}.png`;
                }
                else if (type === 'sequence') {
                    blob = await exportSequence(project, this.renderer.assets.images, progress, controller.signal);
                    filename = name + '-frames.zip';
                }
                else if (type === 'video') {
                    const result = await exportVideo(project, this.renderer.assets.images, progress, controller.signal);
                    blob = result.blob;
                    filename = name + '.' + result.extension;
                }
                else
                    throw new Error('Unknown export format.');
            }
            if (controller.signal.aborted)
                return;
            downloadBlob(blob, filename);
            this.exportController = null;
            this.closeDialog();
            this.toast('Exported ' + filename);
        }
        catch (error) {
            this.exportController = null;
            if (error.name !== 'AbortError') {
                this.closeDialog();
                this.toast(error.message || 'Export failed.', true);
            }
        }
    }
    async showPreview() { this.stop(); if (this.penDraft)
        this.finishPen(); this.showDialog('A little motion.', 'Preview your animation at document frame rate.', `<canvas class="preview-canvas" id="preview-canvas"></canvas><div class="preview-controls"><button class="tiny-button" id="preview-play" data-action="preview-toggle" aria-label="Play or pause preview">${icon('pause')}</button><input type="range" id="preview-range" min="0" max="${this.doc.duration - 1}" value="0" aria-label="Preview frame"><span id="preview-label">1 / ${this.doc.duration}</span></div>`); this.dialog.classList.add('preview-dialog'); const canvas = $('#preview-canvas'); canvas.width = this.doc.width; canvas.height = this.doc.height; this.preview = { canvas, ctx: canvas.getContext('2d'), start: performance.now(), startFrame: 0, frame: 0, drawn: -1, doc: clone(this.doc) }; this.previewPlaying = true; const current = this.preview; await this.renderer.assets.prepare(current.doc); if (this.preview !== current)
        return; $('#preview-range').addEventListener('input', e => { if (!this.preview)
        return; this.preview.frame = +e.target.value; this.preview.startFrame = this.preview.frame; this.preview.start = performance.now(); this.drawPreview(); }); this.invalidate(); }
    tickPreview(now) { if (!this.preview)
        return; const p = this.preview; p.frame = (p.startFrame + Math.floor((now - p.start) / 1000 * p.doc.fps)) % p.doc.duration; if (p.drawn !== p.frame)
        this.drawPreview(); }
    drawPreview() { if (!this.preview)
        return; const p = this.preview; renderCanvasFrame(p.ctx, p.doc, p.frame, this.renderer.assets.images, false); p.drawn = p.frame; $('#preview-range').value = p.frame; $('#preview-label').textContent = `${p.frame + 1} / ${p.doc.duration}`; }
    showHelp() { const shortcuts = [['Selection', 'V'], ['Transform', 'Q'], ['Edit path nodes', 'A'], ['Pen / Brush', 'P / B'], ['Rectangle / Ellipse', 'R / O'], ['Line / Text', 'N / T'], ['Paint / Erase object', 'G / E'], ['Hand / Zoom', 'H / Z'], ['Play / Pause', 'Space'], ['Previous / Next frame', ', / .'], ['Insert key / Blank key', 'F6 / F7'], ['Convert to symbol', 'F8'], ['Group / Ungroup', '⌘ G / ⌘ ⇧ G'], ['Undo / Redo', '⌘ Z / ⌘ ⇧ Z'], ['Duplicate', '⌘ D'], ['Save / Open', '⌘ S / ⌘ O'], ['Fit stage', '⌘ 0'], ['Onion skin', 'Shift O'], ['Finish pen path', 'Enter'], ['Pan / Zoom', 'Wheel / ⌘ Wheel']]; this.showDialog('A few useful shortcuts.', 'Use Ctrl instead of ⌘ on Windows and Linux.', `<div class="shortcut-grid">${shortcuts.map(([name, key]) => `<div class="shortcut-row"><span>${name}</span><kbd>${key}</kbd></div>`).join('')}</div><div class="about-box"><strong>A quick animation recipe</strong><br>Draw on frame 1. Move to frame 24 and press F6. Move or rotate your artwork. Return to frame 1 and choose Create tween. Press Space.<br><br><strong>Pen tool</strong><br>Click to add an anchor; drag while adding it to create Bézier handles. Click the first anchor to close, or press Enter to finish an open path. Use A to edit anchors. Alt-drag a tangent handle to break its symmetry.</div>`); }
    showAbout() { this.showDialog('Animation, with a little wonder.', 'Celesta Studio 1.0 · Independent vector animation software', `<p class="dialog-note">A local-first animation editor built with plain HTML, CSS, and JavaScript. The WebGPU renderer batches tessellated vector geometry and transforms it on the GPU, with 4× multisample antialiasing. Canvas 2D is used for text rasterization, fallback rendering, and raster exports.</p><div class="about-box"><strong>Working authoring features</strong><br>Vector shapes, cubic Bézier paths, brush strokes, text, bitmap and SVG import, layers, graphic symbols, transform editing, frame-by-frame animation, motion and compatible-path shape tweens, easing, onion skins, undo/redo, autosave, and six export options.<br><br><strong>Scope</strong><br>This is an independent Animate-style editor, not an Adobe product or a complete replacement. It does not read FLA/XFL/SWF, execute ActionScript, or implement audio editing, nested movie-clip timelines, masks, inverse kinematics, or complex-path boolean operations. SVG import intentionally omits unsupported constructs and reports them. Shape morphing requires matching anchor topology.</div><p class="dialog-note" style="margin-top:18px">Renderer: ${esc(this.renderer.kind)}. ${this.renderer.kind === 'Canvas 2D' ? esc(this.renderer.reason || '') : ''}<br>Projects stay on this device unless you explicitly save or export them.</p>`); }
    keydown(e) {
        const mod = e.ctrlKey || e.metaKey, key = e.key.toLowerCase();
        if (this.dialog.open)
            return;
        if (this.isTyping(e.target)) {
            if (mod && key === 's') {
                e.preventDefault();
                this.action('save');
            }
            return;
        }
        if (mod) {
            const commands = { s: 'save', o: 'open', n: 'new', e: 'export', z: e.shiftKey ? 'redo' : 'undo', y: 'redo', a: 'select-all', c: 'copy', v: 'paste', x: 'cut', d: 'duplicate', g: e.shiftKey ? 'ungroup' : 'group', '0': 'fit', '+': 'zoom-in', '=': 'zoom-in', '-': 'zoom-out', "'": 'grid', enter: 'preview' };
            if (commands[key]) {
                e.preventDefault();
                this.action(commands[key]);
                return;
            }
            if (e.code === 'BracketLeft' || e.code === 'BracketRight') {
                e.preventDefault();
                this.action(e.code === 'BracketLeft' ? 'send-back' : 'bring-front');
                return;
            }
        }
        if (e.key === 'Escape') {
            e.preventDefault();
            this.hideMenu();
            if (this.penDraft || this.drag) {
                this.penDraft = null;
                this.drag = null;
                this.history.cancel();
            }
            else if (this.symbolContext)
                this.leaveSymbol();
            else {
                this.selection = [];
                this.stop();
            }
            this.refresh();
            return;
        }
        if (e.key === 'Enter' && this.penDraft) {
            e.preventDefault();
            this.finishPen();
            return;
        }
        const commands = { ' ': 'play', f6: 'keyframe', f7: 'blank-keyframe', f8: 'convert-symbol', f5: 'extend', home: 'first', end: 'last', ',': 'prev', '.': 'next', delete: 'delete', backspace: 'delete', '?': 'help' };
        if (commands[key]) {
            e.preventDefault();
            this.action(commands[key]);
            return;
        }
        if (e.shiftKey && key === 'o') {
            e.preventDefault();
            this.action('onion');
            return;
        }
        if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key) && this.selection.length) {
            e.preventDefault();
            const amount = e.shiftKey ? 10 : 1;
            this.edit('Nudge artwork', () => { for (const { object: o } of this.editableSelected()) {
                if (e.key === 'ArrowLeft')
                    o.x -= amount;
                if (e.key === 'ArrowRight')
                    o.x += amount;
                if (e.key === 'ArrowUp')
                    o.y -= amount;
                if (e.key === 'ArrowDown')
                    o.y += amount;
            } });
            return;
        }
        const tool = toolDefinitions.find(t => t[2].toLowerCase() === key);
        if (tool && !mod && !e.altKey) {
            e.preventDefault();
            this.setTool(tool[0]);
            return;
        }
        if (key === 'x')
            this.action('swap-colors');
    }
}
new CelestaApp();
