import { downloadBlob } from "../workspace/workspace";
import { exportProjectZip, importProjectZip, pickZipFile } from "../workspace/projectArchive";
import type { Workspace } from "../workspace/useWorkspace";
import { showError, toaster } from "./toast";

/** Download the current project (files + .qisplay/project.json manifest). */
export async function exportProject(ws: Workspace) {
  if (!ws.project) return;
  try {
    await ws.flush();
    const { blob, filename } = await exportProjectZip(ws.project.id);
    downloadBlob(blob, filename);
  } catch (err) {
    showError(err);
  }
}

/** Pick a .zip and open it as a new project. */
export async function importProject(ws: Workspace) {
  const file = await pickZipFile();
  if (!file) return;
  try {
    const result = await importProjectZip(file);
    await ws.openProject(result.projectId);
    toaster.create({
      type: result.skipped.length ? "warning" : "success",
      title: `Opened "${result.name}"`,
      description:
        `${result.fileCount} file(s)` +
        (result.usedManifest ? ", with tabs and settings restored" : "") +
        (result.skipped.length ? `. Skipped: ${result.skipped.slice(0, 5).join(", ")}${result.skipped.length > 5 ? "…" : ""}` : ""),
    });
  } catch (err) {
    showError(err);
  }
}
