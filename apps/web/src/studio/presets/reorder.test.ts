import { describe, expect, it } from "vitest";
import { reorderPlan } from "./reorder";

// Reorder shots by dragging (editor QA, 2026-10-15).
describe("reorderPlan", () => {
  const shots = [
    { id: "a", startTime: 0, duration: 2 },
    { id: "b", startTime: 2, duration: 3 },
  ];

  it("puts a shot dropped on another in front of it, back to back", () => {
    expect(reorderPlan(shots, "b", 2, 0.4)).toEqual([
      { id: "b", startTime: 0, duration: 3 },
      { id: "a", startTime: 3, duration: 2 },
    ]);
  });

  it("goes after a shot when dropped past its middle", () => {
    const three = [...shots, { id: "c", startTime: 5, duration: 1 }];
    expect(reorderPlan(three, "a", 0, 3.8)?.map((p) => p.id)).toEqual(["b", "a", "c"]);
  });

  it("leaves a drop on empty space to the normal move", () => {
    expect(reorderPlan(shots, "b", 2, 8)).toBeNull();
  });
});
