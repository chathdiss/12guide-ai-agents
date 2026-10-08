# Advisor API

The backend of the Advisor web app. It receives questions from the website, checks them, forwards them to the Advisor agent (an n8n workflow, see [`agents/advisor`](../../agents/advisor)) and returns the answer. Plain Node.js, no build step; the only dependency is `pg`, for the knowledge base.

The Claude API key is **not** needed here. Claude is called by the n8n workflow, whose credential lives in n8n. This server only needs the n8n webhook URL and a shared secret.

## Endpoints

| Method and path | What it does |
|---|---|
| `GET /api/health` | Returns `{"status":"ok"}` |
| `POST /api/chat` | Takes `{ chatId, question, language, history, attachments }` and returns `{ answer, sources, tier, tierReason, followUps }` |

Errors are returned as `{ error, code }`. The website turns the `code` into a message in the chosen language (`invalid_request`, `attachments_invalid`, `rate_limited`, `not_found`, `n8n_status`, `no_answer`, `too_slow`, `unreachable`, `not_configured`).

## How answers are grounded

For every question the server first searches the knowledge base (`packages/knowledge/src/search.js`) and sends the passages it found to the agent together with the question. The agent may only answer from those passages and marks each claim with `[1]`, `[2]`, ... (numbers valid for that request only). When the answer comes back, `src/cite.js` removes markers that match no passage, renumbers the rest in order of use, and returns exactly the cited passages as `sources`, each with file path, line range and the passage itself. If nothing relevant is found the agent says so instead of guessing, and if the database is down it answers from general knowledge with a warning line.

How the search is done (`src/knowledge.js`, `src/rewrite.js`):

- A small, cheap model (Claude Haiku, `ANTHROPIC_API_KEY`) turns the question into English search keywords: it translates, expands abbreviations, keeps codes and API names as they are and adds a few synonyms. It only does this; the answer itself is written by the Lite, Full or Super model that the n8n router picks. Without the key the question is searched as typed.
- The question is searched twice, as typed and with the keywords, and the results are taken in turn. The keywords alone would replace specific words ("Admin Studio", "July 2025") with general ones.
- A phrase in quotes is taken as a title: a document with exactly that title comes first.
- A question about code ("source code", PL/SQL, a file, a method) also gets a search in the source code alone.
- The same model flags a question that is clearly not about IFS (for example "what is 2+2"). Nothing is searched for it, so the agent gets no passages and the router picks the Lite tier. A short follow-up question is judged on its own first, so it cannot borrow the previous question to look IFS-related.


## Settings (environment variables)

| Variable | Needed | Meaning |
|---|---|---|
| `N8N_CHAT_URL` | yes | Production URL of the Advisor webhook in n8n |
| `INTERNAL_API_KEY` | yes | Shared secret, sent to n8n as the `X-Internal-Key` header |
| `DATABASE_URL` | no | The knowledge base ([`packages/db`](../../packages/db)). Without it the agent answers from general knowledge and says so |
| `PORT` | no | Defaults to 4000; Render sets it |
| `RATE_LIMIT_PER_MINUTE` | no | Requests per client per minute, default 30 |
| `AGENT_TIMEOUT_MS` | no | How long to wait for the agent, default 600000 (complete answers take minutes) |

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
