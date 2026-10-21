import { describe, expect, it } from "vitest";
import { DEFAULT_TITLE_STYLE, TEXT_STYLE_PRESETS, scaledTextStyle } from "./AssetsPanel";

describe("editor text presets", () => {
  it("starts the primary title at a shader-friendly display scale", () => {
    expect(DEFAULT_TITLE_STYLE.fontSize).toBeGreaterThanOrEqual(96);
    expect(DEFAULT_TITLE_STYLE.fontWeight).toBe(800);
  });

  it("offers distinct title, editorial, outline, and utility treatments", () => {
    expect(TEXT_STYLE_PRESETS.map((preset) => preset.name)).toEqual([
      "Heading",
      "Subtitle",
      "Lower Third",
      "Caption",
      "Hero",
      "Quote",
      "Outline",
      "Badge",
    ]);
    expect(new Set(TEXT_STYLE_PRESETS.map((preset) => preset.style.fontSize)).size)
      .toBeGreaterThanOrEqual(6);
  });

  // Studio embed: sized for a 9:16 phone frame, scaled to the frame height.
  it("reads on a phone: every preset is at least 2.3% of a 1920 frame", () => {
    for (const preset of TEXT_STYLE_PRESETS) {
      expect(scaledTextStyle(preset.style, 1920).fontSize! / 1920).toBeGreaterThanOrEqual(0.023);
    }
  });

  it("scales size, outline, spacing and shadow with the frame height", () => {
    const hero = TEXT_STYLE_PRESETS.find((p) => p.name === "Hero")!.style;
    const half = scaledTextStyle(hero, 960);
    expect(half.fontSize).toBe(Math.round(hero.fontSize! / 2));
    expect(half.strokeWidth).toBe(hero.strokeWidth! / 2);
    expect(half.letterSpacing).toBe(hero.letterSpacing! / 2);
    const caption = TEXT_STYLE_PRESETS.find((p) => p.name === "Caption")!.style;
    expect(scaledTextStyle(caption, 1080).fontSize).toBe(Math.round(caption.fontSize! * 1080 / 1920));
    expect(scaledTextStyle(caption, 1080).shadowColor).toBe(caption.shadowColor);
  });
});
