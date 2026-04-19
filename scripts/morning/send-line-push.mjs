#!/usr/bin/env node
import "dotenv/config";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..", "..");

async function main() {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  const to = process.env.LINE_PUSH_TO_USER_ID;
  const raw = await fs.readFile(path.join(ROOT, "output", "morning-run.json"), "utf-8");
  const data = JSON.parse(raw);
  const text = [
    "【本日の候補】",
    data.picked ? "タイトル: " + data.picked.title : "候補なし",
    data.picked ? "URL: " + data.picked.link : "",
    "",
    "--- X 投稿案 ---",
    data.xDraft || "(なし)",
  ]
    .filter(Boolean)
    .join("\n");
  if (!token || !to) {
    const missing = [
      !token?.trim() && "LINE_CHANNEL_ACCESS_TOKEN",
      !to?.trim() && "LINE_PUSH_TO_USER_ID",
    ].filter(Boolean);
    console.log(
      `LINE 未設定（${missing.join(" と ")} が .env に無いか空です）。.env を保存（Ctrl+S）したか確認してください。\n\n内容:\n` +
        text,
    );
    return;
  }
  const res = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + token,
    },
    body: JSON.stringify({
      to,
      messages: [{ type: "text", text: text.slice(0, 4900) }],
    }),
  });
  if (!res.ok) throw new Error(await res.text());
  console.log("LINE push OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
