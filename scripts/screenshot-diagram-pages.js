#!/usr/bin/env node

/**
 * Playwright で図解用 HTML（Surge 向けページ）のスクリーンショットを撮る。
 * - フルページ 1 枚（一覧で見やすい）
 * - セクション／フッターごとに分割（説明用に貼りやすい）
 * Mermaid の SVG が出るまで待ってから撮影する。
 */

import { chromium } from "playwright";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DIAGRAM_PAGES = [
  {
    id: "recommended-build-flow",
    title: "推奨する作り方（汎用）",
    file: path.join(__dirname, "..", "docs", "recommended-build-flow-surge", "index.html"),
  },
  {
    id: "gha-line-pipeline",
    title: "GHA × LINE × X パイプライン",
    file: path.join(__dirname, "..", "docs", "gha-line-pipeline-surge", "index.html"),
  },
];

async function waitForMermaid(page, timeoutMs = 30000) {
  const count = await page.locator("pre.mermaid").count();
  if (count === 0) {
    console.log("   （Mermaid ブロックなし — そのまま撮影）");
    return;
  }
  console.log(`   Mermaid 描画待ち（最大 ${timeoutMs / 1000}s）…`);
  try {
    await page.waitForFunction(
      () => {
        const blocks = [...document.querySelectorAll("pre.mermaid")];
        return blocks.length > 0 && blocks.every((el) => el.querySelector("svg"));
      },
      null,
      { timeout: timeoutMs }
    );
    await page.waitForTimeout(600);
    console.log("   Mermaid 描画完了");
  } catch {
    console.warn("   ⚠️ Mermaid の待ち時間内に SVG が揃いませんでした。現状の DOM で撮影します。");
    await page.waitForTimeout(1500);
  }
}

function slugifyShort(s, maxLen = 48) {
  const t = s
    .replace(/\s+/g, "-")
    .replace(/[^\w\u3040-\u30ff\u3400-\u9fff\-]/g, "")
    .slice(0, maxLen);
  return t || "section";
}

async function captureOnePage(browser, meta, outDir) {
  await fs.access(meta.file).catch(() => {
    throw new Error(`HTML が見つかりません: ${meta.file}`);
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 2,
    locale: "ja-JP",
  });

  const page = await context.newPage();

  await page.addInitScript(() => {
    const style = document.createElement("style");
    style.textContent = `
      body {
        font-family: "Noto Sans JP", "Hiragino Sans", "メイリオ", Meiryo, sans-serif !important;
      }
    `;
    document.head.appendChild(style);
  });

  const url = pathToFileURL(meta.file).href;
  console.log(`\n📄 ${meta.title}`);
  console.log(`   ${url}`);

  await page.goto(url, { waitUntil: "networkidle", timeout: 90000 });
  await waitForMermaid(page);

  const fullPath = path.join(outDir, `${meta.id}-full.png`);
  await page.screenshot({ path: fullPath, fullPage: true, type: "png" });
  console.log(`   ✅ フルページ: ${fullPath}`);

  const root = page.locator("div.mx-auto.max-w-3xl").first();
  if ((await root.count()) === 0) {
    console.warn("   ⚠️ div.mx-auto.max-w-3xl が無いためセクション分割をスキップ");
    await context.close();
    return;
  }

  const parts = root.locator(":scope > section, :scope > footer");
  const n = await parts.count();
  console.log(`   セクション分割: ${n} 枚`);

  for (let i = 0; i < n; i++) {
    const part = parts.nth(i);
    let label = `section-${String(i + 1).padStart(2, "0")}`;
    try {
      const heading = await part.locator("h1, h2, h3").first().textContent({ timeout: 2000 });
      if (heading) label += `-${slugifyShort(heading.trim())}`;
    } catch {
      /* no heading */
    }
    const sectionPath = path.join(outDir, `${meta.id}-${label}.png`);
    await part.scrollIntoViewIfNeeded();
    await part.screenshot({ path: sectionPath, type: "png" });
    console.log(`   ✅ ${path.basename(sectionPath)}`);
  }

  await context.close();
}

async function main() {
  const outDir = path.join(__dirname, "..", "output", "diagram-screenshots");
  await fs.mkdir(outDir, { recursive: true });
  console.log("📸 図解 HTML のスクリーンショット（Playwright）");
  console.log(`📁 出力先: ${outDir}`);

  const browser = await chromium.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--lang=ja-JP",
    ],
  });

  try {
    for (const meta of DIAGRAM_PAGES) {
      await captureOnePage(browser, meta, outDir);
    }
    console.log("\n✅ すべて完了");
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error("❌", err.message);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});