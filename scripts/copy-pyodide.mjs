// Copies the Pyodide runtime (Python compiled to WebAssembly) from node_modules
// into public/pyodide so it is served from our own origin. Scientific packages
// (numpy, scipy, matplotlib, ...) are fetched from the matching jsDelivr build.
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "node_modules", "pyodide");
const dest = join(root, "public", "pyodide");
const files = [
  "pyodide.mjs",
  "pyodide.asm.mjs",
  "pyodide.asm.wasm",
  "python_stdlib.zip",
  "pyodide-lock.json",
];

mkdirSync(dest, { recursive: true });
for (const f of files) copyFileSync(join(src, f), join(dest, f));
console.log(`copied Pyodide runtime -> public/pyodide (${files.length} files)`);
