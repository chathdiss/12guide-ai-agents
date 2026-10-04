# Advisor web app

The chat web app of the Advisor agent: a ChatGPT-style interface where IFS consultants ask functional and technical questions in English or Dutch. Built with Next.js, React, TypeScript, Tailwind and shadcn/ui.

The agent itself (prompt, tier router, Claude calls) is an n8n workflow in [`agents/advisor`](../../agents/advisor). This app sends each question to it and shows the answer.

## Run locally

Needs Node 20.9 or newer (developed on Node 24).

```bash
cd apps/advisor-web
npm install
cp .env.example .env.local   # then set N8N_WEBHOOK_URL
npm run dev                  # http://localhost:3000
```

`N8N_WEBHOOK_URL` is the production webhook URL of the imported Advisor workflow, for example `http://localhost:5678/webhook/advisor-chat`. It is only read on the server and never reaches the browser.

## What it does

- Chat with a sidebar of earlier chats, grouped by date, with search, rename and delete.
- English / Dutch switch: the whole interface and the answers follow the chosen language.
- Light, dark or system theme.
- Attach up to 4 images or text files (drag, paste or pick); screenshots are read by the model.
- Each answer shows the tier the router chose (Lite / Full / Super), can be copied, and suggests follow-up questions.
- Failed answers show an error with a Try again button.

## How it works

`Browser → /api/chat (Next.js route) → n8n webhook → Claude`

`src/app/api/chat/route.ts` validates the request and forwards it to n8n, so the webhook URL stays on the server. The request and response shapes are in `src/lib/chat/api-types.ts`.

## Structure

- `src/app`: page, layout, global styles and the `/api/chat` route
- `src/components/chat`: sidebar, messages, message box, header controls
- `src/components/ui`: shadcn/ui building blocks
- `src/lib/chat`: chat state, attachment handling, shared types
- `src/lib/i18n.ts`: all interface texts in English and Dutch

## Not built yet

- Chats are stored in the browser (localStorage). Server-side storage belongs to `apps/api` and `packages/db`.
- Source links stay empty until the knowledge search (`packages/knowledge`) exists, and answers are marked as not yet verified.
- Login (`packages/auth`) and feedback.
