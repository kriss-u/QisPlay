import { useLiveQuery } from "dexie-react-hooks";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { clearJournal, handOff, replayJournal, type PendingEdit } from "./backgroundSave";
import { db, getSetting, requestPersistentStorage, setSetting, type FileEntry } from "./db";
import { isInside } from "./paths";
import { WELCOME_FILES } from "./seed";
import { createProject, writeFile } from "./workspace";

const SAVE_DELAY_MS = 400;

interface TabState {
  tabs: string[];
  active: string | null;
}

const tabsKey = (projectId: string) => `tabs:${projectId}`;

// Module-level so React StrictMode's double effects can't seed two projects.
let initialProject: Promise<string> | null = null;
function initialProjectId() {
  initialProject ??= (async () => {
    void requestPersistentStorage();
    await replayJournal(); // edits from a tab that closed before they were saved
    const last = await getSetting<string>("lastProject");
    if (last && (await db.projects.get(last))) return last;
    const recent = await db.projects.orderBy("updatedAt").reverse().first();
    if (recent) return recent.id;
    const p = await createProject("My first project", WELCOME_FILES);
    await setSetting(tabsKey(p.id), { tabs: ["main.py"], active: "main.py" });
    return p.id;
  })();
  return initialProject;
}

/**
 * The open project, its files (live from IndexedDB), the editor tabs, and
 * unsaved editor buffers. Edits are autosaved after a short pause.
 */
export function useWorkspace() {
  const [projectId, setProjectId] = useState<string | null>(null);
  const [tabState, setTabState] = useState<TabState>({ tabs: [], active: null });
  const [buffers, setBuffers] = useState<Record<string, string>>({});

  const projects = useLiveQuery(() => db.projects.orderBy("updatedAt").reverse().toArray(), []);
  const files = useLiveQuery(
    () => (projectId ? db.files.where("projectId").equals(projectId).sortBy("path") : []),
    [projectId],
  );
  const project = projects?.find((p) => p.id === projectId) ?? null;

  // Pending autosaves, keyed by path.
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const pendingWrites = useRef(new Map<string, PendingEdit>());
  const projectRef = useRef(projectId);
  useEffect(() => {
    projectRef.current = projectId;
  }, [projectId]);

  const save = (edit: PendingEdit) => writeFile(edit.projectId, edit.path, edit.content);

  const flush = useCallback(async () => {
    for (const t of timers.current.values()) clearTimeout(t);
    timers.current.clear();
    const edits = [...pendingWrites.current.values()];
    pendingWrites.current.clear();
    await Promise.all(edits.map(save));
  }, []);

  const openProject = useCallback(
    async (id: string) => {
      await flush();
      const saved = (await getSetting<TabState>(tabsKey(id))) ?? { tabs: [], active: null };
      setBuffers({});
      setTabState(saved);
      setProjectId(id);
      await setSetting("lastProject", id);
    },
    [flush],
  );

  // Open the last project (or create the welcome project on first visit).
  useEffect(() => {
    let cancelled = false;
    void initialProjectId().then((id) => {
      if (!cancelled) void openProject(id);
    });
    return () => {
      cancelled = true;
    };
    // openProject is stable; this runs once.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist the open tabs per project.
  useEffect(() => {
    if (projectId) void setSetting(tabsKey(projectId), tabState);
  }, [projectId, tabState]);

  // Drop tabs whose files no longer exist (deleted, or renamed elsewhere).
  useEffect(() => {
    if (!files) return;
    const existing = new Set(files.filter((f) => f.kind === "file").map((f) => f.path));
    setTabState((s) => {
      const tabs = s.tabs.filter((t) => existing.has(t));
      if (tabs.length === s.tabs.length) return s;
      const active = s.active && existing.has(s.active) ? s.active : (tabs[tabs.length - 1] ?? null);
      return { tabs, active };
    });
  }, [files]);

  // Save anything pending before the page goes away.
  useEffect(() => {
    // Hidden or closing: hand unsaved edits to the service worker + journal
    // (both survive the tab closing), then try to save them normally too.
    const onHide = (event: Event) => {
      if (event.type === "visibilitychange" && document.visibilityState !== "hidden") return;
      const edits = [...pendingWrites.current.values()];
      if (!edits.length) return;
      handOff(edits);
      void flush().then(clearJournal);
    };
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, [flush]);

  const openFile = useCallback((path: string) => {
    setTabState((s) => ({ tabs: s.tabs.includes(path) ? s.tabs : [...s.tabs, path], active: path }));
  }, []);

  const closeTab = useCallback((path: string) => {
    setTabState((s) => {
      const i = s.tabs.indexOf(path);
      const tabs = s.tabs.filter((t) => t !== path);
      const active = s.active === path ? (tabs[Math.min(i, tabs.length - 1)] ?? null) : s.active;
      return { tabs, active };
    });
  }, []);

  const editFile = useCallback((path: string, text: string) => {
    const pid = projectRef.current;
    if (!pid) return;
    setBuffers((b) => ({ ...b, [path]: text }));
    pendingWrites.current.set(path, { projectId: pid, path, content: text, savedAt: Date.now() });
    clearTimeout(timers.current.get(path));
    timers.current.set(
      path,
      setTimeout(() => {
        timers.current.delete(path);
        const edit = pendingWrites.current.get(path);
        pendingWrites.current.delete(path);
        if (edit) void save(edit);
      }, SAVE_DELAY_MS),
    );
  }, []);

  /** Keep tabs and buffers in step after a rename/move. */
  const applyRename = useCallback((moved: Map<string, string>) => {
    const map = (p: string) => moved.get(p) ?? p;
    setTabState((s) => ({ tabs: s.tabs.map(map), active: s.active && map(s.active) }));
    setBuffers((b) => Object.fromEntries(Object.entries(b).map(([k, v]) => [map(k), v])));
  }, []);

  /** Before deleting: drop pending saves so they don't resurrect the files. */
  const forgetPaths = useCallback((path: string) => {
    const gone = (p: string) => p === path || isInside(p, path);
    for (const p of [...pendingWrites.current.keys()]) {
      if (gone(p)) {
        pendingWrites.current.delete(p);
        clearTimeout(timers.current.get(p));
        timers.current.delete(p);
      }
    }
    setBuffers((b) => Object.fromEntries(Object.entries(b).filter(([k]) => !gone(k))));
  }, []);

  /** Files a script wrote replace whatever the editor had. */
  const applyExternalChanges = useCallback((changed: Record<string, string | Uint8Array>) => {
    setBuffers((b) => {
      const next = { ...b };
      for (const [path, content] of Object.entries(changed)) {
        if (typeof content === "string") next[path] = content;
        else delete next[path];
      }
      return next;
    });
  }, []);

  const contentOf = useCallback(
    (entry: FileEntry) => (entry.path in buffers ? buffers[entry.path] : entry.content),
    [buffers],
  );

  const fileMap = useMemo(() => new Map((files ?? []).map((f) => [f.path, f])), [files]);

  return {
    projects: projects ?? [],
    project,
    files: files ?? [],
    fileMap,
    loaded: files !== undefined && project !== null,
    tabs: tabState.tabs,
    active: tabState.active,
    setActive: (path: string) => setTabState((s) => ({ ...s, active: path })),
    openProject,
    openFile,
    closeTab,
    editFile,
    contentOf,
    flush,
    applyRename,
    forgetPaths,
    applyExternalChanges,
  };
}

export type Workspace = ReturnType<typeof useWorkspace>;
