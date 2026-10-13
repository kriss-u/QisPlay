// QisPlay service worker: finishes saving unsaved editor changes after the tab
// closes. The page posts its pending edits on `pagehide`/`visibilitychange`, and
// `waitUntil` keeps this worker alive until they are written to IndexedDB.
// There is deliberately no fetch handler: nothing is cached or intercepted.

const DB_NAME = "py-wasm";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("message", (event) => {
  if (event.data?.type === "save-edits") event.waitUntil(saveEdits(event.data.edits));
});

function saveEdits(edits) {
  return new Promise((resolve) => {
    const open = indexedDB.open(DB_NAME);
    // The app owns the schema; never create or upgrade the database from here.
    open.onupgradeneeded = () => open.transaction.abort();
    open.onerror = () => resolve();
    open.onsuccess = () => {
      const db = open.result;
      if (!db.objectStoreNames.contains("files")) return db.close(), resolve();
      const tx = db.transaction("files", "readwrite");
      const files = tx.objectStore("files");
      for (const edit of edits) {
        const get = files.get([edit.projectId, edit.path]);
        get.onsuccess = () => {
          const current = get.result;
          // Only update files that still exist and haven't been saved since.
          if (current && current.kind === "file" && current.updatedAt < edit.savedAt) {
            files.put({ ...current, content: edit.content, updatedAt: edit.savedAt });
          }
        };
      }
      tx.oncomplete = tx.onerror = tx.onabort = () => {
        db.close();
        resolve();
      };
    };
  });
}
