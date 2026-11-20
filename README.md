# Shared Claude

🌐 **Language:** 日本語 | [English](./README.en.md)

1つの **Anthropic API キー** や **Claude プラン契約（Pro / Max / Team）**、あるいは **OpenRouter / Ollama 等の互換 API** をバックエンドとして共有しつつ、利用メンバーごとに **仮想アカウント・チャット履歴・プロジェクト・コンテキストを完全に分離** できるセルフホスト型 Web アプリです。

---

## 主な機能

- **仮想アカウント管理 & 3階層権限**
  - **システム管理者 (`system_admin`)**: チーム管理、全アカウント管理、全体共通／チーム専用 Claude 接続先の管理
  - **チーム管理者 (`team_admin`)**: 自チームのメンバー管理、チーム専用接続先の管理、自チームの利用状況確認
  - **一般メンバー (`member`)**: 自分専用のチャット履歴・プロジェクト・カスタム指示を利用（他メンバー／他チームから完全分離）
- **マルチ接続プロバイダ対応**
  - **従量課金 API (`anthropic_api`)**: Anthropic 公式 API のほか、`Base URL` 指定により OpenRouter / Ollama / LiteLLM 等の Anthropic Messages API 互換サービスに対応（単価・モデル一覧の自動取得に対応）
  - **プラン契約共有 (`claude_cli`)**: `claude setup-token` で発行した OAuth トークン（`CLAUDE_CODE_OAUTH_TOKEN`）またはローカル CLI セッションを利用して定額プラン枠を共有
- **研究・論文執筆・開発向けの充実したチャット体験**
  - **Projects（プロジェクト）**: プロジェクト固有のシステムプロンプトとナレッジファイルを登録可能
  - **PDF テキスト自動抽出 & ドラッグ＆ドロップ**: ブラウザ側で PDF（学術論文など）からページ番号付きでテキストを自動抽出し、API モードでもプラン契約モードでも読解・考察が可能（スキャン PDF は API モードでバイナリ送信に自動フォールバック）
  - **Artifacts**: HTML / SVG / Mermaid 図表 / Markdown を右ペインでライブプレビュー・コピー・ダウンロード
  - **Extended Thinking / Web 検索 / 回答スタイル / Prompt Caching**（API モード）
  - **履歴検索・ピン留め・タイトル変更・メッセージ編集再送信・回答再生成・Markdown エクスポート**
- **月別・モデル別の利用状況可視化**
  - アカウント設定および管理パネルから、当月・過去月のトークン数、プラン枠利用量、モデル別単価に基づく概算 API 料金（USD）を確認可能
- **レスポンシブ UI**: PC・スマートフォンの両方に対応

---

## データベースの選択（6 方式対応）

環境変数 `DB_PROVIDER`（または接続用環境変数）によって、利用環境に合わせたデータベースを選べます。テーブルやインデックスは初回起動時に自動作成されます。

| 方式 | `DB_PROVIDER` | 必要な環境変数 | おすすめの用途 |
| :--- | :--- | :--- | :--- |
| **PostgreSQL** | `postgres` | `DATABASE_URL` | Supabase / Neon / Render / Railway / Vercel Postgres |
| **MySQL / MariaDB** | `mysql` | `MYSQL_URL` | TiDB Cloud / 既存 MySQL サーバー |
| **MongoDB** | `mongodb` | `MONGODB_URI`（任意で `MONGODB_DB_NAME`） | MongoDB Atlas 無料枠 / Docker MongoDB |
| **Firebase Firestore** | `firestore` | `FIREBASE_PROJECT_ID`, `FIREBASE_SERVICE_ACCOUNT_JSON` | Firebase Spark 無料枠 |
| **SQLite (`node:sqlite`)** | `sqlite` | 任意で `SQLITE_PATH`（Node.js 22+ 組み込み） | Docker / VPS / 自宅サーバーでの永続ファイル DB |
| **ローカル JSON** | `local` | 不要（`./data/shared-claude-store.json` に保存） | ローカルでの即時お試し起動 |

※ `DB_PROVIDER` を省略した場合は、`DATABASE_URL` → `MYSQL_URL` → `MONGODB_URI` → `FIREBASE_*` → `SQLITE_PATH` → `local` の順で自動判定されます。

---

## デプロイ・起動方法

### 方法 1: ローカルで動かす（Node.js 22+ 推奨）

```bash
git clone <your-repo-url>
cd shared-claude
npm install
# SQLite を使う場合は DB_PROVIDER=sqlite を指定（省略時は local JSON）
DB_PROVIDER=sqlite npm run dev
```

ブラウザで `http://localhost:3000` を開くと、初回セットアップ画面（システム管理者アカウント・初期チーム・最初の接続先の登録）が表示されます。

---

### 方法 2: Docker / Docker Compose で動かす（VPS・自宅サーバー・Render 等）

`Dockerfile` と `docker-compose.yml` を同梱しています。

```bash
docker compose up -d --build
```

デフォルトでは `DB_PROVIDER=sqlite` が有効になり、`./data/shared-claude.sqlite` にデータが永続化されます。

---

### 方法 3: PaaS / クラウドにデプロイする

- **Render / Railway / Koyeb / Fly.io（長時間ストリーミング・Max プラン CLI 共有におすすめ）**
  - 同梱の `Dockerfile` または Node.js ビルド（`npm run build` / `npm run start`）でそのままデプロイできます。
  - サーバーレス関数の短いタイムアウトがないため、**長い論文の考察** や **Max プラン（`claude_cli`）の実行** でも安定して動作します。
  - 永続ディスクをマウントして `DB_PROVIDER=sqlite` にするか、外部 DB（`DATABASE_URL` / `MYSQL_URL` / `MONGODB_URI` / `FIREBASE_*`）を指定してください。

- **Vercel（サーバーレス無料枠）**
  - リポジトリを Vercel にインポートし、Environment Variables に外部 DB の環境変数（`DATABASE_URL`、`MYSQL_URL`、`MONGODB_URI`、または `FIREBASE_PROJECT_ID` + `FIREBASE_SERVICE_ACCOUNT_JSON`）を設定してデプロイします。
  - ※サーバーレス関数には実行時間制限があるため、極端に長い応答や頻繁な CLI 起動にはコンテナ型ホスティング（Render / Railway / Docker）の方が適しています。

---

## Claude 接続先の登録について

### A. Anthropic API / 互換 API（OpenRouter 等）を使う場合
- 管理パネルの「Claude接続先」から **「従量課金 (Anthropic APIキー)」** を選び、API キーを入力します。
- OpenRouter 等を使う場合は「詳細オプション」を開き、`Base URL`（例: `https://openrouter.ai/api`）を設定してください。利用可能なモデルと単価が自動取得されます。

### B. Claude プラン契約（Pro / Max / Team）を共有する場合
1. 手元の端末で以下を 1 回だけ実行し、共有したいアカウントでログインして長期 OAuth トークン（`sk-ant-oat01-...`）を発行します：
   ```bash
   npx -y @anthropic-ai/claude-code setup-token
   ```
2. アプリの初期セットアップまたは管理パネルの「Claude接続先」で **「プラン契約 (Claude Code CLI)」** を選び、トークンを登録します。

> **プラン契約モード利用時の注意**
> - 画像の視覚認識や「思考（Extended Thinking）」「Web検索」トグルは API モード専用です（ただしテキストを含む論文 PDF は自動テキスト抽出によりプラン契約モードでも読解できます）。
> - サブスクリプションのレートリミット（5時間上限等）は共有メンバー全員で共有されます。

---

## ライセンス

MIT License
