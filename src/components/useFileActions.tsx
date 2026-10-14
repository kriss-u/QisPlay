import { Text } from "@chakra-ui/react";
import type { FileEntry } from "../workspace/db";
import { basename, dirname, join, validateName } from "../workspace/paths";
import type { Workspace } from "../workspace/useWorkspace";
import { EXAMPLES } from "../examples";
import { copyEntry, createEntry, deleteEntry, renameEntry, uniquePath } from "../workspace/workspace";
import { useDialogs } from "./dialogContext";
import { showError } from "./toast";

/** Create / rename / move / copy / delete; shared by the explorer and the command palette. */
export function useFileActions(ws: Workspace, onReveal?: (folder: string) => void) {
  const dialogs = useDialogs();
  const projectId = ws.project?.id;

  async function create(parent: string, kind: "file" | "dir") {
    if (!projectId) return;
    const name = await dialogs.prompt({
      title: kind === "file" ? "New file" : "New folder",
      label: parent ? `In ${parent}/` : "In the project root",
      initial: kind === "file" ? "untitled.py" : "",
      confirmLabel: "Create",
      validate: (v) => validateName(v) ?? (ws.fileMap.has(join(parent, v)) ? "That name is taken" : null),
    });
    if (!name) return;
    try {
      const path = await createEntry(projectId, parent, name, kind);
      if (parent) onReveal?.(parent);
      if (kind === "file") ws.openFile(path);
    } catch (err) {
      showError(err);
    }
  }

  async function rename(entry: FileEntry) {
    if (!projectId) return;
    const parent = dirname(entry.path);
    const name = await dialogs.prompt({
      title: `Rename ${entry.kind === "dir" ? "folder" : "file"}`,
      initial: basename(entry.path),
      confirmLabel: "Rename",
      validate: (v) =>
        validateName(v) ??
        (v !== basename(entry.path) && ws.fileMap.has(join(parent, v)) ? "That name is taken" : null),
    });
    if (!name || name === basename(entry.path)) return;
    try {
      await ws.flush();
      ws.applyRename(await renameEntry(projectId, entry.path, join(parent, name)));
    } catch (err) {
      showError(err);
    }
  }

  /** Moves a file or folder into `parent` ("" = project root), keeping its name. Returns the new path. */
  async function move(path: string, parent: string) {
    const to = join(parent, basename(path));
    if (!projectId || to === path) return;
    try {
      await ws.flush();
      ws.applyRename(await renameEntry(projectId, path, to));
      if (parent) onReveal?.(parent);
      return to;
    } catch (err) {
      showError(err);
    }
  }

  /** Copies a file or folder into `parent`; returns the copy's path. */
  async function copy(path: string, parent: string) {
    if (!projectId) return;
    try {
      await ws.flush(); // copy what the editor shows, not the last autosave
      const to = await copyEntry(projectId, path, parent);
      if (parent) onReveal?.(parent);
      return to;
    } catch (err) {
      showError(err);
    }
  }

  async function remove(entry: FileEntry) {
    if (!projectId) return;
    const isDir = entry.kind === "dir";
    const ok = await dialogs.confirm({
      title: `Delete ${isDir ? "folder" : "file"}?`,
      body: (
        <Text>
          <b>{entry.path}</b>
          {isDir ? " and everything in it" : ""} will be deleted. This can't be undone.
        </Text>
      ),
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    try {
      ws.forgetPaths(entry.path);
      await deleteEntry(projectId, entry.path);
    } catch (err) {
      showError(err);
    }
  }

  async function addExample(index: number) {
    const ex = EXAMPLES[index];
    if (!projectId || !ex) return;
    try {
      const path = await uniquePath(projectId, "", ex.file);
      await createEntry(projectId, "", path, "file", ex.code);
      ws.openFile(path);
    } catch (err) {
      showError(err);
    }
  }

  return { create, rename, move, copy, remove, addExample };
}
