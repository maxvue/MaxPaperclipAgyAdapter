import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const projectDirectory = process.cwd();
const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "maxpaperclip-package-"));

try {
  const packed = JSON.parse(execFileSync("npm", [
    "pack",
    "--json",
    "--pack-destination",
    temporaryDirectory,
    projectDirectory,
  ], { encoding: "utf8" }));
  const packageMetadata = Array.isArray(packed) ? packed[0] : Object.values(packed)[0];
  const filename = packageMetadata?.filename;
  assert.equal(typeof filename, "string");
  const archive = path.join(temporaryDirectory, filename);

  execFileSync("npm", [
    "install",
    "--ignore-scripts",
    "--no-audit",
    "--no-fund",
    "--prefix",
    temporaryDirectory,
    archive,
  ], { stdio: "pipe" });

  const packageDirectory = path.join(
    temporaryDirectory,
    "node_modules",
    "@maxvue",
    "maxpaperclipagyadapter",
  );
  const module = await import(pathToFileURL(path.join(packageDirectory, "dist", "index.js")));
  const adapter = module.createServerAdapter();
  assert.equal(adapter.type, "maxpaperclip_agy");
  assert.equal(typeof adapter.execute, "function");

  const require = createRequire(import.meta.url);
  const uiParser = require(path.join(packageDirectory, "ui-parser.cjs"));
  assert.equal(typeof uiParser.parseStdoutLine, "function");
} finally {
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
}
