// Project and file operations on top of IndexedDB. All writes go through here.
import { db, type FileContent, type Project, type TemplateOrigin } from "./db";
import { ancestors, basename, isInside, join, validateName } from "./paths";

export class WorkspaceError extends Error {}

const now = () => Date.now();

async function touchProject(projectId: string) {
  await db.projects.update(projectId, { updatedAt: now() });
}

export async function createProject(
  name: string,
  files: Record<string, FileContent> = {},
  template?: TemplateOrigin,
) {
  const error = validateName(name);
  if (error) throw new WorkspaceError(error);
  const project: Project = { id: crypto.randomUUID(), name, createdAt: now(), updatedAt: now(), template };
  await db.transaction("rw", db.projects, db.files, async () => {
    await db.projects.add(project);
    for (const [path, content] of Object.entries(files)) {
      await putFile(project.id, path, content);
    }
  });
  return project;
}

export async function renameProject(projectId: string, name: string) {
  const error = validateName(name);
  if (error) throw new WorkspaceError(error);
  await db.projects.update(projectId, { name, updatedAt: now() });
}

/** `name`, or "name (2)", "name (3)", ... if a project already has it. */
export async function uniqueProjectName(name: string) {
  const taken = new Set((await db.projects.toArray()).map((p) => p.name.toLowerCase()));
  if (!taken.has(name.toLowerCase())) return name;
  for (let i = 2; ; i++) {
    const candidate = `${name} (${i})`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}

/** Hides the "template updated" notice for this project until a newer version. */
export async function dismissTemplateUpdate(projectId: string, version: number) {
  const project = await db.projects.get(projectId);
  if (project?.template) await db.projects.update(projectId, { template: { ...project.template, dismissed: version } });
}

export async function deleteProject(projectId: string) {
  await db.transaction("rw", db.projects, db.files, async () => {
    await db.files.where("projectId").equals(projectId).delete();
    await db.projects.delete(projectId);
  });
}

/** Writes a file, creating any missing parent folders. */
async function putFile(projectId: string, path: string, content: FileContent) {
  for (const dir of ancestors(path)) {
    const existing = await db.files.get([projectId, dir]);
    if (existing?.kind === "file") throw new WorkspaceError(`"${dir}" is a file, not a folder`);
    if (!existing) {
      await db.files.put({ projectId, path: dir, kind: "dir", content: "", updatedAt: now() });
    }
  }
  await db.files.put({ projectId, path, kind: "file", content, updatedAt: now() });
}

export async function createEntry(
  projectId: string,
  parent: string,
  name: string,
  kind: "file" | "dir",
  content = "",
) {
  // `name` may be nested ("a/b/c.py"); the folders on the way are created.
  for (const segment of name.split("/")) {
    const error = validateName(segment);
    if (error) throw new WorkspaceError(error);
  }
  const path = join(parent, name);
  await db.transaction("rw", db.files, db.projects, async () => {
    if (await db.files.get([projectId, path])) {
      throw new WorkspaceError(`"${path}" already exists`);
    }
    if (kind === "file") {
      await putFile(projectId, path, content);
    } else {
      for (const dir of [...ancestors(path), path]) {
        const existing = await db.files.get([projectId, dir]);
        if (existing?.kind === "file") throw new WorkspaceError(`"${dir}" is a file, not a folder`);
        if (!existing) {
          await db.files.put({ projectId, path: dir, kind: "dir", content: "", updatedAt: now() });
        }
      }
    }
    await touchProject(projectId);
  });
  return path;
}

/** Saves editor contents. */
export async function writeFile(projectId: string, path: string, content: FileContent) {
  await db.transaction("rw", db.files, db.projects, async () => {
    await putFile(projectId, path, content);
    await touchProject(projectId);
  });
}

/** Renames or moves a file or folder (with everything inside it). Returns the path map. */
export async function renameEntry(projectId: string, from: string, to: string) {
  if (from === to) return new Map<string, string>();
  const error = validateName(basename(to));
  if (error) throw new WorkspaceError(error);
  if (isInside(to, from)) throw new WorkspaceError("Can't move a folder into itself");

  const moved = new Map<string, string>();
  await db.transaction("rw", db.files, db.projects, async () => {
    const entry = await db.files.get([projectId, from]);
    if (!entry) throw new WorkspaceError(`"${from}" no longer exists`);
    if (await db.files.get([projectId, to])) throw new WorkspaceError(`"${to}" already exists`);

    const all = await db.files.where("projectId").equals(projectId).toArray();
    const affected = all.filter((f) => f.path === from || isInside(f.path, from));
    for (const f of affected) {
      const next = to + f.path.slice(from.length);
      moved.set(f.path, next);
      await db.files.delete([projectId, f.path]);
      await db.files.put({ ...f, path: next, updatedAt: now() });
    }
    for (const dir of ancestors(to)) {
      if (!(await db.files.get([projectId, dir]))) {
        await db.files.put({ projectId, path: dir, kind: "dir", content: "", updatedAt: now() });
      }
    }
    await touchProject(projectId);
  });
  return moved;
}

/** "name.py" if it's free in `parent`, else "name copy.py", "name copy 2.py", ... (as VS Code pastes). */
async function copyName(projectId: string, parent: string, name: string, isDir: boolean) {
  const dot = isDir ? -1 : name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  for (let i = 0; ; i++) {
    const candidate = join(parent, i === 0 ? name : `${stem} copy${i === 1 ? "" : ` ${i}`}${ext}`);
    if (!(await db.files.get([projectId, candidate]))) return candidate;
  }
}

/** Copies a file, or a folder with everything inside it, into `parent`. Returns the new path. */
export async function copyEntry(projectId: string, from: string, parent: string) {
  if (parent === from || isInside(parent, from)) throw new WorkspaceError("Can't copy a folder into itself");
  let to = "";
  await db.transaction("rw", db.files, db.projects, async () => {
    const entry = await db.files.get([projectId, from]);
    if (!entry) throw new WorkspaceError(`"${from}" no longer exists`);
    if (parent && (await db.files.get([projectId, parent]))?.kind !== "dir") {
      throw new WorkspaceError(`"${parent}" is not a folder`);
    }
    to = await copyName(projectId, parent, basename(from), entry.kind === "dir");
    const all = await db.files.where("projectId").equals(projectId).toArray();
    for (const f of all.filter((f) => f.path === from || isInside(f.path, from))) {
      await db.files.put({ ...f, path: to + f.path.slice(from.length), updatedAt: now() });
    }
    await touchProject(projectId);
  });
  return to;
}

/** Deletes a file, or a folder and everything inside it. Returns the deleted paths. */
export async function deleteEntry(projectId: string, path: string) {
  let deleted: string[] = [];
  await db.transaction("rw", db.files, db.projects, async () => {
    const all = await db.files.where("projectId").equals(projectId).toArray();
    deleted = all.filter((f) => f.path === path || isInside(f.path, path)).map((f) => f.path);
    await db.files.bulkDelete(deleted.map((p) => [projectId, p] as [string, string]));
    await touchProject(projectId);
  });
  return deleted;
}

/** Picks "name.py", "name-2.py", ... so a new file never clobbers an existing one. */
export async function uniquePath(projectId: string, parent: string, name: string) {
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  for (let i = 1; ; i++) {
    const candidate = join(parent, i === 1 ? name : `${stem}-${i}${ext}`);
    if (!(await db.files.get([projectId, candidate]))) return candidate;
  }
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
