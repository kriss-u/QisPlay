import { createFromTemplate, type Catalog, type TemplateInfo } from "../templates/catalog";
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

/** Create a project from a template and open it. Rethrows so callers can stay open on failure. */
export async function openTemplate(ws: Workspace, catalog: Catalog, template: TemplateInfo) {
  try {
    await ws.flush();
    const projectId = await createFromTemplate(catalog, template);
    await ws.openProject(projectId);
    toaster.create({ type: "success", title: `Created "${template.title}"` });
  } catch (err) {
    showError(err);
    throw err;
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
