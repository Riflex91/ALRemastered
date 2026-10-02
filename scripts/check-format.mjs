import { readFileSync } from "node:fs";
import { sourceFiles } from "./files.mjs";

const problems = [];
for (const file of sourceFiles()) {
  const text = readFileSync(file, "utf8");
  if (text.includes("\r")) problems.push(`${file}: CRLF is not allowed in repository text files`);
  if (!text.endsWith("\n")) problems.push(`${file}: missing final newline`);
  if (/ +\n/.test(text)) problems.push(`${file}: trailing spaces`);
}

if (problems.length > 0) {
  process.stderr.write(`${problems.join("\n")}\n`);
  process.exit(1);
}
process.stdout.write("Format check passed.\n");
