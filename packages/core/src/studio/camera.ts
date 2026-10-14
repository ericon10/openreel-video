import { cameraAt, shakeOffset, type CameraFrame, type StudioPresetData } from "./presets";

// Draws a camera preset over the frame below it (fork only; the Character
// Studio embed). The frame is the composite of every track under the block's
// own track, so captions on a track above it stay still and readable.
// The same math runs in the preview and in the export, and the Studio's
// worker mirrors it, so what the owner sees is what renders.

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export interface StudioLayerLike {
  readonly trackId?: string;
  readonly startTime: number;
  readonly duration: number;
  readonly enabled: boolean;
  readonly opacity: number;
  readonly studio?: StudioPresetData;
}

export function studioFrameAt(layer: StudioLayerLike, time: number): CameraFrame | null {
  if (!layer.studio || !layer.enabled || layer.duration <= 0) return null;
  if (time < layer.startTime || time >= layer.startTime + layer.duration) return null;
  const u = (time - layer.startTime) / layer.duration;
  return cameraAt(layer.studio.keys, u, layer.studio.strength);
}

const isIdentity = (f: CameraFrame) =>
  f.scale === 1 && !f.x && !f.y && !f.rotation && !f.blur && !f.motionBlur && !f.rgb && !f.flash && !f.dark && !f.shake && f.saturation === 1 && f.brightness === 1 && !f.vignette;

function snapshot(ctx: Ctx2D, w: number, h: number): OffscreenCanvas {
  const copy = new OffscreenCanvas(w, h);
  copy.getContext("2d")!.drawImage(ctx.canvas as CanvasImageSource, 0, 0, w, h);
  return copy;
}

// Returns true when it drew anything.
export function applyStudioCamera(ctx: Ctx2D, layer: StudioLayerLike, time: number, width: number, height: number): boolean {
  const f = studioFrameAt(layer, time);
  if (!f || isIdentity(f)) return false;
  const px = width / 1080;
  const shake = shakeOffset(time, f.shake);
  const src = snapshot(ctx, width, height);

  // The picture: scaled around the centre, shifted, rotated, with filters.
  const filters: string[] = [];
  if (f.blur > 0) filters.push(`blur(${(f.blur * px).toFixed(2)}px)`);
  if (f.saturation !== 1) filters.push(`saturate(${f.saturation.toFixed(3)})`);
  if (f.brightness !== 1) filters.push(`brightness(${f.brightness.toFixed(3)})`);
  const place = (target: Ctx2D, img: CanvasImageSource, dx = 0, alpha = 1) => {
    target.save();
    target.globalAlpha = alpha;
    target.translate(width / 2 + (f.x + shake.dx) * width + dx, height / 2 + (f.y + shake.dy) * height);
    target.rotate(((f.rotation + shake.rot) * Math.PI) / 180);
    target.scale(f.scale, f.scale);
    target.drawImage(img, -width / 2, -height / 2, width, height);
    target.restore();
  };

  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = Math.max(0, Math.min(1, layer.opacity));
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, width, height);
  ctx.filter = filters.length ? filters.join(" ") : "none";
  place(ctx, src);
  ctx.filter = "none";

  // A motion streak: faint copies along the move.
  if (f.motionBlur > 0.02) {
    const steps = 4;
    const spread = f.motionBlur * 0.06 * width;
    for (let i = 1; i <= steps; i++) {
      const off = (i / steps) * spread;
      place(ctx, src, off, (0.22 * f.motionBlur) / i);
      place(ctx, src, -off, (0.22 * f.motionBlur) / i);
    }
  }

  // RGB split: red and blue shifted apart, added over the picture.
  if (f.rgb > 0.2) {
    const d = f.rgb * px;
    for (const [color, dx] of [["#ff0000", -d], ["#00ffff", d]] as const) {
      const tint = new OffscreenCanvas(width, height);
      const t = tint.getContext("2d")!;
      t.drawImage(ctx.canvas as CanvasImageSource, 0, 0, width, height);
      t.globalCompositeOperation = "multiply";
      t.fillStyle = color;
      t.fillRect(0, 0, width, height);
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      ctx.globalAlpha = 0.55;
      ctx.drawImage(tint, dx, 0, width, height);
      ctx.restore();
    }
  }

  if (f.vignette > 0) {
    const g = ctx.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.3, width / 2, height / 2, Math.max(width, height) * 0.75);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, `rgba(0,0,0,${(0.85 * f.vignette).toFixed(3)})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, width, height);
  }
  if (f.dark > 0) {
    ctx.fillStyle = `rgba(0,0,0,${f.dark.toFixed(3)})`;
    ctx.fillRect(0, 0, width, height);
  }
  if (f.flash > 0) {
    ctx.fillStyle = `rgba(255,255,255,${f.flash.toFixed(3)})`;
    ctx.fillRect(0, 0, width, height);
  }
  ctx.restore();
  return true;
}

// The painter's loops call this as they reach each track (bottom to top):
// the presets on that track move everything drawn so far.
export function applyStudioTrack(ctx: Ctx2D, layers: readonly StudioLayerLike[] | undefined, trackId: string, time: number, width: number, height: number): boolean {
  let drew = false;
  for (const layer of layers ?? []) {
    if (layer.studio && layer.trackId === trackId) drew = applyStudioCamera(ctx, layer, time, width, height) || drew;
  }
  return drew;
}

// The last pass only handles a preset whose track is gone (it then moves the
// whole frame); a hidden Presets track switches its presets off.
export function studioLayerOrphaned(layer: StudioLayerLike, trackIds: ReadonlySet<string>): boolean {
  return !!layer.studio && (!layer.trackId || !trackIds.has(layer.trackId));
}
