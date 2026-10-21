// The only part that talks to cvhelper (content scripts can't: CORS). Answers
// content scripts: "status" (should clicks attach the CV?) and "cv" (the file).
const DEFAULT_SERVER = "http://127.0.0.1:4321";
const CACHE_MS = 60_000;
let cache = null; // { key, at, cv } - the current job's CV, so clicks are instant

async function settings() {
  const { server, enabled } = await chrome.storage.local.get(["server", "enabled"]);
  return { server: (server || DEFAULT_SERVER).replace(/\/+$/, ""), enabled: enabled !== false };
}

async function getJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
  if (!res.ok) throw new Error(`${res.status} from cvhelper`);
  return res.json();
}

// The app's current job, if it has a CV.
async function currentJob(server) {
  const state = await getJson(`${server}/api/extension/state`);
  const job = state.jobs.find((j) => j.id === state.current);
  return job && job.cv_ready ? job : null;
}

// Express sends: attachment; filename="X.pdf"; filename*=UTF-8''X.pdf
function fileNameFrom(disposition) {
  const star = /filename\*=UTF-8''([^;]+)/i.exec(disposition || "");
  if (star) return decodeURIComponent(star[1]);
  const plain = /filename="?([^";]+)"?/i.exec(disposition || "");
  return plain ? plain[1] : "CV.pdf";
}

function toBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let text = "";
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(text);
}

async function currentCv() {
  const { server } = await settings();
  const job = await currentJob(server);
  if (!job) return null;
  const key = `${server} ${job.id}`;
  if (cache && cache.key === key && Date.now() - cache.at < CACHE_MS) return cache.cv;
  const res = await fetch(`${server}/api/jobs/${encodeURIComponent(job.id)}/cv-file`, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) return null;
  const cv = {
    id: job.id,
    title: job.title,
    fileName: fileNameFrom(res.headers.get("content-disposition")),
    type: res.headers.get("content-type")?.split(";")[0] || "application/octet-stream",
    base64: toBase64(await res.arrayBuffer()),
  };
  cache = { key, at: Date.now(), cv };
  return cv;
}

async function answer(message) {
  try {
    if (message.type === "cv") return await currentCv();
    if (message.type === "status") {
      if (!(await settings()).enabled) return { armed: false };
      const cv = await currentCv();
      return cv ? { armed: true, title: cv.title, fileName: cv.fileName } : { armed: false };
    }
  } catch {
    // cvhelper isn't running (or answered badly): never block the page.
  }
  return message.type === "cv" ? null : { armed: false };
}

chrome.runtime.onMessage.addListener((message, _sender, reply) => {
  answer(message).then(reply);
  return true; // reply comes later
});
