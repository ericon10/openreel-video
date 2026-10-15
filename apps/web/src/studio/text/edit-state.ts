import { create } from "zustand";
import { useTimelineStore } from "../../stores/timeline-store";
import { useUIStore } from "../../stores/ui-store";

// Which caption is being edited in place (double-click on the caption, on
// the timeline or in the preview). Character Studio editor QA, 2026-10-15.
interface InlineTextEditState { id: string | null; close: () => void }
export const useInlineTextEdit = create<InlineTextEditState>((set) => ({ id: null, close: () => set({ id: null }) }));

// Opens the editor on a caption: selects it and, when the playhead is not
// on it, moves the playhead inside it so the box sits over the text.
export function openInlineTextEdit(clip: { id: string; trackId: string; startTime: number; duration: number }): void {
  const tl = useTimelineStore.getState();
  const t = tl.playheadPosition;
  if (t < clip.startTime || t >= clip.startTime + clip.duration) tl.setPlayheadPosition(clip.startTime + Math.min(0.05, clip.duration / 2));
  useUIStore.getState().select({ type: "text-clip", id: clip.id, trackId: clip.trackId });
  useInlineTextEdit.setState({ id: clip.id });
}
