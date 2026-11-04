// Copies the static site into dist/ and writes dist/config.js with the Convex URL.
// CONVEX_URL is set by `convex deploy --cmd` on Vercel, or by you locally.
import { cpSync, readFileSync, rmSync, writeFileSync } from "node:fs";

const out = "dist";
rmSync(out, { recursive: true, force: true });
cpSync("prototype", out, { recursive: true });

// prototype/index.html is written as an artifact fragment (no doctype/head skeleton).
// Add the skeleton for standalone hosting and load config.js before the page script.
let html = readFileSync(`${out}/index.html`, "utf8");
if (!/^\s*<!doctype/i.test(html)) {
  html =
    '<!doctype html>\n<html lang="en">\n<meta charset="utf-8">\n' +
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n' +
    html;
}
html = html.replace("<script>", '<script src="/config.js"></script>\n<script>');
writeFileSync(`${out}/index.html`, html);

const url = process.env.CONVEX_URL || "";
writeFileSync(`${out}/config.js`, `window.ONYX_CONVEX_URL = ${JSON.stringify(url)};\n`);
console.log(url ? `Built dist/ with Convex at ${url}` : "Built dist/ without Convex: the form stays in prototype mode");
