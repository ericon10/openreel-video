import { create } from "zustand";
import type { PresetStrength, SavedStyle } from "@openreel/core/studio";

// The embed's own UI state: the strength new presets get, the preset block
// being edited, the last result line, and the spots the Studio suggests.

export interface SuggestedSpot { label: string; time: number; why: string }

interface PresetUi {
  strength: PresetStrength;
  selected: string | null;
  status: { tone: "ok" | "bad"; text: string } | null;
  busy: string | null;
  spots: SuggestedSpot[];
  styles: SavedStyle[];
  setStrength: (s: PresetStrength) => void;
  select: (id: string | null) => void;
  say: (status: PresetUi["status"]) => void;
  setBusy: (id: string | null) => void;
  setSpots: (spots: SuggestedSpot[]) => void;
  setStyles: (styles: SavedStyle[]) => void;
}

export const usePresetUi = create<PresetUi>((set) => ({
  strength: "normal",
  selected: null,
  status: null,
  busy: null,
  spots: [],
  styles: [],
  setStrength: (strength) => set({ strength }),
  select: (selected) => set({ selected }),
  say: (status) => set({ status }),
  setBusy: (busy) => set({ busy }),
  setSpots: (spots) => set({ spots }),
  setStyles: (styles) => set({ styles }),
}));
