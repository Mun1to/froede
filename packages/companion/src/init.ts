import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ensureTokenIgnored } from "./token.js";

const VITE_CONFIG_NAMES = [
  "vite.config.ts",
  "vite.config.mts",
  "vite.config.js",
  "vite.config.mjs",
];

/** Absolute path to vite-plugin-froede's built entry, forward slashes. */
function pluginDistPath(): string {
  // dist/init.js -> ../../vite-plugin/dist/index.js
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path
    .resolve(here, "..", "..", "vite-plugin", "dist", "index.js")
    .split(path.sep)
    .join("/");
}

/**
 * One-step setup: wires vite-plugin-froede into the project's vite config
 * (when there is one) and gitignores the token. Conservative on purpose:
 * if the config doesn't look like something it can patch safely, it prints
 * the manual steps instead of guessing.
 */
export async function runInit(root: string): Promise<void> {
  const log = (line: string) => console.log(line);
  log(`froede init - project root: ${root}\n`);

  let configFile: string | undefined;
  for (const name of VITE_CONFIG_NAMES) {
    try {
      await fs.stat(path.join(root, name));
      configFile = name;
      break;
    } catch {
      // keep looking
    }
  }

  if (!configFile) {
    log("  No vite config found - treating this as a static HTML project.");
    log("  Nothing to configure: serve the folder on localhost (for example");
    log("  `python -m http.server`) and run the companion here.\n");
  } else {
    const abs = path.join(root, configFile);
    const source = await fs.readFile(abs, "utf8");
    if (source.includes("froede")) {
      log(`  ${configFile}: froede is already configured, skipping.`);
    } else {
      let rel = path
        .relative(root, pluginDistPath().split("/").join(path.sep))
        .split(path.sep)
        .join("/");
      if (!rel.startsWith(".")) rel = "./" + rel;
      const importLine = `import froede from "${rel}";`;

      const pluginsPattern = /plugins\s*:\s*\[/;
      if (!pluginsPattern.test(source)) {
        log(`  ${configFile}: could not find a plugins: [...] array.`);
        log("  Add froede by hand (it must run BEFORE the react plugin):");
        log(`    ${importLine}`);
        log("    plugins: [froede(), react()]");
      } else {
        // Insert the import after the last existing top-level import line,
        // and froede() as the FIRST plugin (it must transform before react).
        const importMatches = [...source.matchAll(/^import .*$/gm)];
        const lastImport = importMatches[importMatches.length - 1];
        const importAt = lastImport
          ? (lastImport.index ?? 0) + lastImport[0].length
          : 0;
        let updated =
          source.slice(0, importAt) +
          (lastImport ? "\n" : "") +
          importLine +
          (lastImport ? "" : "\n") +
          source.slice(importAt);
        updated = updated.replace(pluginsPattern, (m) => m + "froede(), ");
        await fs.writeFile(abs, updated, "utf8");
        log(`  ${configFile}: added froede() as the first plugin.`);
        log("  Restart your dev server to pick it up.");
      }
    }
  }

  const ignored = await ensureTokenIgnored(root);
  const ignoreMsg = {
    already: ".gitignore already covers .froede-token.",
    added: "added .froede-token to .gitignore.",
    created: "created .gitignore with .froede-token.",
    "no-git": "no git repo here - remember to gitignore .froede-token if you add one.",
  }[ignored];
  log(`  ${ignoreMsg}\n`);

  log("Next steps:");
  log("  1. Run the companion here:  froede   (or: node <froede>/packages/companion/dist/cli.js)");
  log("  2. Load the extension once: chrome://extensions -> Load unpacked -> packages/extension/dist");
  log("  3. Open your localhost page, paste the port + token in the popup, toggle edit mode.");
}
