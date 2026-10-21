import { useState } from "react";
import { addJobs, type AddEvent } from "./api";

// A box to paste WhatsApp messages or links into; shows progress as each job is read.
export function AddJobs({ onAdded }: { onAdded: () => void }) {
  const [text, setText] = useState("");
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<string[]>([]);

  const print = (line: string) => setLog((lines) => [...lines, line]);

  function onEvent(event: AddEvent) {
    switch (event.type) {
      case "start":
        print(
          `Checking ${event.links} job link(s)` +
            (event.ignored ? `, ignoring ${event.ignored} other link(s)` : "") +
            "...",
        );
        break;
      case "result":
        print(`${event.outcome}: ${event.title || event.link}${event.detail ? ` (${event.detail})` : ""}`);
        if (event.outcome === "added" || event.outcome === "closed") onAdded();
        break;
      case "done":
        print(
          event.loggedOut
            ? "Done. WARNING: HireMe answered as logged out, so company names and apply links are missing."
            : "Done.",
        );
        break;
      case "error":
        print(`Error: ${event.error}`);
        break;
    }
  }

  async function run() {
    setRunning(true);
    setLog([]);
    try {
      await addJobs(text, onEvent);
      setText("");
    } catch (err) {
      print(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setRunning(false);
      onAdded();
    }
  }

  return (
    <details className="box">
      <summary>Add jobs</summary>
      <textarea
        rows={8}
        placeholder="Paste WhatsApp messages or job links"
        value={text}
        disabled={running}
        onChange={(e) => setText(e.target.value)}
      />
      <div>
        <button onClick={run} disabled={running || !text.trim()}>
          {running ? "Adding..." : "Add"}
        </button>
      </div>
      {log.length > 0 && (
        <ul className="log">
          {log.map((line, i) => (
            <li key={i} dir="auto">
              {line}
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}
