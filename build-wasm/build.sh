#!/usr/bin/env bash
# Cross-compiles qiskit and qiskit-aer to WebAssembly wheels for Pyodide 314.0.7
# and copies them into ../public/wheels. Re-runnable; work files stay in this folder.
#
# Requirements: a host Python 3.14 (must match Pyodide's), rustup, cmake, git, curl.
set -euo pipefail
cd "$(dirname "$0")"

PYODIDE_VERSION=314.0.7
QISKIT_VERSION=2.5.2
AER_VERSION=0.17.2
OPENBLAS_ZIP=libopenblas-0.3.31.zip
OPENBLAS_SHA256=5749b13537da6f03343c34269eb3e922349910883bf90895df0533ab95de9d96

# --- toolchain -------------------------------------------------------------
if [ ! -x .venv/bin/pyodide ]; then
  python3.14 -m venv --without-pip .venv
  pip3 --python .venv/bin/python install pip pyodide-build
fi
# shellcheck disable=SC1091
. .venv/bin/activate
pyodide xbuildenv install "$PYODIDE_VERSION"
pyodide xbuildenv install-emscripten
RUST_TOOLCHAIN=$(pyodide config get rust_toolchain)
rustup toolchain install "$RUST_TOOLCHAIN" --profile minimal --target wasm32-unknown-emscripten
export RUSTUP_TOOLCHAIN=$RUST_TOOLCHAIN

mkdir -p sdists src deps/dl deps/include deps/lib dist

sdist() { # name version -> path of the downloaded sdist
  local url
  url=$(curl -sf "https://pypi.org/pypi/$1/$2/json" |
    python3 -I -c "import json,sys;print([u['url'] for u in json.load(sys.stdin)['urls'] if u['packagetype']=='sdist'][0])")
  [ -f "sdists/$(basename "$url")" ] || curl -sfL "$url" -o "sdists/$(basename "$url")"
  echo "sdists/$(basename "$url")"
}

fresh_src() { # sdist dir patch
  rm -rf "src/$2"
  tar xzf "$1" -C src
  patch -d "src/$2" -p1 < "patches/$3"
}

# --- qiskit (Rust / PyO3) ---------------------------------------------------
fresh_src "$(sdist qiskit "$QISKIT_VERSION")" "qiskit-$QISKIT_VERSION" "qiskit-$QISKIT_VERSION-emscripten.patch"
(cd "src/qiskit-$QISKIT_VERSION" && QISKIT_BUILD_PROFILE=release pyodide build -o ../../dist .)

# --- qiskit-aer (C++ / pybind11 / CMake) ------------------------------------
if [ ! -f deps/lib/libopenblas.so ]; then
  curl -sfL "https://cdn.jsdelivr.net/pyodide/v$PYODIDE_VERSION/full/$OPENBLAS_ZIP" -o deps/dl/openblas.zip
  echo "$OPENBLAS_SHA256  deps/dl/openblas.zip" | sha256sum -c
  unzip -o -q deps/dl/openblas.zip -d deps/dl/openblas
  cp deps/dl/openblas/libopenblas.so deps/lib/
fi
if [ ! -d deps/include/nlohmann ]; then # versions pinned by qiskit-aer's conan setup
  curl -sfL https://github.com/nlohmann/json/archive/refs/tags/v3.1.1.tar.gz | tar xz -C deps/dl
  curl -sfL https://github.com/gabime/spdlog/archive/refs/tags/v1.9.2.tar.gz | tar xz -C deps/dl
  cp -r deps/dl/json-3.1.1/single_include/nlohmann deps/include/
  cp -r deps/dl/spdlog-1.9.2/include/spdlog deps/include/
fi
AER_DIR="qiskit_aer-$AER_VERSION"
fresh_src "$(sdist qiskit-aer "$AER_VERSION")" "$AER_DIR" "qiskit-aer-$AER_VERSION-emscripten.patch"
mkdir -p "src/$AER_DIR/wasm-deps"
cp -r deps/include deps/lib "src/$AER_DIR/wasm-deps/"
(cd "src/$AER_DIR" && pyodide build -o ../../dist .)

# --- install into the app ----------------------------------------------------
cp dist/qiskit-*.whl dist/qiskit_aer-*.whl ../public/wheels/
(
  cd ../public/wheels
  python3 -I - <<'EOF'
import glob, json
wheels = sorted(glob.glob("qiskit-*.whl")) + sorted(glob.glob("qiskit_aer-*.whl"))
json.dump({"wheels": wheels}, open("manifest.json", "w"), indent=2)
print("manifest:", wheels)
EOF
)
