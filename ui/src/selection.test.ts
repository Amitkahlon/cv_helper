import { describe, expect, it } from "vitest";
import { EMPTY, prune, setMany, shownState, toggle } from "./selection";

const order = ["a", "b", "c", "d", "e"];
const ids = (s: { ids: ReadonlySet<string> }) => [...s.ids].sort();

describe("selection", () => {
  it("toggles single rows and remembers the anchor", () => {
    let s = toggle(EMPTY, "b", order);
    expect(ids(s)).toEqual(["b"]);
    expect(s.anchor).toBe("b");
    s = toggle(s, "b", order);
    expect(ids(s)).toEqual([]);
  });

  it("selects a range with Shift, in either direction, keeping the anchor", () => {
    let s = toggle(EMPTY, "b", order);
    s = toggle(s, "d", order, true);
    expect(ids(s)).toEqual(["b", "c", "d"]);
    expect(s.anchor).toBe("b");
    s = toggle(s, "a", order, true); // a is unselected, so the range a..b gets selected
    expect(ids(s)).toEqual(["a", "b", "c", "d"]);
  });

  it("unselects a range when Shift-clicking a selected row", () => {
    let s = setMany(EMPTY, order, true);
    s = toggle(s, "b", order); // unselect b, anchor b
    s = toggle(s, "d", order, true); // d is selected, so b..d gets unselected
    expect(ids(s)).toEqual(["a", "e"]);
  });

  it("Shift without an anchor in view selects just the row", () => {
    const s = toggle({ ids: new Set(), anchor: "gone" }, "c", order, true);
    expect(ids(s)).toEqual(["c"]);
  });

  it("selects or clears many, and reports the header state", () => {
    let s = setMany(EMPTY, ["a", "b"], true);
    expect(shownState(s, order)).toBe("some");
    s = setMany(s, order, true);
    expect(shownState(s, order)).toBe("all");
    s = setMany(s, ["a", "b", "c", "d", "e"], false);
    expect(shownState(s, order)).toBe("none");
  });

  it("forgets rows that no longer exist, keeping the same object when nothing changed", () => {
    const s = toggle(setMany(EMPTY, ["a", "b", "c"], true), "c", order);
    const pruned = prune(s, ["a", "b", "d"]);
    expect(ids(pruned)).toEqual(["a", "b"]);
    expect(pruned.anchor).toBeNull();
    expect(prune(pruned, ["a", "b"])).toBe(pruned);
  });
});
