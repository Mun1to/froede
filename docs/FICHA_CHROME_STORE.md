# Ficha de la Chrome Web Store

Textos listos para copiar y pegar en el Developer Dashboard. Todo en inglés porque es el idioma principal de la ficha (igual que el README). Requisitos vigentes verificados en julio 2026: capturas de al menos 1280x800px (hasta 5), política de privacidad obligatoria con URL pública, y una declaración de "propósito único" en la pestaña de prácticas de privacidad.

## Store listing

**Name:** `froede`

**Category:** Developer Tools

**Summary** (resumen corto, máx. 132 caracteres - este tiene 106):

```
Point, click, edit your localhost page - text, size, color, spacing - straight into your real source code.
```

**Detailed description** (texto plano, sin markdown - la ficha no lo interpreta):

```
froede is a lightweight toolkit for editing the code behind a running web page or app by clicking on what you see - no diving into the source, no full IDE required.

Point at an element on a page running on localhost, change it - text, size, color, typography, spacing, attributes, its position (drag to move) - or delete it, and have that change land in the real source file. Not in a sandbox. Not through an AI agent as a middleman. Not a throwaway DOM tweak that disappears on reload.

How it works:
- Click any element to select it. Resize handles appear on its corners (Shift+drag to lock to one axis), and a panel shows size, color, typography, spacing and the element's editable attributes.
- Drag an element to move it, with smart guides that snap it to the center of its container. Press Backspace to delete the selected element.
- Double-click a text element to edit its content in place.
- Every change writes straight to the real source file on your machine - static HTML and React + Vite projects are both supported.

Everything runs locally. There is no cloud, no account, no telemetry, and no AI. The extension talks only to a small companion process you start yourself with "npx froede" in your own project folder, over a loopback-only connection your browser secures with a pairing token. That companion physically cannot write outside the project folder it was started in, and every edit verifies the current file content before writing so it never overwrites unrelated changes.

Setup:
1. Install this extension.
2. In your project: npx froede init (skip for static HTML).
3. Run: npx froede - it prints a port and pairing token to paste into this extension's popup.

froede is open source (MIT). Full docs, source and security model: https://github.com/Mun1to/froede
```

## Privacy practices tab

**Single purpose description:**

```
froede lets a developer click an element on their own localhost page and edit its text, size, color, typography, spacing, attributes or position, or delete it, writing the change directly back into the real source file they are running - a point-and-click alternative to hand-editing code for simple visual tweaks.
```

**Permission justifications:**

- `storage`:
  ```
  Used to remember the local companion's port number and pairing token entered in the popup, so the user does not have to retype them every time. Stored only with chrome.storage.local, on the user's own device - never synced to an account or transmitted anywhere.
  ```
- `activeTab`:
  ```
  Used to toggle edit mode on the tab the user is actively using and relay their click/edit actions to it. froede only acts on the tab the user has explicitly activated, never in the background.
  ```
- Host permissions (`http://localhost/*`, `http://127.0.0.1/*`):
  ```
  The content script only runs on localhost/127.0.0.1 pages - the project the developer is actively running - so it can detect element clicks and relay them to the local companion process. It never runs on any other website.
  ```

**Are you using remote code?** No.

**Data usage - collection:** froede does not collect any of the listed data categories (personally identifiable information, health, financial, authentication, personal communications, location, web history, user activity, or website content). Check "No" / leave every category unchecked, and certify the Limited Use disclosure.

**Privacy policy URL:**

```
https://github.com/Mun1to/froede/blob/main/PRIVACY.md
```

## Assets checklist

- [x] Icon 128x128 - `packages/extension/static/icons/icon128.png` (regenerado del logo nuevo)
- [x] Screenshots (1280x800px, hasta 5) - `docs/screenshots/webstore/`: 1_hero, 2_edit, 3_panel, 4_guide (demo VoCript, 24-bit sin alfa). Espejo con nombres semánticos para el README en `docs/screenshots/` (hero/text-edit/panel-select/move-guides).
- [ ] Promo tile pequeño 440x280 (opcional, no obligatorio para publicar)

## Lo que solo puede hacer Munir

Ver checklist completo en `docs/PUBLICAR-WEBSTORE.md`.
