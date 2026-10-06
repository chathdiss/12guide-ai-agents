import { createHash } from "node:crypto";
import { splitIdentifiers } from "./identifiers.js";

// Words that say nothing about the topic, in English and Dutch, plus the product name itself
const STOPWORDS = new Set(
  (
    "a an the and or of to in on for with is are was were be been how do does did can could should would what which who when where why " +
    "i we you it this that these those my our your me about from into by as at not no if then than so there here " +
    "de het een en of van te in op voor met is zijn was waren wordt worden hoe wat welke wie wanneer waar waarom ik we je jij u " +
    "dit dat deze die mijn onze uw niet geen als dan zo er hier om aan bij naar uit door ook maar kan kun kunnen moet moeten " +
    "ifs cloud please help show explain tell give using use used make"
  ).split(" "),
);

// The words of a question that are worth searching for. Identifiers such as CodeBHandling
// are searched both whole and as the words inside them.
export function queryTerms(query, max = 12) {
  const terms = new Set();
  const add = (word) => {
    const w = word.toLowerCase().replace(/[^a-z0-9_]/g, "");
    if (w.length >= 2 && !STOPWORDS.has(w)) terms.add(w);
  };
  for (const token of query.match(/[A-Za-z0-9_]+/g) ?? []) {
    add(token);
    for (const part of splitIdentifiers(token).split(" ")) if (part) add(part);
  }
  return [...terms].slice(0, max);
}

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Finds the chunks that best match a question. `db` is a pg Pool or Client.
// Chunks must contain most of the terms; at most `perDocument` chunks per file are returned.
export async function searchKnowledge(db, query, { limit = 6, perDocument = 2, candidates = 60 } = {}) {
  const terms = queryTerms(query);
  if (terms.length === 0) return [];

  const { rows } = await db.query(
    `SELECT c.id, c.content, c.search_text, c.start_line, c.end_line,
            d.title, d.doc_key, d.origin, d.url, d.version, d.component, d.meta,
            ts_rank_cd(c.tsv, q.query, 32) AS rank
       FROM knowledge_chunks c
       JOIN knowledge_documents d ON d.id = c.document_id
       CROSS JOIN (SELECT to_tsquery('simple', $1) AS query) q
      WHERE c.tsv @@ q.query
      ORDER BY rank DESC
      LIMIT $2`,
    [terms.join(" | "), candidates],
  );

  const patterns = terms.map((t) => new RegExp(`(^|[^a-z0-9])${escapeRegExp(t)}`));
  const scored = rows.map((r) => {
    const hay = r.search_text.toLowerCase();
    const matched = patterns.filter((p) => p.test(hay)).length;
    const coverage = matched / terms.length;
    return { r, coverage, score: coverage * 10 + Number(r.rank) };
  });

  // keep chunks that cover most of the question, unless that would leave almost nothing
  let kept = scored.filter((s) => s.coverage >= 0.5);
  if (kept.length < 3) kept = scored;
  kept.sort((a, b) => b.score - a.score);

  const perDoc = new Map();
  const out = [];
  for (const { r, coverage, score } of kept) {
    const n = perDoc.get(r.doc_key) ?? 0;
    if (n >= perDocument) continue;
    perDoc.set(r.doc_key, n + 1);
    out.push({
      ref: createHash("sha1").update(`${r.doc_key}#${r.id}`).digest("hex").slice(0, 8),
      title: r.title,
      path: r.doc_key,
      origin: r.origin,
      url: r.url,
      version: r.version,
      component: r.component,
      startLine: r.start_line,
      endLine: r.end_line,
      content: r.content,
      coverage: Number(coverage.toFixed(2)),
      score: Number(score.toFixed(3)),
    });
    if (out.length >= limit) break;
  }
  return out;
}
