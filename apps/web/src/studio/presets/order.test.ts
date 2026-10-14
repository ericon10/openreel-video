import { describe, expect, it } from "vitest";
import type { Track } from "@openreel/core";
import { orderStudioTracks } from "./order";

type T = Pick<Track, "type" | "name" | "role"> & { id: string };
const ids = (list: T[]) => orderStudioTracks(list).map((t) => t.id);

describe("Studio track order", () => {
  it("puts captions on top and the Presets track right above the footage", () => {
    const saved = [
      { id: "p", type: "graphics", name: "Presets", role: "effects" },
      { id: "v1", type: "video", name: "Track 1" },
      { id: "c", type: "text", name: "Captions", role: "captions" },
      { id: "a", type: "audio", name: "Sound" },
      { id: "v2", type: "video", name: "Overlay" },
    ] as T[];
    expect(ids(saved)).toEqual(["c", "p", "v1", "v2", "a"]);
  });

  it("keeps an already tidy order as it is", () => {
    const tidy = [
      { id: "c", type: "text", name: "Captions" },
      { id: "p", type: "graphics", name: "Presets", role: "effects" },
      { id: "o", type: "video", name: "Overlay" },
      { id: "v", type: "video", name: "Track 1" },
    ] as T[];
    expect(ids(tidy)).toEqual(["c", "p", "o", "v"]);
  });
});
