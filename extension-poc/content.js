// Runs in every frame of every page. When armed (auto-attach on, and the app's
// current job has a CV), a click on a CV upload field attaches that CV instead
// of opening the file picker. Talks to cvhelper only through background.js,
// because a page's content script can't fetch 127.0.0.1 (CORS).
(() => {
  const CV_WORDS = /\b(cv|resume|résumé|curriculum)\b|קורות|קו"ח/i;
  const OTHER_WORDS = /cover.?letter|motivation|photo|picture|avatar|headshot|transcript|portfolio|מכתב|תמונה/i;
  const IMAGE_ONLY = /^(image\/.*|\.(png|jpe?g|gif|webp|heic|bmp|svg))$/i;

  // True only while a real click or key press by the user is being handled.
  // Registered first, so it is set before the listeners below run. A page's own
  // timers and fake events never set it (pages can't fake isTrusted).
  let inUserAction = false;
  for (const type of ["click", "keydown", "pointerup"]) {
    addEventListener(type, (event) => {
      if (!event.isTrusted) return;
      inUserAction = true;
      setTimeout(() => (inUserAction = false), 0);
    }, true);
  }

  let altSeen = 0;
  const trackAlt = (event) => { if (event.altKey) altSeen = Date.now(); };
  for (const type of ["pointerdown", "mousedown", "keydown"]) addEventListener(type, trackAlt, true);
  const altHeld = () => Date.now() - altSeen < 1000;

  // After the extension is reloaded, old copies of this script lose their link
  // to it. They must then stop blocking anything.
  const alive = () => !!chrome.runtime?.id;
  const isArmed = () => alive() && document.documentElement?.dataset.cvhelperArmed === "1";

  let status = { armed: false };
  function setArmed(value) {
    const root = document.documentElement;
    if (!root) return;
    if (value) root.dataset.cvhelperArmed = "1";
    else delete root.dataset.cvhelperArmed;
  }
  async function refresh() {
    if (!alive()) return setArmed(false);
    try {
      status = (await chrome.runtime.sendMessage({ type: "status" })) || { armed: false };
    } catch {
      status = { armed: false };
    }
    setArmed(status.armed);
  }

  // The words that describe a file field: its own attributes and labels first;
  // nearby text only if those say nothing.
  function notForCv(input) {
    const accept = (input.accept || "").split(",").map((s) => s.trim()).filter(Boolean);
    if (accept.length && accept.every((a) => IMAGE_ONLY.test(a))) return true;
    const labels = [...(input.labels || [])].map((l) => l.textContent);
    const own = [input.name, input.id, input.title, input.getAttribute("aria-label"), ...labels].join(" ");
    if (CV_WORDS.test(own)) return false;
    if (OTHER_WORDS.test(own)) return true;
    let el = input.parentElement;
    for (let i = 0; el && i < 3; i++, el = el.parentElement) {
      const text = (el.textContent || "").slice(0, 200);
      if (CV_WORDS.test(text)) return false;
      if (OTHER_WORDS.test(text)) return true;
    }
    return false; // unsure: attach
  }

  // Only right after a real click or key press by the user. Without this, any
  // website could call input.click() (or fake a click) on its own while armed and
  // read your CV from the field. Pages can't fake user activation.
  const userJustActed = () => navigator.userActivation?.isActive === true;

  const wanted = (input) => isArmed() && userJustActed() && !altHeld() && !input.disabled && !notForCv(input);

  // 1. The user clicks the file field itself (or its label, which clicks it).
  addEventListener("click", (event) => {
    const input = event.composedPath()[0];
    if (!event.isTrusted) return; // a page's fake click gets nothing
    if (!(input instanceof HTMLInputElement) || input.type !== "file" || !wanted(input)) return;
    event.preventDefault(); // this is what stops the file picker
    attach(input);
  }, true);

  // 2. The site's own button called input.click()/showPicker() (see main.js).
  addEventListener("cvhelper-attach", (event) => {
    const input = event.composedPath()[0];
    // Only when the site's button reacts to a real click right now; the site
    // calling click() later, or firing this event itself, gets the normal flow.
    if (!inUserAction) return;
    if (!(input instanceof HTMLInputElement) || !wanted(input)) return;
    event.preventDefault(); // tells main.js we took over
    attach(input);
  }, true);

  async function attach(input) {
    let cv = null;
    try {
      cv = await chrome.runtime.sendMessage({ type: "cv" });
    } catch {}
    if (!cv) {
      setArmed(false); // so the next click opens the normal picker
      toast("cvhelper couldn't get the CV (is cvhelper running?). Click again to choose a file.", true);
      refresh();
      return;
    }
    const bytes = Uint8Array.from(atob(cv.base64), (c) => c.charCodeAt(0));
    const transfer = new DataTransfer();
    transfer.items.add(new File([bytes], cv.fileName, { type: cv.type }));
    input.files = transfer.files;
    input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    input.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
    toast(`cvhelper attached ${cv.fileName} for ${cv.title}. Alt+click to choose a different file.`);
  }

  // A small note in the corner, in a shadow root so the page's CSS can't touch it.
  let hideTimer;
  function toast(text, isError = false) {
    let host = document.getElementById("cvhelper-toast");
    if (!host) {
      host = document.createElement("div");
      host.id = "cvhelper-toast";
      host.attachShadow({ mode: "open" });
      (document.body || document.documentElement).append(host);
    }
    host.style.cssText = "all:initial;position:fixed;right:16px;bottom:16px;z-index:2147483647;";
    host.shadowRoot.innerHTML = "";
    const box = document.createElement("div");
    box.textContent = text;
    box.style.cssText = `max-width:320px;padding:10px 14px;border-radius:8px;font:13px/1.4 system-ui,sans-serif;
      color:#fff;background:${isError ? "#b42318" : "#1f2328"};box-shadow:0 4px 16px rgba(0,0,0,.25);`;
    host.shadowRoot.append(box);
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => host.remove(), 5000);
  }

  // 3. Keep the flag fresh: the user may move to the next job in the app.
  refresh();
  addEventListener("focus", refresh);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh(); });
  chrome.storage.onChanged.addListener(refresh);
})();
