import { create } from "zustand";

// The Studio media picker (owner, 2026-10-15): Add media opens it, Studio
// first, From computer second.

export interface PickerItem {
  id: string;
  name: string;
  kind: "video" | "image" | "audio";
  url: string;
  src: string | null;
  thumb: string | null;
  duration: number | null;
}

export interface PickerGroup { id: "post" | "clips" | "stills" | "library"; label: string; items: PickerItem[] }

interface PickerUi {
  open: boolean;
  tab: "studio" | "computer";
  // The Media tab's own file input (the editor's From computer, as before).
  fromComputer: (() => void) | null;
  show: (fromComputer: () => void) => void;
  setTab: (tab: PickerUi["tab"]) => void;
  close: () => void;
}

export const useStudioMedia = create<PickerUi>((set) => ({
  open: false,
  tab: "studio",
  fromComputer: null,
  show: (fromComputer) => set({ open: true, tab: "studio", fromComputer }),
  setTab: (tab) => set({ tab }),
  close: () => set({ open: false }),
}));

// Add media and Import media in the Media tab call this inside the embed.
export function openStudioMedia(fromComputer: () => void): void {
  useStudioMedia.getState().show(fromComputer);
}
