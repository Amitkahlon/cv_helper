import { useContext, useState } from "react";
import { runBulk, type BulkEvent } from "./api";
import { BULK_ACTIONS, type ActionContext, type BulkActionDef } from "./bulkActions";
import type { CvEntry } from "./cvsApi";
import { RolesContext } from "./roles";
import type { SelectionApi } from "./selection";

// The bar shown while rows are selected: what's selected, the actions, an
// action's inputs, and its progress. Works with any action in BULK_ACTIONS.
export function SelectionBar({
  selection,
  shownCount,
  cvs,
  labelOf,
  onChanged,
}: {
  selection: SelectionApi;
  shownCount: number;
  cvs: CvEntry[];
  labelOf: (id: string) => string; // a row's name, for the results
  onChanged: () => void; // rows changed: reload them
}) {
  const roles = useContext(RolesContext);
  const context: ActionContext = { cvs, roles };
  const [action, setAction] = useState<BulkActionDef | null>(null); // asking for its inputs
  const [params, setParams] = useState<Record<string, string>>({});
  const [running, setRunning] = useState("");
  const [progress, setProgress] = useState({ done: 0, total: 0, failed: 0 });
  const [log, setLog] = useState<{ ok: boolean; text: string }[]>([]);

  // Hidden when nothing is selected, unless there's a result to show (e.g. after deleting the selected rows).
  if (selection.count === 0 && !running && log.length === 0 && progress.total === 0) return null;

  function choose(def: BulkActionDef) {
    setLog([]);
    if (def.params?.length) {
      setAction(def);
      setParams(Object.fromEntries(def.params.map((p) => [p.key, ""])));
    } else {
      void run(def, {});
    }
  }

  async function run(def: BulkActionDef, values: Record<string, string>) {
    const ids = selection.selected;
    if (def.confirm && !confirm(def.confirm(ids.length))) return;
    setAction(null);
    setRunning(def.label);
    setProgress({ done: 0, total: ids.length, failed: 0 });
    setLog([]);
    const onEvent = (event: BulkEvent) => {
      if (event.type === "result") {
        setProgress((p) => ({ ...p, done: p.done + 1, failed: p.failed + (event.ok ? 0 : 1) }));
        if (!event.ok || event.message) {
          setLog((lines) => [...lines, { ok: event.ok, text: `${labelOf(event.id)}: ${event.message ?? "failed"}` }]);
        }
        if (def.id !== "delete") onChanged(); // keep the table current while slow actions run
      } else if (event.type === "error") {
        setLog((lines) => [...lines, { ok: false, text: event.error }]);
      }
    };
    try {
      await runBulk(def.id, ids, values, onEvent);
    } catch (err) {
      setLog((lines) => [...lines, { ok: false, text: err instanceof Error ? err.message : String(err) }]);
    } finally {
      setRunning("");
      onChanged();
    }
  }

  return (
    <div className="selection-bar">
      <div className="controls" style={{ margin: 0 }}>
        <b>{selection.count} selected</b>
        {selection.hiddenCount > 0 && <span className="hint">({selection.hiddenCount} hidden by the filters)</span>}
        {selection.shownState !== "all" && shownCount > 0 && (
          <button onClick={() => selection.selectShown(true)} disabled={!!running}>
            Select all {shownCount} shown
          </button>
        )}
        <button onClick={selection.clear} disabled={!!running || selection.count === 0}>
          Clear
        </button>
        <span className="divider" />
        {BULK_ACTIONS.map((def) => (
          <button
            key={def.id}
            className={def.danger ? "danger" : action?.id === def.id ? "current" : undefined}
            onClick={() => choose(def)}
            disabled={!!running || selection.count === 0}
          >
            {def.label}
            {def.params?.length ? "…" : ""}
          </button>
        ))}
      </div>

      {action && (
        <div className="action-form">
          {action.hint && <p className="hint">{action.hint}</p>}
          <div className="fields">
            {action.params!.map((field) => (
              <label key={field.key} className="field">
                <span>{field.label}</span>
                {field.kind === "select" ? (
                  <select value={params[field.key]} onChange={(e) => setParams({ ...params, [field.key]: e.target.value })}>
                    {groupOptions(field.options!(context))}
                  </select>
                ) : (
                  <input dir="auto" value={params[field.key]} onChange={(e) => setParams({ ...params, [field.key]: e.target.value })} />
                )}
              </label>
            ))}
          </div>
          <div className="controls">
            <button className="primary" onClick={() => run(action, params)}>
              {action.label} for {selection.count} job(s)
            </button>
            <button onClick={() => setAction(null)}>Cancel</button>
          </div>
        </div>
      )}

      {(running || log.length > 0 || progress.total > 0) && (
        <div className="action-form">
          <div className="controls" style={{ margin: 0 }}>
            <span>
              {running ? `${running}: ` : "Done: "}
              {progress.done} of {progress.total}
              {progress.failed ? `, ${progress.failed} failed` : ""}
            </span>
            {!running && (
              <button
                onClick={() => {
                  setLog([]);
                  setProgress({ done: 0, total: 0, failed: 0 });
                }}
              >
                Close
              </button>
            )}
          </div>
          <div className="bar">
            <div style={{ width: `${progress.total ? (100 * progress.done) / progress.total : 0}%` }} />
          </div>
          {log.length > 0 && (
            <ul className="log">
              {log.map((line, i) => (
                <li key={i} className={line.ok ? undefined : "error"} dir="auto">
                  {line.text}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// <option>s, in <optgroup>s where options name a group.
function groupOptions(options: { value: string; label: string; group?: string }[]) {
  const groups: { name: string | undefined; items: typeof options }[] = [];
  for (const option of options) {
    const last = groups[groups.length - 1];
    if (last && last.name === option.group) last.items.push(option);
    else groups.push({ name: option.group, items: [option] });
  }
  return groups.map((group, i) => {
    const items = group.items.map((o) => (
      <option key={o.value} value={o.value}>
        {o.label}
      </option>
    ));
    return group.name ? (
      <optgroup key={i} label={group.name}>
        {items}
      </optgroup>
    ) : (
      items
    );
  });
}
