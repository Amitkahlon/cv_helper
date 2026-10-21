# cvhelper auto-attach (proof of concept)

A Chrome extension that holds one CV: the CV of the job you're applying to right
now (the job the cvhelper app's Apply tab is showing). When auto-attach is on, a
click on any website's upload-resume control attaches that CV instead of opening
the file picker, and a small note in the corner says which file was attached.

## Load it

1. Open `chrome://extensions`, turn on **Developer mode**.
2. **Load unpacked** → choose this `extension-poc` folder (Chrome 111 or newer).
3. Run `cvhelper ui`, and choose a current job: open it in the app's Apply tab,
   or pick it in the extension's popup. The job needs a built (or chosen) CV.

## Use it

- Click the site's "Upload resume" button (or the file field, or its label):
  the CV is attached.
- **Alt+click** opens the normal file picker, to choose a different file.
- The popup's **Auto-attach** switch turns it off everywhere.
- Fields that are clearly not for a CV (images only, or named cover letter,
  photo, avatar, transcript) are left alone.
- If cvhelper isn't running or the job has no CV, nothing is blocked.

## Files

- `main.js` runs in the page's own world and catches `input.click()` /
  `input.showPicker()` calls made by custom upload buttons.
- `content.js` catches direct clicks, decides if the field is for a CV, and
  attaches the file.
- `background.js` is the only part that talks to cvhelper (`127.0.0.1:4321`, or
  the URL set under "Server" in the popup).

## Limits

- Sites that only take drag-and-drop, with no file field at all, won't work.
- Sites that upload through their own iframe from another domain, or open
  their own kind of picker, may not work.
- A file field the extension can't tell apart (e.g. one unnamed field for "any
  document") gets the CV; Alt+click if you wanted something else.

## Safety

The CV is attached only in direct response to your own click or key press (the browser marks those as
trusted; pages can't fake them). A site that clicks its file field by itself, fires fake clicks, or calls
`click()` later from a timer gets the normal file picker, never your CV. Turn auto-attach off in the popup
when you're not applying.
