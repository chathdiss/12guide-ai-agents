# Advisor API

The backend of the Advisor web app. It receives questions from the website, checks them, forwards them to the Advisor agent (an n8n workflow, see [`agents/advisor`](../../agents/advisor)) and returns the answer. It has no dependencies: plain Node.js, no build step.

The Claude API key is **not** needed here. Claude is called by the n8n workflow, whose credential lives in n8n. This server only needs the n8n webhook URL and a shared secret.

## Endpoints

| Method and path | What it does |
|---|---|
| `GET /api/health` | Returns `{"status":"ok"}` |
| `POST /api/chat` | Takes `{ chatId, question, language, history, attachments }` and returns `{ answer, sources, tier, tierReason, followUps }` |

Errors are returned as `{ error, code }`. The website turns the `code` into a message in the chosen language (`invalid_request`, `attachments_invalid`, `rate_limited`, `not_found`, `n8n_status`, `no_answer`, `too_slow`, `unreachable`, `not_configured`).

## Settings (environment variables)

| Variable | Needed | Meaning |
|---|---|---|
| `N8N_CHAT_URL` | yes | Production URL of the Advisor webhook in n8n |
| `INTERNAL_API_KEY` | yes | Shared secret, sent to n8n as the `X-Internal-Key` header |
| `PORT` | no | Defaults to 4000; Render sets it |
| `RATE_LIMIT_PER_MINUTE` | no | Requests per client per minute, default 30 |
| `AGENT_TIMEOUT_MS` | no | How long to wait for the agent, default 120000 |

See `.env.example`. Never commit real values.

## Run locally

```powershell
cd apps/api
npm install
$env:N8N_CHAT_URL="http://localhost:5678/webhook/advisor-chat"; $env:INTERNAL_API_KEY="any-local-value"; npm start
```

Open http://localhost:4000/api/health. Then start the website with `API_URL=http://localhost:4000` (see `apps/advisor-web`).

**Easier: a `.env` file.** `npm start` only reads the real environment, which is what Render provides. For local work you can keep the values in a file instead of typing them each time:

```powershell
cp .env.example .env      # then fill in INTERNAL_API_KEY
npm run start:local       # or: npm run dev, which also restarts on every code change
```

`.env` is ignored by git, so it is never committed. If the file is missing, these scripts stop with `.env: not found`.

## Tests

```bash
npm test
```

The tests use a fake n8n server, so they need no keys or running services.

## Deploy on Render

| Field | Value |
|---|---|
| Root Directory | `apps/api` |
| Build Command | `npm install` |
| Start Command | `npm start` |
| Environment variables | `N8N_CHAT_URL`, `INTERNAL_API_KEY` |

## What it protects, and what it does not

- Requests above 30 MB, with invalid fields or too many attachments are refused before they reach the agent.
- Each client is limited per minute, to protect the Claude budget from loops and misuse. The counter is in memory and resets on restart.
- The log records only metadata (status, tier, duration), never questions or answers.
- There is no login yet, so anyone who knows the address can use it. Keep the address within the test group and set a spending limit in the Anthropic console.
