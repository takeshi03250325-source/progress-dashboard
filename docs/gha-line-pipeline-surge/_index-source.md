このファイルの **下の** `html` フェンス内を `index.html` として保存するためのソースです。リポジトリルートで `node scripts/extract-gha-line-surge-html.cjs` を実行すると UTF-8 の `index.html` が生成されます（スクリプトは同梱）。

```html
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>GHA × LINE × X パイプライン（図解）</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      theme: {
        extend: {
          fontFamily: { sans: ['"Noto Sans JP"', 'system-ui', 'sans-serif'] },
        },
      },
    };
  </script>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;600;700&display=swap" rel="stylesheet" />
</head>
<body class="min-h-screen bg-slate-50 text-slate-900 antialiased">
  <div class="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
    <header class="mb-10 border-b border-slate-200 pb-8">
      <p class="text-sm font-medium uppercase tracking-wide text-violet-700">Surge 向け静的ページ</p>
      <div class="mt-3 rounded-lg border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-slate-800">
        <span class="font-semibold text-violet-900">この資料の Surge URL（共有・添付用）</span>
        <p class="mt-1 break-all">
          <a href="https://ads-gha-line-pipeline.surge.sh" class="font-mono text-base font-medium text-violet-700 underline decoration-violet-300 underline-offset-2 hover:text-violet-900">https://ads-gha-line-pipeline.surge.sh</a>
        </p>
        <p class="mt-2 text-xs text-slate-600">未デプロイのときは Surge が「プロジェクトが見つかりません」と表示します。フッターのコマンドで公開してください。</p>
      </div>
      <h1 class="mt-6 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">GHA × LINE × X パイプライン（図解）</h1>
      <p class="mt-4 text-slate-600">
        建設ニュースを朝に取得し、1本選んで X 文案まで作り、<strong>自分の LINE</strong> で承認したあと X に投稿する想定の<strong>全体像</strong>です。トリガーと主処理は <strong>GitHub Actions</strong>、LINE の返信受けは <strong>サーバレス Webhook</strong> が前提です。
      </p>
    </header>

    <section class="mb-10">
      <h2 class="mb-3 text-xl font-bold text-slate-900">要件（整理）</h2>
      <ul class="list-inside list-disc space-y-1 text-slate-700">
        <li><strong>トリガー</strong>: GitHub Actions（例: 毎朝の定時実行）</li>
        <li><strong>処理する場所</strong>: GitHub Actions 上で取得・1本選定・X 投稿案生成など</li>
        <li><strong>届ける先</strong>: 自分の LINE（承認・確認の主画面）→ 確定後 X</li>
      </ul>
    </section>

    <section class="mb-10">
      <h2 class="mb-3 text-xl font-bold text-slate-900">一枚でわかる（テキスト図）</h2>
      <pre class="overflow-x-auto rounded-xl border border-slate-200 bg-white p-4 text-[11px] leading-relaxed text-slate-800 shadow-sm sm:text-xs"> ┌──────────────── GitHub リポジトリ ─────────────────┐
 │  config/news-sources.yaml …… 「ソース元」（何のRSSを読むか）    │
 │  .github/workflows/*.yml … トリガー＆処理（Actions）           │
 │  GitHub Secrets ………… LINE / X / LLM などのトークン・キー     │
 └──────────────────────────────────────────────────┘
          │
          │  毎朝 ※cron は UTC（例: 6:30 JST → 前日 21:30 UTC）
          ▼
 ┌─────────────────────┐
 │ ① GitHub Actions     │  checkout → YAML で URL 一覧取得
 │   ニュース取得       │  → 1本選定 → X用文案 → LINE へプッシュ
 └──────────┬──────────┘
            │
            ▼
      ┌──────────┐
      │ ② 自分の LINE │  承認UI（ボタン推奨）／未回答なら投稿しない
      └─────┬────┘
            │ 承認イベント
            ▼
 ┌─────────────────────┐
 │ ③ サーバレス Webhook │  LINE署名検証 → GitHub API で次ジョブ起動
 │   （常時HTTPS）      │  ※Actions だけでは「返信を待てない」ので必須
 └──────────┬──────────┘
            │ repository_dispatch 等
            ▼
 ┌─────────────────────┐
 │ ④ GitHub Actions     │  投稿専用ワークフロー（Secrets の X だけここ）
 │   X API で投稿       │
 └─────────────────────┘</pre>
      <p class="mt-4 font-medium text-slate-800">
        覚え方: リポに <strong>設定と秘密</strong> → <strong>朝ジョブ</strong> → <strong>LINE</strong> で人が決める → <strong>Webhook</strong> が橋渡し → <strong>投稿ジョブ</strong> が X に出す。
      </p>
    </section>

    <section class="mb-10">
      <h2 class="mb-3 text-xl font-bold text-slate-900">4パーツと実装の置き場所</h2>
      <div class="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table class="min-w-full divide-y divide-slate-200 text-sm">
          <thead class="bg-slate-100">
            <tr>
              <th class="px-4 py-3 text-left font-semibold text-slate-900">パーツ</th>
              <th class="px-4 py-3 text-left font-semibold text-slate-900">実装の置き場</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            <tr>
              <td class="px-4 py-3 font-medium text-slate-900">トリガー</td>
              <td class="px-4 py-3 text-slate-700">GitHub Actions <code class="rounded bg-slate-100 px-1">schedule</code>（＋手動 <code class="rounded bg-slate-100 px-1">workflow_dispatch</code> 推奨）</td>
            </tr>
            <tr class="bg-slate-50/80">
              <td class="px-4 py-3 font-medium text-slate-900">ソース元</td>
              <td class="px-4 py-3 text-slate-700">RSS / 許可された API。URL 一覧はリポ内 <code class="rounded bg-slate-100 px-1">config/news-sources.yaml</code> など</td>
            </tr>
            <tr>
              <td class="px-4 py-3 font-medium text-slate-900">処理する場所</td>
              <td class="px-4 py-3 text-slate-700"><strong>主に</strong> GitHub Actions。承認の<strong>受信・検証</strong>はサーバレス Webhook</td>
            </tr>
            <tr class="bg-slate-50/80">
              <td class="px-4 py-3 font-medium text-slate-900">届ける先</td>
              <td class="px-4 py-3 text-slate-700">Messaging API で自分の LINE へ。承認後は X API</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section class="mb-10">
      <h2 class="mb-3 text-xl font-bold text-slate-900">ソース元の保管（要約）</h2>
      <ul class="list-inside list-disc space-y-2 text-slate-700">
        <li><strong>公開してよいフィード URL</strong> → リポ内 YAML / JSON（PR で差分が見える）</li>
        <li><strong>API キー・トークン</strong> → GitHub Secrets（ソース URL まで Secret に入れない方が運用しやすい）</li>
        <li>サーバレス側にも LINE チャネルシークレット等が必要なら、そのホストの環境変数で管理</li>
      </ul>
    </section>

    <section class="mb-10">
      <h2 class="mb-4 text-xl font-bold text-slate-900">図（Mermaid）</h2>
      <p class="mb-6 text-sm text-slate-600">
        関連:
        <a class="text-violet-600 underline" href="https://docs.github.com/en/actions/using-workflows/workflow-syntax-for-github-actions#onschedule">GitHub Actions schedule（UTC）</a>、
        <a class="text-violet-600 underline" href="https://developers.line.biz/ja/docs/messaging-api/">LINE Messaging API</a>
      </p>

      <h3 class="mb-3 text-lg font-semibold text-slate-800">4パーツと流れ</h3>
      <div class="mb-10 overflow-x-auto rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <pre class="mermaid text-sm">
flowchart TB
  subgraph trig [Trigger]
    cron[GHA_on_schedule_UTC]
  end
  subgraph src [Source_meta]
    yaml["config/news-sources.yaml"]
    feeds[RSS_or_API_on_web]
  end
  subgraph proc [Process]
    job1[GHA_fetch_pick_draft]
    hook[Serverless_LINE_webhook]
    job2[GHA_post_to_X_only]
  end
  subgraph deliv [Deliver]
    linePush[LINE_Messaging_to_you]
    xPost[X_API]
  end
  cron --> job1
  yaml --> job1
  job1 --> feeds
  job1 --> linePush
  linePush --> hook
  hook --> job2
  job2 --> xPost
        </pre>
      </div>

      <h3 class="mb-3 text-lg font-semibold text-slate-800">設定と秘密の分け方</h3>
      <div class="mb-10 overflow-x-auto rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <pre class="mermaid text-sm">
flowchart LR
  yamlFile["Repo_YAML_feed_URLs"]
  ghSecrets["GitHub_Secrets_tokens"]
  gha["GitHub_Actions_jobs"]
  srv["Serverless_webhook"]
  yamlFile -->|"何を読むか"| gha
  ghSecrets -->|"誰として読む・送る・投稿するか"| gha
  ghSecrets -->|"LINE_channel_secret等"| srv
        </pre>
      </div>

      <h3 class="mb-3 text-lg font-semibold text-slate-800">時系列（詳細）</h3>
      <div class="overflow-x-auto rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <pre class="mermaid text-sm">
sequenceDiagram
  participant Cron as GHA_cron
  participant Feed as NewsFeeds
  participant GA1 as Workflow_fetch_and_draft
  participant Line as LINE_Messaging_API
  participant User as You
  participant Hook as Serverless_webhook
  participant GA2 as Workflow_post_X

  Cron->>GA1: schedule_trigger
  GA1->>Feed: fetch_RSS_or_API
  Feed-->>GA1: articles
  GA1->>GA1: pick_one_and_write_X_text
  GA1->>Line: push_approval_message
  Line->>User: notify
  User->>Line: approve_action
  Line->>Hook: webhook_POST
  Hook->>Hook: verify_signature
  Hook->>GA2: dispatch_second_workflow
  GA2->>GA2: post_via_X_API
        </pre>
      </div>
    </section>

    <section class="mb-10 rounded-xl border border-amber-200 bg-amber-50/80 p-6">
      <h2 class="mb-2 text-lg font-bold text-amber-900">レビューで出た要点（短く）</h2>
      <ul class="list-inside list-disc space-y-2 text-sm text-slate-800">
        <li><strong>UI/UX</strong>: LINE は短い階層＋ボタン承認推奨。未回答は投稿しない。締切・失敗通知を明示。</li>
        <li><strong>エンジニア</strong>: cron は UTC。LINE 返信は Webhook 必須。投稿ワークフローは分離。新規は Messaging API 前提（LINE Notify は廃止済みのため運用前に公式で確認）。</li>
      </ul>
    </section>

    <footer class="rounded-xl border border-slate-200 bg-slate-900 p-6 text-slate-100">
      <h2 class="mb-2 text-lg font-bold text-white">Surge で公開する手順</h2>
      <ol class="list-inside list-decimal space-y-2 text-sm text-slate-200">
        <li><code class="rounded bg-slate-800 px-1.5 py-0.5 text-violet-200">cd docs/gha-line-pipeline-surge</code></li>
        <li>初回のみ: <code class="rounded bg-slate-800 px-1.5 py-0.5 text-violet-200">npx surge login</code></li>
        <li><code class="rounded bg-slate-800 px-1.5 py-0.5 text-violet-200">npx surge . ads-gha-line-pipeline.surge.sh</code></li>
      </ol>
      <p class="mt-4 text-sm text-slate-300">
        公開URL: <a class="font-mono text-violet-200 underline hover:text-white" href="https://ads-gha-line-pipeline.surge.sh">https://ads-gha-line-pipeline.surge.sh</a>
      </p>
      <p class="mt-3 text-xs text-slate-400">汎用の「作り方の順番」は <code class="text-slate-300">docs/recommended-build-flow-surge/</code> を参照。</p>
    </footer>
  </div>

  <script src="https://cdn.jsdelivr.net/npm/mermaid@10.9.3/dist/mermaid.min.js"></script>
  <script>
    mermaid.initialize({
      startOnLoad: true,
      theme: 'neutral',
      securityLevel: 'loose',
      fontFamily: 'Noto Sans JP, sans-serif',
    });
  </script>
</body>
</html>
```
