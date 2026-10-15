import { describe, expect, it } from "vitest";
import { karaokeLitWords, wrapWidthFor } from "./title-engine";

// Character Studio editor QA (2026-10-15): long captions wrap inside the
// frame, and karaoke lights the caption's own words in turn.
describe("wrapWidthFor", () => {
  it("is 90% of the frame at scale 1 and grows when the text is scaled down", () => {
    expect(wrapWidthFor(1080, 1)).toBeCloseTo(972);
    expect(wrapWidthFor(1080, 0.5)).toBeCloseTo(1944);
    expect(wrapWidthFor(1080, 0)).toBeCloseTo(972);
  });
});

describe("karaokeLitWords", () => {
  it("lights words one after another across the clip", () => {
    const text = "one two three";
    expect(karaokeLitWords(text, 3, 0)).toBe(1);
    expect(karaokeLitWords(text, 3, 1.1)).toBe(2);
    expect(karaokeLitWords(text, 3, 2.9)).toBe(3);
  });
  it("follows the text when it is edited and the clip when it is retimed", () => {
    expect(karaokeLitWords("a b c d", 4, 3.5)).toBe(4);
    expect(karaokeLitWords("a b c d", 8, 3.5)).toBe(2);
    expect(karaokeLitWords("", 3, 1)).toBe(0);
  });
});
