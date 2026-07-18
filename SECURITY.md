# Is froede safe? (plain-language edition)

froede edits files on your computer, so you deserve to know exactly what it can and cannot do - in normal words, not just code. [Version en espanol](SECURITY.es.md).

## What actually runs, and where

| Piece | Where it lives | What it can do |
|---|---|---|
| Browser extension | Your browser | Sees your clicks on localhost pages. **Cannot touch your files** - browsers forbid it, by design. |
| Companion (`npx froede`) | A terminal, inside YOUR project folder | The only piece that writes files. It can **only** write inside the folder you started it in - never outside. |
| Vite plugin (optional) | Your dev server, only while developing | Adds an invisible "this element comes from file X, line Y" label in dev. Never runs in production builds, never changes your files. |

Nothing else. **No cloud, no account, no telemetry, no AI.** Your code never leaves your machine. When you close the companion terminal, froede is completely off.

## The five locks

1. **Local only.** The companion listens on `127.0.0.1` - it does not exist for your network, let alone the internet.
2. **Web pages can never connect.** Browsers stamp every connection with its origin; the companion accepts only froede's own extension ID and rejects everything else. Neither a malicious website nor any other installed extension can talk to it.
3. **Pairing token.** A secret code (stored in `.froede-token`, gitignored automatically) that you paste into the extension once per project. Without it, nothing can ask the companion to write - not even other programs on your own computer.
4. **Fenced to one folder.** The companion physically cannot write outside the project folder you started it in. Symlink tricks and `../` paths are checked and rejected.
5. **No blind writes.** Before every edit, the companion re-reads the file and verifies it still contains what the browser thinks it does. If anything changed underneath (you edited in your IDE, another tool touched it), the edit is aborted instead of guessing.

Extra rails: edits are a closed allowlist (plain text, a fixed set of style properties, a fixed set of attributes), values are escaped before touching a file, and `href`/`src` reject `javascript:`-style URLs outright - froede will never write a script-injection vector into your code, even if asked to.

## What froede can never do

- Write outside the project folder it was started in
- Run when you haven't started it
- Send anything anywhere (there is no server to send to)
- Edit arbitrary code: only the text, styles and attributes of the element you clicked
- Bypass git: every change lands as a normal file edit you can see with `git diff` and undo with `git checkout`

## Reporting a vulnerability

Open an issue at [github.com/Mun1to/froede/issues](https://github.com/Mun1to/froede/issues), or if it is sensitive, use GitHub's private "Report a vulnerability" on the Security tab.

## For the technically curious

The full threat model (DNS rebinding, constant-time token comparison, realpath confinement, the drift-guard protocol) is documented in [docs/PROTOCOLO.md](docs/PROTOCOLO.md) (Spanish) and in the source - the companion is ~600 lines of readable TypeScript in [`packages/companion/src`](packages/companion/src).
