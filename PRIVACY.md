# Privacy Policy

**Last updated: 2026-07-18**

froede is a browser extension and local command-line tool for editing the source code behind a page you are running on `localhost`. This policy covers the froede browser extension specifically, since that is the piece submitted to the Chrome Web Store.

## Data collection

froede does not collect, transmit, sell, or share any user data. There is no server, no account, no analytics, and no telemetry anywhere in the product.

## What the extension stores, and where

The extension uses two permissions:

- **`storage`** - to remember the companion's port number and pairing token you paste into the popup, so you don't have to re-enter them every time. This is stored with `chrome.storage.local`, on your own device only. It is never synced to a Google account, never sent to any server, and never leaves your browser.
- **`activeTab`** - to know which tab to toggle edit mode on, and to send it the selection/edit messages you trigger by clicking. It only acts on the tab you are actively using, and only in response to your own action (opening the popup, clicking "Edit").

The extension also opens a WebSocket connection to `127.0.0.1` (your own machine, never a remote host) to talk to the froede companion process you started yourself with `npx froede`. That connection carries the DOM selection and edit content needed to write your change into your source file - it never leaves your computer.

## Content scripts

The extension's content script only runs on `http://localhost/*` and `http://127.0.0.1/*` pages - the projects you are actively developing. It does not run on, read, or interact with any other website you visit.

## Third parties

froede shares nothing with any third party. There is nothing to share - no data is ever collected in the first place.

## Children's privacy

froede is a developer tool with no data collection of any kind, and is not directed at children.

## Changes to this policy

If this policy ever changes, the update will be committed to this file in the public repository, where the full history is visible.

## Contact

Open an issue at [github.com/Mun1to/froede/issues](https://github.com/Mun1to/froede/issues).

---

For the full technical security model (what runs where, the five locks against a malicious page or a stale token), see [SECURITY.md](SECURITY.md).
