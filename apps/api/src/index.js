import { createApp } from "./server.js";
import { createRetriever } from "./knowledge.js";
import { createRewriter } from "./rewrite.js";
import { findByTitle, loadDocumentTexts, searchKnowledge } from "../../../packages/knowledge/src/search.js";

const port = Number(process.env.PORT) || 4000; // Render sets PORT itself

const config = {
  n8nChatUrl: process.env.N8N_CHAT_URL,
  internalKey: process.env.INTERNAL_API_KEY,
  rateLimitPerMinute: Number(process.env.RATE_LIMIT_PER_MINUTE) || 30,
  agentTimeoutMs: Number(process.env.AGENT_TIMEOUT_MS) || 600_000,
};

if (!config.n8nChatUrl) {
  console.warn("Warning: N8N_CHAT_URL is not set, so /api/chat will answer with a configuration error.");
}
if (!config.internalKey) {
  console.warn("Warning: INTERNAL_API_KEY is not set, so requests to n8n are sent without the X-Internal-Key header.");
}

// The knowledge base (PostgreSQL, see packages/db) is optional: without DATABASE_URL the agent
// answers from general knowledge and says so.
if (process.env.DATABASE_URL) {
  const { default: pg } = await import("pg");
  const db = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5,
    connectionTimeoutMillis: 3000,
    statement_timeout: 20000,
  });
  // A small model (Haiku) turns the question into search keywords; optional, the search works without it
  const rewrite = process.env.ANTHROPIC_API_KEY
    ? createRewriter({ apiKey: process.env.ANTHROPIC_API_KEY, model: process.env.REWRITE_MODEL || undefined })
    : null;
  if (!rewrite) console.warn("Warning: ANTHROPIC_API_KEY is not set, so questions are searched as typed (no translation or synonyms).");
  config.retrieve = createRetriever({ db, search: searchKnowledge, rewrite, loadFull: loadDocumentTexts, findTitles: findByTitle });
} else {
  console.warn("Warning: DATABASE_URL is not set, so answers are not grounded in the approved sources.");
}

createApp(config).listen(port, () => {
  console.log(`API running on port ${port}`);
});
