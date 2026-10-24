# QisPlay

A Python and Qiskit playground that runs entirely in the browser. It has a VS Code-style
editor, a file explorer with projects, a Python console and plots. There's no server
and no account; everything a user creates is stored in their own browser.

> Developer notes. Users never see the implementation details below. The UI only
> talks about "Python".

Under the hood: CPython is compiled to WebAssembly by
[Pyodide](https://pyodide.org) 314.0.7 (Python 3.14) and runs in a Web Worker.
qiskit and qiskit-aer are cross-compiled here (see below).

```sh
npm install        # also copies the Pyodide runtime and file icons into public/
npm run dev        # http://localhost:5173
npm run build      # static site in dist/
npm run build:wasm # rebuild the qiskit / qiskit-aer wheels (rarely needed)
```

## Features

- **Projects:** multiple projects stored in IndexedDB (via Dexie). You can create,
  rename, switch and delete them, and download or open them as `.zip` (see
  [Project archives](#project-archives)).
- **Templates:** start a project from a template, such as a course lab. Templates
  come from a public GitHub repo, with no account or server needed (see
  [Templates](#templates)).
- **Explorer:** files and folders with Material Icon Theme icons. Open files appear as
  tabs, and edits autosave.
- **Saving on close:** unsaved edits survive the tab closing. On `pagehide` they're
  handed to a service worker (`public/sw.js`) that finishes writing them, and to a
  synchronous localStorage journal that's replayed on the next visit
  (`src/workspace/backgroundSave.ts`).
- **Editor:** CodeMirror 6 with VS Code Dark+ and Light+ colors, rainbow brackets,
  find/replace at the top, and Jedi autocompletion running inside the in-browser
  Python. Autocomplete also offers **auto-imports**, which add the import to the file
  when chosen:
  - **Library names:** qiskit and qiskit_aer classes and functions, e.g. `plot_` offers
    `from qiskit.visualization import plot_histogram`.
  - **Your own files:** functions and classes defined in other project files.
  - **Aliases:** `np`, `plt`, `rx` and `mpl`.
  - **Modules:** `math`, `json` and the like.
- **Run:** executes the active `.py` file as `__main__` with the whole project
  importable. Files the script writes are saved back into the project. Plots go to a
  **Figures** tab (with a count, a PNG download per figure, and an automatic switch
  after a successful run that drew something).
- **GUI windows:** pages opened with pywebview's API show in a dialog and keep
  calling into Python after the script ends. qisdebug's `debug.show()` opens its
  timeline viewer this way. A `webview` stand-in (`src/python/webview.py`) supports
  `html=` windows only.
- **Responsive:**
  - **Phones (under 768 px):** the explorer becomes a drawer (☰), the editor and
    output stack vertically with a draggable divider, and header extras move into a
    "⋯" menu.
  - **Tablets (under 1024 px):** the explorer is a drawer, and the editor and output
    sit side by side.
- **Console:** a Python REPL with a persistent namespace, multi-line input, history,
  queued input and Restart. **Shift+Enter** in the editor sends the selection (or the
  current line) to it, as in VS Code.
- **Keyboard:** VS Code shortcuts shown per platform (⌘ on macOS, Ctrl elsewhere),
  plus a command palette (`F1`, or `Mod+Shift+P` except on Firefox), quick open
  (`Mod+P`) and a help dialog. Keys that browsers or the OS reserve never reach a
  page, so those commands use alternatives:
  - **New file / close tab:** `Ctrl+N` and `Ctrl+W` become `Alt+N` and `Alt+W`.
  - **Switch editor tab:** `Ctrl+PgUp/PgDn` and `⌘⌥←/→` become `Alt+PgUp/PgDn`, or
    `⌃⌥←/→` on macOS.
  - **Replace:** `⌘H` on macOS becomes `⌘⌥F`.
  - **Go to line:** `⌘G` becomes `⌃G`.
- **Themes:** light, dark, or follow the system. The choice is applied before first
  paint, with no flash.
- **Stop:** interrupts running code through a SharedArrayBuffer, which requires
  cross-origin isolation (below). Without it, Stop restarts the runtime.
- **Packages:** Python starts with numpy, scipy, matplotlib, qiskit and qiskit-aer. The Packages
  panel adds optional ones (pandas, sympy, qiskit-algorithms, qiskit-ibm-runtime,
  qiskit-qasm3-import, qisdebug) and the Black formatter; what you add is kept in
  localStorage and loads in the background on each start. The same panel saves
  `requirements.txt` or `environment.yaml` into the project.
- **Formatting:** Black (opt in) formats the open file: `Shift+Alt+F` (`⌃⇧F` on macOS, since
  `⌥⇧F` types symbols there), the editor's right-click menu, the header button, or the
  command palette. Settings can format on save or run, and set the line length.
- **Restrictions:** only the bundled and added packages can be imported (no `pip`), and
  `input()` is disabled.
- **IBM Quantum hardware:** qiskit-ibm-runtime's fake backends and primitives run
  locally, but IBM's cloud APIs send no CORS headers, so the browser can't reach them.
  After install, the worker patches `QiskitRuntimeService.__init__` to raise a clear
  error instead (`_patch_ibm_runtime` in `bootstrap.py`).

## Deploying to Cloudflare Pages

The site is fully static. In Pages, use these settings:

| Setting | Value |
| --- | --- |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Node version | from `.node-version` (22) |

- **`public/_headers`:** this is required. It sets `Cross-Origin-Opener-Policy:
  same-origin` and `Cross-Origin-Embedder-Policy: require-corp`, which the Stop button
  needs. It also makes `/assets/*` immutable and always revalidates `sw.js`.
- **Compiled wheels:** they're committed in `public/wheels/`, because Pages can't run
  `build-wasm/build.sh`.
- **Copied assets:** `public/pyodide/` and `public/file-icons/` are copied from
  `node_modules` during the build, so they aren't committed.
- **Size:** the build is about 28 MB in about 1,300 files. The largest file is
  `pyodide.asm.wasm` at 9.6 MB, within Pages' 25 MiB per-file limit.
- **Package CDN:** scientific packages (numpy, scipy, matplotlib…) load from the
  version-pinned jsDelivr Pyodide CDN, which sends CORS headers, so it works with COEP.

## SEO, social sharing and analytics

`vite-seo.ts` (a Vite plugin, configured in `vite.config.ts`) runs on every build:

- **Meta tags:** title, description, canonical, robots, Open Graph (Facebook, LinkedIn,
  WhatsApp, Slack, Discord, Telegram) and Twitter/X cards, plus JSON-LD
  (`WebSite` + `WebApplication`). Text and URLs come from `src/app/brand.ts`.
- **Share image:** `public/og-image.png` (1200×630). Regenerate it from
  `scripts/og-image.svg` with `rsvg-convert -w 1200 -h 630 scripts/og-image.svg -o public/og-image.png`.
- **Generated files:** `dist/sitemap.xml` and `dist/robots.txt`. `lastmod` is the last
  git commit date, so it refreshes with every deploy and only moves when something
  really changed.
- **Crawlable content:** `index.html` ships a real `<h1>` and description inside
  `#root`; it doubles as the loading splash and React replaces it on mount.
- **Environment variables** (see `.env.example`; set them in Pages for production):
  - `SITE_URL`: canonical origin. Defaults to `DEFAULT_SITE_URL` in `brand.ts`
    (https://qisplay.nepcodex.com).
  - `VITE_TEMPLATES_REPO`: GitHub `owner/repo` that templates come from. Defaults to
    `kriss-u/qisplay-templates`.
  - `VITE_GA_ID`: Google Analytics 4 ID. Analytics is only injected in production
    builds when it's set, and skipped for visitors with Do Not Track or Global
    Privacy Control. It uses gtag.js directly, not Tag Manager: GTM can load
    arbitrary third-party tags, which COEP would block.

## Project archives

**Download as .zip** writes the project's files plus `.qisplay/project.json`, a
manifest carrying the metadata that lives in IndexedDB:

```json
{
  "format": "qisplay-project",
  "version": 1,
  "project": { "name": "…", "createdAt": 0, "updatedAt": 0, "template": { "id": "…", "version": 1, "ref": "1.0.0" } },
  "workspace": { "openTabs": ["main.py"], "activeFile": "main.py" },
  "files": [{ "path": "data.bin", "kind": "file", "binary": true, "updatedAt": 0 }]
}
```

**Open project from .zip…** recreates the project, including its tabs, the active file
and timestamps:

- **Manifest:** the name `.qisplay` is reserved for it.
- **Plain zips:** a zip without a manifest (for example a zipped folder) also works;
  a single top-level folder is unwrapped.
- **Skipped entries:** junk entries (`__MACOSX`, `.DS_Store`, `__pycache__`), unsafe
  paths and files over 20 MB are skipped.
- **Name clashes:** these get a unique name, e.g. "Name (2)".
- **Template origin:** `project.template` is only present for projects created from
  a template. It survives a round trip, so update notices keep working.

## Templates

**Project menu → New project from template…** (also in the command palette) opens a
gallery of starter projects from the
[qisplay-templates](https://github.com/kriss-u/qisplay-templates) repo. Its README
covers authoring and releasing.

- **Source:** `src/templates/catalog.ts` fetches `index.json` from
  `cdn.jsdelivr.net/gh/…@latest`. jsDelivr resolves `@latest` to the newest version tag
  and reports it in the `x-jsd-version` header, so a template's files are then fetched
  at that exact (immutable) version when a project is created from it. The edge caches
  `@latest` for up to 12 hours, and the templates repo's release workflow purges it.
  jsDelivr's data API isn't used; it fails to list versions for this account.
- **Origin:** the new project records `{ id, version, ref }` (`Project.template`).
- **Updates:** when the catalog has a higher `version` for that template, the header
  shows **Template updated**. It offers a fresh copy as a new project, leaving the
  old one alone, or a per-version dismiss. Nothing is merged.
- **Offline:** the last catalog is cached in IndexedDB settings and used when the
  fetch fails.
- **Links:** `?collection=<id>` opens the gallery filtered to a collection and
  `?template=<id>` highlights one template. `?templates=<sha|branch>` previews the
  repo at that ref for the rest of the tab's session. The parameters are removed from
  the address bar once read.

## Walkthrough

A first visit gets a guided tour (`src/components/Walkthrough.tsx`, steps in
`src/components/walkthroughSteps.ts`). Each step has a `since` revision, and the
browser remembers the newest revision it finished (`qisplay:walkthrough-done` in
localStorage). A returning visitor sees only the steps with a newer `since`, as a
"What's new" tour, so someone who missed several releases sees all of them at once.
"Start walkthrough" in the command palette always replays the full tour.

**Shipping a user-facing feature:** add a step for it, or edit the step for the area
it changed, and set its `since` to the highest one plus one. `news` can hold a
shorter "what changed" text for the What's new tour. Steps spotlight elements marked
`data-tour="<id>"`; point at something that is always on screen (a menu's button,
not an item inside it), or leave out `placement` for a centered card.

## Installed Python packages

| Package | Source |
| --- | --- |
| numpy, scipy, matplotlib, sympy (+ their deps) | Pyodide distribution (jsDelivr CDN, version-pinned) |
| rustworkx, dill, stevedore, typing-extensions, python-dateutil, pylatexenc | PyPI via micropip (rustworkx ships an official `pyemscripten_2026_0_wasm32` wheel) |
| libopenblas | Pyodide distribution, used as the BLAS/LAPACK library for qiskit-aer |
| **qiskit 2.5.2, qiskit-aer 0.17.2** | Cross-compiled here from the PyPI sdists plus our patches, served from `public/wheels/` |
| qiskit-algorithms, qiskit-qasm3-import, qiskit-ibm-runtime, pandas, sympy, qisdebug, black | Optional: added in the Packages panel, then installed in the background after startup (pandas and sympy from Pyodide, the rest from PyPI). A run that imports one that isn't added prints a hint. pydantic comes from PyPI (≥2.13, which qiskit-ibm-runtime needs) rather than Pyodide's 2.12 |

The Pyodide runtime itself (`pyodide.asm.wasm`, the stdlib and the lockfile) is
installed from npm and served from this app's own origin.

## Building qiskit and qiskit-aer for WebAssembly

Neither project publishes a WebAssembly wheel, so `build-wasm/` cross-compiles both
from source:

```sh
npm run build:wasm      # same as ./build-wasm/build.sh
```

The script installs a pinned toolchain into `build-wasm/.venv` and `~/.cache/pyodide-build`:
pyodide-build, the Pyodide 314.0.7 cross-build environment, Emscripten 5.0.3 and Rust 1.93.0
with the `wasm32-unknown-emscripten` target. It then downloads the qiskit and qiskit-aer
sdists from PyPI and applies the patches in `build-wasm/patches/`. It builds both wheels,
copies them to `public/wheels/` and writes `public/wheels/manifest.json`. You need a host
**Python 3.14** to match Pyodide, plus rustup, cmake, curl and several GB of free disk.
A cold build takes about 15 minutes.

**The patch files are the source of truth.** Every change to upstream code lives in
them, and `build.sh` fails if one doesn't apply cleanly. Each patch has a header
explaining its changes:

- `qiskit-2.5.2-emscripten.patch`
  - Drops crossterm, which pulls in mio (no WebAssembly support), and assumes an
    80-column terminal.
  - Builds faer without rayon, since its spindle/atomic-wait thread pool has no
    emscripten backend.
  - Runs primitives synchronously, and never uses process parallelism.
- `qiskit-aer-0.17.2-emscripten.patch`
  - No AVX2 flags taken from the host CPU, and no conan.
  - Adds a single-threaded `omp.h` stub.
  - Declares BLAS/LAPACK routines as returning `int`, to match Pyodide's OpenBLAS.
  - Fixes system-memory detection, which returned 0 and made every shot come back
    empty.
  - Runs jobs synchronously, and makes `psutil` optional.

To change a patch, edit the extracted tree under `build-wasm/src/`, rebuild, then
regenerate the patch with `diff -ruN` against a pristine copy of the sdist.

Verified in Pyodide:

- **Simulation methods:** Aer gives the expected GHZ statistics with statevector,
  density_matrix, stabilizer, extended_stabilizer and matrix_product_state.
- **Exact results:** Aer's statevector matches qiskit's exact `Statevector`, and the
  unitary simulator returns a unitary.
- **Noise and scale:** noise models work, and so does a 20-qubit MPS run (SVD through
  OpenBLAS).
- **Primitives:** EstimatorV2, both Samplers, `transpile` at optimization levels 0–3
  (including lists of circuits) and `circuit.draw("mpl")` all work.

Everything runs single-threaded, because the browser runtime has no threads.

## Layout

```
src/App.tsx                    layout, commands (shortcuts + palette), run/console wiring
src/app/                       brand, color mode, editor themes, rainbow brackets, shortcuts
src/python/pyodide.worker.ts   Python runtime: boot, packages, run / console / completion
src/python/bootstrap.py        runner: project sync, tracebacks, figures, console, Jedi
src/python/webview.py          pywebview stand-in: windows open in PyWindowDialog
src/python/usePython.ts        React hook owning the worker
src/workspace/                 IndexedDB (Dexie), file ops, zip archives, background save
src/templates/                 template catalog (jsDelivr) and project creation from it
src/components/                explorer, tabs, editor, console, palette, dialogs, walkthrough
public/sw.js                   service worker that finishes saves after the tab closes
public/_headers                Cloudflare Pages headers (COOP/COEP, caching)
vite-seo.ts                    SEO plugin: meta tags, JSON-LD, sitemap, robots, GA4
public/wheels/                 compiled qiskit + qiskit-aer wheels and manifest.json
build-wasm/                    build.sh + patches for those wheels
scripts/                       copy Pyodide runtime and Material icons into public/
```

## Credits

- **File icons:** [Material Icon Theme](https://github.com/material-extensions/vscode-material-icon-theme)
  (MIT). Its license is shipped as `file-icons/LICENSE`.
- **Editor colors:** modeled on VS Code's Dark+ and Light+ themes.

Made with ❤️ by Krishna Upadhyay.
