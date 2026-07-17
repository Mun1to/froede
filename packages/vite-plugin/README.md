# vite-plugin-froede

Dev-only Vite plugin for [froede](https://github.com/Mun1to/froede) - it stamps every JSX host element with `data-froede-loc="src/App.tsx:4:6"` during `vite dev`, so the froede extension can map what you click in the browser back to the exact spot in your source code.

- **Dev only**: never runs on `vite build`, nothing leaks into production.
- **In-memory only**: the attribute exists in the served modules, never in your files.
- Components (capitalized) are skipped so the attribute never pollutes props.

## Use

`npx froede init` adds it for you. Manually:

```ts
// vite.config.ts
import froede from "vite-plugin-froede";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [froede(), react()], // froede() must come first
});
```

Full docs: [github.com/Mun1to/froede](https://github.com/Mun1to/froede#readme)
