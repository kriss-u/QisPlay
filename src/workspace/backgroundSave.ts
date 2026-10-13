// Saving unsaved edits when the tab is hidden or closed.
//
// A page's own workers die with the tab, so two mechanisms back each other up:
//  1. The service worker (public/sw.js) receives the edits and finishes writing
//     them to IndexedDB after the tab is gone (kept alive via waitUntil).
//  2. A synchronous localStorage journal, which always completes; it's replayed
//     into IndexedDB on the next visit if anything was missed.
import { db } from "./db";

export interface PendingEdit {
  projectId: string;
  path: string;
  content: string;
  savedAt: number;
}

const JOURNAL_KEY = "qisplay:unsaved-edits";

export function registerSaveWorker() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("/sw.js").catch(() => {
    // Without it, the journal below still preserves edits.
  });
}

export function handOff(edits: PendingEdit[]) {
  if (!edits.length) return;
  try {
    localStorage.setItem(JOURNAL_KEY, JSON.stringify(edits));
  } catch {
    // Storage full or blocked: the service worker may still save them.
  }
  navigator.serviceWorker?.controller?.postMessage({ type: "save-edits", edits });
}

export function clearJournal() {
  try {
    localStorage.removeItem(JOURNAL_KEY);
  } catch {
    // ignore
  }
}

/** Applies edits that never reached IndexedDB. Never resurrects deleted files. */
export async function replayJournal() {
  let edits: PendingEdit[] = [];
  try {
    edits = JSON.parse(localStorage.getItem(JOURNAL_KEY) ?? "[]");
  } catch {
    edits = [];
  }
  if (!edits.length) return 0;
  let applied = 0;
  await db.transaction("rw", db.files, async () => {
    for (const edit of edits) {
      const current = await db.files.get([edit.projectId, edit.path]);
      if (current?.kind === "file" && current.updatedAt < edit.savedAt) {
        await db.files.put({ ...current, content: edit.content, updatedAt: edit.savedAt });
        applied++;
      }
    }
  });
  clearJournal();
  return applied;
}
