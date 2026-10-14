import type { Clip, TimelineBeatMarker, Track } from "@openreel/core";
import { getBeatSyncBridge } from "../../bridges/beat-sync-bridge";
import { useProjectStore } from "../../stores/project-store";
import { useTimelineStore } from "../../stores/timeline-store";

// Beat sync (Character Studio embed): find the beat in a music track, or
// tap the tempo, or type a BPM. Beats show as markers on the timeline
// (OpenReel's beat overlay) and clips and preset blocks snap to them. The
// music can stay in the export or be left out (the owner usually adds the
// TikTok sound in the app). Beats, the music list and the export switch
// are saved with the project for the Studio.

const store = () => useProjectStore.getState();
const r3 = (n: number) => Math.round(n * 1000) / 1000;

export interface SavedBeats { bpm: number | null; source: "music" | "tap" | "bpm"; times: number[] }

// Media the Studio sent as music, or the owner added here.
const music = new Set<string>();
let musicInExport = true;

export const musicMediaIds = (): string[] => [...music].filter((id) => !!store().getMediaItem(id));
export const markMusic = (mediaId: string): void => void music.add(mediaId);
export const getMusicInExport = (): boolean => musicInExport;
export const setMusicInExport = (on: boolean): void => { musicInExport = on; };

export function musicClips(): Clip[] {
  const ids = new Set(musicMediaIds());
  return store().project.timeline.tracks.flatMap((t) => t.clips).filter((c) => ids.has(c.mediaId));
}

const musicTrackIds = (): Set<string> => new Set(musicClips().map((c) => c.trackId));

// The project to export: music tracks muted when the switch is off.
export function exportProject<P extends { timeline: { tracks: readonly Track[] } }>(project: P): P {
  if (musicInExport) return project;
  const ids = musicTrackIds();
  if (!ids.size) return project;
  return { ...project, timeline: { ...project.timeline, tracks: project.timeline.tracks.map((t) => (ids.has(t.id) ? { ...t, muted: true } : t)) } };
}

function toMarkers(times: number[]): TimelineBeatMarker[] {
  return times.map((time, index) => ({ time: r3(time), strength: index % 4 === 0 ? 1 : 0.6, index, isDownbeat: index % 4 === 0 }));
}

function publish(times: number[], bpm: number | null): void {
  getBeatSyncBridge().setBeatMarkers(toMarkers(times), { bpm: bpm ?? 0, confidence: 1, analyzedAt: Date.now() });
}

let source: SavedBeats["source"] = "music";

// A time pulled onto the nearest beat when it is close (a quarter of a
// beat at most, and never more than 0.15 s).
export function nearBeat(t: number, beats = beatTimes()): number {
  if (beats.length < 2) return t;
  const period = (beats[beats.length - 1]! - beats[0]!) / (beats.length - 1);
  const tol = Math.min(0.15, period / 4);
  let best = t;
  let dist = tol;
  for (const b of beats) {
    const d = Math.abs(b - t);
    if (d < dist) { dist = d; best = b; }
  }
  return best;
}

export const beatTimes = (): number[] => getBeatSyncBridge().getState().beatMarkers.map((b) => b.time);
export const beatBpm = (): number | null => getBeatSyncBridge().getState().beatAnalysis?.bpm || null;

// The source file's beats moved to where the clip plays on the timeline.
export function beatsOnTimeline(sourceBeats: number[], clip: Pick<Clip, "startTime" | "inPoint" | "outPoint">): number[] {
  return sourceBeats
    .filter((b) => b >= clip.inPoint && b < clip.outPoint)
    .map((b) => r3(clip.startTime + (b - clip.inPoint)));
}

// A steady grid through `anchor` (a beat lands on it) across the timeline.
export function beatGrid(bpm: number, anchor: number, duration: number): number[] {
  if (!(bpm >= 30 && bpm <= 300) || duration <= 0) return [];
  const period = 60 / bpm;
  const first = anchor - Math.floor(anchor / period) * period;
  const out: number[] = [];
  for (let t = first; t < duration; t += period) out.push(r3(t));
  return out;
}

// Taps to a tempo: the median gap of the last taps (a pause of 2 s starts over).
export function tempoFromTaps(taps: number[]): number | null {
  const recent: number[] = [];
  for (let i = taps.length - 1; i >= 0; i--) {
    if (recent.length && recent[0]! - taps[i]! > 2000) break;
    recent.unshift(taps[i]!);
    if (recent.length >= 9) break;
  }
  if (recent.length < 4) return null;
  const gaps = recent.slice(1).map((t, i) => t - recent[i]!).sort((a, b) => a - b);
  const mid = gaps[Math.floor(gaps.length / 2)]!;
  return mid > 0 ? Math.round(60000 / mid) : null;
}

const timelineDuration = (): number => Math.max(1, store().project.timeline.duration || 0);

export async function findBeatsInMusic(): Promise<{ ok: boolean; message: string }> {
  const clip = musicClips().sort((a, b) => b.duration - a.duration)[0];
  if (!clip) return { ok: false, message: "Add a music track first." };
  const item = store().getMediaItem(clip.mediaId);
  if (!item?.blob) return { ok: false, message: "The music is still loading. Try again in a moment." };
  try {
    const result = await getBeatSyncBridge().analyzeAudioFromBlob(item.blob, clip.id);
    const times = beatsOnTimeline(result.beats.map((b) => b.time), clip);
    if (!times.length) return { ok: false, message: "No beat found in the part of the music that plays. Tap the tempo instead." };
    source = "music";
    publish(times, Math.round(result.bpm));
    return { ok: true, message: `${times.length} beats at ${Math.round(result.bpm)} BPM. Clips and presets snap to them.` };
  } catch (e) {
    return { ok: false, message: `The beat could not be read (${(e as Error).message}). Tap the tempo instead.` };
  }
}

export function setGrid(bpm: number, kind: "tap" | "bpm"): { ok: boolean; message: string } {
  const anchor = useTimelineStore.getState().playheadPosition;
  const times = beatGrid(bpm, anchor, timelineDuration());
  if (!times.length) return { ok: false, message: "Use a tempo between 30 and 300 BPM." };
  source = kind;
  publish(times, bpm);
  return { ok: true, message: `${bpm} BPM from the playhead: ${times.length} beats. Clips and presets snap to them.` };
}

export function clearBeats(): void {
  getBeatSyncBridge().clearBeatMarkers();
}

export async function addMusicFile(file: File): Promise<{ ok: boolean; message: string }> {
  const before = new Set(store().project.mediaLibrary.items.map((i) => i.id));
  const r = await store().importMedia(file);
  const item = store().project.mediaLibrary.items.find((i) => !before.has(i.id));
  if (!r.success || !item) return { ok: false, message: r.error?.message ?? "That file could not be added." };
  const added = await store().addTrack("audio", undefined, { name: "Music" });
  const track = [...store().project.timeline.tracks].reverse().find((t) => t.type === "audio" && t.name === "Music" && t.clips.length === 0);
  const placed = await store().placeMediaClip(item.id, added.success ? track?.id : undefined, 0);
  if (!placed.success) return { ok: false, message: placed.error?.message ?? "The music could not be placed." };
  markMusic(item.id);
  return findBeatsInMusic();
}

// Saved with the project, and back on reopen.
export function savedBeats(): SavedBeats | null {
  const times = beatTimes();
  return times.length ? { bpm: beatBpm(), source, times } : null;
}

export function restoreBeats(saved: { beats?: SavedBeats | null; music?: string[]; musicInExport?: boolean }): void {
  for (const id of saved.music ?? []) music.add(id);
  if (typeof saved.musicInExport === "boolean") musicInExport = saved.musicInExport;
  if (saved.beats?.times.length) {
    source = saved.beats.source;
    publish(saved.beats.times, saved.beats.bpm);
  }
}
