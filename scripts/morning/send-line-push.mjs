#!/usr/bin/env node
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, "..", "..");
dotenv.config({ path: path.join(ROOT, ".env") });

const LINE_TEXT_MAX = 4900;

function verdictLineFor(v) {
  if (v !== "OK" && v !== "NG") return "";
  return `【投稿判定】${v}（OK→【本文】を X に / NG→【候補2】【候補3】も確認）`;
}

/** morning-run から LINE の text メッセージ配列（最大5件）を組み立てる */
export function buildLineMessageTexts(parsed, options = {}) {
  const banner = typeof options.banner === "string" ? options.banner : "";
  const picks =
    Array.isArray(parsed.picks) && parsed.picks.length > 0 ? parsed.picks : null;

  const pickCountActual =
    typeof parsed.pickCountActual === "number"
      ? parsed.pickCountActual
      : picks
        ? picks.length
        : parsed.picked
          ? 1
          : 0;

  if (pickCountActual === 0 && banner.trim()) {
    const hintNg =
      banner.includes("NG") || banner.includes("次の候補")
        ? "\n\n【別の候補は見つかりませんでした】\n朝の自動実行は GitHub が投稿履歴を更新します。このフォルダで **git pull** してからもう一度 NG を試してください。\nそれでも無いときは、RSS 上にその時点で未投稿の記事が無い可能性があります（翌日までお待ちください）。"
        : "\n\n（この実行では候補がありませんでした）";
    return [(banner.trim() + hintNg).slice(0, LINE_TEXT_MAX)];
  }

  if (!picks) {
    const verdictLine = verdictLineFor(parsed.xPostVerdict);
    const text = [
      banner.trimEnd() ? banner.trimEnd() + "\n\n" : "",
      "【本日の候補】",
      parsed.picked ? "タイトル: " + parsed.picked.title : "候補なし",
      parsed.picked ? "URL: " + parsed.picked.link : "",
      verdictLine,
      "",
      "--- X 投稿案（全文） ---",
      parsed.xDraft || "(なし)",
    ]
      .filter(Boolean)
      .join("\n");
    return [text];
  }

  const msgs = [];
  if (banner.trim()) {
    msgs.push(
      `${banner.trim()}\n\n【本日の候補 ${picks.length}件】`.slice(0, LINE_TEXT_MAX),
    );
  } else {
    msgs.push(`【本日の候補 ${picks.length}件】`.slice(0, LINE_TEXT_MAX));
  }

  for (let i = 0; i < picks.length; i++) {
    const p = picks[i];
    const vl = verdictLineFor(p.xPostVerdict);
    const block = [
      `━━━━ 【候補 ${i + 1} / ${picks.length}】 ━━━━`,
      p.picked ? "タイトル: " + p.picked.title : "（なし）",
      p.picked ? "URL: " + p.picked.link : "",
      vl,
      "",
      "--- X 投稿案（全文） ---",
      p.xDraft || "(なし)",
    ]
      .filter(Boolean)
      .join("\n");
    msgs.push(block.slice(0, LINE_TEXT_MAX));
  }

  return msgs.slice(0, 5);
}

/** @param {object | null} data morning-run のオブジェクト。省略時は output/morning-run.json を読む
 * @param {{ banner?: string }} [options] banner があれば本文の先頭に付与 */
export async function sendLinePush(data = null, options = {}) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN?.trim();
  const to = process.env.LINE_PUSH_TO_USER_ID?.trim();
  let parsed = data;
  if (!parsed) {
    const raw = await fs.readFile(path.join(ROOT, "output", "morning-run.json"), "utf-8");
    parsed = JSON.parse(raw);
  }

  const texts = buildLineMessageTexts(parsed, options);
  const preview = texts.join("\n---\n");

  if (!token || !to) {
    const missing = [
      !token?.trim() && "LINE_CHANNEL_ACCESS_TOKEN",
      !to?.trim() && "LINE_PUSH_TO_USER_ID",
    ].filter(Boolean);
    const localHint = `${missing.join(" と ")} が .env に無いか空です。.env を保存（Ctrl+S）したか確認してください。`;
    const ciHint = `GitHub Actions では .env は使えません。リポジトリの Settings → Secrets and variables → Actions に ${missing.join(" と ")} を登録してください。`;
    console.error(process.env.GITHUB_ACTIONS === "true" ? ciHint : localHint);
    console.error("\n--- 送信できなかった本文プレビュー ---\n" + preview.slice(0, 6000));
    if (process.env.GITHUB_ACTIONS === "true") {
      throw new Error(ciHint);
    }
    return false;
  }

  const messages = texts.map((t) => ({
    type: "text",
    text: t.slice(0, LINE_TEXT_MAX),
  }));

  const res = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + token,
    },
    body: JSON.stringify({
      to,
      messages,
    }),
  });
  if (!res.ok) throw new Error(await res.text());
  console.log("LINE push OK (" + messages.length + " messages)");
  return true;
}

const invokedAsMain =
  process.argv[1] && path.resolve(__filename) === path.resolve(process.argv[1]);
if (invokedAsMain) {
  sendLinePush().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
