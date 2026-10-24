// Packages beyond the basics, which the user adds in the Packages panel. The
// worker installs them (OPTIONAL in pyodide.worker.ts); this is what the UI says.
export interface OptionalPackage {
  /** Distribution name, as in the worker. */
  id: string;
  description: string;
  group: "libraries" | "tools";
}

export const OPTIONAL_PACKAGES: OptionalPackage[] = [
  { id: "qiskit-algorithms", group: "libraries", description: "VQE, QAOA, Grover and optimizers." },
  { id: "qiskit-ibm-runtime", group: "libraries", description: "Fake backends and the Sampler and Estimator primitives." },
  { id: "qiskit-qasm3-import", group: "libraries", description: "Lets qasm3.load and qasm3.loads read OpenQASM 3." },
  { id: "qisdebug", group: "libraries", description: "Records every gate, pass and statevector; debug.show() opens its viewer." },
  { id: "pandas", group: "libraries", description: "Data tables and analysis." },
  { id: "sympy", group: "libraries", description: "Symbolic math." },
  { id: "black", group: "tools", description: "Code formatter. Powers Format document, format on save and format on run." },
];

export const BLACK = "black";
