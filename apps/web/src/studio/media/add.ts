import { useProjectStore } from "../../stores/project-store";
import { useTimelineStore } from "../../stores/timeline-store";
import { importOne } from "../bridge";
import type { PickerItem } from "./state";

// Studio media onto the timeline (owner, 2026-10-15: Add media, Studio
// first). The file comes from the Studio (its direct storage link first,
// like the post's own media), lands in the editor's media library, and is
// named in the post's media map by its Studio asset id, so it opens again
// with the post after Done.

let active: Record<string, string> | null = null;

// The map the editor saves with the project (StudioEditor's media.current).
export function setActiveMedia(map: Record<string, string>): void {
  active = map;
}

const store = () => useProjectStore.getState();

// The editor's media id for a Studio item: the one already loaded, else a
// fresh import. Two taps on one item load it once.
const loading = new Map<string, Promise<string>>();
export async function studioMediaId(item: PickerItem): Promise<string> {
  const map = active ?? (active = {});
  const have = store().project.mediaLibrary.items.map((i) => i.id);
  const known = Object.entries(map).find(([mediaId, assetId]) => assetId === item.id && have.includes(mediaId));
  if (known) return known[0];
  const pending = loading.get(item.id);
  if (pending) return pending;
  const p = importOne(item).then((mediaId) => {
    map[mediaId] = item.id;
    return mediaId;
  }).finally(() => loading.delete(item.id));
  loading.set(item.id, p);
  return p;
}

// One tap: on a new track at the playhead, like the Media tab's own add.
export async function addStudioMedia(item: PickerItem): Promise<{ at: number }> {
  const mediaId = await studioMediaId(item);
  const at = useTimelineStore.getState().playheadPosition;
  const r = await store().addClipToNewTrack(mediaId, at);
  if (!r.success) throw new Error(`${item.name}: ${r.error?.message ?? "could not be added"}`);
  return { at };
}

// A drag from the picker: exactly where it was dropped, on that track (or
// a new one when dropped on empty space).
export const DRAG_KEY = "studioMedia";
export async function dropStudioMedia(item: PickerItem, trackId: string, time: number): Promise<void> {
  const mediaId = await studioMediaId(item);
  const r = await store().placeMediaClip(mediaId, trackId || undefined, time);
  if (!r.success) throw new Error(`${item.name}: ${r.error?.message ?? "could not be placed"}`);
}

// The drop handlers' hook: true when the payload was a Studio item (then
// the drop is handled here).
export function handleStudioDrop(data: unknown, trackId: string, time: number, onError: (message: string) => void): boolean {
  const item = (data as Record<string, unknown> | null)?.[DRAG_KEY] as PickerItem | undefined;
  if (!item || typeof item.id !== "string" || typeof item.url !== "string") return false;
  void dropStudioMedia(item, trackId, time).catch((e: Error) => onError(e.message));
  return true;
}
