# Shared Claude

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

## データベースの選択（3 方式対応）

環境変数 `DB_PROVIDER`（または接続用環境変数）によって、利用環境に合わせたデータベースを選べます。

| 方式 | `DB_PROVIDER` | 必要な設定 | おすすめの用途 |
| :--- | :--- | :--- | :--- |
| **ローカルファイル** | `local` | 設定不要（`./data/shared-claude-store.json` に自動保存） | ローカル PC・VPS・Docker での単体セルフホスト |
| **PostgreSQL / Supabase / Neon** | `postgres` | `DATABASE_URL`（初回起動時にテーブルを自動作成） | Vercel 等のサーバーレス環境（無料枠で完結） |
| **Firebase Cloud Firestore** | `firestore` | `FIREBASE_PROJECT_ID` と `FIREBASE_SERVICE_ACCOUNT_JSON` | Firebase Spark プラン無料枠 + Vercel 等 |

※ `DB_PROVIDER` を省略した場合は、`DATABASE_URL` → `FIREBASE_*` → `local` の順で自動判定されます。

---

## セットアップ方法

### 1. ローカルで動かす（最短・設定不要）

```bash
git clone <your-repo-url>
cd shared-claude
npm install
npm run dev
```

ブラウザで `http://localhost:3000` を開くと、初回セットアップ画面（システム管理者アカウント・初期チーム・最初の接続先の登録）が表示されます。

---

### 2. Vercel ＋ 無料データベースで公開する（例）

1. **データベースを準備する（どちらか一方）**
   - **PostgreSQL (Supabase / Neon 等)**: 接続文字列 `DATABASE_URL` を取得します（テーブルは初回アクセス時に自動作成されます）。
   - **Firebase Firestore**: Firebase プロジェクトを作成し、Firestore データベースを有効化したうえで、サービスアカウントの秘密鍵 JSON を取得します（必要に応じて `npx -y firebase-tools@latest deploy --only firestore` で `firestore.rules` を反映してください）。
2. **Vercel にデプロイする**
   - このリポジトリを Vercel にインポートし、**Environment Variables** に以下を設定します：
     - PostgreSQL の場合：`DATABASE_URL`
     - Firestore の場合：`FIREBASE_PROJECT_ID` と `FIREBASE_SERVICE_ACCOUNT_JSON`
     - 任意：`APP_SECRET`（未設定時は DB 内に自動生成）
3. **初回セットアップ**
   - デプロイされた URL にアクセスし、画面の案内に従ってシステム管理者アカウントと Claude 接続先を登録します。

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
