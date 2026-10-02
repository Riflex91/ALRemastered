import { readFileSync } from "node:fs";
import { sourceFiles } from "./files.mjs";

const problems = [];
for (const file of sourceFiles()) {
  const text = readFileSync(file, "utf8").replace(/\r\n/g, "\n");
  if (!text.endsWith("\n")) problems.push(`${file}: missing final newline`);
  if (/ +\n/.test(text)) problems.push(`${file}: trailing spaces`);
}

if (problems.length > 0) {
  process.stderr.write(`${problems.join("\n")}\n`);
  process.exit(1);
}
process.stdout.write("Format check passed.\n");
