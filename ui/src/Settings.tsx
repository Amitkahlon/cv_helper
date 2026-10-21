import { useEffect, useState } from "react";
import { errorText } from "./api";
import { ObjectEditor, type Field } from "./fields";

interface Config {
  ai: { provider: string; model: string };
  filters: {
    reject_employment_types: string[];
    accept_fields: string[];
    max_min_years_experience: number | null;
    reject_keywords: string[];
    locations: string[];
  };
  cv: { font: string; accent_color: string; font_size: number };
}

interface SettingsData {
  workspace: string;
  config: Config;
  providers: Record<string, string>;
  keys_set: Record<"anthropic" | "openai" | "gemini", boolean>;
}

const FILTER_FIELDS: Field[] = [
  { key: "reject_employment_types", label: "Reject employment types (comma separated, e.g. internship, student, part-time)", kind: "list" },
  { key: "accept_fields", label: "Only these fields (comma separated; empty = any)", kind: "list" },
  { key: "reject_keywords", label: "Reject jobs mentioning (comma separated)", kind: "list" },
  { key: "locations", label: "Locations (comma separated; empty = anywhere; remote always passes)", kind: "list" },
];

const KEY_NAMES = { anthropic: "Anthropic (Claude)", openai: "OpenAI (ChatGPT)", gemini: "Google (Gemini)" } as const;
type KeyName = keyof typeof KEY_NAMES;

const MODEL_HINTS: Record<string, string> = {
  "claude-cli": "sonnet",
  "anthropic-api": "claude-opus-5-5",
  "openai-api": "gpt-5",
  "gemini-api": "gemini-2.5-flash",
  "codex-cli": "the CLI's default",
  "gemini-cli": "the CLI's default",
};

export function SettingsPage() {
  const [data, setData] = useState<SettingsData | null>(null);
  const [config, setConfig] = useState<Config | null>(null);
  const [newKeys, setNewKeys] = useState<Partial<Record<KeyName, string>>>({});
  const [workspace, setWorkspace] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const load = async () => {
    const response = await fetch("/api/settings");
    if (!response.ok) throw new Error(await errorText(response));
    const loaded: SettingsData = await response.json();
    setData(loaded);
    setConfig(loaded.config);
    setWorkspace(loaded.workspace);
    setNewKeys({});
  };

  useEffect(() => {
    load().catch((err) => setError(String(err)));
  }, []);

  if (!data || !config) return error ? <p className="error">{error}</p> : <p>Loading...</p>;

  async function save(apiKeys?: Partial<Record<KeyName, string>>) {
    setError("");
    try {
      const response = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config, api_keys: apiKeys }),
      });
      if (!response.ok) throw new Error(await errorText(response));
      await load();
      setStatus("Saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function switchWorkspace() {
    if (!confirm(`Switch to the workspace in ${workspace}? It is created if it doesn't exist.`)) return;
    const response = await fetch("/api/workspace", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: workspace }),
    });
    if (!response.ok) return setError(await errorText(response));
    location.reload(); // every page reloads its data from the new workspace
  }

  const years = config.filters.max_min_years_experience;
  return (
    <div className="page">
      <div className="toolbar">
        <button className="primary" onClick={() => save()}>
          Save
        </button>
        <span>{status}</span>
      </div>
      {error && <p className="error">{error}</p>}

      <h2>AI</h2>
      <div className="fields">
        <label className="field">
          <span>Provider</span>
          <select
            value={config.ai.provider}
            onChange={(e) => setConfig({ ...config, ai: { ...config.ai, provider: e.target.value } })}
          >
            {Object.entries(data.providers).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Model (empty = default)</span>
          <input
            value={config.ai.model}
            placeholder={MODEL_HINTS[config.ai.provider]}
            onChange={(e) => setConfig({ ...config, ai: { ...config.ai, model: e.target.value } })}
          />
        </label>
      </div>
      <p className="hint">
        CLI providers use your own account on that tool (it must be installed and logged in). API providers need a
        key and are paid per use. Keys are stored in your user settings, not in the workspace.
      </p>
      <div className="fields">
        {(Object.keys(KEY_NAMES) as KeyName[]).map((name) => (
          <label key={name} className="field">
            <span>
              {KEY_NAMES[name]} API key: {data.keys_set[name] ? <b className="ok">saved</b> : "not set"}
            </span>
            <input
              type="password"
              autoComplete="off"
              placeholder={data.keys_set[name] ? "type a new key to replace it" : "paste a key"}
              value={newKeys[name] ?? ""}
              onChange={(e) => setNewKeys({ ...newKeys, [name]: e.target.value })}
            />
          </label>
        ))}
      </div>
      <p>
        <button onClick={() => save(newKeys)} disabled={!Object.values(newKeys).some((k) => k?.trim())}>
          Save keys
        </button>{" "}
        {(Object.keys(KEY_NAMES) as KeyName[])
          .filter((name) => data.keys_set[name])
          .map((name) => (
            <button key={name} onClick={() => save({ [name]: "" })}>
              Remove {KEY_NAMES[name]} key
            </button>
          ))}
      </p>

      <h2>Job filters</h2>
      <p className="hint">
        Applied when a job's requirements are extracted: a match puts "rejected: reason" in its Filter column.
      </p>
      <ObjectEditor
        fields={FILTER_FIELDS}
        value={config.filters}
        onChange={(filters) => setConfig({ ...config, filters: { ...config.filters, ...filters } })}
      />
      <div className="fields">
        <label className="field">
          <span>Reject jobs asking for more than this many years (empty = no limit)</span>
          <input
            type="number"
            min={0}
            value={years ?? ""}
            onChange={(e) =>
              setConfig({
                ...config,
                filters: { ...config.filters, max_min_years_experience: e.target.value === "" ? null : Number(e.target.value) },
              })
            }
          />
        </label>
      </div>

      <h2>CV look</h2>
      <div className="fields">
        <label className="field">
          <span>Font</span>
          <input value={config.cv.font} onChange={(e) => setConfig({ ...config, cv: { ...config.cv, font: e.target.value } })} />
        </label>
        <label className="field">
          <span>Accent color</span>
          <input
            type="color"
            value={config.cv.accent_color}
            onChange={(e) => setConfig({ ...config, cv: { ...config.cv, accent_color: e.target.value } })}
          />
        </label>
        <label className="field">
          <span>Font size (pt)</span>
          <input
            type="number"
            step={0.5}
            min={8}
            max={14}
            value={config.cv.font_size}
            onChange={(e) => setConfig({ ...config, cv: { ...config.cv, font_size: Number(e.target.value) } })}
          />
        </label>
      </div>

      <h2>Workspace</h2>
      <p className="hint">The folder with your tracker, profile and CVs. Each person (or job search) can have its own.</p>
      <div className="fields">
        <label className="field wide">
          <span>Folder</span>
          <input value={workspace} onChange={(e) => setWorkspace(e.target.value)} />
        </label>
      </div>
      <p>
        <button onClick={switchWorkspace} disabled={workspace.trim() === data.workspace}>
          Switch workspace
        </button>
      </p>
    </div>
  );
}
