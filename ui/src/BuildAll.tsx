import { useState } from "react";
import { buildAll, type BuildEvent } from "./api";

// "Create CVs" for every open job that has no CV yet, with a live log.
export function BuildAll({ onChanged }: { onChanged: () => void }) {
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const print = (line: string) => setLog((lines) => [...lines, line]);

  function onEvent(event: BuildEvent) {
    if (event.type === "start") print(`Building ${event.count} CV(s)...`);
    else if (event.type === "result") {
      print(event.ok ? `built: ${event.id} (score ${event.score}, ${event.choice})` : `failed: ${event.id} (${event.error})`);
      onChanged();
    } else if (event.type === "done") print("Done.");
    else print(`Error: ${event.error}`);
  }

  async function run() {
    if (!confirm("Build a CV with AI for every job that is not submitted, not rejected and has no CV yet?")) return;
    setRunning(true);
    setLog([]);
    try {
      await buildAll(onEvent);
    } catch (err) {
      print(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setRunning(false);
      onChanged();
    }
  }

  return (
    <details className="box">
      <summary>Create CVs</summary>
      <p className="hint">
        For each open job without a CV: reads its requirements, picks a CV (or uses the one you chose), builds it and
        scores it. Takes about half a minute per job.
      </p>
      <button className="primary" onClick={run} disabled={running}>
        {running ? "Building..." : "Create CVs for open jobs"}
      </button>
      {log.length > 0 && (
        <ul className="log">
          {log.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      )}
    </details>
  );
}
