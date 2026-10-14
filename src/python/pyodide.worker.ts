// Hosts the Pyodide (CPython -> WebAssembly) runtime off the UI thread.
// The worker only executes project files sent from the editor: there is no
// REPL and stdin is disabled, so the terminal is output-only. Pages opened with
// pywebview's API (webview.py) show in a dialog and call back in here.
import type { PyodideInterface } from "pyodide";
import type { PyProxy } from "pyodide/ffi";
import type { Completion, FromWorker, ProjectFiles, Target, ToWorker } from "./protocol";
import bootstrap from "./bootstrap.py?raw";
import webviewShim from "./webview.py?raw";

// The app is type-checked against the DOM lib, so describe the worker scope locally.
const ctx = self as unknown as {
  postMessage(msg: FromWorker): void;
  onmessage: ((event: MessageEvent<ToWorker>) => void) | null;
  location: Location;
};

const BASE = import.meta.env.BASE_URL;
const PYODIDE_URL = `${BASE}pyodide/`;
// Must match the installed `pyodide` npm version so the wheel ABI lines up.
const PACKAGE_CDN = "https://cdn.jsdelivr.net/pyodide/v314.0.7/full/";

// Shipped in the Pyodide distribution. libopenblas is the BLAS/LAPACK that the
// qiskit-aer wheel is dynamically linked against.
// jedi powers editor autocompletion.
const PYODIDE_PACKAGES = [
  "micropip",
  "numpy",
  "scipy",
  "matplotlib",
  "sympy",
  "libopenblas",
  "jedi",
];
// Pulled from PyPI by micropip (pure Python, or official wasm wheels).
const PYPI_PACKAGES = [
  "rustworkx",
  "dill",
  "stevedore",
  "typing-extensions",
  "python-dateutil",
  "pylatexenc", // qiskit's matplotlib circuit drawer
];
// Not on PyPI as wasm wheels; provided via public/wheels once compiled.
const LOCAL_PACKAGES = ["qiskit", "qiskit_aer"];

const REPORTED = ["numpy", "scipy", "matplotlib", "sympy", "rustworkx", ...LOCAL_PACKAGES];

// Installed in the background once Python is ready, so they don't delay
// startup. A run whose code uses one (`uses`) waits until it's in. `pyodide`
// ones ship with Pyodide; the rest come from PyPI.
/**
 * `pyodide`: ships with the runtime. `needs`: install from PyPI without its
 * declared dependencies, loading just these runtime packages first.
 */
const BACKGROUND: { name: string; uses: RegExp; pyodide?: boolean; needs?: string[] }[] = [
  { name: "qiskit-algorithms", uses: /\bqiskit_algorithms\b/ }, // VQE, QAOA, Grover, optimizers
  // Only qasm3.load/loads need it; qasm3.dumps and loads_experimental are built in.
  { name: "qiskit-qasm3-import", uses: /\bqasm3\.loads?\b|\bqiskit_qasm3_import\b/ },
  { name: "pandas", uses: /\bpandas\b/, pyodide: true },
  // Its terminal viewer (textual, typer) can't run here; timelines, summary()
  // export() and diff() only need pydantic, and rich prints the CLI frames.
  { name: "qisdebug", uses: /\bqisdebug\b/, needs: ["pydantic", "rich"] },
];
const installed = new Set<string>();
let background: Promise<void> = Promise.resolve();

let py: PyodideInterface | undefined;
let runner: PyProxy | undefined;
let webview: PyProxy | undefined; // the pywebview stand-in (webview.py)
let interrupt: Uint8Array | undefined;
// Output produced right now belongs to a script run or to console input.
let target: Target = "run";

const post = (msg: FromWorker) => ctx.postMessage(msg);
const status = (text: string) => post({ type: "status", text });

function streamTo(type: "stdout" | "stderr") {
  const decoder = new TextDecoder();
  return {
    write(buf: Uint8Array) {
      post({ type, text: decoder.decode(buf, { stream: true }), target });
      return buf.length;
    },
  };
}

async function localWheels(): Promise<string[]> {
  try {
    const res = await fetch(`${BASE}wheels/manifest.json`, { cache: "no-cache" });
    if (!res.ok) return [];
    const { wheels } = (await res.json()) as { wheels?: string[] };
    return (wheels ?? []).map((w) => new URL(`${BASE}wheels/${w}`, ctx.location.href).href);
  } catch {
    return [];
  }
}

async function init(buffer?: SharedArrayBuffer) {
  status("Starting Python…");
  const { loadPyodide } = (await import(
    /* @vite-ignore */ `${PYODIDE_URL}pyodide.mjs`
  )) as typeof import("pyodide");
  py = await loadPyodide({ indexURL: PYODIDE_URL, packageBaseUrl: PACKAGE_CDN });

  // Package installers print progress; keep it out of the user's output.
  py.setStdout({ batched: () => {} });
  py.setStderr({ batched: () => {} });
  py.setStdin({ error: true });
  if (buffer) {
    interrupt = new Uint8Array(buffer);
    py.setInterruptBuffer(interrupt);
  }

  status("Loading scientific packages…");
  await py.loadPackage(PYODIDE_PACKAGES, { messageCallback: () => {} });

  const micropip = py.pyimport("micropip");
  status("Loading more packages…");
  await micropip.install(PYPI_PACKAGES);

  const wheels = await localWheels();
  if (wheels.length) {
    status("Loading Qiskit…");
    await micropip.install(wheels);
  }
  micropip.destroy();

  py.setStdout(streamTo("stdout"));
  py.setStderr(streamTo("stderr"));

  status("Almost ready…");
  py.FS.mkdirTree("/opt/qisplay");
  py.FS.writeFile("/opt/qisplay/_runner.py", bootstrap);
  py.FS.writeFile("/opt/qisplay/webview.py", webviewShim);
  py.runPython(`
import sys
sys.path.insert(0, "/opt/qisplay")
import _runner
`);
  runner = py.globals.get("_runner") as PyProxy;
  runner._set_figure_sink((png: string) => post({ type: "figure", png, target }));
  webview = py.pyimport("webview") as PyProxy;
  webview._set_sink((window: number, title: string, html: string, width: number, height: number, methods: PyProxy) => {
    post({ type: "window-open", window, title: String(title), html, width, height, methods: methods.toJs() as string[] });
    methods.destroy();
  });

  const all = versions(REPORTED);
  const packages: Record<string, string> = {
    python: py.runPython("import sys; sys.version.split()[0]"),
  };
  const missing: string[] = [];
  for (const [name, v] of Object.entries(all)) {
    if (v) packages[name] = v;
    else missing.push(name);
  }
  post({ type: "ready", packages, missing, background: BACKGROUND.map((p) => p.name) });
  // A failure here is retried when code actually uses the package.
  background = install(BACKGROUND.map((p) => p.name)).catch(() => {});
}

/** Installed versions by distribution name (null if missing). */
function versions(names: string[]): Record<string, string | null> {
  const result = py!.runPython(`
from importlib.metadata import version, PackageNotFoundError
def _v(n):
    try:
        return version(n)
    except PackageNotFoundError:
        return None
{n: _v(n) for n in ${JSON.stringify(names)}}
`);
  const all = result.toJs({ dict_converter: Object.fromEntries }) as Record<string, string | null>;
  result.destroy();
  return all;
}

/**
 * Installs quietly and reports the new versions. Pyodide's loader prints
 * progress to stdout (even with micropip's verbose=False), which would land in
 * the user's output, so its packages go through loadPackage with messages off.
 */
async function install(names: string[]) {
  const spec = (n: string) => BACKGROUND.find((p) => p.name === n);
  const fromPyodide = names.filter((n) => spec(n)?.pyodide);
  const fromPypi = names.filter((n) => !fromPyodide.includes(n));
  const withDeps = fromPypi.filter((n) => !spec(n)?.needs);
  const noDeps = fromPypi.filter((n) => spec(n)?.needs);
  const runtime = [...fromPyodide, ...noDeps.flatMap((n) => spec(n)!.needs!)];
  const quiet = { messageCallback: () => {}, errorCallback: () => {} };
  if (runtime.length) await py!.loadPackage(runtime, quiet);
  if (fromPypi.length) {
    const micropip = py!.pyimport("micropip");
    try {
      if (withDeps.length) await micropip.install.callKwargs(withDeps, { verbose: false });
      if (noDeps.length) await micropip.install.callKwargs(noDeps, { deps: false, verbose: false });
    } finally {
      micropip.destroy();
    }
  }
  const found = versions(names);
  const failed = names.filter((n) => !found[n]);
  if (failed.length) throw new Error(`not available: ${failed.join(", ")}`);
  names.forEach((n) => installed.add(n));
  runner?._invalidate_index(); // so auto-import offers their names
  post({ type: "installed", packages: found as Record<string, string> });
}

/** Before running code that uses a background package: wait for it, or retry if that failed. */
async function installUsed(sources: string[], kind: Target) {
  const code = sources.join("\n");
  const used = BACKGROUND.filter((p) => p.uses.test(code)).map((p) => p.name);
  if (!used.length || used.every((n) => installed.has(n))) return;
  post({ type: "info", text: `[loading ${used.filter((n) => !installed.has(n)).join(", ")}…]\n`, target: kind });
  await background;
  const needed = used.filter((n) => !installed.has(n));
  if (!needed.length) return;
  try {
    await install(needed);
  } catch (err) {
    const reason = String(err).trim().split("\n").pop();
    post({ type: "stderr", text: `Couldn't install ${needed.join(", ")}: ${reason}\n`, target: kind });
  }
}

/** Project .py sources, scanned for on-demand imports. */
const pythonSources = (files: ProjectFiles) =>
  Object.entries(files.files)
    .filter(([path, content]) => path.endsWith(".py") && typeof content === "string")
    .map(([, content]) => content as string);

/** Runs a script or console input; both report the files they changed. */
function execute(
  id: number,
  kind: Target,
  call: (files: unknown, dirs: unknown) => PyProxy,
  files: ProjectFiles,
  columns: number,
) {
  if (!py || !runner) return;
  if (interrupt) interrupt[0] = 0;
  // shutil.get_terminal_size() reads COLUMNS; Qiskit's text drawer folds to it.
  const os = py.pyimport("os");
  const environ = os.environ;
  environ.set("COLUMNS", String(columns));
  environ.destroy();
  os.destroy();
  target = kind;
  const started = performance.now();
  let ok = false;
  let changed: Record<string, string | Uint8Array> = {};
  const pyFiles = py.toPy(files.files);
  const pyDirs = py.toPy(files.dirs);
  try {
    const result = call(pyFiles, pyDirs);
    const [okValue, changedProxy] = result.toJs({ depth: 1 });
    ok = okValue;
    changed = changedProxy.toJs({ dict_converter: Object.fromEntries });
    changedProxy.destroy();
    result.destroy();
  } catch (err) {
    post({ type: "stderr", text: `${String(err)}\n`, target });
  } finally {
    pyFiles.destroy();
    pyDirs.destroy();
  }
  post({ type: "done", id, ok, ms: performance.now() - started, changed, target: kind });
}

function complete(id: number, code: string, line: number, column: number, entry: string) {
  let items: Completion[] = [];
  if (runner) {
    try {
      const result = runner._complete(code, line, column, entry);
      items = result.toJs({ dict_converter: Object.fromEntries });
      result.destroy();
    } catch {
      items = [];
    }
  }
  post({ type: "completions", id, items });
}

ctx.onmessage = async (event: MessageEvent<ToWorker>) => {
  const msg = event.data;
  if (msg.type === "init") {
    try {
      await init(msg.interruptBuffer);
    } catch (err) {
      post({ type: "fatal", error: String(err) });
    }
  } else if (msg.type === "run") {
    await installUsed(pythonSources(msg.files), "run");
    execute(msg.id, "run", (f, d) => runner!._run(msg.entry, f, d), msg.files, msg.columns);
  } else if (msg.type === "console") {
    await installUsed([msg.source, ...pythonSources(msg.files)], "console");
    execute(msg.id, "console", (f, d) => runner!._console(msg.source, f, d), msg.files, msg.columns);
  } else if (msg.type === "sync") {
    // Keep the project on disk current so autocomplete sees other files' latest code.
    if (py && runner) {
      const f = py.toPy(msg.files.files);
      const d = py.toPy(msg.files.dirs);
      try {
        runner._sync_project(f, d);
      } catch {
        // Best effort; the next run syncs again.
      } finally {
        f.destroy();
        d.destroy();
      }
    }
  } else if (msg.type === "console-reset") {
    runner?._console_reset();
  } else if (msg.type === "is-complete") {
    const status = runner ? (runner._is_complete(msg.source) as "complete" | "incomplete" | "invalid") : "complete";
    post({ type: "is-complete", id: msg.id, status });
  } else if (msg.type === "complete") {
    complete(msg.id, msg.code, msg.line, msg.column, msg.entry);
  } else if (msg.type === "window-call") {
    let reply: string;
    try {
      reply = webview!._call(msg.window, msg.method, msg.args) as string;
    } catch (err) {
      reply = JSON.stringify({ error: String(err) });
    }
    post({ type: "window-result", id: msg.id, reply });
  } else if (msg.type === "window-close") {
    webview?._close(msg.window);
  }
};
