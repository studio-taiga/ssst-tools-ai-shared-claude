# Shared Claude

🌐 **Language:** [日本語](./README.md) | English

A self-hosted web application that lets a team share a single **Anthropic API key**, **Claude subscription plan (Pro / Max / Team)**, or **OpenRouter / Ollama / compatible API** backend while keeping **virtual accounts, chat histories, projects, and context completely isolated** per member.

---

## Key Features

- **Virtual Accounts & 3-Tier Role-Based Access**
  - **System Admin (`system_admin`)**: Manage teams, all accounts, and global/team-scoped Claude connections.
  - **Team Admin (`team_admin`)**: Manage members within their team, team-scoped connections, and view team usage reports.
  - **Member (`member`)**: Private chat histories, projects, and custom instructions completely isolated from other members and teams.
- **Multi-Provider Connections**
  - **Pay-as-you-go API (`anthropic_api`)**: Supports the official Anthropic API as well as Anthropic Messages API-compatible providers like OpenRouter, Ollama, or LiteLLM via `Base URL` (with automatic model list and pricing discovery).
  - **Plan Sharing (`claude_cli`)**: Share a flat-rate Claude subscription quota using an OAuth token issued via `claude setup-token` (`CLAUDE_CODE_OAUTH_TOKEN`) or a local CLI session.
- **Rich Chat Experience for Research, Writing & Development**
  - **Projects**: Register project-specific system prompts and knowledge files.
  - **Automatic PDF Text Extraction & Drag-and-Drop**: Extracts text with page numbers from PDFs (e.g., academic papers) directly in the browser so both API and Plan modes can read them (scanned PDFs automatically fall back to binary upload in API mode).
  - **Artifacts**: Live preview, copy, and download HTML, SVG, Mermaid diagrams, and Markdown in a dedicated side pane.
  - **Extended Thinking / Web Search / Response Styles / Prompt Caching** (API mode).
  - **History Search, Pinning, Renaming, Message Edit & Resend, Regenerate, Markdown Export**.
- **Monthly & Per-Model Usage Visualization**
  - View monthly/historical token counts, plan quota usage, and estimated API cost (USD) based on per-model pricing in Account Settings and the Admin Panel.
- **Responsive UI & Bilingual (English / Japanese)**: Works on desktop and mobile with an instant language switcher (`JA / EN`).

---

## Database Options (6 Providers Supported)

Choose the database backend that fits your environment via `DB_PROVIDER` (or connection environment variables). Tables and indexes are created automatically on first startup.

| Provider | `DB_PROVIDER` | Required Environment Variables | Recommended For |
| :--- | :--- | :--- | :--- |
| **PostgreSQL** | `postgres` | `DATABASE_URL` | Supabase / Neon / Render / Railway / Vercel Postgres |
| **MySQL / MariaDB** | `mysql` | `MYSQL_URL` | TiDB Cloud / Existing MySQL servers |
| **MongoDB** | `mongodb` | `MONGODB_URI` (optional `MONGODB_DB_NAME`) | MongoDB Atlas free tier / Docker MongoDB |
| **Firebase Firestore** | `firestore` | `FIREBASE_PROJECT_ID`, `FIREBASE_SERVICE_ACCOUNT_JSON` | Firebase Spark free tier |
| **SQLite (`node:sqlite`)** | `sqlite` | Optional `SQLITE_PATH` (built into Node.js 22+) | Persistent file DB on Docker / VPS / Home server |
| **Local JSON** | `local` | None (saved to `./data/shared-claude-store.json`) | Instant local trial |

*If `DB_PROVIDER` is omitted, it is auto-detected in the following order: `DATABASE_URL` → `MYSQL_URL` → `MONGODB_URI` → `FIREBASE_*` → `SQLITE_PATH` → `local`.*

---

## Deployment & Running

### Option 1: Run Locally (Node.js 22+ recommended)

```bash
git clone <your-repo-url>
cd shared-claude
npm install
# Specify DB_PROVIDER=sqlite to use SQLite (defaults to local JSON if omitted)
DB_PROVIDER=sqlite npm run dev
```

Open `http://localhost:3000` in your browser to complete the initial setup (creating the system admin account, initial team, and first connection).

---

### Option 2: Docker / Docker Compose (VPS / Home Server / Render, etc.)

Includes `Dockerfile` and `docker-compose.yml`.

```bash
docker compose up -d --build
```

By default, `DB_PROVIDER=sqlite` is enabled and data is persisted to `./data/shared-claude.sqlite`.

---

### Option 3: Deploy to PaaS / Cloud

- **Render / Railway / Koyeb / Fly.io (Recommended for long streaming & Max plan CLI sharing)**
  - Deploy directly using the included `Dockerfile` or standard Node.js build (`npm run build` / `npm run start`).
  - Without short serverless function timeouts, **long paper analyses** and **Claude Plan CLI (`claude_cli`)** run reliably.
  - Either mount a persistent disk with `DB_PROVIDER=sqlite` or configure an external DB (`DATABASE_URL` / `MYSQL_URL` / `MONGODB_URI` / `FIREBASE_*`).

- **Vercel (Serverless Free Tier)**
  - Import the repository into Vercel and set an external DB's environment variables (`DATABASE_URL`, `MYSQL_URL`, `MONGODB_URI`, or `FIREBASE_PROJECT_ID` + `FIREBASE_SERVICE_ACCOUNT_JSON`).
  - *Note: Serverless functions have execution time limits, so container-based hosting (Render / Railway / Docker) is better suited for very long responses or frequent CLI invocations.*

---

## Registering Claude Connections

### A. Using Anthropic API / Compatible APIs (OpenRouter, etc.)
- In the Admin Panel under **Connections**, select **Pay-as-you-go (Anthropic API Key)** and enter your API key.
- For OpenRouter or other compatible endpoints, expand **Advanced Options** and set `Base URL` (e.g., `https://openrouter.ai/api`). Available models and pricing are fetched automatically.

### B. Sharing a Claude Plan Subscription (Pro / Max / Team)
1. Run the following command once on your local machine and log in with the account you want to share to issue a long-lived OAuth token (`sk-ant-oat01-...`):
   ```bash
   npx -y @anthropic-ai/claude-code setup-token
   ```
2. In the initial setup or Admin Panel under **Connections**, select **Plan Subscription (Claude Code CLI)** and register the token.

> **Notes on Plan Subscription Mode**
> - Image vision, **Extended Thinking**, and **Web Search** toggles are exclusive to API mode (however, text-based PDFs are automatically extracted in the browser and can still be read in Plan mode).
> - Subscription rate limits (such as 5-hour caps) are shared across all members using that connection.

---

## License

MIT
