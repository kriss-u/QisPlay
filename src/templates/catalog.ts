// Template projects come from a public GitHub repo (kriss-u/qisplay-templates),
// read through jsDelivr's CDN: no account, no backend. The repo's index.json
// lists every template and its files; we fetch it at the newest version tag,
// whose files jsDelivr serves as immutable, and fetch a template's files only
// when someone creates a project from it.
import { getSetting, setSetting, type FileContent, type TemplateOrigin } from "../workspace/db";
import { createProject, uniqueProjectName } from "../workspace/workspace";

const REPO = import.meta.env.VITE_TEMPLATES_REPO || "kriss-u/qisplay-templates";
const SCHEMA = 1;
const CACHE_KEY = "templates:catalog";
const REF_KEY = "qisplay:templates-ref";
/** How long a fetched catalog counts as fresh before we look for a newer tag. */
const FRESH_MS = 5 * 60 * 1000;

export interface TemplateCollection {
  id: string;
  title: string;
  description?: string;
}

export interface TemplateInfo {
  id: string;
  title: string;
  description: string;
  version: number;
  order: number;
  collections: string[];
  tags: string[];
  level?: "beginner" | "intermediate" | "advanced";
  changes?: string;
  open: string[];
  files: { path: string; size: number }[];
}

export interface Catalog {
  /** Repo version (tag without "v", branch or commit) the catalog was read at. */
  ref: string;
  collections: TemplateCollection[];
  templates: TemplateInfo[];
}

const base = (ref: string) => `https://cdn.jsdelivr.net/gh/${REPO}@${ref}/`;

/**
 * A ref to preview instead of the newest tag, from `?templates=<sha|branch>`.
 * Kept for the tab's session so reloads stay on it.
 */
function overrideRef(): string | null {
  try {
    return sessionStorage.getItem(REF_KEY);
  } catch {
    return null;
  }
}

export function setOverrideRef(ref: string) {
  try {
    sessionStorage.setItem(REF_KEY, ref);
  } catch {
    // Private mode: the preview just won't survive a reload.
  }
}

/**
 * index.json at the preview ref, or at `@latest`. jsDelivr resolves `@latest`
 * to the newest version tag and names it in `x-jsd-version`, so one request
 * gives both the catalog and the exact version to fetch its files at. Its edge
 * caches `@latest` for up to 12 hours (the templates repo's release workflow
 * purges it), and "no-cache" revalidates instead of trusting the browser's
 * week-long copy.
 */
async function fetchIndex(): Promise<{ ref: string; index: unknown }> {
  const preview = overrideRef();
  const res = await fetch(`${base(preview ?? "latest")}index.json`, { cache: "no-cache" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const ref = preview ?? res.headers.get("x-jsd-version");
  if (!ref) throw new Error("the CDN didn't say which version it served");
  return { ref, index: await res.json() };
}

async function fetchCatalog(): Promise<Catalog> {
  const { ref, index: raw } = await fetchIndex();
  const index = raw as { schema?: number; collections?: TemplateCollection[]; templates?: TemplateInfo[] };
  if (index?.schema !== SCHEMA || !Array.isArray(index.templates)) {
    throw new Error("The template list is in a format this version doesn't understand. Reload the page to update.");
  }
  return { ref, collections: index.collections ?? [], templates: index.templates };
}

let pending: { at: number; promise: Promise<Catalog> } | null = null;

/**
 * The template catalog. Reuses a recent fetch; offline (or if jsDelivr is
 * down) falls back to the last catalog this browser saw.
 */
export function loadCatalog(force = false): Promise<Catalog> {
  if (pending && !force && Date.now() - pending.at < FRESH_MS) return pending.promise;
  const promise = fetchCatalog().then(
    async (catalog) => {
      if (!overrideRef()) await setSetting(CACHE_KEY, catalog);
      return catalog;
    },
    async (err) => {
      const cached = await getSetting<Catalog>(CACHE_KEY);
      if (cached && !overrideRef()) return cached;
      if (pending?.promise === promise) pending = null; // retry next time instead of reusing the failure
      throw new Error(`Couldn't load templates (${err instanceof Error ? err.message : err}). Check your connection.`);
    },
  );
  pending = { at: Date.now(), promise };
  return promise;
}

function decode(bytes: Uint8Array): FileContent {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return bytes;
  }
}

/** Downloads a template's files and creates a new project from them. Returns its id. */
export async function createFromTemplate(catalog: Catalog, template: TemplateInfo): Promise<string> {
  const dir = `${base(catalog.ref)}templates/${encodeURIComponent(template.id)}/`;
  const entries = await Promise.all(
    template.files.map(async ({ path }) => {
      const res = await fetch(dir + path.split("/").map(encodeURIComponent).join("/"));
      if (!res.ok) throw new Error(`Couldn't download ${path} (HTTP ${res.status})`);
      return [path, decode(new Uint8Array(await res.arrayBuffer()))] as const;
    }),
  );
  const origin: TemplateOrigin = { id: template.id, version: template.version, ref: catalog.ref };
  const project = await createProject(await uniqueProjectName(template.title), Object.fromEntries(entries), origin);
  const tabs = template.open.filter((p) => entries.some(([path]) => path === p));
  await setSetting(`tabs:${project.id}`, { tabs, active: tabs[tabs.length - 1] ?? null });
  return project.id;
}

/** The catalog's newer version of the template a project came from, unless dismissed. */
export function availableUpdate(catalog: Catalog | null, origin: TemplateOrigin | undefined): TemplateInfo | null {
  if (!catalog || !origin) return null;
  const latest = catalog.templates.find((t) => t.id === origin.id);
  if (!latest || latest.version <= origin.version || latest.version === origin.dismissed) return null;
  return latest;
}
