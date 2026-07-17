# froede

**front + edit + code.** Click on your localhost page and the change lands in your real source files - text, styles, attributes. No sandbox, no AI middleman.

This package is the **local companion + CLI**. It pairs with the froede browser extension: the extension sees your clicks, this process writes the files.

## Use

```bash
cd your-project
npx froede init   # one-time: wires the Vite plugin (if any) + gitignores the token
npx froede        # starts the companion; prints a port and a pairing token
```

Then open your localhost page, paste the port + token into the froede extension popup, and toggle edit mode.

## Safety, in one paragraph

The companion listens on `127.0.0.1` only, requires a pairing token (created per project, gitignored automatically), rejects connections from web pages, and can only ever write inside the folder you started it in. Every edit verifies the current value before writing and aborts if the file changed underneath. Full plain-language explanation: [SECURITY.md](https://github.com/Mun1to/froede/blob/main/SECURITY.md).

## Docs

Everything else - screenshots, how it works, the browser extension: [github.com/Mun1to/froede](https://github.com/Mun1to/froede#readme)
