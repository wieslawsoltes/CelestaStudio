# Celesta architecture

## Separation of responsibilities

The scene document is the source of truth. Neither the timeline's Canvas 2D pixels nor the stage's GPU buffers are document state. Drawing, scrubbing, history, import, export, and symbol editing all operate on or evaluate the same serializable model.

`model.js` and `math.js` are DOM-independent. `renderer.js` consumes evaluated scene primitives. `importer.js` reconstructs typed objects rather than inserting foreign markup. `exporter.js` evaluates the scene independently of the editor viewport. `app.js` coordinates the UI and editing transactions.

The UI shell is native DOM/CSS, not a UI framework or a GPU imitation of HTML controls. The stage is a WebGPU canvas when available. A separate Canvas 2D overlay renders editor-only handles, guides, and selection indicators. The timeline is another Canvas 2D surface. GPU acceleration is therefore an explicit **stage-rendering architecture**, not a claim that every UI operation is GPU-based.

## Document model

A version-1 project has the following structure; omitted properties have validated defaults:

```js
{
  format: 'celesta', version: 1,
  name: 'Animation', width: 1280, height: 720,
  fps: 24, duration: 96, background: '#f7f3eb',
  layers: [{
    id: 'layer-1', name: 'Artwork', color: '#a78bfa',
    visible: true, locked: false, opacity: 1,
    keys: [{
      frame: 0, tween: 'motion', ease: 'ease-in-out',
      objects: [{
        id: 'shape-1', type: 'rect', name: 'Rectangle',
        x: 100, y: 100, w: 160, h: 80,
        scaleX: 1, scaleY: 1, rotation: 0, skewX: 0,
        fill: '#a78bfa', stroke: 'none', strokeWidth: 0,
        opacity: 1
      }]
    }]
  }],
  symbols: [], assets: [], guides: []
}
```

Frames are zero-based internally and one-based in the UI. `duration` is a frame count, so the valid range is `[0, duration - 1]`. Layers are stored back-to-front; the timeline presents them front-to-back. Keyframes are sorted. Each key owns a complete snapshot of the objects on that layer; there is no implicit sharing of mutable object instances across keys.

Object IDs identify interpolation correspondences across keys in one layer. Root object IDs cannot be shared across layers. Duplication and cross-layer keyframe movement reidentify artwork. Symbols reference separate shared definitions by `symbolId`; nested static references are accepted, but cycles are rejected.

`guides` is reserved document space; arbitrary imported guide data is not implemented as a guide-authoring feature.

## Evaluation and tweening

`keyAt(layer, frame)` locates the preceding key by binary search. With no preceding key the layer is empty. Hold spans return that key's artwork. A motion or shape span finds same-ID objects in the following key and interpolates supported properties. Objects without a compatible following object are held until the boundary; the next key then becomes authoritative.

Interpolation preserves source keys. Transform, opacity, color, dimensions, and supported style properties are evaluated numerically; easing can deliberately overshoot positions/rotation while dimensions and alpha are clamped to valid ranges. Shape interpolation also matches the path anchor counts and interpolates corresponding anchors and tangent coordinates. It is not automatic topology matching.

`ensureKey()` evaluates the current pose before inserting a snapshot. This prevents an auto-key edit in the middle of a span from snapping to its starting pose. F6 preserves an existing object selection when possible. Changing frame selection does not modify the document.

`flattenScene()` expands groups and graphic symbols into primitive draw entries with world matrices and inherited alpha. Visibility is respected. Layer locking only restricts editing; it does not suppress rendering.

## Affine math and editing

Transforms use six-component column-vector affine matrices:

```
[a c tx]
[b d ty]
[0 0  1]
```

Document math is JavaScript double precision. Objects use a center pivot, rotation, scale, and horizontal skew. Parent/child matrices are composed explicitly. `assignMatrix()` decomposes an arbitrary nonsingular affine transform back to the model, including reflected scale. Grouping and break-apart preserve complete composed transforms rather than just adjusting x/y.

Hit testing applies the inverse world matrix, tests fill interiors and stroke distances in object space, and traverses painter order from front to back. This is geometric hit testing, not pixel-color picking. Selection bounds are conservative transformed object boxes. Pen/path editing supports separate anchor and in/out tangent data.

## Transaction boundary

A pointer gesture begins a `History` transaction and modifies the selected keyframe objects while dragging. Commit stores one before/after document pair; cancel restores the original. No-op transactions are discarded. Normal menu/property edits use the same transaction layer. Undo and redo replace the document and invalidate derived UI/render state.

This deliberately uses bounded snapshots rather than a command-delta log: up to 100 past entries and approximately 64 MiB of accounted serialized history, with one large entry retained when necessary. That makes complex group/symbol operations reliable and simple to inspect, but is not optimal for very large embedded assets. Serialization allocations and past/future history must be included in memory profiling.

## WebGPU render pipeline

Vector geometry is tessellated on the CPU and cached in local coordinates. Cubic Bézier paths use adaptive subdivision; simple concave polygon fills use ear clipping. Strokes become triangle meshes with miter joins and round end caps. Ellipses use triangle fans. This is **not** a compute-shader tessellator or a general polygon Boolean engine.

### Buffer layout

Each vertex is 40 bytes:

| Byte offset | Format | Meaning |
| --- | --- | --- |
| 0 | float32x2 | Local-space position |
| 8 | float32x4 | Unpremultiplied vertex RGBA |
| 24 | float32x2 | Atlas UV |
| 32 | float32 | Transform-record index |
| 36 | float32 | Textured flag |

The transform storage buffer uses 32 bytes per draw entry:

```
vec4f linear = [a, b, c, d]
vec4f offset = [tx, ty, alpha, reserved]
```

The 32-byte camera uniform carries physical viewport dimensions and pan/zoom. WGSL transforms local vertices through the per-object matrix and camera before conversion to clip space. Geometry is uploaded as Float32 after double-precision scene evaluation.

Draw entries remain in painter order. Their meshes are concatenated into one triangle stream, with the transform-record index patched per entry. That permits a single draw call for the visible stage batch without reordering transparent artwork. The pass uses a 4× MSAA attachment, stage scissor, and premultiplied source-over blending.

The mesh cache is keyed by geometry and paint properties. A scene signature detects when the combined stream must be rebuilt. Transform-only animation ordinarily reuses the vertex stream and updates the transform storage buffer. Object visibility, atlas readiness, geometry, text, style, or ordering changes can require rebuilding. CPU scene evaluation, signatures, and transform arrays are still allocated/evaluated each frame; this is not a fully allocation-free renderer.

GPU buffers grow geometrically. Stage culling uses conservative object bounds. More sophisticated spatial indexing and viewport-scaled curve tolerances are possible extension points, not present features.

### Text and bitmaps

Browser Canvas 2D rasterizes individual text objects into a texture atlas; imported bitmap assets are also packed there. Ordinary vectors remain GPU triangles. The implementation does **not** rasterize the complete stage to a canvas and then label its upload a WebGPU renderer.

The atlas is at most 4096×4096, capped by the adapter's limit, and uses a simple shelf allocator. Large source bitmaps are resampled to at most 1024 pixels on an axis for the interactive GPU atlas. Text tiles are bounded and rasterized at up to 2× scale. Native-resolution raster exports use the source images, not the preview atlas. Atlas limits and text-box bounds can make extreme zoom or very large text differ from the Canvas reference path.

The current allocator is append-only. Atlas exhaustion switches to Canvas 2D rather than silently omitting artwork. A production atlas manager should add reclamation, content-versioned invalidation for assets replaced under the same identifier, oversized-resource handling, and residency metrics. These are documented remaining lifecycle concerns.

### Failure behavior and measurements

Initialization requests an adapter/device, checks shader compilation messages, and creates the pipeline asynchronously. Uncaptured GPU validation errors and device loss trigger resource cleanup and a replacement Canvas 2D stage. The HTML badge exposes the backend and the tooltip exposes the fallback reason.

`submitMs` measures CPU elapsed time spent preparing/submitting the render operation. It is not GPU execution time or end-to-end frame latency. Triangle and draw-call counts come from the actual generated stream. GPU timestamp queries and cross-device benchmarks have not been implemented or claimed.

## Storage, import, and security boundary

Imported JSON is reconstructed into a fresh recognized schema with bounded dimensions, timelines, nesting, object counts, and path point counts. Unknown properties do not become executable object state. Embedded image data is limited to accepted raster MIME types; external image URLs are not accepted by the project validator. Symbol cycles and ambiguous root identifiers are rejected.

SVG is parsed in an inert document and supported primitives are rebuilt as Celesta objects. Script elements, foreign content, and unsupported effects are not adopted into the application DOM. Exported XML strings escape user text; embedded player JSON escapes `<` and Unicode script separators. There is no application-level evaluation of user scripts.

These measures are not a sandbox proof or fuzzing result. SVG and path complexity, browser image decoding, resource exhaustion, and validation edge cases require further adversarial testing for use as a public upload service. Local trusted authoring is the delivery's tested workflow.

IndexedDB stores one cloned autosave document after a debounce. Explicit JSON save is independent of that facility. An unavailable storage API does not prevent editing. A full document-management layer would require multiple records, conflict resolution across tabs, storage-quota handling, and backup UX beyond the current recovery document.

## Exports and testing

PNG, video, and sequence exports use the same evaluated scene and Canvas 2D drawing primitives at document resolution, not the on-screen stage bitmap. SVG exports evaluated world transforms. HTML includes an independent self-contained player with equivalent supported tween semantics; it does not include editor tools.

The core tests exercise affine composition/decomposition, interpolation, history, safe reconstruction, parsers, the complete demo, SVG/HTML serialization, and ZIP CRC/header correctness. Browser checks drive real pointer/keyboard interactions and exported files. The recorded run used the Canvas 2D fallback. Run the supplied suite on served origins and actual GPUs before drawing conclusions about WebGPU compatibility, pixel parity, or throughput.
