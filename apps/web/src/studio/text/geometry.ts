import { wrapWidthFor, type TextClip } from "@openreel/core";
import { useEngineStore } from "../../stores/engine-store";

// Where a caption sits on the preview (Character Studio editor QA,
// 2026-10-15): measured with the same wrapped lines the renderer draws, so
// the selection box, a click on the caption and a double-click to edit all
// find the text where it really is. Upstream estimated the box from the
// character count and only hit-tested shapes.

export interface TextRect { x: number; y: number; width: number; height: number; centerX: number; centerY: number; displayScale: number }

const transparent = (c?: string) => !c || /^transparent$/i.test(c) || /rgba\([^)]*,\s*0(?:\.0+)?\)$/i.test(c.replace(/\s+/g, " "));

// The text block's size in project pixels, before its own scale.
export function measureTextClip(clip: TextClip, projectWidth: number): { width: number; height: number } {
  const { style, text, transform } = clip;
  const engine = useEngineStore.getState().getTitleEngine?.();
  let width: number;
  let height: number;
  if (engine) {
    const m = engine.measureText(text, style, wrapWidthFor(projectWidth, transform.scale.x));
    width = m.width;
    height = m.height;
  } else {
    const lines = text.split("\n");
    height = lines.length * style.fontSize * style.lineHeight;
    width = Math.min(projectWidth * 0.9, style.fontSize * Math.max(...lines.map((l) => l.length)) * 0.6);
  }
  // The box look pads each line; a stroke widens the glyphs.
  if (!transparent(style.backgroundColor)) width += 20;
  const stroke = style.strokeColor && style.strokeWidth ? style.strokeWidth : 0;
  return { width: width + stroke, height: height + stroke };
}

// The largest scale, up to the one asked for, at which the caption is no
// taller than the frame (owner, 2026-10-15). It wraps to stay inside the
// width, so a bigger caption grows taller; the handle stops at the frame.
export function capScaleToFrame(clip: TextClip, project: { width: number; height: number }, want: { x: number; y: number }, measure: (c: TextClip, w: number) => { height: number } = measureTextClip): { x: number; y: number } {
  const at = (k: number): TextClip => ({ ...clip, transform: { ...clip.transform, scale: { x: want.x * k, y: want.y * k } } }) as TextClip;
  const fits = (k: number) => measure(at(k), project.width).height * want.y * k <= project.height;
  if (fits(1)) return want;
  let lo = 0, hi = 1;
  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2;
    if (fits(mid)) lo = mid; else hi = mid;
  }
  const k = Math.max(lo, 0.1 / Math.max(want.x, want.y, 1e-6));
  return { x: want.x * k, y: want.y * k };
}

// The caption's rectangle in the overlay's coordinates (the canvas is
// letterboxed inside its element).
export function textClipRect(clip: TextClip, project: { width: number; height: number }, canvas: HTMLElement, overlay: HTMLElement): TextRect {
  const overlayRect = overlay.getBoundingClientRect();
  const canvasRect = canvas.getBoundingClientRect();
  const canvasAspect = project.width / project.height;
  const elementAspect = canvasRect.width / canvasRect.height;
  let actualWidth: number;
  let actualHeight: number;
  let offX = 0;
  let offY = 0;
  if (elementAspect > canvasAspect) {
    actualHeight = canvasRect.height;
    actualWidth = actualHeight * canvasAspect;
    offX = (canvasRect.width - actualWidth) / 2;
  } else {
    actualWidth = canvasRect.width;
    actualHeight = actualWidth / canvasAspect;
    offY = (canvasRect.height - actualHeight) / 2;
  }
  const displayScale = actualWidth / project.width;
  const size = measureTextClip(clip, project.width);
  const width = size.width * clip.transform.scale.x * displayScale;
  const height = size.height * clip.transform.scale.y * displayScale;
  const centerX = canvasRect.left - overlayRect.left + offX + clip.transform.position.x * project.width * displayScale;
  const centerY = canvasRect.top - overlayRect.top + offY + clip.transform.position.y * project.height * displayScale;
  return { x: centerX - width / 2, y: centerY - height / 2, width, height, centerX, centerY, displayScale };
}

// The caption under a point, topmost track first (a track paints over the
// ones below it). A few pixels of slack make thin captions easy to hit.
export function textClipAtPoint(
  clips: TextClip[], time: number, trackOrder: string[], project: { width: number; height: number },
  canvas: HTMLElement, overlay: HTMLElement, clientX: number, clientY: number,
): TextClip | null {
  const overlayRect = overlay.getBoundingClientRect();
  const px = clientX - overlayRect.left;
  const py = clientY - overlayRect.top;
  const rank = (c: TextClip) => { const i = trackOrder.indexOf(c.trackId); return i < 0 ? 1e6 : i; };
  const active = clips.filter((c) => time >= c.startTime && time < c.startTime + c.duration).sort((a, b) => rank(a) - rank(b));
  for (const c of active) {
    const r = textClipRect(c, project, canvas, overlay);
    const slack = 6;
    if (px >= r.x - slack && px <= r.x + r.width + slack && py >= r.y - slack && py <= r.y + r.height + slack) return c;
  }
  return null;
}
