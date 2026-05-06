# 進捗管理ダッシュボード

タスク管理ツール（Linear）のデータを自動で取得し、AIが健康度を判定、HTMLダッシュボードを生成してSlackに画像付きで通知するツールです。

```
┌──────────────────────────────────────────────────────────────┐
│  📊 マガジン進捗管理ダッシュボード                              │
│                                                              │
│  💊 進捗健康度                                                │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐               │
│  │ 企画案  │ │ 構成   │ │ 原稿   │ │ 動画   │               │
│  │  🟢    │ │  🟡   │ │  🟢   │ │  🔴   │               │
│  │  順調   │ │  注意  │ │  順調  │ │  危険  │               │
│  └────────┘ └────────┘ └────────┘ └────────┘               │
│                                                              │
│  🤖 AIからの提案                                              │
│  🔥 優先度：高 ─ 動画編集が3日遅延...                          │
│  🧭 優先度：中 ─ 原稿の引き継ぎを...                           │
│  🌱 優先度：低 ─ ナレッジを蓄積...                             │
│                                                              │
│  📋 マガジン別ステータス / 📅 カレンダー                        │
└──────────────────────────────────────────────────────────────┘
```

Slackにはこのダッシュボードのスクリーンショットが3枚届きます。ブラウザで詳細も確認できます。

一人でも使えます。自分のLinearにタスクを登録すればダッシュボードが動きます。チームメンバーがいなくても問題ありません。

### 朝ニュースと進捗ダッシュボードの違い

同じリポジトリに入っていますが、**目的が別**です。

- **朝ニュース（LINE など）** … 外部の RSS・ニュースから「今日の話題」「X 投稿案のたたき」を届ける。問いは「**何をネタにするか**」に近い。
- **進捗ダッシュボード** … Linear のイシューから、号の**制作工程**（企画・構成・原稿・動画など）の滞りや健康度をまとめる。問いは「**どこで止まっているか・次に誰が何をするか**」に近い。

毎朝ネタが自動で届いても、納期・担当・ブロッカーは消えないので、**両方あっても矛盾しません**（1 人運用で Linear をほとんど使わないなら、ダッシュボードの優先度は下がりがち、という使い分けはあります）。

### 図解ページ（Surge・共有用 URL）

静的 HTML の図解をブラウザでそのまま見られる公開先です。Slack や資料に URL を貼って共有できます。未デプロイのときは「プロジェクトが見つかりません」と出るので、各フォルダの `index.html` を `npx surge . <ドメイン>.surge.sh` でアップロードしてください。

| 内容 | URL |
|------|-----|
| 推奨する作り方（4ステップ・汎用） | [https://ads-recommended-build-flow.surge.sh](https://ads-recommended-build-flow.surge.sh) |
| GHA × LINE × X パイプライン（図解） | [https://ads-gha-line-pipeline.surge.sh](https://ads-gha-line-pipeline.surge.sh) |
| AIスクール向け・概要（図解・デプロイ手順つき） | [https://ads-ai-school-morning.surge.sh](https://ads-ai-school-morning.surge.sh)（`npm run deploy:ai-school-surge`） |
| 同内容・**ブラウザ閲覧・投影用**（手順なし） | [https://ads-magazine-browser.surge.sh](https://ads-magazine-browser.surge.sh)（`npm run deploy:ai-school-browser-surge`） |

本文を変えたときは `docs/ai-school-morning-surge/index.html` と `docs/ai-school-browser-surge/index.html` の**両方**を揃えてからデプロイしてください。まとめて出す場合は `npm run deploy:ai-school-all`（両方の Surge に連続アップロード）。

### 朝ニュース（RSS → X 投稿案 → LINE）

`config/news-sources.yaml` に RSS を列挙し、`npm run morning:fetch` で取得・スコアリング・1 件選定と投稿案を `output/morning-run.json` に書き出します。続けて `npm run morning:line` で Messaging API のプッシュ（要 `.env` の `LINE_CHANNEL_ACCESS_TOKEN` と `LINE_PUSH_TO_USER_ID`）。**チャットで「NG」と返すと次の候補を再取得してプッシュする**には `npm run morning:webhook` でサーバーを起動し、HTTPS の公開 URL（例: ngrok）を LINE Developers の Webhook に設定し、`LINE_CHANNEL_SECRET` を `.env` に書いてください（応答メッセージと競合する場合は公式アカウントのチャット設定を調整）。GitHub Actions では [`.github/workflows/morning-news.yml`](.github/workflows/morning-news.yml) が毎日朝（JST 6:30 前後を目安）に同じ処理を実行します。リポジトリの **Secrets** に同名の変数を登録してください。

**NG で別の記事が出ないとき** … 朝の自動実行は **GitHub 上**で `data/posted-articles.json` と `output/morning-run.json` を更新してプッシュします。ローカルで Webhook を動かしている場合、**その朝の実行後に `git pull` していない**と、手元の履歴が古いままになり、同じ候補が選ばれやすくなります。あわせて pull 後も RSS 上に「まだ除外リストに載っていない別記事」が無い場合は、代替が無いことがあります。

**朝の LINE が 6:30 にならないとき** … ワークフローの `cron` は **UTC** です（`30 21 * * *` = 翌 JST 早朝向けの前日 21:30 UTC）。**`0 0 * * *`（UTC 0:00）だと JST 9:00** になるので取り違えに注意してください。また GitHub の schedule は混雑で **数分〜かなり遅れる**ことがあります。GitHub の Actions タブで「Scheduled」と実際の開始時刻を確認してください。

---

## クイックスタート

### ローカルでダッシュボードを表示（最短手順）

**目的**: `output/dashboard.html` を生成し、PC のブラウザで開いて確認する。Slack・Surge・Playwright はまだ不要です。

| 手順 | 内容 |
|------|------|
| 1 | [Node.js](https://nodejs.org/) **18 以上**をインストールする |
| 2 | リポジトリをクローンし、プロジェクト直下に移動する（`git clone …` → `cd progress-dashboard`） |
| 3 | 依存関係を入れる: `npm install` |
| 4 | 環境変数ファイルを作る: `.env.example` をコピーして `.env` にリネームする |

環境ファイルのコピー例:

- macOS / Linux: `cp .env.example .env`
- Windows（PowerShell）: `Copy-Item .env.example .env`
- Windows（コマンドプロンプト）: `copy .env.example .env`

| 手順 | 内容 |
|------|------|
| 5 | `.env` に **Linear** の `MAGAZINE_LINEAR_API_KEY` と `MAGAZINE_LINEAR_TEAM_KEY` を設定する（取得方法は下の **Part B**） |
| 6 | Linear のラベル名がデフォルトと違う場合は `config/settings.js` を自分のワークスペースに合わせて編集する |
| 7 | 次を **この順番**で実行する |

```bash
npm run fetch-data
npm run calculate-health
npm run ai-suggestions
npm run generate-dashboard
```

| 手順 | 内容 |
|------|------|
| 8 | 生成された **`output/dashboard.html`** をブラウザで開く（エクスプローラーからダブルクリック、または「ファイル」→「開く」） |

- `MAGAZINE_GEMINI_API_KEY` が未設定でも、`npm run ai-suggestions` はフォールバックで提案文を生成します。
- Surge への公開・Slack 通知・スクリーンショットまで一気に試す場合は、下の **Part C〜F** を済ませたうえで `npm run run-all` を実行してください。

---

## 料金について

このツールで使う外部サービスはすべて無料枠で利用できます。

| サービス | 用途 | 料金 |
|---|---|---|
| Linear | タスク管理（データの取得元） | Free プランで十分 |
| Gemini API | AIによる改善提案の生成 | 無料枠あり |
| Surge | ダッシュボードHTMLの公開 | 無料 |
| Slack | ダッシュボード画像の通知先 | 無料ワークスペースで可 |
| GitHub Actions | 定期自動実行（オプション） | 毎月 2,000 分無料 |

---

## このツールの4パーツ

第3回講義で学んだ「4パーツ」が、このツールではどのファイルに対応しているかを示します。

```
┌─────────────┐
│  トリガー     │  .github/workflows/run-dashboard.yml
│  （いつ動く） │  → 毎朝9時 or 手動実行
└──────┬──────┘
       ▼
┌─────────────┐
│  ソース元    │  scripts/fetch-data.js
│  （データ）  │  → Linear API からタスクデータを取得
└──────┬──────┘
       ▼
┌─────────────┐  scripts/calculate-health.js    ← 健康度を計算
│  処理する場所 │  scripts/generate-ai-suggestions.js ← AIが提案を生成
│  （加工）    │  scripts/generate-dashboard.js  ← HTMLを組み立てる
└──────┬──────┘
       ▼
┌─────────────┐  scripts/deploy-to-surge.js  → ウェブに公開
│  届ける先    │  scripts/take-screenshot.js → 画像に変換
│  （配信）    │  scripts/post-to-slack.js   → Slack に通知
└─────────────┘
```

---

## セットアップ

まずは上の **[クイックスタート](#クイックスタート)** で `output/dashboard.html` まで生成できるか確認し、必要に応じて Part B 以降で各サービスを追加してください。

### 準備するもの

- Node.js 18 以上（持っていない場合は AI に「Node.jsをインストールして」と依頼）
- Linear アカウント（持っていない場合は Part B で作成します）
- Google アカウント（持っていない場合は Part C の前に作成してください）
- Slack ワークスペース（持っていない場合は Part D で作成します）

### Part A: リポジトリを開く

1. Git ホスト（Gitea / GitHub など）からリポジトリをクローンする
2. Cursor などでフォルダを開く
3. ターミナルを開いて依存関係をインストールする

ターミナルの開き方: Cursor/VSCode のメニュー「Terminal」→「New Terminal」、またはキーボードで `` Ctrl + ` ``（バッククォート）を押す。

```bash
npm install
```

### Part B: Linear API キーを取得する

Linear はタスク管理ツールです。このツールのデータ取得元になります。

1. [Linear](https://linear.app/) にアカウントを作成する（または既存のワークスペースを使う）

アカウント作成中に GitHub 連携・メンバー招待・メール通知の設定画面が表示されますが、**すべてスキップ（「I'll do this later」）して問題ありません**。後からいつでも設定できます。

2. Settings → 左メニューの「Account」→「Security & Access」→ Personal API keys で新しいキーを作成する

> 「Settings → API」で見つからない場合は、画面左メニューの「Account」セクションの下にある「Security & Access」を探してください。

**APIキーは作成時の一度だけ表示されます。** コピーし忘れて画面を閉じてしまった場合は、古いキーを削除して新しく作り直せば大丈夫です。

3. `.env` ファイルを作成し、キーを設定する

```bash
cp .env.example .env
```

Windows の場合は PowerShell で `Copy-Item .env.example .env`、コマンドプロンプトで `copy .env.example .env` でも同じです。

`.env` を開いて以下を設定:

```
MAGAZINE_LINEAR_API_KEY=lin_api_ここにコピーしたキーを貼る
MAGAZINE_LINEAR_TEAM_KEY=あなたのチームキー
```

`MAGAZINE_LINEAR_TEAM_KEY` は Linear のチーム設定画面の URL に含まれるキー（例: `MYTEAM`）です。

**チェックポイント**: 以下のコマンドでデータが取得できることを確認:

```bash
node scripts/fetch-data.js
```

`data/linear-data.json` にデータが保存されれば成功です。

:::info Linear のラベル設定
このツールは Linear のラベルグループを使って進捗を判定します。初期設定では「マガジン作成ステータス（イシュー）」というラベルグループを参照します。自分のプロジェクトに合わせて `config/settings.js` のラベル名を変更してください。
:::

### Part C: Gemini API キーを取得する

Gemini は Google の AI です。健康度データから改善提案を自動生成します。APIキーの発行は [Google AI Studio](https://aistudio.google.com/) という管理画面で行います（Gemini を直接使うのではなく、API キーだけをここで取得します）。

Google アカウントが必要です。持っていない場合は先に作成してください。

1. [Google AI Studio](https://aistudio.google.com/) にアクセスする
2. 「Get API key」→「Create API key」でキーを作成する（既にキーがある場合はそれを使っても OK）
3. `.env` に追記する

```
MAGAZINE_GEMINI_API_KEY=ここにコピーしたキーを貼る
```

**チェックポイント**: 以下のコマンドで提案が生成されることを確認:

```bash
npm run calculate-health
npm run ai-suggestions
```

「生成されたAI提案」が3件表示されれば成功です。Gemini API が使えない場合も、フォールバック機能で提案は自動生成されます。

### Part D: Slack Bot を作成する

Slack にダッシュボードの画像を投稿するための Bot を作ります。

Slack アカウントとワークスペースを持っていない場合は、先に [Slack](https://slack.com/) でワークスペースを作成してください。

1. [Slack API](https://api.slack.com/apps) にアクセスし「Create New App」→「From scratch」
2. 左メニューの「OAuth & Permissions」を開き、「Scopes」セクションまでスクロールする
3. 「Bot Token Scopes」の「Add an OAuth Scope」ボタンをクリックし、検索ボックスに入力して以下の2つを追加する:
   - `chat:write`
   - `files:write`
4. ページ上部の「Install to Workspace」（または左メニューの「Install App」）をクリックしてインストールする
5. インストール後に表示される「Bot User OAuth Token」（`xoxb-` で始まる文字列）をコピーする

> トークンが見つからない場合は、左メニューの「OAuth & Permissions」を開くと「OAuth Tokens for Your Workspace」セクションに表示されています。

6. 投稿先チャンネルで `/invite @あなたのBot名` を実行
7. チャンネル ID を取得（チャンネル名を右クリック → 「チャンネル詳細を表示」の最下部）
8. `.env` に追記する

```
MAGAZINE_SLACK_BOT_TOKEN=xoxb-ここにトークンを貼る
MAGAZINE_SLACK_CHANNEL_ID=C0ここにチャンネルIDを貼る
```

### Part E: Surge アカウントを準備する

Surge はHTMLを無料で公開できるサービスです。ダッシュボードをウェブで見られるようにします。

1. 以下のコマンドでアカウントを作成する

```bash
npx surge login
```

メールアドレスとパスワードの入力を求められます。**初回はアカウントが自動作成されます。** 既存のアカウントにログインするのではなく、好きなパスワードを新しく設定してください。

> **ターミナルでのパスワード入力について**: パスワードを入力しても画面には何も表示されません（`****` も出ません）。これはセキュリティ上の仕様です。そのまま入力してEnterを押せば反映されます。

2. トークンを取得する

```bash
npx surge token
```

3. `.env` に追記する

```
MAGAZINE_SURGE_LOGIN=あなたのメールアドレス
MAGAZINE_SURGE_TOKEN=ここにトークンを貼る
MAGAZINE_SURGE_DOMAIN=あなたのプロジェクト名-dashboard.surge.sh
```

`MAGAZINE_SURGE_DOMAIN` は好きな名前を設定できます（例: `my-team-dashboard.surge.sh`）。

### Part F: 動作確認

すべての環境変数が設定できたら、動作確認に進みます。

まず、スクリーンショット撮影に必要な Playwright のブラウザをインストールします:

```bash
npx playwright install chromium
```

次に、全パイプラインを実行します:

```bash
npm run run-all
```

成功すると:
- `output/dashboard.html` にダッシュボードが生成される
- Surge にデプロイされてブラウザで見られる
- Slack にスクリーンショット3枚が投稿される

ここまでで手動実行は完了です。毎朝自動でダッシュボードを更新してSlackに届くようにしたい場合は、次の「自動実行の設定（GitHub Actions）」に進んでください。

---

## 自動実行の設定（GitHub Actions）

GitHub Actions を使うと、毎朝自動でダッシュボードを更新してSlackに投稿できます。手動で毎朝コマンドを打つ必要がなくなります。

GitHub アカウントを持っていない場合は、先に [GitHub](https://github.com/) でアカウントを作成してください。

### 設定手順

1. GitHub にリポジトリを作成し、コードをプッシュする

Gitea からクローンした場合、GitHub は別のリモートとして追加します。AIに「このリポジトリを GitHub にもプッシュしたい」と相談すれば手順を案内してもらえます。

> **`npm ci` のエラーについて**: GitHub Actions のワークフローは `npm ci` を使って依存関係をインストールします。`package-lock.json` がコミットされていないと失敗するので、プッシュ前に `package-lock.json` が含まれていることを確認してください。

2. Settings → Secrets and variables → Actions で以下のシークレットを追加:

| シークレット名 | 値 |
|---|---|
| `MAGAZINE_LINEAR_API_KEY` | Linear API キー |
| `MAGAZINE_LINEAR_TEAM_KEY` | Linear チームキー |
| `MAGAZINE_GEMINI_API_KEY` | Gemini API キー |
| `MAGAZINE_SLACK_BOT_TOKEN` | Slack Bot トークン |
| `MAGAZINE_SLACK_CHANNEL_ID` | Slack チャンネル ID |
| `MAGAZINE_SURGE_LOGIN` | Surge メールアドレス |
| `MAGAZINE_SURGE_TOKEN` | Surge トークン |
| `MAGAZINE_SURGE_DOMAIN` | Surge ドメイン |

3. `.github/workflows/run-dashboard.yml` の `schedule` 行のコメントを外す

```yaml
  schedule:
    - cron: '0 0 * * 1-5'  # 毎朝9時（JST）、平日のみ
```

4. Actions タブで「ダッシュボード更新」を手動実行して動作を確認する

:::info 企画案ストック判定の制限
GitHub Actions では実行ごとにワークスペースがリセットされるため、企画案ストックの週次判定は正確に機能しません（毎回初回扱いになります）。正確な判定が必要な場合は、`data/stock-tracker.json` を永続化する設計を追加してください。
:::

---

## カスタマイズの手順

### Linear のラベル構造を変更する

`config/settings.js` を開いて、あなたの Linear ワークスペースのラベル名に合わせて変更してください。

```javascript
export const LABEL_GROUPS = {
  parentStatus: 'あなたのラベルグループ名',
  subIssueStatus: 'あなたのサブイシューラベルグループ名',
};

export const STATUS_LABELS = {
  stock: '1.企画案ストック',      // あなたのラベル名に変更
  composition: '2.構成作成中',    // あなたのラベル名に変更
  manuscript: '3.原稿執筆中',     // あなたのラベル名に変更
  video: '4.動画編集中',          // あなたのラベル名に変更
};
```

### 担当者名を変更する

`config/mappings.js` の `ASSIGNEE_MAPPINGS_INCLUDE` と `ASSIGNEE_MAPPINGS_STARTS_WITH` を編集して、チームメンバーの Linear ユーザー名と表示名の対応を設定してください。

### 健康度の閾値を調整する

`config/health-thresholds.yaml` を編集します。コードを変更する必要はありません。

```yaml
stock:
  healthy: 8      # ≥8本で順調（🟢）
  warning: 5      # 5-7本で注意（🟡）
delay:
  healthy: 0      # 遅延なしで順調
  warning: 1      # 1日遅延で注意
```

### AI提案のプロンプトを調整する

`config/ai-prompts/unified.md` を編集します。`{{CONTEXT}}` の部分に健康度データが自動で挿入されます。

### 見た目（CSS）を変更する

`config/dashboard-styles.css` を編集します。ダッシュボードのデザインを自由に変更できます。

---

## 仕組みの解説

このツールは7つのスクリプトがパイプラインとして順番に実行されます。

```
npm run run-all

  ① fetch-data         Linear API からタスクデータを取得 → data/linear-data.json
  ② calculate-health   健康度を計算                      → data/health-data.json
  ③ ai-suggestions     Gemini で改善提案を生成            → data/ai-suggestions.json
  ④ generate-dashboard HTML ダッシュボードを組み立て       → output/dashboard.html
  ⑤ deploy             Surge にデプロイ                   → data/deployed-url.txt
  ⑥ screenshot         Playwright でスクリーンショット     → output/screenshot-*.png
  ⑦ post-slack         Slack に画像とサマリーを投稿
```

各スクリプトは独立しており、個別に実行できます:

```bash
npm run fetch-data          # ①だけ実行
npm run calculate-health    # ②だけ実行
npm run ai-suggestions      # ③だけ実行
npm run generate-dashboard  # ④だけ実行
npm run deploy              # ⑤だけ実行
npm run screenshot          # ⑥だけ実行
npm run post-slack          # ⑦だけ実行
```

### 設定ファイルの役割

| ファイル | 役割 |
|---|---|
| `config/settings.js` | Linear のチームキー・ラベル名など、プロジェクト固有の設定 |
| `config/mappings.js` | 担当者名の変換ルール |
| `config/health-thresholds.yaml` | 健康度判定の閾値（コード変更不要で調整可能） |
| `config/ai-prompts/unified.md` | AI提案生成のプロンプト |
| `config/dashboard-styles.css` | ダッシュボードの見た目 |

---

## セキュリティについて

- `.env` ファイルには API キーやトークンが含まれます。**Git にコミットしてはいけません**
- `.gitignore` で `.env` は除外済みです
- `.env.example` はキーの形式だけを示したテンプレートで、実際のキーは含まれていません

**⚠️ API キーやパスワードを AI チャットに貼り付けないでください。** Cursor のチャットやその他の AI ツールに API キーを送ると、外部サーバーに送信される可能性があります。キーの設定は `.env` ファイルへの直接入力で行い、チャット欄には貼らないようにしてください。

---

## 困ったときは

つまずいたときは、以下の順で相談してください。

1. **AIに聞く** — エラー文やスクリーンショットを貼って質問する
2. **Slackのチームホームチャンネルで相談する** — 「AIにこう聞いたけど解決しなかった」と経緯を添える
3. [**問い合わせフォーム**](https://tayori.com/form/59d283f664136f1bf4525b0a7eef7d3814bcdd72)**から運営に連絡する** — 試したことを一緒に書く

### よくあるトラブル

| 症状 | 対処 |
|---|---|
| `fetch-data.js` でデータが0件 | Linear のラベルグループ名が `settings.js` と一致しているか確認 |
| Gemini API エラー | フォールバック機能が自動で動くので、提案は生成されます |
| Slack `not_in_channel` | 投稿先チャンネルで `/invite @あなたのBot名` を実行 |
| Surge デプロイ失敗 | `npx surge login` でログイン状態を確認 |
| スクリーンショットが真っ白 | `npx playwright install chromium` を実行 |

:::info 環境制約がある場合
会社のSlackにBot追加不可、APIキーが取れないなどの制約がある場合は、ソース元をJSONファイルに変えてローカルで動かすこともできます。AIに「Linear API を使わずにサンプルデータで動かしたい」と相談してみてください。
:::
