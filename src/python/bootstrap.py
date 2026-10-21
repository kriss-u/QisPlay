# Runs once inside Pyodide after the packages are loaded.
# Sets matplotlib up for a headless worker and routes figures to the UI.
import base64
import io
import os

os.environ["MPLBACKEND"] = "Agg"

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt

_emit_figure = None


def _flush_figures():
    """Send every open figure to the UI as a PNG, then close them."""
    for num in plt.get_fignums():
        fig = plt.figure(num)
        buf = io.BytesIO()
        fig.savefig(buf, format="png", bbox_inches="tight", dpi=110)
        if _emit_figure is not None:
            _emit_figure(base64.b64encode(buf.getvalue()).decode("ascii"))
    plt.close("all")


def _show(*args, **kwargs):
    _flush_figures()


plt.show = _show


def _set_figure_sink(fn):
    global _emit_figure
    _emit_figure = fn


import builtins
import linecache
import sys
import traceback


def _no_input(prompt=""):
    # EOFError, like Python with no stdin attached, so libraries that read input
    # in a loop (e.g. qisdebug's show()) stop cleanly instead of crashing.
    raise EOFError(
        "input() is not available: this runner executes scripts, it is not an interactive shell"
    )


builtins.input = _no_input


PROJECT_DIR = "/home/user/project"
os.environ["HOME"] = "/home/user"
# Files a script writes are sent back to the workspace; skip anything huge.
MAX_RETURNED_FILE_BYTES = 5 * 1024 * 1024


def _rel(path):
    return os.path.relpath(path, PROJECT_DIR)


def _sync_project(files, dirs):
    """Replace the project directory with `files` ({path: str | bytes}) and `dirs`."""
    import shutil

    # The previous run left us inside PROJECT_DIR; step out and empty it in place.
    os.chdir(os.path.dirname(PROJECT_DIR))
    os.makedirs(PROJECT_DIR, exist_ok=True)
    for name in os.listdir(PROJECT_DIR):
        full = os.path.join(PROJECT_DIR, name)
        if os.path.isdir(full) and not os.path.islink(full):
            shutil.rmtree(full)
        else:
            os.remove(full)
    for rel in dirs:
        os.makedirs(os.path.join(PROJECT_DIR, rel), exist_ok=True)
    for rel, content in files.items():
        full = os.path.join(PROJECT_DIR, rel)
        os.makedirs(os.path.dirname(full), exist_ok=True)
        if isinstance(content, str):
            with open(full, "w", encoding="utf-8") as f:
                f.write(content)
        else:
            # A JS Uint8Array arrives as a memoryview or a JsProxy.
            data = content.to_bytes() if hasattr(content, "to_bytes") else bytes(content)
            with open(full, "wb") as f:
                f.write(data)
    # Project modules must be re-imported fresh on every run.
    for name, mod in list(sys.modules.items()):
        if (getattr(mod, "__file__", None) or "").startswith(PROJECT_DIR + "/"):
            del sys.modules[name]
    import importlib

    importlib.invalidate_caches()


def _snapshot():
    out = {}
    for root, dirs, names in os.walk(PROJECT_DIR):
        dirs[:] = [d for d in dirs if d != "__pycache__"]
        for n in names:
            full = os.path.join(root, n)
            st = os.stat(full)
            out[_rel(full)] = (st.st_mtime_ns, st.st_size)
    return out


def _changed_files(before):
    """Files the script created or modified, as {path: str | bytes}."""
    changed = {}
    for rel, stamp in _snapshot().items():
        if before.get(rel) == stamp:
            continue
        full = os.path.join(PROJECT_DIR, rel)
        if os.path.getsize(full) > MAX_RETURNED_FILE_BYTES:
            continue
        with open(full, "rb") as f:
            data = f.read()
        try:
            changed[rel] = data.decode("utf-8")
        except UnicodeDecodeError:
            changed[rel] = data
    return changed


def _format_exception(e):
    import ast

    te = traceback.TracebackException.from_exception(e)
    frames = []
    for f in te.stack:
        if f.filename == __file__:
            continue  # hide this runner's frames
        if isinstance(e, SyntaxError) and f.filename == ast.__file__:
            continue  # the console's ast.parse call, not user code
        if f.filename.startswith(PROJECT_DIR + "/"):
            f.filename = _rel(f.filename)  # show project-relative paths
        frames.append(f)
    te.stack = traceback.StackSummary.from_list(frames)
    return "".join(te.format()) + _hint(e)


def _hint(e):
    """Friendly pointers for features that need tools QisPlay can't run."""
    text = str(e)
    if "pdflatex" in text or "pdftocairo" in text:
        return (
            "\nHint: LaTeX circuit drawing isn't available in QisPlay. "
            'Use qc.draw("mpl") for the same look, or qc.draw("latex_source") for the LaTeX code.\n'
        )
    return ""


def _execute(code_obj_fn, entry_dir, files, dirs):
    """Shared plumbing for scripts and console input: sync files, run, collect changes."""
    _sync_project(files, dirs)
    saved_path = list(sys.path)
    sys.path[:0] = [entry_dir, PROJECT_DIR]
    os.chdir(PROJECT_DIR)
    linecache.checkcache()
    before = _snapshot()
    ok = True
    try:
        code_obj_fn()
    except SystemExit as e:
        ok = e.code in (None, 0)
    except BaseException as e:
        ok = False
        sys.stderr.write(_format_exception(e))
    finally:
        sys.stdout.flush()
        sys.stderr.flush()
        _flush_figures()
        sys.path[:] = saved_path
    return ok, _changed_files(before)


def _run(entry, files, dirs):
    """Run project file `entry` as __main__ in a fresh namespace. Returns (ok, changed)."""
    entry_path = os.path.join(PROJECT_DIR, entry)

    def go():
        with open(entry_path, encoding="utf-8") as f:
            code = f.read()
        ns = {"__name__": "__main__", "__file__": entry_path, "__builtins__": builtins}
        exec(compile(code, entry_path, "exec"), ns)

    return _execute(go, os.path.dirname(entry_path), files, dirs)


# --- Interactive console: one namespace that persists between inputs ----------

CONSOLE_FILE = "<console>"
_console_ns = {}
_console_count = 0


def _console_reset():
    global _console_ns
    _console_ns = {"__name__": "__main__", "__builtins__": builtins}


_console_reset()


def _is_complete(source):
    """'complete', 'incomplete' (needs more lines, like `def f():`), or 'invalid'."""
    import codeop

    try:
        code = codeop.compile_command(source, CONSOLE_FILE, "exec")
    except (SyntaxError, OverflowError, ValueError):
        return "invalid"
    if code is None:
        return "incomplete"
    # A block statement is only finished by a blank line, as in the standard REPL.
    if "\n" in source.rstrip("\n") and not source.endswith("\n"):
        last = source.rstrip("\n").splitlines()[-1]
        if last.startswith((" ", "\t")):
            return "incomplete"
    return "complete"


def _console(source, files, dirs):
    """Run console input. Echoes the value of a trailing expression like the REPL."""
    import ast

    global _console_count
    _console_count += 1
    filename = f"<console:{_console_count}>"
    linecache.cache[filename] = (len(source), None, source.splitlines(True), filename)

    def go():
        tree = ast.parse(source, filename, "exec")
        last = tree.body[-1] if tree.body and isinstance(tree.body[-1], ast.Expr) else None
        if last is not None:
            tree.body.pop()
        exec(compile(tree, filename, "exec"), _console_ns)
        if last is not None:
            value = eval(compile(ast.Expression(last.value), filename, "eval"), _console_ns)
            if value is not None:
                _console_ns["_"] = value
                print(repr(value))

    return _execute(go, PROJECT_DIR, files, dirs)


_COMPLETION_LIMIT = 150
_AUTO_IMPORT_LIMIT = 60

# Public names offered as auto-imports, searched in this order so each object is
# offered from its shortest public module (QuantumCircuit -> `from qiskit import`).
_INDEX_MODULES = [
    "qiskit",
    "qiskit.circuit",
    "qiskit.circuit.library",
    "qiskit.quantum_info",
    "qiskit.visualization",
    "qiskit.transpiler",
    "qiskit.transpiler.passes",
    "qiskit.primitives",
    "qiskit.result",
    "qiskit.synthesis",
    "qiskit.converters",
    "qiskit.qasm2",
    "qiskit.qasm3",
    "qiskit.providers.fake_provider",
    "qiskit_aer",
    "qiskit_aer.noise",
    "qiskit_aer.primitives",
    # Installed in the background after startup (see _invalidate_index).
    "qiskit_algorithms",
    "qiskit_algorithms.optimizers",
    "qiskit_algorithms.minimum_eigensolvers",
    "qiskit_ibm_runtime",
    "qiskit_ibm_runtime.fake_provider",
    "qisdebug",
]

# Conventional aliases: typing the alias offers the import.
_ALIASES = {
    "np": "import numpy as np",
    "plt": "import matplotlib.pyplot as plt",
    "mpl": "import matplotlib as mpl",
    "rx": "import rustworkx as rx",
    "pd": "import pandas as pd",
}

_index = None
_project_names = {}  # path -> (mtime, [(name, kind)])


def _invalidate_index():
    """Rebuild the index on the next completion (after packages were installed)."""
    global _index
    _index = None


# IBM's cloud APIs send no CORS headers, so the browser blocks every request
# QiskitRuntimeService would make. Fail early with a clear message instead of
# a network error. Backend names (Sampler(mode="ibm_...")) go through it too.
_NO_HARDWARE = '''

# Patched by QisPlay.
def _qisplay_no_hardware(self, *args, **kwargs):
    raise RuntimeError(
        "Running on IBM Quantum hardware isn't supported in the browser. "
        "Use a fake backend instead, e.g. FakeBrisbane() from "
        "qiskit_ibm_runtime.fake_provider, or AerSimulator() from qiskit_aer."
    )


QiskitRuntimeService.__init__ = _qisplay_no_hardware
'''


def _patch_ibm_runtime():
    """Make QiskitRuntimeService raise; call after installing qiskit-ibm-runtime."""
    import importlib.util

    spec = importlib.util.find_spec("qiskit_ibm_runtime")
    if spec is None or spec.origin is None:
        return
    path = os.path.join(os.path.dirname(spec.origin), "qiskit_runtime_service.py")
    with open(path) as f:
        if "_qisplay_no_hardware" in f.read():
            return
    with open(path, "a") as f:
        f.write(_NO_HARDWARE)


def _build_index():
    """[(name, kind, module)] for the libraries above, plus importable modules."""
    import importlib
    import inspect
    import pkgutil

    entries, seen = [], set()
    for modname in _INDEX_MODULES:
        try:
            mod = importlib.import_module(modname)
        except Exception:
            continue
        names = getattr(mod, "__all__", None) or [n for n in dir(mod) if not n.startswith("_")]
        for name in names:
            if name.startswith("_"):
                continue
            try:
                obj = getattr(mod, name)
            except Exception:
                continue
            if inspect.ismodule(obj):
                continue
            kind = "class" if inspect.isclass(obj) else "function" if callable(obj) else None
            if kind is None or (name, id(obj)) in seen:
                continue
            seen.add((name, id(obj)))
            entries.append((name, kind, f"from {modname} import {name}"))

    modules = set(getattr(sys, "stdlib_module_names", ()))
    modules.update(m.name for m in pkgutil.iter_modules() if m.ispkg or not m.name.startswith("test"))
    for name in sorted(modules):
        if not name.startswith("_") and name.isidentifier():
            entries.append((name, "module", f"import {name}"))
    return entries


def _project_symbols(current):
    """Top-level functions/classes in the project's other .py files."""
    import ast

    out = []
    for root, dirs, names in os.walk(PROJECT_DIR):
        dirs[:] = [d for d in dirs if d != "__pycache__" and not d.startswith(".")]
        for n in names:
            if not n.endswith(".py"):
                continue
            full = os.path.join(root, n)
            rel = _rel(full)
            if rel == current:
                continue
            mtime = os.stat(full).st_mtime_ns
            cached = _project_names.get(rel)
            if not cached or cached[0] != mtime:
                try:
                    with open(full, encoding="utf-8") as f:
                        tree = ast.parse(f.read())
                    symbols = [
                        (node.name, "class" if isinstance(node, ast.ClassDef) else "function")
                        for node in tree.body
                        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef))
                        and not node.name.startswith("_")
                    ]
                except Exception:
                    symbols = []
                cached = _project_names[rel] = (mtime, symbols)
            module = rel[:-3].replace("/", ".")
            if module.endswith(".__init__"):
                module = module[: -len(".__init__")]
            if not all(part.isidentifier() for part in module.split(".")):
                continue
            out.extend((name, kind, f"from {module} import {name}") for name, kind in cached[1])
    return out


def _auto_imports(prefix, taken, current):
    global _index
    if _index is None:
        _index = _build_index()
    low = prefix.lower()
    items, offered = [], set()
    for alias, statement in _ALIASES.items():
        if alias.startswith(low) and alias not in taken:
            items.append({"label": alias, "type": "module", "detail": statement, "import": statement})
            offered.add(alias)
    for name, kind, statement in _project_symbols(current) + _index:
        if len(items) >= _AUTO_IMPORT_LIMIT:
            break
        if name in taken or (name, statement) in offered or not name.lower().startswith(low):
            continue
        offered.add((name, statement))
        items.append({"label": name, "type": kind, "detail": statement, "import": statement})
    return items


def _complete(code, line, column, entry):
    """Jedi completions at (1-based line, 0-based column), plus auto-import suggestions."""
    import re

    import jedi

    path = os.path.join(PROJECT_DIR, entry) if entry else None
    try:
        script = jedi.Script(code, path=path, project=jedi.Project(PROJECT_DIR))
        found = script.complete(line, column)
    except Exception:
        found = []
    items = [
        {"label": c.name, "type": c.type, "detail": c.description if c.type != "keyword" else ""}
        for c in found[:_COMPLETION_LIMIT]
    ]

    # Auto-import only for a bare name (not `obj.attr`, not inside an import line).
    text = (code.splitlines()[line - 1] if line - 1 < len(code.splitlines()) else "")[:column]
    match = re.search(r"[A-Za-z_][A-Za-z0-9_]*$", text)
    stripped = text.lstrip()
    if (
        match
        and len(match.group()) >= 2
        and not text[: match.start()].rstrip().endswith(".")
        and not stripped.startswith(("import ", "from "))
        and "#" not in text
    ):
        taken = {c.name for c in found}
        try:
            items += _auto_imports(match.group(), taken, entry)
        except Exception:
            pass
    return items


os.makedirs(PROJECT_DIR, exist_ok=True)
