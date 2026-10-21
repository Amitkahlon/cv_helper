// The popup: pick the job (the one matching this page, or the Apply wizard's
// current job), put its CV into the page's upload field, mark it submitted.

const DEFAULT_SERVER = "http://127.0.0.1:4321";
const app = document.getElementById("app");
const serverInput = document.getElementById("server");
const server = () => (localStorage.getItem("server") || DEFAULT_SERVER).replace(/\/$/, "");

serverInput.value = server();
serverInput.addEventListener("change", () => {
  localStorage.setItem("server", serverInput.value.trim() || DEFAULT_SERVER);
  load();
});

const el = (tag, props = {}, children = []) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
};

async function api(path, options) {
  const response = await fetch(server() + path, options);
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${response.status}`);
  }
  return response;
}

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function load() {
  app.replaceChildren(el("p", { className: "hint", textContent: "Loading..." }));
  const tab = await activeTab();
  let state;
  try {
    state = await (await api(`/api/extension/state?url=${encodeURIComponent(tab?.url || "")}`)).json();
  } catch {
    app.replaceChildren(
      el("p", { className: "error", textContent: "Can't reach cvhelper." }),
      el("p", { className: "hint", textContent: "Run `cvhelper ui` and try again." }),
    );
    return;
  }
  if (state.jobs.length === 0) {
    app.replaceChildren(el("p", { className: "hint", textContent: "No open jobs in your tracker." }));
    return;
  }

  const select = el(
    "select",
    {},
    state.jobs.map((job) =>
      el("option", {
        value: job.id,
        textContent: `${job.title}${job.company ? " — " + job.company : ""}${job.cv_ready ? "" : " (no CV yet)"}`,
      }),
    ),
  );
  select.value = state.match || state.current || state.jobs[0].id;
  const why = el("p", { className: "hint" });
  const status = el("p");
  const fillButton = el("button", { className: "primary", textContent: "Put my CV into this page" });
  const submitButton = el("button", { textContent: "Mark as submitted" });
  const showWhy = () => {
    why.textContent =
      select.value === state.match ? "This job matches the page." : select.value === state.current ? "The Apply wizard's current job." : "";
    const job = state.jobs.find((j) => j.id === select.value);
    fillButton.disabled = !job.cv_ready;
  };
  select.addEventListener("change", showWhy);
  showWhy();

  fillButton.addEventListener("click", async () => {
    status.className = "hint";
    status.textContent = "Filling...";
    try {
      const response = await api(`/api/jobs/${encodeURIComponent(select.value)}/cv-file`);
      const fileName = /filename="?([^";]+)"?/.exec(response.headers.get("content-disposition") || "")?.[1] || "CV.pdf";
      const type = response.headers.get("content-type")?.split(";")[0] || "application/pdf";
      const bytes = new Uint8Array(await response.arrayBuffer());
      let binary = "";
      for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      const base64 = btoa(binary);

      const target = { tabId: tab.id, allFrames: true };
      await chrome.scripting.executeScript({ target, files: ["fill.js"] });
      const results = await chrome.scripting.executeScript({
        target,
        func: (data, name, mime) => window.cvhelperFillCv(data, name, mime),
        args: [base64, fileName, type],
      });
      const filled = results.map((r) => r.result).filter((r) => r && r.filled);
      if (filled.length) {
        status.className = "ok";
        status.textContent = `Attached ${fileName} to: ${filled[0].field || "the upload field"}. Check it before sending.`;
      } else {
        status.className = "error";
        status.textContent = "No CV upload field found on this page. Open the application form first.";
      }
    } catch (err) {
      status.className = "error";
      status.textContent = String(err.message || err);
    }
  });

  submitButton.addEventListener("click", async () => {
    try {
      await api(`/api/jobs/${encodeURIComponent(select.value)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submitted: true }),
      });
      status.className = "ok";
      status.textContent = "Marked as submitted.";
    } catch (err) {
      status.className = "error";
      status.textContent = String(err.message || err);
    }
  });

  app.replaceChildren(select, why, fillButton, submitButton, status);
}

load();
