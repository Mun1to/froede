---
name: froede
description: Spin up froede to click-edit a web page or app served on localhost (static HTML or React/Vite) so the changes land in the real SOURCE files: text, size, color, typography, spacing, attributes, move and delete elements. Use when the user wants to visually edit their localhost page without hand-editing code.
---

# froede: click-edit your localhost page

froede = a browser extension + a local companion (`npx froede`). Select an element on your localhost page, change it (text, size, color, typography, spacing, attributes, position) or delete it, and the change is written straight to the real source file. Everything runs locally, no cloud, no AI middleman. Undo is Ctrl+Z (redo Ctrl+Shift+Z / Ctrl+Y) for edit-by-edit, or `git diff` / `git checkout` for everything at once.

Repo: https://github.com/Mun1to/froede

> npm can lag behind the repo. If you are developing froede itself (working inside this repo, testing an unreleased fix), run the LOCAL build instead of the published package: `node packages/companion/dist/cli.js` (after `pnpm build`), and load the extension unpacked from `packages/extension/dist`. `npx froede` always pulls whatever is currently on npm.

## Steps

### 1. Extension (once per browser)
- If froede is on the Chrome Web Store: install it from there (ID `clfpgnbnfgaabdoiadjfkhfhmnfemeba`), no extra setup.
- If loading it unpacked: download the zip from the latest release, unzip, go to `chrome://extensions`, enable Developer mode, "Load unpacked", pick the folder. Note the ID shown under the extension (needed in step 3 if pairing fails).

### 2. Prepare the project
- **React/Vite:** once, in the project folder: `npx froede init` (detects vite.config, installs `vite-plugin-froede`, wires it up). Then start your dev server as usual.
- **Static HTML:** no init needed. Just serve the folder on localhost.

### 3. Start the companion and pair
- **Before starting**, check the port isn't already taken by a companion from an earlier session (`Get-NetTCPConnection -LocalPort 4519 -State Listen` on Windows) - a stale process on the default port is a common false "it's broken" moment. Pick another with `--port` if so.
- **cd into the project folder FIRST**, then start the companion there - it roots itself at the current working directory, so starting it from the wrong folder (e.g. a monorepo's root instead of the actual app folder) silently breaks every file path. Confirm by reading the `project root:` line it prints.
- `npx froede` (or the local build - see the note above). It is a long-running process; it prints a **port** and a **token** (also written to `.froede-token`). **Copy the token directly from the terminal** (select + copy) - never retype or hand-transcribe it, one wrong character and pairing fails with a confusing "token does not match" error.
- Open your localhost page, click the froede icon, paste port + token, hit "Save and test", then "Edit" (the button turns green and reads "Editing" while the mode is on).
- If it does NOT pair and you loaded the extension unpacked: the companion's own terminal will print exactly why (extension id not authorised) and ask `Authorise extension <id> permanently? [s/N]` - answer that prompt with just `s` or `n`, nothing else (do not paste other commands into it). Once approved, it is remembered for next time. The popup also shows a ready-to-copy `FROEDE_EXTENSION_ID=<id> npx froede` command as a fallback.

### 4. Edit
- **Click** an element: selects it (resize handles + a panel with size, color, typography, spacing, attributes).
- **Double-click** a text: edit it in place.
- **Drag**: move it (snaps to nearby elements' edges/centers and the parent's padded box, Figma-style; Shift = lock to one axis, Alt = free).
- **Backspace / Delete**: delete the selected element.
- If the element is one of several rendered by the same `.map()` (a loop), froede asks first: **Change only this one** or **Change all N** - it never silently rewrites every instance from one click.
- Every change is saved to the real file. **Ctrl+Z** undoes the last edit (**Ctrl+Shift+Z** / **Ctrl+Y** redoes it) without leaving the page; `git diff` / `git checkout` still works for everything at once.

## Notes for the assistant
- Detect the project type first (is there a `vite.config.*`? -> React/Vite; else static HTML).
- The companion is long-running: if you start it via a tool, run it in the background and read the port/token from its output or `.froede-token`. Do not block the session waiting on it. Pass the target folder explicitly (e.g. `Set-Location <project>; node ...cli.js` in one call) rather than relying on whatever cwd the tool happens to default to.
- Pasting port+token into the popup and toggling edit mode is done by the user (browser UI) - guide them, do not assume it is done.
- On Windows/PowerShell, if `npm`/`npx` errors with "running scripts is disabled" it is the ExecutionPolicy blocking the `.ps1`: fix once with `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned`, or use the `.cmd` variant (`npx.cmd froede`).
- Security: the companion only listens on 127.0.0.1 and only writes inside the folder it started in; a normal web page cannot connect. See SECURITY.md.
