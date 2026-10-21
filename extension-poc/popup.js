// The popup: is cvhelper reachable, auto-attach on/off, and which job's CV is
// attached (the app's "current" job, which can be changed here too).
const DEFAULT_SERVER = "http://127.0.0.1:4321";
const $ = (id) => document.getElementById(id);

async function server() {
  const { server } = await chrome.storage.local.get("server");
  return (server || DEFAULT_SERVER).replace(/\/+$/, "");
}

async function show() {
  const base = await server();
  $("server").value = base;
  $("enabled").checked = (await chrome.storage.local.get("enabled")).enabled !== false;
  let state;
  try {
    const res = await fetch(`${base}/api/extension/state`, { signal: AbortSignal.timeout(3000) });
    state = await res.json();
  } catch {
    $("reach").className = "error";
    $("reach").textContent = `cvhelper isn't reachable at ${base}. Run "cvhelper ui".`;
    $("job").textContent = "No current job.";
    $("jobs").replaceChildren();
    return;
  }
  $("reach").className = "ok";
  $("reach").textContent = "cvhelper is running.";

  const ready = state.jobs.filter((j) => j.cv_ready);
  const options = [new Option("— choose a job —", "")];
  for (const j of ready) options.push(new Option(`${j.title} — ${j.company}`, j.id));
  $("jobs").replaceChildren(...options);
  $("jobs").value = ready.some((j) => j.id === state.current) ? state.current : "";

  const job = state.jobs.find((j) => j.id === state.current);
  if (!job) {
    $("job").textContent = "No current job. Choose one below or in the app's Apply tab.";
    return;
  }
  const status = await chrome.runtime.sendMessage({ type: "status" });
  const link = `${base}/api/jobs/${encodeURIComponent(job.id)}/cv-file`;
  $("job").replaceChildren();
  const title = document.createElement("b");
  title.textContent = `${job.title} — ${job.company}`;
  const file = document.createElement("div");
  if (job.cv_ready && status?.fileName) {
    file.textContent = `${status.fileName} · `;
    const open = Object.assign(document.createElement("a"), { href: link, target: "_blank", textContent: "Open CV" });
    file.append(open);
  } else {
    file.textContent = "This job has no CV yet.";
  }
  $("job").append(title, file);
}

$("enabled").addEventListener("change", (e) => chrome.storage.local.set({ enabled: e.target.checked }));

$("jobs").addEventListener("change", async (e) => {
  if (!e.target.value) return;
  await fetch(`${await server()}/api/extension/current`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: e.target.value }),
  });
  await chrome.storage.local.set({ changedAt: Date.now() }); // pages re-check their flag
  show();
});

$("server").addEventListener("change", async (e) => {
  await chrome.storage.local.set({ server: e.target.value.trim() || DEFAULT_SERVER });
  show();
});

show();
