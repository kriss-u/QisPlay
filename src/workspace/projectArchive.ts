// Project <-> .zip. The zip holds the project's files plus a manifest at
// `.qisplay/project.json` with the metadata that lives in IndexedDB (project
// info, open tabs, per-file details), so an export can be restored faithfully.
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { APP_NAME } from "../app/brand";
import { db, getSetting, setSetting, type FileContent, type TemplateOrigin } from "./db";
import { ancestors, validateName } from "./paths";
import { uniqueProjectName } from "./workspace";

export const MANIFEST_PATH = ".qisplay/project.json";
const FORMAT = "qisplay-project";
const FORMAT_VERSION = 1;
const MAX_IMPORT_FILE_BYTES = 20 * 1024 * 1024;
const JUNK = /(^|\/)(__MACOSX|__pycache__|\.DS_Store|Thumbs\.db)(\/|$)/;

export interface ProjectManifest {
  format: typeof FORMAT;
  version: number;
  app: string;
  exportedAt: string;
  project: { name: string; createdAt: number; updatedAt: number; template?: TemplateOrigin };
  workspace: { openTabs: string[]; activeFile: string | null };
  files: { path: string; kind: "file" | "dir"; binary?: boolean; updatedAt: number }[];
}

interface TabState {
  tabs: string[];
  active: string | null;
}

export async function exportProjectZip(projectId: string): Promise<{ blob: Blob; filename: string }> {
  const project = await db.projects.get(projectId);
  if (!project) throw new Error("Project not found");
  const files = await db.files.where("projectId").equals(projectId).sortBy("path");
  const tabs = (await getSetting<TabState>(`tabs:${projectId}`)) ?? { tabs: [], active: null };

  const manifest: ProjectManifest = {
    format: FORMAT,
    version: FORMAT_VERSION,
    app: APP_NAME,
    exportedAt: new Date().toISOString(),
    project: {
      name: project.name,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      ...(project.template
        ? { template: { id: project.template.id, version: project.template.version, ref: project.template.ref } }
        : {}),
    },
    workspace: { openTabs: tabs.tabs, activeFile: tabs.active },
    files: files.map((f) => ({
      path: f.path,
      kind: f.kind,
      ...(f.kind === "file" && typeof f.content !== "string" ? { binary: true } : {}),
      updatedAt: f.updatedAt,
    })),
  };

  const tree: Record<string, Uint8Array> = { [MANIFEST_PATH]: strToU8(JSON.stringify(manifest, null, 2) + "\n") };
  for (const f of files) {
    if (f.kind === "dir") tree[`${f.path}/`] = new Uint8Array();
    else tree[f.path] = typeof f.content === "string" ? strToU8(f.content) : f.content;
  }
  const zipped = zipSync(tree, { level: 6 });
  return {
    blob: new Blob([zipped as Uint8Array<ArrayBuffer>], { type: "application/zip" }),
    filename: `${project.name}.zip`,
  };
}

function parseManifest(bytes: Uint8Array | undefined): ProjectManifest | null {
  if (!bytes) return null;
  try {
    const m = JSON.parse(strFromU8(bytes));
    if (m?.format !== FORMAT) return null;
    if (typeof m.version !== "number" || m.version > FORMAT_VERSION) {
      throw new Error(`This project was exported by a newer version of ${APP_NAME}`);
    }
    return m as ProjectManifest;
  } catch (err) {
    if (err instanceof Error && err.message.includes("newer version")) throw err;
    return null; // unreadable manifest: import the files anyway
  }
}

function validOrigin(t: unknown): TemplateOrigin | undefined {
  const o = t as TemplateOrigin | undefined;
  return o && typeof o.id === "string" && typeof o.version === "number" && typeof o.ref === "string" ? o : undefined;
}

/** Normalizes a zip entry path; null if it's unsafe or unusable. */
function cleanPath(raw: string): string | null {
  const parts = raw.replace(/\\/g, "/").split("/").filter((p) => p !== "" && p !== ".");
  if (!parts.length || parts.some((p) => p === ".." || validateName(p) !== null)) return null;
  return parts.join("/");
}

function decodeText(bytes: Uint8Array): string | null {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

export interface ImportResult {
  projectId: string;
  name: string;
  fileCount: number;
  skipped: string[];
  usedManifest: boolean;
}

/** Creates a new project from a .zip (ours, or any zip of a folder). */
export async function importProjectZip(file: File): Promise<ImportResult> {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(new Uint8Array(await file.arrayBuffer()));
  } catch {
    throw new Error(`"${file.name}" isn't a valid .zip file`);
  }
  const manifest = parseManifest(entries[MANIFEST_PATH]);

  let names = Object.keys(entries).filter((n) => !JUNK.test(n) && !n.startsWith(".qisplay/"));
  // A zip of a folder ("myproject/main.py", ...) imports the folder's contents.
  let prefix = "";
  if (!manifest) {
    const tops = new Set(names.map((n) => n.split("/")[0]));
    if (tops.size === 1 && names.every((n) => n.includes("/"))) prefix = `${[...tops][0]}/`;
  }
  names = names.filter((n) => n !== prefix);

  const skipped: string[] = [];
  const files = new Map<string, FileContent>();
  const dirs = new Set<string>();
  const binaryHint = new Set(manifest?.files.filter((f) => f.binary).map((f) => f.path));
  for (const name of names) {
    const path = cleanPath(name.slice(prefix.length));
    if (!path) {
      skipped.push(name);
      continue;
    }
    if (name.endsWith("/")) {
      dirs.add(path);
      continue;
    }
    const bytes = entries[name];
    if (bytes.byteLength > MAX_IMPORT_FILE_BYTES) {
      skipped.push(`${path} (too large)`);
      continue;
    }
    const text = binaryHint.has(path) ? null : decodeText(bytes);
    files.set(path, text ?? bytes);
    for (const dir of ancestors(path)) dirs.add(dir);
  }
  for (const f of manifest?.files ?? []) {
    const path = cleanPath(f.path);
    if (f.kind === "dir" && path) dirs.add(path);
  }
  if (!files.size && !dirs.size) throw new Error("The .zip doesn't contain any usable files");
  for (const dir of [...dirs]) if (files.has(dir)) dirs.delete(dir); // a file wins over a same-named folder

  const baseName = manifest?.project.name ?? file.name.replace(/\.zip$/i, "");
  const name = await uniqueProjectName(validateName(baseName) ? "Imported project" : baseName);
  const now = Date.now();
  const projectId = crypto.randomUUID();
  const updatedAt = new Map(manifest?.files.map((f) => [f.path, f.updatedAt]));

  await db.transaction("rw", db.projects, db.files, async () => {
    await db.projects.add({
      id: projectId,
      name,
      createdAt: manifest?.project.createdAt ?? now,
      updatedAt: now,
      template: validOrigin(manifest?.project.template),
    });
    for (const path of dirs) {
      await db.files.put({ projectId, path, kind: "dir", content: "", updatedAt: updatedAt.get(path) ?? now });
    }
    for (const [path, content] of files) {
      await db.files.put({ projectId, path, kind: "file", content, updatedAt: updatedAt.get(path) ?? now });
    }
  });

  // Restore the open tabs, or open a sensible first file.
  const exists = (p: string | null): p is string => !!p && files.has(p);
  let tabs: TabState = {
    tabs: (manifest?.workspace.openTabs ?? []).filter(exists),
    active: exists(manifest?.workspace.activeFile ?? null) ? manifest!.workspace.activeFile : null,
  };
  if (!tabs.tabs.length) {
    const depth = (p: string) => p.split("/").length;
    const pythonFiles = [...files.keys()]
      .filter((p) => p.endsWith(".py"))
      .sort((a, b) => depth(a) - depth(b) || a.localeCompare(b)); // top-level files first
    const first = ["main.py", ...pythonFiles].find((p) => files.has(p));
    tabs = first ? { tabs: [first], active: first } : { tabs: [], active: null };
  }
  tabs.active ??= tabs.tabs[0] ?? null;
  await setSetting(`tabs:${projectId}`, tabs);

  return { projectId, name, fileCount: files.size, skipped, usedManifest: manifest !== null };
}

/** Opens the browser's file picker for a .zip. Resolves null if cancelled. */
export function pickZipFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".zip,application/zip";
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.addEventListener("cancel", () => resolve(null));
    input.click();
  });
}
