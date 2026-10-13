# py-wasm

A browser-only Python runner: a CodeMirror editor, an xterm.js output pane and
CPython compiled to WebAssembly ([Pyodide](https://pyodide.org) 314.0.7, Python 3.14).
No backend executes code: everything runs in a Web Worker in the browser.

```sh
npm install      # also copies the Pyodide runtime into public/pyodide
npm run dev      # http://localhost:5173
npm run build    # static site in dist/ (serve it with the COOP/COEP headers below)
```

## What it does

- **Projects:** create, rename, switch between and delete projects, or download one as a
  `.zip`. Everything is stored in this browser's IndexedDB (via Dexie): there is no
  server, no account and no git. Clearing site data deletes it, so use the zip download
  for anything you want to keep.
- **File explorer:** files and folders with new, rename and delete (folders are deleted
  recursively). Open files appear as tabs, and edits autosave after a short pause.
- **Runs:** **Run** (`Ctrl/Cmd+Enter`) executes the active `.py` file as `__main__`,
  with the whole project on Python's path, so `from helpers import ...` works across
  files. Files the script writes (CSV, PNG and so on) are saved back into the project.
  Image files open as previews.
- **Editor:** CodeMirror 6 with autocompletion from Jedi, which runs inside the browser's
  Python, so completions come from the actually installed numpy, qiskit, qiskit_aer and
  so on.
- **Output:** a read-only xterm.js pane, with matplotlib figures below it.
- **No interactive shell:** the terminal has stdin disabled, `input()` raises an error,
  each run starts fresh, and imports never download new packages.
- **Stop:** interrupts a running script with `KeyboardInterrupt`. This needs
  cross-origin isolation (COOP/COEP headers, configured in `vite.config.ts`); without
  it, Stop restarts the runtime instead.

## Installed Python packages

| Package | Source |
| --- | --- |
| numpy, scipy, matplotlib, sympy (+ their deps) | Pyodide distribution (jsDelivr CDN, version-pinned) |
| rustworkx, dill, stevedore, typing-extensions, python-dateutil, pylatexenc | PyPI via micropip (rustworkx ships an official `pyemscripten_2026_0_wasm32` wheel) |
| libopenblas | Pyodide distribution, used as the BLAS/LAPACK library for qiskit-aer |
| **qiskit 2.5.2, qiskit-aer 0.17.2** | Cross-compiled here from the PyPI sdists plus our patches, served from `public/wheels/` |

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
src/python/pyodide.worker.ts  Pyodide boot, package install, run/interrupt
src/python/bootstrap.py       matplotlib→PNG bridge, script runner, input() block
src/python/usePython.ts       React hook owning the worker
build-wasm/build.sh           cross-compiles qiskit + qiskit-aer to wasm wheels
build-wasm/patches/           every change made to the upstream sources
src/workspace/                IndexedDB schema (Dexie), project/file operations, zip export
src/components/               explorer, editor tabs, CodeMirror, xterm.js output
src/examples.ts               example scripts
public/wheels/                drop-in location for locally compiled wasm wheels
scripts/copy-pyodide.mjs      copies the runtime from node_modules to public/
```

The UI uses Chakra UI v3. The project registers the Chakra UI MCP server
(`@chakra-ui/react-mcp`) in `.mcp.json` for Claude Code.
