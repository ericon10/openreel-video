import type { Project } from "@openreel/core";
import { getExportEngine } from "@openreel/core";
import { useProjectStore } from "../stores/project-store";
import type { StudioParams } from "./params";
import { memoryFile } from "./sink";
import { applyPreset, cutoutIds, restoreCutouts } from "./presets/actions";
import { orderStudioTracks } from "./presets/order";

// The Studio side of the editor: load a post onto the timeline, and save
// the export and the project back to the post. The Studio is the source of
// truth for media (its assets in R2); the editor keeps no copy of its own.

export interface StudioMedia {
  id: string;
  name: string;
  kind: "video" | "audio" | "image";
  url: string;
  role: "clip" | "broll" | "music" | "ambience" | "voice";
  // Where it sits on the timeline and which part of the source plays.
  start: number;
  in: number;
  out: number | null;
}

export interface StudioCaption {
  text: string;
  start: number;
  end: number | null;
}

export interface StudioManifest {
  post: { id: string; title: string };
  canvas: { width: number; height: number; fps: number };
  media: StudioMedia[];
  captions: StudioCaption[];
  duration: number;
  // Spots the Studio suggests (the payoff); one click moves the playhead.
  suggestions?: Array<{ label: string; time: number; why: string }>;
  // The post's Format from the Idea step: a preset placed on first open.
  format?: { preset: string; strength: "subtle" | "normal" | "strong" } | null;
  // The saved editor project (media blobs left out), when the post was
  // edited before.
  project: (Project & { studioMedia?: Record<string, string>; studioCutouts?: string[] }) | null;
}

async function json<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } } & T;
  if (!res.ok) throw new Error(body.error?.message || `The Studio answered ${res.status}.`);
  return body;
}

export async function loadManifest(p: StudioParams): Promise<StudioManifest> {
  return json<StudioManifest>(await fetch(`${p.api}/content/${p.post}/editor`, { credentials: "same-origin" }));
}

async function fetchFile(m: StudioMedia): Promise<File> {
  // Same origin first; a video may redirect to storage (R2 allows GET from
  // the Studio's origin).
  const res = await fetch(m.url, { credentials: "same-origin" });
  if (!res.ok) throw new Error(`${m.name} could not be loaded (${res.status}).`);
  const blob = await res.blob();
  const type = blob.type || (m.kind === "video" ? "video/mp4" : m.kind === "audio" ? "audio/mpeg" : "image/png");
  const ext = type.split("/")[1]?.replace("mpeg", "mp3").replace("quicktime", "mov") || "bin";
  return new File([blob], `${m.name}.${ext}`, { type, lastModified: 0 });
}

const store = () => useProjectStore.getState();

async function importOne(m: StudioMedia): Promise<string> {
  const file = await fetchFile(m);
  const before = new Set(store().project.mediaLibrary.items.map((i) => i.id));
  const r = await store().importMedia(file);
  if (!r.success) throw new Error(`${m.name}: ${r.error?.message ?? "could not be imported"}`);
  const item = store().project.mediaLibrary.items.find((i) => !before.has(i.id));
  if (!item) throw new Error(`${m.name} did not reach the media library.`);
  return item.id;
}

// A new timeline from the post: its shots in order on the video track,
// B-roll where the cut puts it, the sound bed on audio tracks, and the
// captions as text.
async function assemble(manifest: StudioManifest, onStep: (s: string) => void): Promise<Record<string, string>> {
  const { width, height, fps } = manifest.canvas;
  store().createNewProject(manifest.post.title || "Studio post", { width, height, frameRate: fps });
  const ids: Record<string, string> = {};
  for (const [i, m] of manifest.media.entries()) {
    onStep(`Loading ${m.name} (${i + 1} of ${manifest.media.length})...`);
    const mediaId = await importOne(m);
    ids[mediaId] = m.id;
    const placed = await store().placeMediaClip(mediaId, undefined, m.start);
    if (!placed.success) throw new Error(`${m.name}: ${placed.error?.message ?? "could not be placed"}`);
    const clip = store().project.timeline.tracks.flatMap((t) => t.clips).find((c) => c.mediaId === mediaId);
    if (clip && (m.in > 0 || m.out != null)) await store().trimClip(clip.id, m.in, m.out ?? undefined);
  }
  if (manifest.captions.length) {
    onStep("Adding the captions...");
    // On top: a track paints over the ones below it.
    const added = await store().addTrack("text", 0, { role: "captions", name: "Captions" });
    const track = store().project.timeline.tracks.find((t) => t.type === "text");
    if (added.success && track) {
      for (const c of manifest.captions) {
        const end = c.end ?? manifest.duration;
        store().createTextClip(track.id, c.start, c.text, Math.max(0.5, end - c.start), {
          fontSize: 64, fontWeight: 800, color: "#ffffff", strokeColor: "#000000", strokeWidth: 6, textAlign: "center",
        });
      }
    }
  }
  // The suggested spots as markers, and the post's Format placed once.
  for (const spot of manifest.suggestions ?? []) await store().addMarker(spot.time, spot.label, "#ff6a3d");
  if (manifest.format) {
    onStep("Placing the format's edit...");
    const payoff = manifest.suggestions?.find((x) => /payoff/i.test(x.label))?.time ?? Math.max(0, manifest.duration - 2);
    await applyPreset(manifest.format.preset, manifest.format.strength, payoff);
  }
  return ids;
}

// A saved project comes back with its media fetched again from the Studio.
async function reopen(manifest: StudioManifest, onStep: (s: string) => void): Promise<Record<string, string>> {
  const saved = manifest.project!;
  const map = saved.studioMedia ?? {};
  const items = [];
  for (const item of saved.mediaLibrary.items) {
    const assetId = map[item.id];
    const m = manifest.media.find((x) => x.id === assetId);
    if (!m) { items.push(item); continue; }
    onStep(`Loading ${m.name}...`);
    const file = await fetchFile(m);
    items.push({ ...item, blob: file, fileHandle: null, isPlaceholder: false });
  }
  store().loadProject({ ...saved, mediaLibrary: { items }, timeline: { ...saved.timeline, tracks: orderStudioTracks(saved.timeline.tracks) } });
  if (saved.studioCutouts?.length) {
    onStep("Loading the person cutout...");
    await restoreCutouts(saved.studioCutouts);
  }
  return map;
}

export async function openPost(p: StudioParams, onStep: (s: string) => void): Promise<{ manifest: StudioManifest; media: Record<string, string> }> {
  onStep("Opening the post...");
  const manifest = await loadManifest(p);
  const media = manifest.project ? await reopen(manifest, onStep) : await assemble(manifest, onStep);
  return { manifest, media };
}

// The project as JSON for the Studio: no blobs, file handles or object
// URLs; media are named by their Studio asset ids.
export function projectForStudio(media: Record<string, string>): unknown {
  const project = store().project;
  return {
    ...project,
    studioMedia: media,
    studioCutouts: cutoutIds(),
    mediaLibrary: {
      items: project.mediaLibrary.items.map((i) => ({
        ...i, blob: null, fileHandle: null, thumbnailUrl: null, waveformData: null, filmstripThumbnails: [],
      })),
    },
  };
}

async function upload(p: StudioParams, blob: Blob, name: string): Promise<string> {
  const type = blob.type || "video/mp4";
  const { slots } = await json<{ slots: Array<{ uploadId: string; url: string; method: string; headers: Record<string, string> }> }>(
    await fetch(`${p.api}/uploads`, {
      method: "POST", credentials: "same-origin", headers: { "content-type": "application/json", "x-studio-request": "1" },
      body: JSON.stringify({ files: [{ name, type, size: blob.size }] }),
    }),
  );
  const slot = slots[0]!;
  // A presigned storage link carries its own authorization; the local
  // driver's link is the Studio's own (same origin, with the session).
  const local = slot.url.startsWith("/");
  const put = await fetch(slot.url, { method: "PUT", headers: { ...slot.headers, ...(local ? { "x-studio-request": "1" } : {}) }, body: blob, credentials: local ? "same-origin" : "omit" });
  if (!put.ok) throw new Error(`The upload to the Studio failed (${put.status}).`);
  return slot.uploadId;
}

// The export format this browser can encode: MP4 with H.264 (Chrome and
// Edge), else WebM with VP9. The Studio's worker makes either one the same
// plain MP4 (1080x1920, 30 fps, H.264, AAC), so the post never depends on
// the browser's encoder.
async function exportFormat(width: number, height: number, fps: number): Promise<{ format: "mp4" | "webm"; codec: "h264" | "vp9"; audio: "aac" | "ogg"; mime: string }> {
  const h264 = typeof VideoEncoder !== "undefined" && (await VideoEncoder.isConfigSupported({ codec: "avc1.640028", width, height, bitrate: 12e6, framerate: fps }).catch(() => ({ supported: false }))).supported;
  const aac = typeof AudioEncoder !== "undefined" && (await AudioEncoder.isConfigSupported({ codec: "mp4a.40.2", sampleRate: 48000, numberOfChannels: 2, bitrate: 192000 }).catch(() => ({ supported: false }))).supported;
  return h264 && aac ? { format: "mp4", codec: "h264", audio: "aac", mime: "video/mp4" } : { format: "webm", codec: "vp9", audio: "ogg", mime: "video/webm" };
}

// Done: export the timeline in this browser, upload it, and hand the Studio
// the video and the project.
export async function saveToStudio(p: StudioParams, media: Record<string, string>, onStep: (s: string) => void): Promise<void> {
  const engine = getExportEngine();
  if (!engine.isInitialized?.()) await engine.initialize();
  const project = store().project;
  const { width, height, frameRate } = project.settings;
  const f = await exportFormat(width, height, frameRate);
  onStep("Exporting the video...");
  const file = memoryFile();
  const gen = engine.exportVideo(project, {
    format: f.format, codec: f.codec, width, height, frameRate, bitrate: 12000, bitrateMode: "vbr", quality: 85, keyframeInterval: 2,
    audioSettings: { format: f.audio, sampleRate: 48000, bitDepth: 16, bitrate: 192000, channels: 2 },
  }, file.writable);
  let step = await gen.next();
  while (!step.done) {
    const pr = step.value as { progress?: number };
    if (typeof pr.progress === "number") onStep(`Exporting the video... ${Math.round(pr.progress * (pr.progress <= 1 ? 100 : 1))}%`);
    step = await gen.next();
  }
  const result = step.value;
  if (!result.success) throw new Error(result.error?.message || "The export did not finish.");
  const blob = result.blob ?? file.blob(f.mime);
  if (!blob.size) throw new Error("The export came out empty. Press Done again.");
  onStep("Saving to the post...");
  const uploadId = await upload(p, blob, `${p.post}-edit.${f.format}`);
  await json(await fetch(`${p.api}/content/${p.post}/editor`, {
    method: "POST", credentials: "same-origin", headers: { "content-type": "application/json", "x-studio-request": "1" },
    body: JSON.stringify({ uploadId, project: projectForStudio(media) }),
  }));
}
