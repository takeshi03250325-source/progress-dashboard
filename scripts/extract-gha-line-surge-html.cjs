const fs = require("fs");
const path = require("path");
const mdPath = path.join(__dirname, "..", "docs", "gha-line-pipeline-surge", "_index-source.md");
const outPath = path.join(__dirname, "..", "docs", "gha-line-pipeline-surge", "index.html");
let md = fs.readFileSync(mdPath, "utf8");
md = md.replace(/\r\n/g, "\n");
const marker = "```html\n";
const i = md.indexOf(marker);
if (i < 0) { console.error("no marker"); process.exit(1); }
const rest = md.slice(i + marker.length);
const end = rest.indexOf("\n```");
if (end < 0) { console.error("no end"); process.exit(1); }
const html = rest.slice(0, end).trimEnd() + "\n";
fs.writeFileSync(outPath, html, "utf8");
console.log("Wrote", outPath, Buffer.byteLength(html, "utf8"), "bytes");
