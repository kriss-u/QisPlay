# Local WebAssembly wheels

`npm run build:wasm` (`build-wasm/build.sh`) writes the cross-compiled qiskit and
qiskit-aer wheels here, together with `manifest.json`. The worker installs every
wheel in the manifest, in order, at startup.
