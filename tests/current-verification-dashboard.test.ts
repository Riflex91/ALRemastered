import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function sorted(values: readonly string[]): string[] {
  return [...values].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

test("normal dashboard routes every one-click harness through one Current verification slot", () => {
  const html = readFileSync(new URL("../dashboard/index.html", import.meta.url), "utf8");
  const script = readFileSync(new URL("../dashboard/app.js", import.meta.url), "utf8");

  const body = html.match(/<body data-current-verification-slice="([^"]*)">/);
  assert.ok(body, "Dashboard must declare one current verification slice marker.");
  const currentSlice = body[1];

  assert.match(html, /id="current-verification-panel"/);
  assert.match(html, />Current verification</);
  assert.match(html, /id="current-verification-slot"/);
  assert.match(html, /Historical verification harnesses remain retained/);

  const buttons = [...html.matchAll(/id="start-slice-([0-9]+)-([0-9]+)-live-test"/g)]
    .map((match) => `${match[1]}.${match[2]}`);
  const wrappers = [...html.matchAll(
    /<div class="selection-content" data-verification-test="([0-9]+\.[0-9]+)" hidden>/g,
  )].map((match) => match[1]);

  assert.ok(buttons.length > 0);
  assert.deepEqual(sorted(wrappers), sorted(buttons));
  assert.equal(new Set(wrappers).size, wrappers.length);

  if (currentSlice) {
    assert.equal(wrappers.includes(currentSlice), true);
  }

  assert.match(script, /function mountCurrentVerification\(\)/);
  assert.match(script, /document\.body\.dataset\.currentVerificationSlice/);
  assert.match(script, /querySelectorAll\("\[data-verification-test\]"\)/);
  assert.match(script, /replaceChildren\(current\)/);
  assert.match(script, /current\.hidden = false/);
});

test("historical harness controls and API callers remain retained", () => {
  const html = readFileSync(new URL("../dashboard/index.html", import.meta.url), "utf8");
  const script = readFileSync(new URL("../dashboard/app.js", import.meta.url), "utf8");

  for (const slice of ["3-5", "4-5", "5-4", "6-4", "7-4", "8-1", "8-2", "8-3"]) {
    assert.match(html, new RegExp(`id=["']start-slice-${slice}-live-test["']`));
    assert.match(script, new RegExp(`/api/live-test/slice-${slice}`));
  }
});
