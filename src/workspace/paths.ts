// Project paths are slash-separated and relative to the project root.

export function basename(path: string) {
  return path.slice(path.lastIndexOf("/") + 1);
}

export function dirname(path: string) {
  const i = path.lastIndexOf("/");
  return i < 0 ? "" : path.slice(0, i);
}

export function join(dir: string, name: string) {
  return dir ? `${dir}/${name}` : name;
}

/** Every ancestor folder of a path, outermost first: "a/b/c.py" -> ["a", "a/b"]. */
export function ancestors(path: string) {
  const parts = path.split("/").slice(0, -1);
  return parts.map((_, i) => parts.slice(0, i + 1).join("/"));
}

export function isInside(path: string, dir: string) {
  return path.startsWith(`${dir}/`);
}

/** Returns an error message, or null if `name` is a usable file/folder name. */
export function validateName(name: string): string | null {
  if (!name.trim()) return "Name can't be empty";
  if (name !== name.trim()) return "Name can't start or end with spaces";
  if (name.includes("/") || name.includes("\\")) return "Name can't contain slashes";
  if (name === "." || name === "..") return "That name is reserved";
  if (name.startsWith("__pycache__") || name === ".qisplay") return "That name is reserved";
  if (name.length > 120) return "Name is too long";
  return null;
}

export function isPython(path: string) {
  return path.endsWith(".py");
}

const IMAGE_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  svg: "image/svg+xml",
  webp: "image/webp",
};

export function imageType(path: string): string | undefined {
  return IMAGE_TYPES[path.slice(path.lastIndexOf(".") + 1).toLowerCase()];
}
