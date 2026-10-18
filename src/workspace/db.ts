// Everything the user creates lives in this browser's IndexedDB (via Dexie):
// projects and their files and folders.
import Dexie, { type EntityTable, type Table } from "dexie";

export interface Project {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  /** Set when the project was created from a template (see src/templates/). */
  template?: TemplateOrigin;
}

/** Which template, at which version, a project started from. */
export interface TemplateOrigin {
  id: string;
  version: number;
  /** The templates repo version (tag or commit) it was fetched from. */
  ref: string;
  /** An update notice the user dismissed, by template version. */
  dismissed?: number;
}

/** Text files hold a string; files a script writes (e.g. PNGs) may be binary. */
export type FileContent = string | Uint8Array;

export interface FileEntry {
  projectId: string;
  /** Slash-separated, relative to the project root, e.g. "src/utils.py". */
  path: string;
  kind: "file" | "dir";
  content: FileContent;
  updatedAt: number;
}

export interface Setting {
  key: string;
  value: unknown;
}

export const db = new Dexie("py-wasm") as Dexie & {
  projects: EntityTable<Project, "id">;
  files: Table<FileEntry, [string, string]>;
  settings: EntityTable<Setting, "key">;
};

db.version(1).stores({
  projects: "id, updatedAt",
  files: "[projectId+path], projectId",
  runs: "++id, projectId, [projectId+createdAt]",
  settings: "key",
});
// v2 removed run history; `null` deletes the old table and its data.
db.version(2).stores({ runs: null });

export async function getSetting<T>(key: string): Promise<T | undefined> {
  return (await db.settings.get(key))?.value as T | undefined;
}

export async function setSetting(key: string, value: unknown) {
  await db.settings.put({ key, value });
}

/** Ask the browser not to evict our data under storage pressure (best effort). */
export async function requestPersistentStorage() {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) {
      await navigator.storage.persist();
    }
  } catch {
    // Not fatal: data is still stored, just evictable.
  }
}
