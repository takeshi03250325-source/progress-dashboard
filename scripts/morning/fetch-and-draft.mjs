#!/usr/bin/env node
import "dotenv/config";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import yaml from "js-yaml";
import Parser from "rss-parser";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..", "..");

async function loadConfig() {
  const configPath = path.join(ROOT, "config", "news-sources.yaml");
  const raw = await fs.readFile(configPath, "utf-8");
  return yaml.load(raw);
}

function scoreItem(item, keywords) {
  const text = `${item.title || ""} ${item.contentSnippet || item.content || ""}`.toLowerCase();
  let s = 0;
  for (const kw of keywords) {
    if (text.includes(kw.toLowerCase())) s += 2;
  }
  const pub = item.pubDate ? new Date(item.pubDate).getTime() : 0;
  s += Math.min(5, pub / 1e12);
  return s;
}

function withinAge(isoDate, maxAgeHours) {
  if (!isoDate) return false;
  const t = new Date(isoDate).getTime();
  if (Number.isNaN(t)) return false;
  const ageMs = Date.now() - t;
  return ageMs >= 0 && ageMs <= maxAgeHours * 3600 * 1000;
}

function buildDraft(item, maxChars) {
  const title = (item.title || "無題").trim();
  const link = item.link || "";
  const line1 = title.length > 100 ? title.slice(0, 97) + "…" : title;
  const line2 = link ? "\n" + link : "";
  const hashtags = "\n#ニュース";
  let body = line1 + line2 + hashtags;
  if (body.length > maxChars) body = body.slice(0, maxChars - 1) + "…";
  return body;
}

async function main() {
  const cfg = await loadConfig();
  const maxAge = Number(cfg.max_age_hours ?? 48);
  const maxChars = Number(cfg.x_post_max_chars ?? 260);
  const keywords = cfg.keywords?.interest || [];
  const parser = new Parser({
    timeout: 20000,
    headers: { "User-Agent": "morning-news-bot/1.0 (+https://github.com/)" },
  });
  const all = [];
  const errors = [];
  for (const f of cfg.feeds || []) {
    if (!f.enabled) continue;
    try {
      const w = Number(f.weight ?? 1);
      const feed = await parser.parseURL(f.url);
      for (const it of feed.items || []) {
        if (!withinAge(it.pubDate || it.isoDate, maxAge)) continue;
        const base = scoreItem(it, keywords) * w;
        all.push({
          title: it.title,
          link: it.link,
          pubDate: it.pubDate || it.isoDate,
          feedName: f.name,
          score: base,
        });
      }
    } catch (e) {
      errors.push({ feed: f.name, url: f.url, message: e.message });
    }
  }
  all.sort((a, b) => b.score - a.score);
  const picked = all[0] || null;
  const draft = picked
    ? buildDraft({ title: picked.title, link: picked.link, contentSnippet: "" }, maxChars)
    : "";
  const out = {
    generatedAt: new Date().toISOString(),
    candidates: all.slice(0, 15),
    picked,
    xDraft: draft,
    errors,
  };
  const outDir = path.join(ROOT, "output");
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(path.join(outDir, "morning-run.json"), JSON.stringify(out, null, 2), "utf-8");
  console.log("OK output/morning-run.json");
  if (errors.length) console.warn("feed errors:", errors.length);
  if (!picked) console.warn("No candidate picked (feeds, max_age_hours, or keywords).");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
