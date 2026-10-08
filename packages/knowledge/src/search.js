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

// IFS names its tables after the entity: "work task" -> work_task_tab. When the question asks for a table,
// a view or a column, those names are guessed from the words of the question; a guess that exists nowhere
// is dropped later, so a wrong guess costs nothing.
export function guessIdentifiers(query, max = 12) {
  if (!/\b(tables?|views?|columns?)\b/i.test(query)) return [];
  const skip = /^(tables?|views?|columns?|find|information|info|data|details?|stored?|stores|where|give|list)$/;
  const words = (query.toLowerCase().match(/[a-z][a-z0-9]{2,}/g) ?? []).filter((w) => !STOPWORDS.has(w) && !skip.test(w));
  const out = new Set();
  for (let size = 3; size >= 2; size--) {
    for (let i = 0; i + size <= words.length; i++) {
      const name = words.slice(i, i + size).join("_");
      out.add(name);
      out.add(`${name}_tab`);
    }
  }
  return [...out].slice(0, max);
}

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Finds the chunks that best match a question. `db` is a pg Pool or Client.
// Chunks must contain most of the terms; at most `perDocument` chunks per file are returned.
// `keywords` (optional) are the words an AI rewrite made of the question: translated, abbreviations
// expanded, with synonyms. They replace the words of the question. Because synonyms widen the list,
// a chunk then only has to contain a quarter of the terms instead of half.
export async function searchKnowledge(db, query, { limit = 6, perDocument = 2, candidates = 30, keywords = null, origin = null } = {}) {
  const rewritten = Array.isArray(keywords) && keywords.length > 0 ? queryTerms(keywords.join(" "), 24) : [];
  const asked = [...new Set([...(rewritten.length > 0 ? rewritten : queryTerms(query, 30)), ...guessIdentifiers(query)])];
  if (asked.length === 0) return [];
  const minCoverage = rewritten.length > 0 ? 0.25 : 0.5;

  // Words found in most chunks ("error", "type") would make nearly every chunk a candidate. Only the
  // rarer words choose the candidates; all words still count when the candidates are scored.
  const { rows: statRows } = await db.query(
    "SELECT term, df, (SELECT count(*) FROM knowledge_chunks) AS n FROM knowledge_term_stats WHERE term = ANY($1)",
    [asked],
  );
  const total = Number(statRows.find((r) => r.n !== undefined)?.n ?? Infinity);
  const frequency = new Map(statRows.filter((r) => r.term !== undefined).map((r) => [r.term, Number(r.df)]));
  // Names with underscores (work_task_tab) are split into words by the index and matched as a phrase, so
  // the statistics have no row for them: count those directly.
  if (frequency.size > 0) {
    const unknown = asked.filter((t) => !frequency.has(t));
    const counts = await Promise.all(
      unknown.map((t) => db.query("SELECT count(*) AS n FROM knowledge_chunks WHERE tsv @@ to_tsquery('simple', $1)", [t])),
    );
    unknown.forEach((t, i) => counts[i].rows[0]?.n > 0 && frequency.set(t, Number(counts[i].rows[0].n)));
  }
  // a word that is in no chunk at all (a typo, a guessed name that does not exist) cannot match anything and
  // must not lower the match score of every chunk
  const terms = frequency.size > 0 ? asked.filter((t) => frequency.has(t)) : asked;
  if (terms.length === 0) return [];
  const rare = terms.filter((t) => (frequency.get(t) ?? 0) < total * 0.1);
  const searchTerms = rare.length >= 2 ? rare : terms;

  // Every word gets a weight: a word found in few chunks ("payee", "camt") tells more than one found in
  // most ("payment", "error"). The best `candidates` chunks of every source are kept, by that weighted
  // score, so a large source (the code) cannot push the others out.
  const { rows } = await db.query(
    `WITH t AS MATERIALIZED (
       SELECT u.term, to_tsquery('simple', u.term) AS q,
              LN(1 + (SELECT count(*) FROM knowledge_chunks)::float8 / (1 + u.df)) AS w
         FROM unnest($3::text[], $4::int[]) AS u(term, df)
     )
     SELECT * FROM (
       SELECT x.*, ROW_NUMBER() OVER (PARTITION BY x.origin ORDER BY x.wscore DESC, x.rank DESC) AS n FROM (
         SELECT c.id, c.content, c.search_text, c.start_line, c.end_line,
                d.title, d.doc_key, d.origin, d.url, d.version, d.component, d.meta,
                ts_rank_cd(c.tsv, qq.query, 32) AS rank,
                (SELECT COALESCE(SUM(t.w), 0) FROM t WHERE c.tsv @@ t.q) AS wscore,
                (SELECT json_agg(json_build_object('t', t.term, 'w', t.w)) FROM t) AS weights
           FROM knowledge_chunks c
           JOIN knowledge_documents d ON d.id = c.document_id
           CROSS JOIN (SELECT to_tsquery('simple', $1) AS query) qq
          WHERE c.tsv @@ qq.query AND ($5::text IS NULL OR d.origin = $5)
       ) x
     ) ranked
      WHERE n <= $2
      ORDER BY wscore DESC, rank DESC`,
    [searchTerms.join(" | "), candidates, terms, terms.map((t) => frequency.get(t) ?? 0), origin],
  );

  const weight = new Map((rows[0]?.weights ?? []).map((x) => [x.t, Number(x.w)]));
  const weightOf = (t) => weight.get(t) ?? 1;
  const totalWeight = terms.reduce((n, t) => n + weightOf(t), 0);
  const patterns = terms.map((t) => ({ w: weightOf(t), re: new RegExp(`(^|[^a-z0-9])${escapeRegExp(t)}`) }));
  const scored = rows.map((r) => {
    const hay = r.search_text.toLowerCase();
    const matched = patterns.reduce((n, p) => (p.re.test(hay) ? n + p.w : n), 0);
    const coverage = matched / totalWeight;
    // the source weight counts in proportion to how well the chunk matches: a weak match gets little of it
    return { r, coverage, score: coverage * (10 + sourceWeight(r)) + Number(r.rank) };
  });

  // keep chunks that cover enough of the terms, unless that would leave almost nothing
  let kept = scored.filter((s) => s.coverage >= minCoverage);
  if (kept.length < 3) kept = scored;
  kept.sort((a, b) => b.score - a.score);

  // No single source may fill more than half of the results while others have matches
  const perOrigin = new Map();
  const originCap = origin ? limit : Math.max(1, Math.ceil(limit / 2));
  const perDoc = new Map();
  const out = [];
  const skipped = [];
  const take = ({ r, coverage, score }) => {
    perDoc.set(r.doc_key, (perDoc.get(r.doc_key) ?? 0) + 1);
    perOrigin.set(r.origin, (perOrigin.get(r.origin) ?? 0) + 1);
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
  };
  for (const item of kept) {
    if (out.length >= limit) break;
    if ((perDoc.get(item.r.doc_key) ?? 0) >= perDocument) continue;
    if ((perOrigin.get(item.r.origin) ?? 0) >= originCap) {
      skipped.push(item);
      continue;
    }
    take(item);
  }
  // fill the remaining places with the best of what was held back
  for (const item of skipped) {
    if (out.length >= limit) break;
    if ((perDoc.get(item.r.doc_key) ?? 0) >= perDocument) continue;
    take(item);
  }
  out.sort((a, b) => b.score - a.score);
  return out;
}

// Documents whose title is exactly one of the phrases (a question that quotes a title: "Start IFS Cloud
// Workflow using REST API"). Returns the first chunk of each, in the shape of searchKnowledge.
export async function findByTitle(db, phrases, { limit = 3 } = {}) {
  const wanted = [...new Set(phrases.map((p) => p.trim().toLowerCase()).filter(Boolean))];
  if (wanted.length === 0) return [];
  const { rows } = await db.query(
    `SELECT DISTINCT ON (d.id) c.id, c.content, c.start_line, c.end_line,
            d.title, d.doc_key, d.origin, d.url, d.version, d.component
       FROM knowledge_documents d
       JOIN knowledge_chunks c ON c.document_id = d.id
      WHERE lower(d.title) = ANY($1)
      ORDER BY d.id, c.chunk_index
      LIMIT $2`,
    [wanted, limit],
  );
  return rows.map((r) => ({
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
    coverage: 1,
    score: 100,
  }));
}

// The whole text of documents, put back together from their chunks (the few overlapping lines at the
// cut are removed). Returns a Map: doc_key -> text. Used to give the agent a complete topic instead of
// one small piece of it.
export async function loadDocumentTexts(db, docKeys) {
  const keys = [...new Set(docKeys)];
  if (keys.length === 0) return new Map();
  const { rows } = await db.query(
    `SELECT d.doc_key, c.start_line, c.end_line, c.content
       FROM knowledge_chunks c
       JOIN knowledge_documents d ON d.id = c.document_id
      WHERE d.doc_key = ANY($1)
      ORDER BY d.doc_key, c.chunk_index`,
    [keys],
  );
  const texts = new Map();
  let current = null;
  let lastEnd = 0;
  let lines = [];
  const flush = () => current !== null && texts.set(current, lines.join("\n"));
  for (const r of rows) {
    if (r.doc_key !== current) {
      flush();
      current = r.doc_key;
      lastEnd = 0;
      lines = [];
    }
    const chunkLines = r.content.split("\n");
    const skip = Math.max(0, lastEnd - r.start_line + 1); // lines this chunk repeats from the previous one
    lines.push(...chunkLines.slice(skip));
    lastEnd = Math.max(lastEnd, r.end_line);
  }
  flush();
  return texts;
}

// Official documentation first, then question-and-answer sources (they explain how to do things); code field descriptions only name columns
function sourceWeight(r) {
  if (r.origin === "IFS documentation") return 4; // the official documentation outranks what people say about it
  if (r.origin === "IFS community" || r.origin === "IFS technical blog") return 2;
  if (r.meta?.kind === "field descriptions") return -2;
  return 0;
}
