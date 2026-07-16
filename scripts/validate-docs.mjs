import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const html = await readFile(resolve(root, "docs", "index.html"), "utf8");
const ids = [...html.matchAll(/id="([^"]+)"/g)].map((match) => match[1]);
const anchors = [...html.matchAll(/href="#([^"]+)"/g)].map((match) => match[1]);
const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
const missing = [...new Set(anchors.filter((anchor) => !ids.includes(anchor)))];
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]);
for (const script of scripts) new Function(script);
if (duplicates.length) throw new Error(`Duplicate documentation IDs: ${duplicates.join(", ")}`);
if (missing.length) throw new Error(`Missing documentation anchors: ${missing.join(", ")}`);
if (/[ÃâðŸ]/.test(html)) throw new Error("Documentation contains likely mojibake characters");
console.log(`Documentation valid: ${ids.length} IDs, ${anchors.length} anchor links, ${scripts.length} script block.`);
