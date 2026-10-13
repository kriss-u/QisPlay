export interface Example {
  name: string;
  /** File name used when the example is added to a project. */
  file: string;
  code: string;
}

export const EXAMPLES: Example[] = [
  {
    name: "NumPy + Matplotlib",
    file: "numpy_plot.py",
    code: `import numpy as np
import matplotlib.pyplot as plt

x = np.linspace(0, 2 * np.pi, 400)
for k in range(1, 4):
    plt.plot(x, np.sin(k * x) / k, label=f"sin({k}x)/{k}")

plt.legend()
plt.title("Hello from QisPlay")
plt.show()

print("numpy", np.__version__)
print("mean of sin(x):", np.sin(x).mean())
`,
  },
  {
    name: "SciPy optimize",
    file: "scipy_optimize.py",
    code: `import numpy as np
from scipy.optimize import minimize

def rosenbrock(p):
    x, y = p
    return (1 - x) ** 2 + 100 * (y - x ** 2) ** 2

result = minimize(rosenbrock, x0=[-1.2, 1.0], method="BFGS")
print("minimum at", np.round(result.x, 4), "after", result.nit, "iterations")
`,
  },
  {
    name: "Qiskit: Bell state",
    file: "bell_state.py",
    code: `from qiskit import QuantumCircuit
from qiskit.quantum_info import Statevector

qc = QuantumCircuit(2)
qc.h(0)
qc.cx(0, 1)
print(qc.draw("text"))

state = Statevector.from_instruction(qc)
print(state.probabilities_dict())

qc.draw("mpl")  # open figures are shown automatically after the run
`,
  },
  {
    name: "Qiskit Aer: sampling",
    file: "aer_sampling.py",
    code: `from qiskit import QuantumCircuit, transpile
from qiskit_aer import AerSimulator
from qiskit.visualization import plot_histogram
import matplotlib.pyplot as plt

qc = QuantumCircuit(3, 3)
qc.h(0)
qc.cx(0, 1)
qc.cx(1, 2)
qc.measure(range(3), range(3))

sim = AerSimulator()
counts = sim.run(transpile(qc, sim), shots=2048).result().get_counts()
print(counts)

plot_histogram(counts)
plt.show()
`,
  },
];
