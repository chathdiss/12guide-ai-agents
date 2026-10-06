import { createApp } from "./server.js";
import { createRetriever } from "./knowledge.js";
import { searchKnowledge } from "../../../packages/knowledge/src/search.js";

const port = Number(process.env.PORT) || 4000; // Render sets PORT itself

const config = {
  n8nChatUrl: process.env.N8N_CHAT_URL,
  internalKey: process.env.INTERNAL_API_KEY,
  rateLimitPerMinute: Number(process.env.RATE_LIMIT_PER_MINUTE) || 30,
  agentTimeoutMs: Number(process.env.AGENT_TIMEOUT_MS) || 120_000,
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
    statement_timeout: 5000,
  });
  config.retrieve = createRetriever({ db, search: searchKnowledge });
} else {
  console.warn("Warning: DATABASE_URL is not set, so answers are not grounded in the approved sources.");
}

createApp(config).listen(port, () => {
  console.log(`API running on port ${port}`);
});
