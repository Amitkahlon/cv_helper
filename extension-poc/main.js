// Runs in the page's own JavaScript world (not the extension's), so it can
// catch sites whose "Upload resume" button calls input.click() or
// input.showPicker() on a hidden file input. Those calls open the file picker
// without a user click on the input, so content.js would never see them.
(() => {
  if (window.__cvhelperPatched) return;
  window.__cvhelperPatched = true;

  // Alt held (seen in the last second) means "let me pick a file myself".
  let altSeen = 0;
  const trackAlt = (event) => { if (event.altKey) altSeen = Date.now(); };
  for (const type of ["pointerdown", "mousedown", "click", "keydown"]) addEventListener(type, trackAlt, true);

  // content.js sets this flag; it has to be readable right now, without waiting.
  const armed = () => document.documentElement?.dataset.cvhelperArmed === "1";

  // True if content.js took over (it cancels the event when it will attach the
  // CV). Otherwise the site gets the normal picker.
  function handledByCvhelper(input) {
    if (!(input instanceof HTMLInputElement) || input.type !== "file") return false;
    if (!armed() || Date.now() - altSeen < 1000) return false;
    const event = new CustomEvent("cvhelper-attach", { bubbles: true, composed: true, cancelable: true });
    return !input.dispatchEvent(event);
  }

  const proto = HTMLInputElement.prototype;
  const originalClick = proto.click;
  proto.click = function () {
    if (!handledByCvhelper(this)) return originalClick.call(this);
  };
  const originalShowPicker = proto.showPicker;
  if (originalShowPicker) {
    proto.showPicker = function () {
      if (!handledByCvhelper(this)) return originalShowPicker.call(this);
    };
  }
})();
