// VS Code-style file and folder icons from the Material Icon Theme (MIT).
// The lookup table and SVGs are copied to /file-icons by scripts/copy-file-icons.mjs.
import { useEffect, useState } from "react";
import { useColorMode } from "../app/colorMode";

interface Table {
  extensions: Record<string, string>;
  fileNames: Record<string, string>;
  folders: Record<string, string>;
  foldersOpen: Record<string, string>;
}

interface IconMap extends Table {
  file: string;
  folder: string;
  folderOpen: string;
  light: Table;
}

const BASE = `${import.meta.env.BASE_URL}file-icons/`;
let loading: Promise<IconMap | null> | null = null;
let loaded: IconMap | null = null;

function loadMap() {
  loading ??= fetch(`${BASE}map.json`)
    .then((r) => (r.ok ? (r.json() as Promise<IconMap>) : null))
    .then((m) => (loaded = m))
    .catch(() => null);
  return loading;
}

function lookup(map: IconMap, light: boolean, pick: (t: Table) => string | undefined) {
  return (light ? pick(map.light) : undefined) ?? pick(map);
}

/** Resolves like the VS Code extension: exact file name, then longest extension. */
function iconName(map: IconMap, name: string, kind: "file" | "dir", open: boolean, light: boolean) {
  const lower = name.toLowerCase();
  if (kind === "dir") {
    return (
      lookup(map, light, (t) => (open ? t.foldersOpen : t.folders)[lower]) ?? (open ? map.folderOpen : map.folder)
    );
  }
  const byName = lookup(map, light, (t) => t.fileNames[lower]);
  if (byName) return byName;
  const parts = lower.split(".");
  for (let i = 1; i < parts.length; i++) {
    const ext = parts.slice(i).join(".");
    const byExt = lookup(map, light, (t) => t.extensions[ext]);
    if (byExt) return byExt;
  }
  return map.file;
}

export function FileIcon({
  name,
  kind = "file",
  open = false,
  size = 16,
}: {
  name: string;
  kind?: "file" | "dir";
  open?: boolean;
  size?: number;
}) {
  const [map, setMap] = useState<IconMap | null>(loaded);
  const { colorMode } = useColorMode();
  useEffect(() => {
    if (!map) void loadMap().then(setMap);
  }, [map]);

  if (!map) return <span style={{ display: "inline-block", width: size, height: size, flexShrink: 0 }} />;
  const icon = iconName(map, name, kind, open, colorMode === "light");
  return (
    <img
      src={`${BASE}${icon}.svg`}
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      draggable={false}
      style={{ flexShrink: 0 }}
    />
  );
}
