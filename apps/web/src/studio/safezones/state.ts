import { create } from "zustand";
import { readChoice, saveChoice, type SafeZoneApp } from "./zones";

// The safe-zone overlay choice, remembered in this browser.
export const useSafeZones = create<{ app: SafeZoneApp; set: (app: SafeZoneApp) => void }>((set) => ({
  app: readChoice(),
  set: (app) => { saveChoice(app); set({ app }); },
}));
