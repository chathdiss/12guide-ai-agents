import assert from "node:assert/strict";
import { createServer } from "node:http";
import { describe, it } from "node:test";
import { buildCitations } from "../src/cite.js";
import { createRetriever, retrievalQuery } from "../src/knowledge.js";
import { createApp } from "../src/server.js";

const passage = (n) => ({
  id: n,
  title: `File${n}.plsql`,
  path: `accrul/database/File${n}.plsql`,
  origin: "IFS source code",
  url: "",
  version: "ACCRUL Apps10 UPD29",
  startLine: 10 * n,
  endLine: 10 * n + 9,
  content: `code of passage ${n}`,
});

describe("citations", () => {
  const passages = [passage(1), passage(2), passage(3)];

  it("renumbers in order of first use and lists only the cited passages", () => {
    const r = buildCitations("It is set in the third file [3]. The second also does it [2][3].", passages);
    assert.equal(r.answer, "It is set in the third file [1]. The second also does it [2][1].");
    assert.deepEqual(r.sources.map((s) => s.title), ["File3.plsql", "File2.plsql"]);
    assert.equal(r.sources[0].startLine, 30);
  });

  it("removes markers that match no passage", () => {
    const r = buildCitations("Claim [7] and another [1, 9].", passages);
    assert.equal(r.answer, "Claim and another [1].");
    assert.equal(r.sources.length, 1);
  });

  it("leaves code alone", () => {
    const r = buildCitations("Use `arr[1]` here [2].\n```\nx[1] = 2;\n```", passages);
    assert.equal(r.answer, "Use `arr[1]` here [1].\n```\nx[1] = 2;\n```");
  });

  it("returns no sources when nothing is cited", () => {
    assert.deepEqual(buildCitations("Not found in the approved sources.", passages).sources, []);
  });
});

describe("retrieval", () => {
  it("adds the previous question to a very short follow-up", () => {
    const history = [{ role: "user", content: "How is currency amount calculated?" }, { role: "assistant", content: "..." }];
    assert.match(retrievalQuery("and the rate?", history), /currency amount/);
    assert.equal(retrievalQuery("How is the currency rate calculated?", history), "How is the currency rate calculated?");
  });

  it("numbers the passages and survives a database failure", async () => {
    const ok = createRetriever({ db: {}, search: async () => [{ title: "A", path: "a/A", origin: "IFS source code", url: null, component: "ACCRUL", version: "UPD29", startLine: 1, endLine: 5, content: "x" }] });
    const found = await ok("question about something");
    assert.equal(found.status, "ok");
    assert.equal(found.passages[0].id, 1);
    assert.equal(found.passages[0].version, "ACCRUL UPD29");

    const broken = createRetriever({ db: {}, search: async () => { throw new Error("connection refused"); } });
    const originalError = console.error;
    console.error = () => {};
    try {
      assert.deepEqual(await broken("question about something"), { status: "unavailable", passages: [] });
    } finally {
      console.error = originalError;
    }
  });
});

describe("chat with the knowledge base", () => {
  it("sends the passages to the agent and returns numbered sources", async () => {
    let received;
    const n8n = createServer(async (req, res) => {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      received = JSON.parse(Buffer.concat(chunks).toString());
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ answer: "The amount is negated [2].", sources: [], tier: "lite" }));
    });
    await new Promise((r) => n8n.listen(0, "127.0.0.1", r));
    const retrieve = async () => ({ status: "ok", passages: [passage(1), passage(2)] });
    const api = createApp({ n8nChatUrl: `http://127.0.0.1:${n8n.address().port}/x`, retrieve });
    await new Promise((r) => api.listen(0, "127.0.0.1", r));

    const res = await fetch(`http://127.0.0.1:${api.address().port}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: "How is the currency amount set?" }),
    });
    const body = await res.json();
    await Promise.all([api, n8n].map((s) => new Promise((r) => s.close(r))));

    assert.equal(received.knowledge, "ok");
    assert.equal(received.passages.length, 2);
    assert.equal(body.answer, "The amount is negated [1].");
    assert.deepEqual(body.sources.map((s) => s.title), ["File2.plsql"]);
  });
});
