# froede

**front + edit + code.** A lightweight toolkit for editing the code behind a running web page or app by clicking on what you see - no diving into the source, no full IDE required.

> **Status: v0.1 MVP (working).** Visible text editing works end to end on both targets (static HTML and React + Vite), verified against real files. Styles, layout and more are on the roadmap. Not yet published to npm or the Chrome Web Store - see the quickstart below.

## The idea

Point at an element on a live page or app, change it - text, style, layout - and have that change land in the real source code. Not in a sandbox. Not through an AI agent as a middleman. Not a throwaway DOM tweak that disappears on reload. As simple and intuitive as a devtools extension, not a full design app.

## How it works

```
Browser (Chrome/Edge)                     Your machine
┌────────────────────────┐               ┌─────────────────────────────┐
│ froede extension (MV3) │  WebSocket    │ froede companion (Node.js)  │
│ click text -> edit it  │ ────────────► │ finds the exact spot in the │
│ in place, press Enter  │  127.0.0.1    │ real source file and splices│
└────────────────────────┘  + token      │ the edit (format preserved) │
                                         └─────────────────────────────┘
                                     static HTML: parse5 + tab reload
                                     React/Vite:  babel loc + Vite HMR
```

- **Static HTML:** the extension sends the element's DOM path; the companion maps it onto the file with parse5 (same WHATWG algorithm as the browser) and splices the text node.
- **React + Vite:** a tiny Vite plugin (`@froede/vite-plugin`, dev-only) stamps every host element with `data-froede-loc="src/App.tsx:4:6"`; the companion re-parses that file and splices the exact JSX text. Vite HMR shows the change instantly.
- **Security:** loopback only, Origin check (web pages can never connect), shared token (constant-time compared), and the companion physically cannot write outside the project folder it was started in. Every edit verifies the current text first and aborts on mismatch.

## Quickstart (v0.1, from source)

```powershell
git clone https://github.com/Mun1to/froede && cd froede
pnpm install && pnpm build
```

1. **Extension:** `chrome://extensions` -> Developer mode -> Load unpacked -> `packages/extension/dist`.
2. **Companion:** `cd` into the project you want to edit, then `node <froede>/packages/companion/dist/cli.js`. It prints a port and token.
3. **React/Vite projects only:** add `froede()` from `@froede/vite-plugin` as the first plugin in `vite.config.ts` and restart dev.
4. Open your localhost page, paste port + token in the extension popup, hit "Toggle edit mode", click any text, type, press Enter. The file is saved for real - your undo is `git diff`.

v0.1 edits plain visible text only (no styles/layout yet, no `{expressions}` in JSX). Try it on `examples/static-site` and `examples/react-vite-app`.

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
