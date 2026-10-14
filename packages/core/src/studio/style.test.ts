import { describe, expect, it } from "vitest";
import { anchorFor, anchorWords, timeFor, type Places } from "./style";

// The same vectors as the Studio's server/core/editorStyle.test.ts, so the
// editor and the worker place a saved style the same way.

const a: Places = { duration: 8, payoff: 6, cuts: [3.2], beats: [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4] };
const b: Places = { duration: 12, payoff: 9.5, cuts: [4, 8], beats: [0.6, 1.2, 1.8, 2.4] };

describe("saved style anchors", () => {
  it("names the payoff, a cut, a beat, then the start or the end", () => {
    expect(anchorFor(6, a)).toMatchObject({ on: "payoff", offset: 0 });
    expect(anchorFor(3.22, a)).toMatchObject({ on: "cut", index: 0, offset: 0.02 });
    expect(anchorFor(2.5, a)).toMatchObject({ on: "beat", index: 4, offset: 0 });
    expect(anchorFor(5.2, a)).toMatchObject({ on: "payoff", offset: -0.8 });
    expect(anchorFor(7.6, a)).toMatchObject({ on: "end", offset: 0.4 });
    expect(anchorFor(0.2, a)).toMatchObject({ on: "start", offset: 0.2 });
  });

  it("lands on the same kind of place in another video", () => {
    expect(timeFor(anchorFor(6, a), b)).toBe(9.5);
    expect(timeFor(anchorFor(3.22, a), b)).toBe(4.02);
    expect(timeFor(anchorFor(2.5, a), b)).toBe(3.75);
    expect(timeFor(anchorFor(1, a), b)).toBe(1.2);
    expect(timeFor(anchorFor(7.6, a), b)).toBe(11.6);
  });

  it("stays inside the video and describes each place", () => {
    expect(timeFor({ on: "payoff", index: 0, offset: 5, ratio: 0.9 }, b)).toBe(11.9);
    expect(anchorWords(anchorFor(6, a))).toBe("at the payoff");
    expect(anchorWords(anchorFor(3.2, a))).toBe("on cut 1");
    expect(anchorWords(anchorFor(1, a))).toBe("on beat 2");
  });
});
