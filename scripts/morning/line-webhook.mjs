#!/usr/bin/env node
/**
 * LINE Messaging API の Webhook を受け、ユーザーから「NG」のテキストが来たとき
 * 朝ニュースを再フェッチ（dedupe により次候補）してプッシュする。
 *
 * 起動: npm run morning:webhook
 * 公開 URL は HTTPS が必須のため、ローカルでは ngrok 等でトンネルする。
 * LINE Developers の Webhook URL に https://xxx/webhook を設定し、チャネルシークレットを .env に書く。
 */
import crypto from "crypto";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { runMorningFetch } from "./fetch-and-draft.mjs";
import { sendLinePush } from "./send-line-push.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, "..", "..");
dotenv.config({ path: path.join(ROOT, ".env") });

const PORT = Number(process.env.LINE_WEBHOOK_PORT || "3333");
const CHANNEL_SECRET = process.env.LINE_CHANNEL_SECRET?.trim();
const ALLOWED_USER_ID = process.env.LINE_PUSH_TO_USER_ID?.trim();

/** 直近の処理時刻（連打・二重イベント緩和） */
const lastNgAt = new Map();
const DEBOUNCE_MS = 8000;

let pipelineBusy = false;

function verifyLineSignature(rawBody, signature) {
  if (!CHANNEL_SECRET || !signature) return false;
  const hash = crypto.createHmac("sha256", CHANNEL_SECRET).update(rawBody, "utf8").digest("base64");
  try {
    const a = Buffer.from(signature, "utf8");
    const b = Buffer.from(hash, "utf8");
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function isNgMessage(text) {
  if (!text || typeof text !== "string") return false;
  const t = text.trim().normalize("NFKC").toLowerCase();
  return t === "ng";
}

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function runNgPipeline(userId) {
  if (ALLOWED_USER_ID && userId !== ALLOWED_USER_ID) {
    console.warn("[webhook] ignored: userId does not match LINE_PUSH_TO_USER_ID");
    return;
  }
  const now = Date.now();
  const prev = lastNgAt.get(userId) || 0;
  if (now - prev < DEBOUNCE_MS) {
    console.warn("[webhook] debounced NG from", userId);
    return;
  }
  lastNgAt.set(userId, now);

  if (pipelineBusy) {
    console.warn("[webhook] pipeline busy, skip NG");
    return;
  }
  pipelineBusy = true;
  try {
    console.log("[webhook] NG -> runMorningFetch + sendLinePush");
    await runMorningFetch();
    await sendLinePush(null, {
      banner: "【NG を受け取りました。次の候補です】\n",
    });
  } catch (e) {
    console.error("[webhook] pipeline error:", e);
  } finally {
    pipelineBusy = false;
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

  if (req.method === "GET" && url.pathname === "/") {
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("morning LINE webhook OK (POST /webhook)\n");
    return;
  }

  /** ブラウザで /webhook を開くと GET になり 404 になりがちなので説明だけ返す（LINE 本体は POST） */
  if (req.method === "GET" && url.pathname === "/webhook") {
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(
      "LINE Webhook の URL は正しいです。この画面は確認用です。実際のイベントは LINE から POST で届きます。\n",
    );
    return;
  }

  if (req.method !== "POST" || url.pathname !== "/webhook") {
    res.writeHead(404);
    res.end();
    return;
  }

  let rawBuf;
  try {
    rawBuf = await readRawBody(req);
  } catch (e) {
    res.writeHead(400);
    res.end();
    return;
  }

  const rawBody = rawBuf.toString("utf8");
  const sig = req.headers["x-line-signature"];
  if (!verifyLineSignature(rawBody, sig)) {
    console.warn("[webhook] invalid signature (check LINE_CHANNEL_SECRET)");
    res.writeHead(401);
    res.end();
    return;
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    res.writeHead(400);
    res.end();
    return;
  }

  /** LINE は素早く 200 を期待するため、先に応答してから非同期で処理 */
  res.writeHead(200);
  res.end();

  const events = Array.isArray(payload.events) ? payload.events : [];
  for (const ev of events) {
    if (ev.type !== "message" || ev.message?.type !== "text") continue;
    if (ev.source?.type !== "user" || !ev.source?.userId) continue;
    const text = ev.message.text || "";
    if (!isNgMessage(text)) continue;
    const userId = ev.source.userId;
    void runNgPipeline(userId);
  }
});

server.listen(PORT, () => {
  console.log(`LINE webhook listening on http://127.0.0.1:${PORT}/webhook`);
  if (!CHANNEL_SECRET) {
    console.warn("警告: LINE_CHANNEL_SECRET が未設定です。署名検証が失敗します。");
  }
});
