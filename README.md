<p align="center"><img src="docs/brand/froede-logo.svg" width="110" alt="froede logo"></p>

# froede

**front + edit + code.** A lightweight toolkit for editing the code behind a running web page or app by clicking on what you see - no diving into the source, no full IDE required.

[![npm](https://img.shields.io/npm/v/froede)](https://www.npmjs.com/package/froede) [![license](https://img.shields.io/npm/l/froede)](LICENSE)

> **Status: live on npm** (current version in the badge above). Text, size, color, typography, spacing and attributes (alt, href, placeholder, src, title) all edit end to end on both targets (static HTML and React + Vite), verified against real files - including a real `npx froede@latest init` run against a clean project. Layout and animations are on the roadmap. Not yet in the Chrome Web Store - the quickstart below covers the manual install.

![Selecting an element shows resize handles and a property panel](docs/screenshots/panel-select.png)

## The idea

Point at an element on a live page or app, change it - text, size, color, typography, spacing, attributes - and have that change land in the real source code. Not in a sandbox. Not through an AI agent as a middleman. Not a throwaway DOM tweak that disappears on reload. As simple and intuitive as a devtools extension, not a full design app.

## See it in action

| Before | Editing text | Selected: style + attributes |
|---|---|---|
| ![A portfolio page running on localhost](docs/screenshots/hero.png) | ![A heading being edited in place](docs/screenshots/text-edit.png) | ![A button selected, with resize handles and a panel showing size, colors, type, spacing and its href attribute](docs/screenshots/panel-select.png) |

Click any element to select it - resize handles appear on its corners (Shift+drag to lock to one axis) and a panel shows size, color, typography, spacing and the element's editable attributes. Double-click a text element to edit its content in place. Every change writes straight to the real source file.

## Is it safe?

froede edits files on your computer, so this matters: everything runs **locally** (no cloud, no account, no telemetry, no AI), the part that writes files can only touch the one folder you point it at, and every piece is explained in normal words in [SECURITY.md](SECURITY.md) - including what froede can *never* do. Your undo is always `git diff`.

## How it works

```
Browser (Chrome/Edge)                     Your machine
┌────────────────────────┐               ┌─────────────────────────────┐
│ froede extension (MV3) │  WebSocket    │ froede companion (Node.js)  │
│ select/edit an element │ ────────────► │ finds the exact spot in the │
│ text, size, color, ... │  127.0.0.1    │ real source file and splices│
└────────────────────────┘  + token      │ the edit (format preserved) │
                                         └─────────────────────────────┘
                                     static HTML: parse5 + tab reload
                                     React/Vite:  babel loc + Vite HMR
```

- **Static HTML:** the extension sends the element's DOM path; the companion maps it onto the file with parse5 (same WHATWG algorithm as the browser) and splices the text node or the `style="..."` attribute.
- **React + Vite:** a tiny Vite plugin (`vite-plugin-froede`, dev-only) stamps every host element with `data-froede-loc="src/App.tsx:4:6"`; the companion re-parses that file and splices the exact JSX text or patches the `style={{}}` object. Vite HMR shows the change instantly.
- **Style edits are always inline and always scoped to the exact element** - never a shared class rule, so resizing one card never moves its siblings.
- **Security:** loopback only, Origin check (web pages can never connect), shared token (constant-time compared), and the companion physically cannot write outside the project folder it was started in. Every edit verifies the current value first and aborts on mismatch.

## Quickstart

1. **Get the extension** (once per browser): [download the .zip from the latest release](https://github.com/Mun1to/froede/releases/latest), unzip it, then go to `chrome://extensions`, turn on Developer mode, click "Load unpacked" and pick the unzipped folder.

2. **Wire up your project** (static HTML projects skip this - just serve the folder on localhost):

   ```bash
   cd your-project
   npx froede init   # detects your Vite config, installs the plugin, wires it up
   ```

3. **Start the companion and pair it:**

   ```bash
   npx froede        # prints a port and a pairing token
   ```

   Open your localhost page, paste the port + token into the extension popup, and hit "Toggle edit mode". Click to select, double-click to edit text - every change is saved to the real file, and your undo is `git diff`.

Full walkthrough, including a ready-to-paste prompt for your AI coding session: [`docs/INSTALAR.md`](docs/INSTALAR.md) (Spanish).

v0.3 edits plain visible text, inline size/color/typography/spacing, and a safe allowlist of attributes (href/src reject script-scheme URLs) - no layout (move/duplicate/delete) or animations yet.

## Landscape (as of mid-2026)

Before starting, we looked for anything that already does this:

| Project | Open source | Simple / lightweight | Writes back to real source |
|---|---|---|---|
| [Onlook](https://github.com/onlook-dev/onlook) | Yes (Apache-2.0) | No - full editor app, sandboxed web container, Next.js + Tailwind only | Yes |
| [Stagewise](https://github.com/stagewise-io/stagewise) | Yes | Yes - browser toolbar | Indirect - routes through a connected AI coding agent |
| [VisBug](https://github.com/GoogleChromeLabs/ProjectVisBug) | Yes (Apache-2.0) | Yes - browser extension | No - ephemeral, DOM-only |
| [GrapesJS](https://github.com/GrapesJS/grapesjs) | Yes (BSD-3-Clause) | No - an SDK for building editors, not an end-user tool | No - export-based |
| [Plasmic](https://github.com/plasmicapp/plasmic) | Split (MIT core / AGPL studio) | No - separate Studio app | Publish-based, not live |
| Chrome DevTools Workspaces | Built-in | Yes | Sources panel only - element/DOM edits aren't saved |

None of them combine "point-and-click simple" with "writes straight to your real source, no sandbox, no AI middleman." That's the gap froede is aiming at.

Full research notes: [`docs/INVESTIGACION.md`](docs/INVESTIGACION.md) (Spanish).

## License

MIT - see [LICENSE](LICENSE).
