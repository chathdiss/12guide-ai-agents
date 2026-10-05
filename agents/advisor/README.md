# Advisor agent

The logic of the Advisor agent, built as an n8n workflow. The chat web app (`apps/advisor-web`) sends each question to this workflow through a webhook.

## Files

Two files with the same workflow, for different n8n versions. Import the one that matches your server (n8n shows its version under **Help → About n8n**):

| File | Use it on | Claude node | Models (Lite / Full / Super) |
|---|---|---|---|
| `n8n-agent-workflow.json` | n8n **2.41.5** and newer | 1.6 | Haiku 4.5 / Sonnet 5.5 / Opus 5.5 |
| `n8n-agent-workflow-2.34.6.json` | n8n **2.34.6** (and other versions that bundle `@langchain/anthropic` older than 1.5) | 1.5 | Haiku 4.5 / Sonnet 4.5 / Opus 4.5 |

They differ in two ways:
- **Claude node version.** A newer file on an older n8n fails to import, because that node version does not exist there.
- **Models.** n8n 2.34.6 bundles an Anthropic library (1.3.27) that adds `thinking: disabled` to every request. Sonnet 5.5 and Opus 5.5 reject it ("thinking.type.disabled is not supported for this model"), while Haiku 4.5 and the 4.5 models accept it. From `@langchain/anthropic` 1.5 on (n8n 2.41.5), the setting is only sent when chosen, so the 5.x models work. If the server is upgraded, switch to `n8n-agent-workflow.json`.

The models are set in one place, at the top of the **Complexity router** node. Import with **Workflows → Import from file**.

## Setup

1. Import the file for your n8n version (see above) and rename the workflow, on a shared server for example `Advisor – Chat agent`.
2. Open the **Claude** node and select an Anthropic credential (create `Advisor – Anthropic` with the API key). Credentials are not part of the file.
3. Open the **Webhook** node. **Authentication** is already set to **Header Auth** in the file, so the node shows a warning until you choose a credential. Create one named `Advisor – internal key` with header name `X-Internal-Key` and the shared secret as value. The same secret goes into the backend as `INTERNAL_API_KEY`. Without it, anyone who finds the URL could use the agent, and n8n will not let you activate the workflow while the credential is missing.
4. Save and set the workflow to **Active**. The webhook path is `advisor-chat`, so the production URL is `http://<n8n host>/webhook/advisor-chat`. Put that URL in the backend (`apps/api`) as `N8N_CHAT_URL`.
5. Test it: a request with the right `X-Internal-Key` header must be answered, and one without it must be refused.

`n8n-agent-workflow.json` was run on n8n 2.41.5 (Node 24). `n8n-agent-workflow-2.34.6.json` was checked against the node definitions shipped with n8n 2.34.6 (every node and node version exists there), but has not been run on a 2.34.6 server.

The Claude node must be version **1.5 or newer**, which is where the `Thinking Mode` setting appears: older versions always send a `thinking` setting that the newest Claude models reject.

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
