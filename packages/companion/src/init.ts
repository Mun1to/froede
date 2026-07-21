import { promises as fs } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { ensureTokenIgnored } from "./token.js";

const VITE_CONFIG_NAMES = [
  "vite.config.ts",
  "vite.config.mts",
  "vite.config.js",
  "vite.config.mjs",
];

// Keep this in sync with froede's own version (they release together).
const PLUGIN_VERSION_RANGE = "^0.3.0";

type PackageManager = "pnpm" | "npm" | "yarn" | "bun";

async function detectPackageManager(root: string): Promise<PackageManager> {
  const checks: [string, PackageManager][] = [
    ["pnpm-lock.yaml", "pnpm"],
    ["yarn.lock", "yarn"],
    ["bun.lock", "bun"],
    ["bun.lockb", "bun"],
  ];
  for (const [file, pm] of checks) {
    try {
      await fs.stat(path.join(root, file));
      return pm;
    } catch {
      // keep looking
    }
  }
  return "npm";
}

/**
 * Runs `<pm> add -D vite-plugin-froede`, showing real output. Returns
 * success. Passed as a single command string (not an args array) so
 * shell:true never triggers Node's DEP0190 warning about unescaped args -
 * safe here since `pm` is a closed enum and the version is our own
 * constant, never user input.
 */
function installPlugin(root: string, pm: PackageManager): boolean {
  const pkg = `vite-plugin-froede@${PLUGIN_VERSION_RANGE}`;
  const command = pm === "npm" ? `npm install --save-dev ${pkg}` : `${pm} add -D ${pkg}`;
  const result = spawnSync(command, {
    cwd: root,
    stdio: "inherit",
    shell: true,
  });
  return result.status === 0;
}

/**
 * One-step setup: installs vite-plugin-froede (via the project's own package
 * manager, detected from its lockfile) and wires it into the Vite config as
 * the first plugin, then gitignores the token. Conservative on purpose: if
 * the config doesn't look like something it can patch safely, or the install
 * fails, it prints the manual steps instead of guessing.
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
    if (source.includes("vite-plugin-froede")) {
      log(`  ${configFile}: froede is already configured, skipping.`);
    } else {
      let hasPackageJson = true;
      try {
        await fs.stat(path.join(root, "package.json"));
      } catch {
        hasPackageJson = false;
      }

      let installed = false;
      if (hasPackageJson) {
        const pm = await detectPackageManager(root);
        log(`  Installing vite-plugin-froede with ${pm}...`);
        installed = installPlugin(root, pm);
        if (!installed) {
          log(`  Could not run "${pm} add -D vite-plugin-froede" - install it yourself, then re-run "froede init".`);
        }
      } else {
        log("  No package.json found - install vite-plugin-froede yourself, then re-run \"froede init\".");
      }

      const importLine = `import froede from "vite-plugin-froede";`;
      const pluginsPattern = /plugins\s*:\s*\[/;
      if (!installed) {
        log("  Add it by hand once installed (it must run BEFORE the react plugin):");
        log(`    ${importLine}`);
        log("    plugins: [froede(), react()]");
      } else if (!pluginsPattern.test(source)) {
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

  // Point at the release page by URL: someone who installed via npx has no
  // repo checkout, so "load the extension folder" would be a dead end.
  log("Next steps:");
  log("  1. Get the extension (once per browser):");
  log("     https://github.com/Mun1to/froede/releases/latest");
  log("     Download froede-extension.zip, unzip it, then open chrome://extensions,");
  log("     turn on Developer mode, click \"Load unpacked\" and pick the unzipped folder.");
  log("  2. Start the companion here:  npx froede");
  log("  3. Open your localhost page, paste the port + token into the extension popup,");
  log("     then hit \"Edit\" and click something.");
}
