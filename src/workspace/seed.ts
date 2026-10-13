// Files for the project created on first visit.

export const WELCOME_FILES: Record<string, string> = {
  "main.py": `from qiskit import QuantumCircuit, transpile
from qiskit_aer import AerSimulator


def bell_circuit() -> QuantumCircuit:
    """Two qubits in the entangled state (|00> + |11>) / sqrt(2)."""
    qc = QuantumCircuit(2, 2)
    qc.h(0)
    qc.cx(0, 1)
    qc.measure([0, 1], [0, 1])
    return qc


def simulate(qc: QuantumCircuit, shots: int = 1024) -> dict[str, int]:
    sim = AerSimulator()
    return sim.run(transpile(qc, sim), shots=shots).result().get_counts()


def main() -> None:
    qc = bell_circuit()
    print(qc.draw("text"))
    print("Counts:", simulate(qc))


if __name__ == "__main__":
    main()
`,
};
