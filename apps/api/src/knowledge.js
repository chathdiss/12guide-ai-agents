// Looks up the passages of the approved sources that belong to a question.
// `search(db, query)` is searchKnowledge from packages/knowledge; `db` is a pg Pool.

const MAX_PASSAGE_CHARS = 2400;

// A short follow-up such as "and the second step?" finds nothing alone, so the previous question helps
export function retrievalQuery(question, history = []) {
  if (question.split(/\s+/).length >= 4) return question;
  const previous = [...history].reverse().find((m) => m.role === "user");
  return previous ? `${previous.content.slice(0, 300)} ${question}` : question;
}

// Returns a function (question, history) => { status: "ok" | "unavailable", passages }
export function createRetriever({ db, search, limit = 6 }) {
  return async (question, history) => {
    try {
      const found = await search(db, retrievalQuery(question, history), { limit });
      const passages = found.map((r, i) => ({
        id: i + 1,
        title: r.title,
        path: r.path,
        origin: r.origin,
        url: r.url || "",
        version: `${r.component} ${r.version}`.trim(),
        startLine: r.startLine,
        endLine: r.endLine,
        content: r.content.slice(0, MAX_PASSAGE_CHARS),
      }));
      return { status: "ok", passages };
    } catch (err) {
      console.error(JSON.stringify({ time: new Date().toISOString(), knowledge: "unavailable", error: String(err?.message ?? err) }));
      return { status: "unavailable", passages: [] };
    }
  };
}
