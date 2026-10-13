// Copies the Material Icon Theme (MIT, github.com/material-extensions/vscode-material-icon-theme)
// into public/file-icons and writes a compact lookup table, so the explorer can
// show VS Code-style file and folder icons. Icons are fetched only when used.
import { copyFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = join(root, "node_modules", "material-icon-theme");
const dest = join(root, "public", "file-icons");
const manifest = JSON.parse(readFileSync(join(pkg, "dist", "material-icons.json"), "utf8"));

// Icon id -> SVG file name (without .svg).
const fileOf = Object.fromEntries(
  Object.entries(manifest.iconDefinitions).map(([id, def]) => [id, basename(def.iconPath, ".svg")]),
);
const resolve = (table = {}) =>
  Object.fromEntries(Object.entries(table).flatMap(([k, id]) => (fileOf[id] ? [[k.toLowerCase(), fileOf[id]]] : [])));

const pick = (m) => ({
  extensions: resolve(m.fileExtensions),
  fileNames: resolve(m.fileNames),
  folders: resolve(m.folderNames),
  foldersOpen: resolve(m.folderNamesExpanded),
});

const map = {
  file: fileOf[manifest.file],
  folder: fileOf[manifest.folder],
  folderOpen: fileOf[manifest.folderExpanded],
  ...pick(manifest),
  light: pick(manifest.light ?? {}),
};

mkdirSync(dest, { recursive: true });
let count = 0;
for (const name of readdirSync(join(pkg, "icons"))) {
  if (!name.endsWith(".svg")) continue;
  copyFileSync(join(pkg, "icons", name), join(dest, name));
  count++;
}
copyFileSync(join(pkg, "LICENSE"), join(dest, "LICENSE"));
writeFileSync(join(dest, "map.json"), JSON.stringify(map));
console.log(`copied ${count} Material file icons -> public/file-icons`);
