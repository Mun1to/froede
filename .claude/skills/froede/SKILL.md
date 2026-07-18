---
name: froede
description: Spin up froede to click-edit a web page or app served on localhost (static HTML or React/Vite) so the changes land in the real SOURCE files: text, size, color, typography, spacing, attributes, move and delete elements. Use when the user wants to visually edit their localhost page without hand-editing code.
---

# froede: click-edit your localhost page

froede = a browser extension + a local companion (`npx froede`). Select an element on your localhost page, change it (text, size, color, typography, spacing, attributes, position) or delete it, and the change is written straight to the real source file. Everything runs locally, no cloud, no AI middleman. Undo is `git diff` / `git checkout`.

Repo: https://github.com/Mun1to/froede

## Steps

### 1. Extension (once per browser)
- If froede is on the Chrome Web Store: install it from there (ID `clfpgnbnfgaabdoiadjfkhfhmnfemeba`), no extra setup.
- If loading it unpacked: download the zip from the latest release, unzip, go to `chrome://extensions`, enable Developer mode, "Load unpacked", pick the folder. Note the ID shown under the extension (needed in step 3 if pairing fails).

### 2. Prepare the project
- **React/Vite:** once, in the project folder: `npx froede init` (detects vite.config, installs `vite-plugin-froede`, wires it up). Then start your dev server as usual.
- **Static HTML:** no init needed. Just serve the folder on localhost.

### 3. Start the companion and pair
- In the project folder: `npx froede`. It is a long-running process; it prints a **port** and a **token** (also written to `.froede-token`).
- Open your localhost page, click the froede icon, paste port + token, hit "Toggle edit mode".
- If it does NOT pair and you loaded the extension unpacked, the companion expects the Store ID. Start it with yours: `FROEDE_EXTENSION_ID=<your-id-from-chrome://extensions> npx froede` (PowerShell: `$env:FROEDE_EXTENSION_ID="<your-id>"; npx froede`).

### 4. Edit
- **Click** an element: selects it (resize handles + a panel with size, color, typography, spacing, attributes).
- **Double-click** a text: edit it in place.
- **Drag**: move it (center-snap guides like Canva; Shift = lock to one axis, Alt = free).
- **Backspace / Delete**: delete the selected element.
- Every change is saved to the real file. Review with `git diff`, undo with `git checkout`.

## Notes for the assistant
- Detect the project type first (is there a `vite.config.*`? -> React/Vite; else static HTML).
- The companion is long-running: if you start it via a tool, run it in the background and read the port/token from its output or `.froede-token`. Do not block the session waiting on it.
- Pasting port+token into the popup and toggling edit mode is done by the user (browser UI) - guide them, do not assume it is done.
- On Windows/PowerShell, if `npm`/`npx` errors with "running scripts is disabled" it is the ExecutionPolicy blocking the `.ps1`: fix once with `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned`, or use the `.cmd` variant (`npx.cmd froede`).
- Security: the companion only listens on 127.0.0.1 and only writes inside the folder it started in; a normal web page cannot connect. See SECURITY.md.
