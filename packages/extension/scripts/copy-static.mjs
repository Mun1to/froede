import { cpSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const dist = path.join(root, "dist");

mkdirSync(dist, { recursive: true });
cpSync(path.join(root, "static"), dist, { recursive: true });
console.log("copied static/ -> dist/");
