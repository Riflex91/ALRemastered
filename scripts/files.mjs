import { readdirSync, statSync } from "node:fs";
import { extname, join } from "node:path";

const roots = ["src", "tests", "scripts", "installer", ".github"];
const extensions = new Set([".ts", ".mjs", ".sh", ".ps1", ".nsi", ".yml", ".yaml"]);

export function sourceFiles() {
  const files = [];
  for (const root of roots) walk(root, files);
  return files.sort();
}

function walk(path, files) {
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const child = join(path, entry.name);
    if (entry.isDirectory()) walk(child, files);
    else if (entry.isFile() && extensions.has(extname(entry.name).toLowerCase())) files.push(child);
  }
}

export function isFile(path) {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}
