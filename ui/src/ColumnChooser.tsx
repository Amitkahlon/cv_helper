import { useEffect, useRef, useState } from "react";
import type { ColumnDef, ColumnPrefs } from "./jobColumns";

// A "Columns" button with a small panel: tick the columns to show.
export function ColumnChooser({ columns, prefs }: { columns: ColumnDef[]; prefs: ColumnPrefs }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  // Close when clicking outside the panel or pressing Escape.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const shown = columns.filter((c) => prefs.isVisible(c.key)).length;
  return (
    <div className="popover-anchor" ref={box}>
      <button onClick={() => setOpen(!open)} aria-expanded={open}>
        Columns ({shown}/{columns.length})
      </button>
      {open && (
        <div className="popover" role="dialog" aria-label="Choose columns">
          <div className="popover-head">
            <b>Show columns</b>
            <button onClick={prefs.reset}>Reset</button>
          </div>
          <div className="column-list">
            {columns.map((column) => (
              <label key={column.key}>
                <input
                  type="checkbox"
                  checked={prefs.isVisible(column.key)}
                  onChange={(e) => prefs.setVisible(column.key, e.target.checked)}
                />
                {column.label}
                {/* the CSV column's name, where it differs from the label (useful in Excel) */}
                {column.label.toLowerCase() !== column.key.replace(/_/g, " ") && <span className="hint"> ({column.key})</span>}
              </label>
            ))}
          </div>
          <p className="hint">Drag a column's right edge in the table to make it wider or narrower.</p>
        </div>
      )}
    </div>
  );
}
