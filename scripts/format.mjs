import { readFileSync, writeFileSync } from "node:fs";
import { sourceFiles } from "./files.mjs";

for (const file of sourceFiles()) {
  const original = readFileSync(file, "utf8");
  const formatted = `${original.replace(/\r\n/g, "\n").replace(/[ \t]+$/gm, "").replace(/\n*$/, "")}\n`;
  if (formatted !== original) writeFileSync(file, formatted, "utf8");
}
process.stdout.write("Repository text formatting normalized.\n");
