import { useCallback, useEffect, useMemo, useState } from "react";

// Selecting rows of any list, by id. Knows nothing about jobs or tables: the
// list's ids come in, the selected ids come out. The pure functions hold the
// rules (tested on their own); useSelection keeps the state for a component.

export interface Selection {
  ids: ReadonlySet<string>;
  anchor: string | null; // the last row clicked without Shift, where a Shift range starts
}

export const EMPTY: Selection = { ids: new Set(), anchor: null };

// Click on a row's checkbox. With Shift, every row between the anchor and this
// one (in the list's current order) takes this row's new state.
export function toggle(selection: Selection, id: string, order: readonly string[], shift = false): Selection {
  const on = !selection.ids.has(id);
  const from = selection.anchor === null ? -1 : order.indexOf(selection.anchor);
  const to = order.indexOf(id);
  const range = shift && from >= 0 && to >= 0 ? order.slice(Math.min(from, to), Math.max(from, to) + 1) : [id];
  return { ids: setAll(selection.ids, range, on), anchor: shift ? selection.anchor : id };
}

// Select (or unselect) many rows at once, e.g. all rows shown.
export function setMany(selection: Selection, ids: readonly string[], on: boolean): Selection {
  return { ids: setAll(selection.ids, ids, on), anchor: selection.anchor };
}

// Forget rows that no longer exist (e.g. deleted). Returns the same object when nothing changed.
export function prune(selection: Selection, existing: readonly string[]): Selection {
  const keep = new Set(existing);
  const anchorOk = selection.anchor === null || keep.has(selection.anchor);
  if (anchorOk && [...selection.ids].every((id) => keep.has(id))) return selection;
  const ids = new Set([...selection.ids].filter((id) => keep.has(id)));
  return { ids, anchor: selection.anchor !== null && keep.has(selection.anchor) ? selection.anchor : null };
}

// How the shown rows are selected: for a header checkbox.
export function shownState(selection: Selection, shown: readonly string[]): "none" | "some" | "all" {
  const count = shown.filter((id) => selection.ids.has(id)).length;
  return count === 0 ? "none" : count === shown.length ? "all" : "some";
}

function setAll(ids: ReadonlySet<string>, change: readonly string[], on: boolean): Set<string> {
  const next = new Set(ids);
  for (const id of change) {
    if (on) next.add(id);
    else next.delete(id);
  }
  return next;
}

// `all`: every id in the list (selection survives filtering, but deleted rows drop out).
// `shown`: the ids on screen, in screen order (for Shift ranges and "select all shown").
export function useSelection(all: readonly string[], shown: readonly string[]) {
  const [selection, setSelection] = useState<Selection>(EMPTY);

  const allKey = all.join("\n");
  useEffect(() => setSelection((s) => prune(s, all)), [allKey]);

  const shownSet = useMemo(() => new Set(shown), [shown]);
  const selected = useMemo(() => all.filter((id) => selection.ids.has(id)), [all, selection]);

  return {
    selected, // in list order
    count: selected.length,
    hiddenCount: selected.filter((id) => !shownSet.has(id)).length, // selected but filtered out of view
    isSelected: useCallback((id: string) => selection.ids.has(id), [selection]),
    toggle: (id: string, shift = false) => setSelection((s) => toggle(s, id, shown, shift)),
    shownState: shownState(selection, shown),
    selectShown: (on: boolean) => setSelection((s) => setMany(s, shown, on)),
    clear: () => setSelection(EMPTY),
  };
}

export type SelectionApi = ReturnType<typeof useSelection>;
