import { readFileSync } from "node:fs";
import { sourceFiles } from "./files.mjs";

const problems = [];
for (const file of sourceFiles()) {
  const text = readFileSync(file, "utf8").replace(/\r\n/g, "\n");
  text.split("\n").forEach((line, index) => {
    if (/\s+$/.test(line)) problems.push(`${file}:${index + 1}: trailing whitespace`);
    if (line.includes("\t") && !file.endsWith(".yml") && !file.endsWith(".yaml")) {
      problems.push(`${file}:${index + 1}: tab character`);
    }
  });
  if (/\bconsole\.log\s*\(/.test(text)) problems.push(`${file}: use structured output instead of console.log`);
}

if (problems.length > 0) {
  process.stderr.write(`${problems.join("\n")}\n`);
  process.exit(1);
}

process.stdout.write(`Style check passed for ${sourceFiles().length} files.\n`);
