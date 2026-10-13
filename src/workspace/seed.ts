// Files for the project created on first visit.

export const WELCOME_FILES: Record<string, string> = {
  "main.py": `# Run this file with the Run button (or Ctrl/Cmd + Enter).
# It imports helpers.py from the same project.
import numpy as np
import matplotlib.pyplot as plt

from helpers import harmonics

x = np.linspace(0, 2 * np.pi, 400)
for k, y in harmonics(x, 3):
    plt.plot(x, y, label=f"sin({k}x)/{k}")

plt.legend()
plt.title("Hello from QisPlay")
plt.show()

# Files your script writes appear in the explorer.
np.savetxt("samples.csv", np.c_[x[:5], np.sin(x[:5])], delimiter=",", header="x,sin(x)")
print("wrote samples.csv")
`,
  "helpers.py": `import numpy as np


def harmonics(x, n):
    """Yield (k, sin(kx)/k) for k = 1..n."""
    for k in range(1, n + 1):
        yield k, np.sin(k * x) / k
`,
  "quantum/bell.py": `from qiskit import QuantumCircuit, transpile
from qiskit_aer import AerSimulator
from qiskit.visualization import plot_histogram
import matplotlib.pyplot as plt

qc = QuantumCircuit(2, 2)
qc.h(0)
qc.cx(0, 1)
qc.measure([0, 1], [0, 1])
print(qc.draw("text"))

sim = AerSimulator()
counts = sim.run(transpile(qc, sim), shots=1024).result().get_counts()
print(counts)

plot_histogram(counts)
plt.show()
`,
};
