#!/usr/bin/env node
import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import yaml from "js-yaml";
import Parser from "rss-parser";
import { GoogleGenerativeAI } from "@google/generative-ai";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..", "..");
dotenv.config({ path: path.join(ROOT, ".env") });

async function loadConfig() {
  const configPath = path.join(ROOT, "config", "news-sources.yaml");
  const raw = await fs.readFile(configPath, "utf-8");
  return yaml.load(raw);
}

function normalizeText(s) {
  if (!s || typeof s !== "string") return "";
  return s
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[\u200b-\u200d\ufeff]/g, "")
    .trim();
}

/** トラッキング系クエリを除いた URL（転載で URL だけ違うケースの一部を寄せる） */
function normalizeUrl(raw) {
  if (!raw || typeof raw !== "string") return "";
  const trimmed = raw.trim();
  try {
    const u = new URL(trimmed);
    const dropKeys = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "fbclid", "gclid", "mc_cid", "mc_eid", "igshid"];
    for (const k of dropKeys) u.searchParams.delete(k);
    for (const key of [...u.searchParams.keys()]) {
      if (key.startsWith("utm_")) u.searchParams.delete(key);
    }
    u.hash = "";
    return u.href;
  } catch {
    return normalizeText(trimmed);
  }
}

/** タイトル＋スニペットから転載同一判定用の指紋 */
function fingerprintArticle(title, snippet) {
  const t = normalizeText(title || "");
  const sn = normalizeText((snippet || "").slice(0, 800));
  const payload = `${t}|${sn}`;
  return crypto.createHash("sha256").update(payload, "utf8").digest("hex");
}

/**
 * 出典表記用：Google ニュース等の集約名ではなく、本文・要約に現れる一次掲載元を推定
 */
function inferPublicationLabel(title, snippet, feedName) {
  const s = (snippet || "").replace(/\s+/g, " ").trim();
  if (s && /の[、，]/.test(s)) {
    const head = s.split(/の[、，]/)[0]?.trim() || "";
    if (
      head.length >= 3 &&
      head.length <= 55 &&
      !/^(Google|グーグル|Yahoo|yahoo|ニュース検索|検索結果)/i.test(head) &&
      /(新聞|通信|新聞社|タイムズ|Press|NEWS|Digital|Web|メディア|\.co\.jp)/i.test(head)
    ) {
      return head;
    }
  }
  const rawFeed = (feedName || "").trim();
  if (!/Google|グーグル|ニュース検索/i.test(rawFeed)) {
    return rawFeed || "ニュース";
  }
  const t = (title || "").replace(/\s+/g, " ").trim();
  const pipe = t.split(/[｜|]/)[0]?.trim() || "";
  if (pipe.length >= 3 && pipe.length <= 50 && /新聞|通信/i.test(pipe)) return pipe;
  return rawFeed || "ニュース";
}

async function loadPostedHistory(filePath) {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const data = JSON.parse(raw);
    const entries = Array.isArray(data.entries) ? data.entries : [];
    const urls = new Set(entries.map((e) => e.urlNorm).filter(Boolean));
    const fps = new Set(entries.map((e) => e.fingerprint).filter(Boolean));
    return { data, entries, urls, fps };
  } catch (e) {
    if (e.code === "ENOENT") {
      return { data: { version: 1, entries: [] }, entries: [], urls: new Set(), fps: new Set() };
    }
    throw e;
  }
}

function isAlreadyPosted(urlNorm, fingerprint, urls, fps) {
  if (urlNorm && urls.has(urlNorm)) return true;
  if (fingerprint && fps.has(fingerprint)) return true;
  return false;
}

async function savePostedHistory(filePath, entries, maxEntries) {
  let list = [...entries];
  if (maxEntries > 0 && list.length > maxEntries) {
    list.sort((a, b) => String(a.postedAt).localeCompare(String(b.postedAt)));
    list = list.slice(list.length - maxEntries);
  }
  const out = { version: 1, entries: list };
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(out, null, 2) + "\n", "utf-8");
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

/** 表示上の文字数で切り詰め（絵文字等も 1 文字扱い） */
function limitChars(s, maxChars) {
  const chars = [...s];
  if (chars.length <= maxChars) return s;
  return chars.slice(0, maxChars - 1).join("") + "…";
}

/** ハッシュタグのみ除去（URL の #fragment は空白が前に無いので触れない） */
function stripHashtags(text) {
  return text
    .replace(/(^|\s)#[\w\u3040-\u30ff\u4e00-\u9faf_]+/gu, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function cleanLlmBody(raw) {
  let t = (raw || "").trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```\w*\r?\n?/, "").replace(/\r?\n?```\s*$/s, "");
  }
  t = t.replace(/^投稿文[：:]\s*/m, "").trim();
  return t;
}

/** 【判定】【抜粋元】【候補2/3】を本文から抽出（プロンプト形式に準拠） */
function parseXPostStructured(raw) {
  if (!raw || typeof raw !== "string") {
    return { verdict: null, excerptSummary: null, alternates: [] };
  }
  const verdictMatch = raw.match(/【判定】\s*(OK|NG)/);
  const verdict = verdictMatch ? verdictMatch[1] : null;

  let excerptSummary = null;
  const mEx = raw.match(/【抜粋元】\s*([\s\S]*?)(?=\n【判定】|\n【候補2】|$)/);
  if (mEx) excerptSummary = mEx[1].trim() || null;

  const mark2 = "【候補2】";
  const mark3 = "【候補3】";
  const idx2 = raw.indexOf(mark2);
  const idx3 = raw.indexOf(mark3);
  let alt2 = null;
  let alt3 = null;
  if (idx2 !== -1) {
    const start2 = idx2 + mark2.length;
    if (idx3 !== -1 && idx3 > idx2) {
      alt2 = raw.slice(start2, idx3).trim();
      alt3 = raw.slice(idx3 + mark3.length).trim();
    } else {
      alt2 = raw.slice(start2).trim();
    }
  }
  const alternates = [alt2, alt3].filter(Boolean);
  return { verdict, excerptSummary, alternates };
}

function finalizeXPost(ret) {
  const p = ret.draft ? parseXPostStructured(ret.draft) : { verdict: null, excerptSummary: null, alternates: [] };
  return {
    ...ret,
    verdict: p.verdict,
    excerptSummary: p.excerptSummary,
    alternates: p.alternates,
  };
}

/** API 未使用時：石男くんの軽いトーン + 出典・抜粋・判定（構造化） */
function buildDraftFallback(item, maxChars) {
  const title = (item.title || "無題").trim();
  const link = (item.link || "").trim();
  const src = inferPublicationLabel(
    title,
    item.contentSnippet || "",
    item.feedName || "ニュース",
  );
  const sn = (item.contentSnippet || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
  let body = `【本文】\n僕、気になるニュースを見つけました。\n\n${title}`;
  if (sn) body += `\n\n${sn}${sn.length >= 200 ? "…" : ""}`;
  body += `\n\n出典：${src}`;
  if (link) body += `\n${link}`;
  body += `\n\n【抜粋元】\nRSS の見出し・要約に基づく紹介です（API 未使用の短文フォールバック）。\n\n【判定】OK`;
  return limitChars(stripHashtags(body), maxChars);
}

async function generateIshioXPost(cfg, picked, maxChars) {
  const xp = cfg.x_post || {};
  const useLlm = xp.ishio_llm !== false && xp.ishio_gemini !== false;
  const apiKey = process.env.MAGAZINE_GEMINI_API_KEY?.trim();
  const promptRel = xp.prompt_file || "config/ai-prompts/morning-ishio-x-post.md";
  const promptPath = path.isAbsolute(promptRel) ? promptRel : path.join(ROOT, promptRel);

  if (!picked || !useLlm || !apiKey) {
    const draft = picked
      ? buildDraftFallback(
          {
            title: picked.title,
            link: picked.link,
            contentSnippet: picked.contentSnippet || "",
            feedName: picked.feedName || "",
          },
          maxChars,
        )
      : "";
    let note;
    if (!picked) note = undefined;
    else if (!useLlm) note = "x_post.ishio_llm / ishio_gemini が false";
    else if (!apiKey) note = "MAGAZINE_GEMINI_API_KEY 未設定";
    return finalizeXPost({
      draft,
      source: "fallback",
      model: null,
      note,
    });
  }

  let template;
  try {
    template = await fs.readFile(promptPath, "utf-8");
  } catch (e) {
    console.warn("morning-ishio prompt read failed:", promptPath, e.message);
    return finalizeXPost({
      draft: buildDraftFallback(
        {
          title: picked.title,
          link: picked.link,
          contentSnippet: picked.contentSnippet || "",
          feedName: picked.feedName || "",
        },
        maxChars,
      ),
      source: "fallback",
      model: null,
      note: "プロンプトファイルを読めませんでした",
    });
  }

  const title = (picked.title || "無題").trim();
  const link = (picked.link || "").trim();
  const snippet = (picked.contentSnippet || "").replace(/\s+/g, " ").trim().slice(0, 2000);
  const feedName = (picked.feedName || "").trim();
  const sourceLabel = inferPublicationLabel(title, snippet, feedName);
  const prompt = template
    .replace(/\{\{TITLE\}\}/g, title)
    .replace(/\{\{LINK\}\}/g, link)
    .replace(/\{\{SNIPPET\}\}/g, snippet || "（要約なし）")
    .replace(/\{\{FEED_NAME\}\}/g, feedName || "不明")
    .replace(/\{\{SOURCE_LABEL\}\}/g, sourceLabel)
    .replace(/\{\{MAX_CHARS\}\}/g, String(maxChars));

  const genAI = new GoogleGenerativeAI(apiKey);
  const preferred = process.env.MAGAZINE_GEMINI_MODEL?.trim();
  const modelCandidates = [];
  if (preferred) modelCandidates.push(preferred);
  for (const id of ["models/gemini-3-flash-preview", "models/gemini-2.5-flash", "models/gemini-2.0-flash"]) {
    if (!modelCandidates.includes(id)) modelCandidates.push(id);
  }

  let lastErr;
  for (const modelName of modelCandidates) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent(prompt);
      const response = await result.response;
      let text = cleanLlmBody(response.text());
      text = stripHashtags(text);
      if (link && !text.includes(link)) {
        text = text.trimEnd() + (text.endsWith("\n") ? "" : "\n\n") + link;
      }
      text = stripHashtags(text);
      text = limitChars(text, maxChars);
      return finalizeXPost({ draft: text, source: "gemini", model: modelName, note: undefined });
    } catch (e) {
      lastErr = e;
      console.warn(`Gemini (${modelName}) failed:`, e.message);
    }
  }

  const errMsg = lastErr ? String(lastErr.message) : "Gemini 利用不可";
  return finalizeXPost({
    draft: buildDraftFallback(
      {
        title: picked.title,
        link: picked.link,
        contentSnippet: picked.contentSnippet || "",
        feedName: picked.feedName || "",
      },
      maxChars,
    ),
    source: "fallback",
    model: null,
    note: errMsg.length > 400 ? errMsg.slice(0, 400) + "…" : errMsg,
  });
}

export async function runMorningFetch() {
  const cfg = await loadConfig();
  const maxAge = Number(cfg.max_age_hours ?? 48);
  const maxChars = Number(cfg.x_post_max_chars ?? 1800);
  const keywords = cfg.keywords?.interest || [];
  const dedupe = cfg.dedupe || {};
  const dedupeOn = dedupe.enabled === true;
  const historyRel = dedupe.history_file || "data/posted-articles.json";
  const maxHist = Number(dedupe.max_entries ?? 400);
  const historyPath = path.isAbsolute(historyRel) ? historyRel : path.join(ROOT, historyRel);

  let postedCtx = { data: { version: 1, entries: [] }, entries: [], urls: new Set(), fps: new Set() };
  if (dedupeOn) {
    postedCtx = await loadPostedHistory(historyPath);
  }

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
        const link = it.link || "";
        const snippet = it.contentSnippet || it.content || "";
        const urlNorm = normalizeUrl(link);
        const fingerprint = fingerprintArticle(it.title, snippet);
        all.push({
          title: it.title,
          link,
          pubDate: it.pubDate || it.isoDate,
          feedName: f.name,
          score: base,
          contentSnippet: snippet,
          urlNorm,
          fingerprint,
        });
      }
    } catch (e) {
      errors.push({ feed: f.name, url: f.url, message: e.message });
    }
  }
  all.sort((a, b) => b.score - a.score);

  const xpCfg = cfg.x_post || {};
  const pickCountRequested = Math.min(Math.max(Number(xpCfg.pick_count ?? 3), 1), 5);
  const picks = [];
  let skippedDuplicates = 0;
  if (dedupeOn) {
    const { urls, fps } = postedCtx;
    for (const cand of all) {
      if (isAlreadyPosted(cand.urlNorm, cand.fingerprint, urls, fps)) {
        skippedDuplicates++;
        continue;
      }
      picks.push(cand);
      if (picks.length >= pickCountRequested) break;
    }
  } else {
    for (let i = 0; i < Math.min(pickCountRequested, all.length); i++) {
      picks.push(all[i]);
    }
  }

  const perPickMax =
    picks.length > 1 ? Math.min(maxChars, Math.max(650, Math.floor(maxChars / picks.length))) : maxChars;

  const pickResults = [];
  for (const cand of picks) {
    const xPost = await generateIshioXPost(cfg, cand, perPickMax);
    pickResults.push({ article: cand, xPost });
  }

  const first = pickResults[0] ?? null;
  const picked = first?.article ?? null;
  const topXPost = first?.xPost ?? null;

  if (dedupeOn && picks.length > 0) {
    const newEntries = picks.map((c) => ({
      urlNorm: c.urlNorm,
      fingerprint: c.fingerprint,
      title: (c.title || "").trim(),
      postedAt: new Date().toISOString(),
      link: c.link || "",
    }));
    const nextEntries = [...postedCtx.entries, ...newEntries];
    await savePostedHistory(historyPath, nextEntries, maxHist);
    console.log("dedupe: recorded", newEntries.length, "entries ->", historyRel);
  }

  const out = {
    generatedAt: new Date().toISOString(),
    dedupeEnabled: dedupeOn,
    skippedDuplicates,
    pickCountRequested,
    pickCountActual: picks.length,
    candidates: all.slice(0, 15),
    picks: pickResults.map(({ article, xPost }) => ({
      picked: article,
      xDraft: xPost.draft,
      xDraftSource: xPost.source,
      xDraftModel: xPost.model ?? null,
      xDraftNote: xPost.note,
      xPostVerdict: xPost.verdict ?? null,
      xDraftExcerptSummary: xPost.excerptSummary ?? null,
      xDraftAlternates: Array.isArray(xPost.alternates) ? xPost.alternates : [],
    })),
    picked,
    xDraft: topXPost?.draft ?? "",
    xDraftSource: topXPost?.source,
    xDraftModel: topXPost?.model ?? null,
    xDraftNote: topXPost?.note,
    xPostVerdict: topXPost?.verdict ?? null,
    xDraftExcerptSummary: topXPost?.excerptSummary ?? null,
    xDraftAlternates: Array.isArray(topXPost?.alternates) ? topXPost.alternates : [],
    errors,
  };
  const outDir = path.join(ROOT, "output");
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(path.join(outDir, "morning-run.json"), JSON.stringify(out, null, 2), "utf-8");
  console.log("OK output/morning-run.json");
  if (picks.length) console.log("picked articles:", picks.length, "/", pickCountRequested);
  if (errors.length) console.warn("feed errors:", errors.length);
  if (dedupeOn && skippedDuplicates) console.log("dedupe: skipped", skippedDuplicates, "already-posted candidates");
  if (!picked) {
    if (all.length === 0) {
      console.warn("No candidate picked (feeds, max_age_hours, or keywords).");
    } else if (dedupeOn) {
      console.warn("No candidate after dedupe (all items matched posted URL/fingerprint).");
    }
  }
}

const __filename = fileURLToPath(import.meta.url);
const invokedAsMain =
  process.argv[1] && path.resolve(__filename) === path.resolve(process.argv[1]);
if (invokedAsMain) {
  runMorningFetch().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
