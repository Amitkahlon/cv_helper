// Injected into the application page (all frames). Defines cvhelperFillCv, which
// puts a file into the page's best-matching upload field and reports what it did.
// The page can't do this itself: browsers only let an extension fill a file field.
(() => {
  if (window.cvhelperFillCv) return;

  const CV_WORDS = /\b(cv|resume|résumé|curriculum)\b|קורות|קו"ח/i;
  const OTHER_WORDS = /cover|letter|motivation|photo|picture|avatar|transcript|portfolio|מכתב/i;

  // Text that describes a file field: its attributes, its label, and nearby text.
  function describe(input) {
    const parts = [input.name, input.id, input.getAttribute("aria-label"), input.accept];
    if (input.id) {
      const label = document.querySelector(`label[for="${CSS.escape(input.id)}"]`);
      if (label) parts.push(label.textContent);
    }
    const near = input.closest("label, fieldset, [class*=upload], [class*=field], div");
    if (near) parts.push(near.textContent.slice(0, 300));
    return parts.filter(Boolean).join(" ");
  }

  function score(input) {
    const text = describe(input);
    let points = 0;
    if (CV_WORDS.test(text)) points += 3;
    if (OTHER_WORDS.test(text) && !CV_WORDS.test(text)) points -= 3;
    if (/pdf|\.doc|application\//i.test(input.accept || "")) points += 1;
    if (!input.accept) points += 0.5;
    if (/image\//i.test(input.accept || "")) points -= 2;
    return points;
  }

  window.cvhelperFillCv = (base64, fileName, mimeType) => {
    const inputs = [...document.querySelectorAll('input[type="file"]')].filter((input) => !input.disabled);
    if (inputs.length === 0) return { filled: false, reason: "no upload field in this frame" };
    const best = inputs.map((input) => ({ input, points: score(input) })).sort((a, b) => b.points - a.points)[0];
    if (best.points < 0) return { filled: false, reason: "only non-CV upload fields here" };

    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const file = new File([bytes], fileName, { type: mimeType });
    const transfer = new DataTransfer();
    transfer.items.add(file);
    best.input.files = transfer.files;
    best.input.dispatchEvent(new Event("input", { bubbles: true }));
    best.input.dispatchEvent(new Event("change", { bubbles: true }));
    return { filled: true, field: describe(best.input).replace(/\s+/g, " ").trim().slice(0, 80), points: best.points };
  };
})();
