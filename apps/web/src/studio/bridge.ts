import type { Project } from "@openreel/core";
import { AudioDucker, getExportEngine } from "@openreel/core";
import { buildTriggerTrackBuffer } from "../components/editor/inspector/AudioDuckingSection";
import { useProjectStore } from "../stores/project-store";
import type { StudioParams } from "./params";
import { memoryFile } from "./sink";
import type { SavedStyle, StyleItem } from "@openreel/core/studio";
import { applyPreset, cutoutIds, restoreCutouts, styleCaptions } from "./presets/actions";
import { orderStudioTracks } from "./presets/order";
import { exportProject, findBeatsInMusic, getMusicInExport, markMusic, musicMediaIds, restoreBeats, savedBeats, type SavedBeats } from "./presets/beat";
import { appliedPresets, clearApplied, restoreApplied, type AppliedPreset } from "./presets/log";
import { applyStack, currentStack } from "./presets/styles";

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
  // The post's caption look and place (the Studio's default otherwise).
  captionLook?: { style: "box" | "outline"; position: string };
  duration: number;
  // Spots the Studio suggests (the payoff); one click moves the playhead.
  suggestions?: Array<{ label: string; time: number; why: string }>;
  // The post's Format from the Idea step: a preset placed on first open.
  format?: { preset: string; strength: "subtle" | "normal" | "strong" } | null;
  // A stack carried from "Make another like this": placed on first open.
  stack?: StyleItem[] | null;
  // The account's saved styles, for the Presets tab.
  styles?: SavedStyle[];
  // The post's sound bed: duck the music under the voice (or the clip's own
  // sound), as the Studio's render does.
  sound?: { duck: boolean; clipSound: boolean };
  // The saved editor project (media blobs left out), when the post was
  // edited before.
  project: (Project & StudioExtras) | null;
}

// What the embed keeps in the project JSON beside OpenReel's own fields.
interface StudioExtras {
  studioMedia?: Record<string, string>;
  studioCutouts?: string[];
  studioBeats?: SavedBeats | null;
  studioMusic?: string[];
  studioMusicInExport?: boolean;
  studioApplied?: AppliedPreset[];
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
  // M4A music is served as audio/mp4: name it .m4a, not .mp4.
  const ext = type === "audio/mp4" ? "m4a" : type.split("/")[1]?.replace("mpeg", "mp3").replace("quicktime", "mov") || "bin";
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
async function assemble(manifest: StudioManifest, onStep: (s: string) => void, warnings: string[]): Promise<Record<string, string>> {
  const { width, height, fps } = manifest.canvas;
  store().createNewProject(manifest.post.title || "Studio post", { width, height, frameRate: fps });
  const ids: Record<string, string> = {};
  clearApplied();
  for (const [i, m] of manifest.media.entries()) {
    onStep(`Loading ${m.name} (${i + 1} of ${manifest.media.length})...`);
    // One file that does not load leaves the rest of the post editable
    // (editor QA 2026-10-15: unsupported music used to stop the whole open).
    try {
      const mediaId = await importOne(m);
      ids[mediaId] = m.id;
      if (m.role === "music") markMusic(mediaId);
      const placed = await store().placeMediaClip(mediaId, undefined, m.start);
      if (!placed.success) throw new Error(`${m.name}: ${placed.error?.message ?? "could not be placed"}`);
      const clip = store().project.timeline.tracks.flatMap((t) => t.clips).find((c) => c.mediaId === mediaId);
      // Sound ends with the post, as in the Studio's render: a longer music
      // bed used to stretch the timeline and Done's export past the video
      // (editor QA, 2026-10-15).
      const soundEnd = m.kind === "audio" && clip && m.start + clip.duration - m.in > manifest.duration + 0.01 ? m.in + Math.max(0.1, manifest.duration - m.start) : null;
      const out = m.out != null && soundEnd != null ? Math.min(m.out, soundEnd) : m.out ?? soundEnd;
      if (clip && (m.in > 0 || out != null)) await store().trimClip(clip.id, m.in, out ?? undefined);
    } catch (e) {
      warnings.push((e as Error).message);
    }
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
      // The same look and place the Studio's own render gives them.
      styleCaptions(manifest.captionLook?.style ?? "box", manifest.captionLook?.position ?? "upper_third");
    }
  }
  // The music ducked under the voice (or the clip's own sound), as the
  // Studio's render does; the export follows the volume keys it writes.
  if (manifest.sound?.duck !== false) {
    onStep("Ducking the music under the voice...");
    await duckMusic(ids, manifest, warnings);
  }
  // The suggested spots as markers; the beat of the post's music.
  for (const spot of manifest.suggestions ?? []) await store().addMarker(spot.time, spot.label, "#ff6a3d");
  if (musicMediaIds().length) {
    onStep("Finding the beat in the music...");
    await findBeatsInMusic();
  }
  // A stack carried from the post this one was made like, else the Format.
  if (manifest.stack?.length) {
    onStep("Placing the presets from the post this is like...");
    await applyStack(manifest.stack);
  } else if (manifest.format) {
    onStep("Placing the format's edit...");
    const payoff = manifest.suggestions?.find((x) => /payoff/i.test(x.label))?.time ?? Math.max(0, manifest.duration - 2);
    await applyPreset(manifest.format.preset, manifest.format.strength, payoff);
  }
  return ids;
}

// A saved project comes back with its media fetched again from the Studio.
async function reopen(manifest: StudioManifest, onStep: (s: string) => void, warnings: string[]): Promise<Record<string, string>> {
  const saved = manifest.project!;
  const map = saved.studioMedia ?? {};
  const items = [];
  for (const item of saved.mediaLibrary.items) {
    const assetId = map[item.id];
    const m = manifest.media.find((x) => x.id === assetId);
    if (!m) { items.push(item); continue; }
    onStep(`Loading ${m.name}...`);
    try {
      const file = await fetchFile(m);
      items.push({ ...item, blob: file, fileHandle: null, isPlaceholder: false });
    } catch (e) {
      warnings.push((e as Error).message);
      items.push(item);
    }
  }
  store().loadProject({ ...saved, mediaLibrary: { items }, timeline: { ...saved.timeline, tracks: orderStudioTracks(saved.timeline.tracks) } });
  if (saved.studioCutouts?.length) {
    onStep("Loading the person cutout...");
    await restoreCutouts(saved.studioCutouts);
  }
  restoreBeats({ beats: saved.studioBeats, music: saved.studioMusic, musicInExport: saved.studioMusicInExport });
  // Spots the Studio suggests now that this timeline does not mark yet.
  const marked = new Set(store().project.timeline.markers.map((m) => (m.label ?? "").toLowerCase()));
  for (const spot of manifest.suggestions ?? []) if (!marked.has(spot.label.toLowerCase())) await store().addMarker(spot.time, spot.label, "#ff6a3d");
  restoreApplied(saved.studioApplied);
  // A voiceover picked after this timeline was saved: placed at its start
  // on its own track (the timeline's own captions stay as they are).
  const known = new Set(Object.values(map));
  for (const m of manifest.media) {
    if (m.role !== "voice" || known.has(m.id)) continue;
    onStep(`Adding the voiceover ${m.name}...`);
    try {
      const mediaId = await importOne(m);
      map[mediaId] = m.id;
      await store().placeMediaClip(mediaId, undefined, m.start);
    } catch (e) {
      warnings.push((e as Error).message);
    }
  }
  return map;
}

export async function openPost(p: StudioParams, onStep: (s: string) => void): Promise<{ manifest: StudioManifest; media: Record<string, string>; warnings: string[] }> {
  onStep("Opening the post...");
  const manifest = await loadManifest(p);
  const warnings: string[] = [];
  const media = manifest.project ? await reopen(manifest, onStep, warnings) : await assemble(manifest, onStep, warnings);
  return { manifest, media, warnings };
}

// Studio ducking: OpenReel's ducker on each music clip, triggered by the
// voiceover track (or the footage when the clip keeps its own sound).
const DUCK = { threshold: -30, reduction: 0.7, attack: 0.1, release: 0.3, holdTime: 0.2 };
async function duckMusic(ids: Record<string, string>, manifest: StudioManifest, warnings: string[]): Promise<void> {
  const roleOf = (mediaId: string) => manifest.media.find((m) => m.id === ids[mediaId])?.role;
  const tracks = store().project.timeline.tracks;
  const trackWith = (role: string) => tracks.find((t) => t.clips.some((c) => roleOf(c.mediaId) === role));
  const trigger = trackWith("voice") ?? (manifest.sound?.clipSound !== false ? trackWith("clip") : undefined);
  if (!trigger) return;
  for (const t of tracks) for (const clip of t.clips) {
    if (roleOf(clip.mediaId) !== "music") continue;
    try {
      const buffer = await buildTriggerTrackBuffer(store().project, clip, trigger);
      const settings = { enabled: true, sourceTrackId: trigger.id, ...DUCK };
      const keys = new AudioDucker().generateDuckingKeyframes(buffer, settings, clip.volume > 0 ? clip.volume : 1);
      if (keys.length) store().setClipAudioDucking(clip.id, settings, keys);
    } catch (e) {
      warnings.push(`The music could not be ducked (${(e as Error).message}). Set it in the music clip's Audio Ducking.`);
    }
  }
}

// The project as JSON for the Studio: no blobs, file handles or object
// URLs; media are named by their Studio asset ids.
export function projectForStudio(media: Record<string, string>): unknown {
  const project = store().project;
  return {
    ...project,
    studioMedia: media,
    studioCutouts: cutoutIds(),
    studioBeats: savedBeats(),
    studioMusic: musicMediaIds(),
    studioMusicInExport: getMusicInExport(),
    studioApplied: appliedPresets(),
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
  // Music tracks left out when "Music in the export" is off.
  const gen = engine.exportVideo(exportProject(project), {
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
    body: JSON.stringify({ uploadId, project: projectForStudio(media), stack: currentStack() }),
  }));
}
