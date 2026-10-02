# 12guide-ai-agents

AI agents that support 12Guide consultants and developers on IFS Cloud projects.
All agents share one platform for LLM access, knowledge search, memory and
authentication, and each agent is deployed independently.

## Agents
- **Advisor** – answers IFS functional and technical questions (English/Dutch),
  grounded in 12Guide and IFS knowledge, with links to sources.
- **Review** – reviews pull requests in Azure DevOps (IFS Build Place) against
  IFS customization best practice before human review.
- **Test** – generates test specifications, data scripts and Playwright
  regression tests from functional specs.
- **Support** – investigates support tickets and prepares drafts for the
  support consultant; nothing reaches the client without human review.

## Principles
- Answers are grounded in approved sources, with links back to them.
- Memory stores only human-confirmed lessons, scoped per customer and IFS version.
- A human stays in control of every client-facing or release decision.

## Structure
- `apps/` – web frontend and backend API
- `agents/` – logic for each agent
- `packages/` – shared code: LLM client, knowledge search, memory, auth, database
- `docs/` – architecture diagrams and decisions
