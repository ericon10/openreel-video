import type { AdjustmentLayer, Clip, TextClip, Track } from "@openreel/core";
import { getSpeedEngine, getBackgroundRemovalEngine, initializeBackgroundRemovalEngine } from "@openreel/core";
import { presetById, presetData, type CameraKey, type PresetDef, type PresetStrength, type StudioPresetData } from "@openreel/core/studio";
import { useProjectStore } from "../../stores/project-store";
import { useTimelineStore } from "../../stores/timeline-store";
import { useEngineStore } from "../../stores/engine-store";
import { PRESETS_TRACK } from "./order";
import { logApplied } from "./log";

// What each preset does to the timeline (Character Studio embed). Camera
// presets become blocks on the Presets track (adjustment layers carrying
// `studio` data) that can be dragged, trimmed, set Subtle/Normal/Strong and
// whose keyframes stay editable. Time presets change the clip under the
// playhead (its speed curve, a freeze, a reversed stretch) and show in its
// Speed panel; text, caption and layout presets change the captions and
// clips they land on. Every change is one undoable step.

export interface PresetResult { ok: boolean; message: string; layerId?: string }

const store = () => useProjectStore.getState();
export const playhead = () => useTimelineStore.getState().playheadPosition;
const uid = () => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `p${Date.now()}${Math.random().toString(36).slice(2, 8)}`);

const tracks = () => store().project.timeline.tracks;
export const presetsTrack = (): Track | undefined => tracks().find((t) => t.name === PRESETS_TRACK && t.role === "effects");
export const videoTracks = (): Track[] => tracks().filter((t) => t.type === "video" && t.clips.length > 0);
export const mainTrack = (): Track | undefined => videoTracks().sort((a, b) => b.clips.length - a.clips.length)[0];

// Where one shot ends and the next begins on the main track.
export function cuts(): number[] {
  const t = mainTrack();
  if (!t) return [];
  const clips = [...t.clips].sort((a, b) => a.startTime - b.startTime);
  const out: number[] = [];
  for (let i = 1; i < clips.length; i++) out.push(Math.round(clips[i]!.startTime * 1000) / 1000);
  return out;
}

export function nearestCut(time: number): number | null {
  const list = cuts();
  if (!list.length) return null;
  return list.reduce((best, c) => (Math.abs(c - time) < Math.abs(best - time) ? c : best), list[0]!);
}

const clipAt = (track: Track | undefined, time: number): Clip | undefined =>
  track?.clips.find((c) => time >= c.startTime && time < c.startTime + c.duration);

// New tracks keep the order in ./order.ts: the Presets track and an
// Overlay go just above the footage, under the captions.
const footageIndex = (): number => {
  const i = tracks().findIndex((t) => t.type === "video" || t.type === "image");
  return i < 0 ? tracks().length : i;
};

async function ensurePresetsTrack(): Promise<string> {
  const existing = presetsTrack();
  if (existing) return existing.id;
  const r = await store().addTrack("graphics", footageIndex(), { name: PRESETS_TRACK, role: "effects" });
  const made = presetsTrack();
  if (!r.success || !made) throw new Error(r.error?.message ?? "The Presets track could not be added.");
  return made.id;
}

const layers = (): AdjustmentLayer[] => [...(store().project.adjustmentLayers ?? [])];

async function setLayers(next: AdjustmentLayer[]): Promise<void> {
  await store().executeAction({ type: "adjustment/setAll", id: uid(), timestamp: Date.now(), params: { layers: next } });
  // OpenReel's adjustment panel edits through its engine; keep it in step.
  useEngineStore.getState().adjustmentLayerEngine?.loadLayers(next);
}

export const presetLayers = (): AdjustmentLayer[] => layers().filter((l) => l.studio);

async function addCameraLayer(def: PresetDef, startTime: number, duration: number, data: StudioPresetData): Promise<string> {
  const trackId = await ensurePresetsTrack();
  const layer: AdjustmentLayer = {
    id: uid(), trackId, name: def.label, startTime: Math.max(0, startTime), duration: Math.max(0.1, duration), effects: [], opacity: 1,
    blendMode: "normal", enabled: true, affectedTracks: "all",
    transform: { position: { x: 0, y: 0 }, scale: { x: 1, y: 1 }, rotation: 0, anchor: { x: 0.5, y: 0.5 }, opacity: 1 },
    studio: data,
  };
  await setLayers([...layers(), layer]);
  return layer.id;
}

// ── Camera presets ──

async function applyCamera(def: PresetDef, strength: PresetStrength, at: number): Promise<PresetResult> {
  let start = at;
  if (def.anchor === "cut") {
    const cut = nearestCut(at);
    if (cut == null) {
      if (def.needs === "shotB") return { ok: false, message: `${def.label} goes on a cut between two shots. Add shot B in the Video step (or Make the close-up), then open the editor again.` };
      start = Math.max(0, at - def.duration / 2);
    } else start = Math.max(0, cut - def.duration / 2);
  }
  const id = await addCameraLayer(def, start, def.duration, presetData(def, strength));
  return { ok: true, message: `${def.label} placed at ${start.toFixed(2)} s. Drag or trim it on the Presets track.`, layerId: id };
}

export async function updatePresetLayer(id: string, patch: { strength?: PresetStrength; keys?: CameraKey[]; startTime?: number; duration?: number }): Promise<void> {
  const next = layers().map((l) => {
    if (l.id !== id || !l.studio) return l;
    return {
      ...l,
      ...(patch.startTime != null ? { startTime: Math.max(0, patch.startTime) } : {}),
      ...(patch.duration != null ? { duration: Math.max(0.1, patch.duration) } : {}),
      studio: { ...l.studio, ...(patch.strength ? { strength: patch.strength } : {}), ...(patch.keys ? { keys: patch.keys } : {}) },
    };
  });
  await setLayers(next);
}

export async function removePresetLayer(id: string): Promise<void> {
  await setLayers(layers().filter((l) => l.id !== id));
}

// ── Time presets (on the clip under the playhead) ──

async function persistSpeed(clip: Clip): Promise<void> {
  const data = getSpeedEngine().getClipSpeedData(clip.id);
  await store().executeAction({ type: "speed/setRampData", id: uid(), timestamp: Date.now(), params: { clipId: clip.id, keyframes: data?.keyframes, freezeFrames: data?.freezeFrames, pitchCorrection: data?.pitchCorrection } });
}

async function applyTime(def: PresetDef, strength: PresetStrength, at: number): Promise<PresetResult> {
  const clip = clipAt(mainTrack(), at);
  if (!clip) return { ok: false, message: "Move the playhead onto a shot first." };
  const speed = getSpeedEngine();
  speed.initializeClip(clip.id, clip.duration);
  const rel = Math.max(0, at - clip.startTime);
  const dur = Math.min(def.duration, Math.max(0.2, clip.duration - rel));
  if (def.speed) {
    for (const p of def.speed) speed.addSpeedKeyframe(clip.id, rel + p.t * dur, p.speed, "ease-in-out");
    // Back to full speed after the moment.
    if (rel + dur + 0.05 < clip.duration) speed.addSpeedKeyframe(clip.id, rel + dur + 0.05, 1, "ease-in-out");
    await persistSpeed(clip);
    return { ok: true, message: `${def.label} on the shot at ${at.toFixed(2)} s. Change it in the shot's Speed panel.` };
  }
  if (def.freeze) {
    speed.createFreezeFrame(clip.id, rel, rel, dur);
    await persistSpeed(clip);
    if (def.id === "record_scratch") {
      // The desaturated hold that sells the moment, as an editable block.
      await addCameraLayer(def, at, dur, { version: 1, preset: def.id, strength, keys: [
        { t: 0, saturation: 1, scale: 1 }, { t: 0.08, saturation: 0.2, scale: 1.06, ease: "out" }, { t: 1, saturation: 0.2, scale: 1.06, ease: "hold" },
      ] });
      await addSound("/studio-sfx/record-scratch.mp3", "Record scratch", at);
    }
    return { ok: true, message: `${def.label} at ${at.toFixed(2)} s for ${dur.toFixed(1)} s.` };
  }
  if (def.reverse) {
    const s1 = await store().splitClip(clip.id, at);
    if (!s1.success) return { ok: false, message: s1.error?.message ?? "The shot could not be split here." };
    const mid = clipAt(mainTrack(), at + 0.01);
    if (!mid) return { ok: false, message: "The shot could not be split here." };
    if (mid.duration > dur + 0.05) await store().splitClip(mid.id, mid.startTime + dur);
    const seg = clipAt(mainTrack(), at + 0.01)!;
    speed.initializeClip(seg.id, seg.duration);
    speed.setReverse(seg.id, true, seg.duration);
    await store().executeAction({ type: "clip/setReverse", id: uid(), timestamp: Date.now(), params: { clipId: seg.id, reversed: true } });
    await addCameraLayer(def, seg.startTime, seg.duration, { version: 1, preset: def.id, strength, keys: [
      { t: 0, rgb: 10, shake: 0.008, saturation: 0.8 }, { t: 0.5, rgb: 6, shake: 0.006 }, { t: 1, rgb: 10, shake: 0.008 },
    ] });
    return { ok: true, message: `Rewind from ${at.toFixed(2)} s.` };
  }
  return { ok: false, message: "That preset has nothing to change here." };
}

// A sound the Studio serves next to the editor, placed on an audio track.
async function addSound(url: string, name: string, at: number): Promise<void> {
  try {
    const res = await fetch(url);
    if (!res.ok) return;
    const file = new File([await res.blob()], `${name}.mp3`, { type: "audio/mpeg" });
    const before = new Set(store().project.mediaLibrary.items.map((i) => i.id));
    const r = await store().importMedia(file);
    const item = store().project.mediaLibrary.items.find((i) => !before.has(i.id));
    if (r.success && item) await store().placeMediaClip(item.id, undefined, at);
  } catch { /* the hold still works without the sound */ }
}

// ── Text and caption presets ──

const textClips = (): TextClip[] => (store().project.textClips ?? []) as TextClip[];
const captionAt = (at: number): TextClip | undefined => {
  const all = textClips();
  return all.find((c) => at >= c.startTime && at < c.startTime + c.duration) ?? all[0];
};

async function applyText(def: PresetDef, at: number): Promise<PresetResult> {
  const cap = captionAt(at);
  if (!cap) return { ok: false, message: "Add a caption first (Text, or the post's Caption step)." };
  const s = store();
  switch (def.textStyle) {
    case "word-by-word":
      s.updateTextAnimation(cap.id, { preset: "word-by-word", params: {}, inDuration: Math.min(1.2, cap.duration * 0.5), outDuration: 0, stagger: 0.12, unit: "word" });
      return { ok: true, message: "The caption now pops in word by word." };
    case "slam":
      s.updateTextAnimation(cap.id, { preset: "zoom-blur", params: { scaleFrom: 1.9, blurAmount: 10 }, inDuration: 0.4, outDuration: 0, stagger: 0, unit: "line" });
      return { ok: true, message: "The caption slams in." };
    case "behind":
      s.updateTextBehindSubject(cap.id, true);
      return { ok: true, message: "The caption sits behind her. The first time, the person cutout loads a small model." };
    case "karaoke": {
      // The caption itself lights up word by word (its place, look and text
      // stay, and it stays editable). Upstream turned it into a subtitle that
      // lost all three. Applying it again turns it off.
      if (!cap.text.trim()) return { ok: false, message: "This caption has no words." };
      if (cap.style.highlightColor) {
        s.updateTextStyle(cap.id, { highlightColor: undefined });
        return { ok: true, message: "Karaoke off for this caption." };
      }
      s.updateTextStyle(cap.id, { highlightColor: KARAOKE_COLOR });
      return { ok: true, message: "Karaoke on this caption: each word lights up in turn. It keeps its place and look; double-click it to change the words." };
    }
  }
  return { ok: false, message: "That text preset is not available." };
}

// The Studio's karaoke color (config/content.yaml caption.karaoke).
const KARAOKE_COLOR = "#ffd60a";

export const UPPER_THIRD = 0.26;
const UPPER_THIRD_Y = UPPER_THIRD;

// The Studio's caption places (config/content.yaml caption.position).
const PLACES: Record<string, number> = { top: 0.16, upper_third: UPPER_THIRD_Y, middle: 0.5, bottom: 0.7 };

// Box (TikTok's white box) or outline (TikTok Classic), at a place.
export function styleCaptions(look: "box" | "outline", place = "upper_third"): number {
  const all = textClips();
  for (const c of all) {
    store().updateTextStyle(c.id, look === "box"
      ? { color: "#000000", backgroundColor: "#ffffff", strokeWidth: 0, fontWeight: 800 }
      : { color: "#ffffff", backgroundColor: "rgba(0,0,0,0)", strokeColor: "#000000", strokeWidth: 10, fontWeight: 800 });
    store().updateTextTransform(c.id, { position: { x: 0.5, y: PLACES[place] ?? UPPER_THIRD_Y } });
  }
  return all.length;
}

async function applyCaptionLook(def: PresetDef): Promise<PresetResult> {
  const all = textClips();
  if (!all.length) return { ok: false, message: "Add a caption first." };
  // Upper third, clear of TikTok's buttons on the right and its caption at the bottom.
  styleCaptions(def.look === "box" ? "box" : "outline");
  return { ok: true, message: `${def.label} on ${all.length === 1 ? "the caption" : `all ${all.length} captions`}, in the upper third.` };
}

// ── Layouts ──

async function ensureVideoTrackAbove(): Promise<string> {
  const r = await store().addTrack("video", footageIndex(), { name: "Overlay" });
  const t = tracks().find((x) => x.type === "video" && x.name === "Overlay" && x.clips.length === 0);
  if (!r.success || !t) throw new Error(r.error?.message ?? "A track could not be added.");
  return t.id;
}

async function applyLayout(def: PresetDef, at: number): Promise<PresetResult> {
  const main = mainTrack();
  const clips = main ? [...main.clips].sort((a, b) => a.startTime - b.startTime) : [];
  const { width, height } = store().project.settings;
  if (def.layout === "greenscreen") {
    const her = clipAt(main, at) ?? clips[0];
    const bg = tracks().flatMap((t) => t.clips).find((c) => c.id !== her?.id && /b-roll/i.test(store().getMediaItem(c.mediaId)?.name ?? ""));
    if (!her || !bg) return { ok: false, message: "Pick B-roll or a screenshot in the Video step first, then open the editor again." };
    const overlay = await ensureVideoTrackAbove();
    await store().moveClip(her.id, her.startTime, overlay);
    await store().moveClip(bg.id, her.startTime, main!.id);
    await setCutout(her.id, true);
    return { ok: true, message: "Her, cut out, over the B-roll. The first time, the person cutout loads a small model." };
  }
  if (clips.length < 2) return { ok: false, message: `${def.label} needs a second shot. Add shot B in the Video step, then open the editor again.` };
  const a = clipAt(main, at) ?? clips[0]!;
  const b = clips.find((c) => c.id !== a.id)!;
  const overlay = await ensureVideoTrackAbove();
  await store().moveClip(b.id, a.startTime, overlay);
  if (def.layout === "split") {
    const half = { x: 0, y: 0.25, width: 1, height: 0.5 };
    await store().updateClipTransform(a.id, { crop: half, fitMode: "contain", position: { x: 0, y: -height / 4 } });
    await store().updateClipTransform(b.id, { crop: half, fitMode: "contain", position: { x: 0, y: height / 4 } });
    return { ok: true, message: "Split screen: the two shots stacked, playing together." };
  }
  const s = 0.34;
  await store().updateClipTransform(b.id, { scale: { x: s, y: s }, borderRadius: 28, position: { x: width / 2 - (width * s) / 2 - 40, y: -height / 2 + (height * s) / 2 + 160 } });
  return { ok: true, message: "Picture-in-picture: shot B small in the top corner. Drag it in the preview to move it." };
}

// The person cutout (OpenReel's background removal) lives in its engine,
// not in the project, so the embed keeps the list and saves it with the
// project for the Studio (`studioCutouts`); it comes back on reopen.
const cutouts = new Set<string>();
export const cutoutIds = (): string[] => [...cutouts].filter((id) => !!store().getClip(id));

export async function setCutout(clipId: string, on: boolean): Promise<void> {
  const engine = getBackgroundRemovalEngine() ?? initializeBackgroundRemovalEngine();
  if (!engine.isInitialized()) await engine.initialize();
  engine.setSettings(clipId, { enabled: on, mode: "transparent", edgeBlur: 3, threshold: 0.6 });
  if (on) cutouts.add(clipId);
  else cutouts.delete(clipId);
}

export async function restoreCutouts(ids: readonly string[]): Promise<void> {
  for (const id of ids) if (store().getClip(id)) await setCutout(id, true).catch(() => undefined);
}

// ── One entry point ──

export async function applyPreset(id: string, strength: PresetStrength, at = playhead()): Promise<PresetResult> {
  const def = presetById(id);
  if (!def) return { ok: false, message: "That preset is not in this version of the editor." };
  try {
    if (def.kind === "camera") return await applyCamera(def, strength, at);
    const r = def.kind === "time" ? await applyTime(def, strength, at)
      : def.kind === "text" ? await applyText(def, at)
      : def.kind === "caption" ? await applyCaptionLook(def)
      : await applyLayout(def, at);
    if (r.ok) logApplied({ preset: def.id, strength, at });
    return r;
  } catch (e) {
    return { ok: false, message: (e as Error).message || "The preset could not be placed." };
  }
}
