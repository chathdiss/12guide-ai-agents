# Advisor agent

The logic of the Advisor agent, built as an n8n workflow. The chat web app (`apps/advisor-web`) sends each question to this workflow through a webhook.

## Files

- `n8n-agent-workflow.json`: the workflow. Import it in n8n with **Workflows → Import from file**.

## Setup

1. Import `n8n-agent-workflow.json`.
2. Open the **Claude** node and select an Anthropic credential. Credentials are not part of the file.
3. Save and set the workflow to **Active**. The webhook path is `advisor-chat`, so the production URL is `http://<n8n host>/webhook/advisor-chat`. Put that URL in `apps/advisor-web/.env.local` as `N8N_WEBHOOK_URL`.

Tested on n8n 2.41.5 (Node 24). The Claude node must be version 1.6 or newer: older versions always send a `thinking` setting that the newest Claude models reject.

## How a question flows

`Webhook → Build prompt → Complexity router → Advisor Agent (Claude) → Format response → Respond to Webhook`

- **Build prompt** turns the question, the last 10 messages of history and any attachments into one prompt. Images are passed to Claude as images; text files are placed in the prompt.
- **Complexity router** scores the question (length, several questions, attachments, wording such as migration or integration, long conversations) and picks a tier. The model per tier is set at the top of that node:

  | Tier | Model |
  |---|---|
  | Lite | claude-haiku-4-5 |
  | Full | claude-sonnet-5-5 |
  | Super | claude-opus-5-5 |

- **Advisor Agent** holds the system prompt: answer language, professional format, no invented URLs, and 2 or 3 suggested follow-up questions.
- **Format response** separates the follow-up questions from the answer text.

The request and response shapes are defined in `apps/advisor-web/src/lib/chat/api-types.ts`.

## Not built yet

- Grounded search over 12Guide and IFS sources (`packages/knowledge`). Answers currently come from the model's general knowledge and say so.
- Memory (`packages/memory`).
- The tier rules and prompts live inside the workflow JSON. They can be moved into code in this folder when the team decides how the agent is deployed.
