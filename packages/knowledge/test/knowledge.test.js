import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { chunkText } from "../src/chunk.js";
import { splitIdentifiers } from "../src/identifiers.js";
import { prepareDocument } from "../src/prepare.js";
import { loadDocumentTexts, searchKnowledge } from "../src/search.js";
import { walkIfsSource } from "../src/sources/ifs-source.js";

const plsql = (n) =>
  Array.from({ length: n }, (_, i) => `PROCEDURE Proc_${i} (\n  a_ IN VARCHAR2 )\nIS\nBEGIN\n   NULL; -- ${"x".repeat(60)}\nEND Proc_${i};\n`).join("\n");

describe("chunkText", () => {
  it("keeps a short text in one chunk", () => {
    const chunks = chunkText("line one\nline two");
    assert.equal(chunks.length, 1);
    assert.deepEqual([chunks[0].startLine, chunks[0].endLine], [1, 2]);
  });

  it("never returns an empty chunk, and drops whitespace-only text", () => {
    assert.deepEqual(chunkText("\n\n   \n"), []);
    for (const c of chunkText(plsql(40))) assert.ok(c.text.trim().length > 0);
  });

  it("cuts long text into bounded chunks that cover every line", () => {
    const text = plsql(80);
    const total = text.split("\n").length;
    const chunks = chunkText(text);
    assert.ok(chunks.length > 3);
    for (const c of chunks) assert.ok(c.text.length <= 2400 + 200, `chunk too big: ${c.text.length}`);

    const covered = new Set();
    for (const c of chunks) for (let l = c.startLine; l <= c.endLine; l++) covered.add(l);
    for (let l = 1; l <= total; l++) {
      const blank = text.split("\n")[l - 1].trim() === "";
      assert.ok(covered.has(l) || blank, `line ${l} is in no chunk`);
    }
  });

  it("moves forward and repeats a few lines between neighbours", () => {
    const chunks = chunkText(plsql(60));
    for (let i = 1; i < chunks.length; i++) {
      assert.ok(chunks[i].startLine > chunks[i - 1].startLine, "chunks must advance");
      assert.ok(chunks[i].startLine <= chunks[i - 1].endLine + 1, "no gap between chunks");
    }
  });

  it("prefers to cut where a declaration starts", () => {
    const chunks = chunkText(plsql(60));
    const starts = chunks.slice(1).map((c) => c.text.split("\n").slice(0, 4).join("\n"));
    assert.ok(starts.some((s) => /PROCEDURE/.test(s)), "some chunk should begin at or just before a PROCEDURE");
  });

  it("copes with one huge line and with Windows line endings", () => {
    const huge = chunkText("a".repeat(10000));
    assert.equal(huge.length, 1);
    const crlf = chunkText("one\r\ntwo\r\nthree");
    assert.equal(crlf[0].text, "one\ntwo\nthree");
  });
});

describe("splitIdentifiers", () => {
  it("opens up snake_case and CamelCase names", () => {
    const words = splitIdentifiers("Customer_Order_API CodeBHandling AccLibCurrencyAmount").split(" ");
    for (const w of ["customer", "order", "api", "code", "handling", "acc", "lib", "currency", "amount"]) {
      assert.ok(words.includes(w), `missing ${w}`);
    }
  });

  it("ignores ordinary words and numbers", () => {
    assert.equal(splitIdentifiers("select the amount from account where id = 12345"), "");
  });

  it("respects the size limit", () => {
    assert.ok(splitIdentifiers("Some_Name ".repeat(5000), 100).length <= 100);
  });
});

describe("IFS source files", () => {
  it("indexes the useful files, skips the noise, and reads version, component and layer from the path", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "ifs-"));
    const put = async (rel, body = "x") => {
      const full = path.join(root, ...rel.split("/"));
      await mkdir(path.dirname(full), { recursive: true });
      await writeFile(full, body);
    };
    await put("Apps10_UPD29/accrul/database/Account.plsql", "PROCEDURE X IS BEGIN NULL; END X;");
    await put("Apps10_UPD29/accrul/client/Ifs.Application.Accrul/Forms/frmA.cs", "class A {}");
    await put("Apps10_UPD29/accrul/client/Ifs.Application.Accrul/Forms/frmA.Designer.cs", "generated");
    await put("Apps10_UPD29/accrul/database/Big_Data.ins", "data");
    await put("Apps10_UPD29/accrul/client/Strings.resx", "<root/>");

    const found = [];
    for await (const f of walkIfsSource(root)) found.push(f);
    const keys = found.map((f) => f.docKey).sort();

    assert.deepEqual(keys, [
      "Apps10_UPD29/accrul/client/Ifs.Application.Accrul/Forms/frmA.cs",
      "Apps10_UPD29/accrul/database/Account.plsql",
    ]);
    const account = found.find((f) => f.title === "Account.plsql");
    assert.equal(account.version, "Apps10 UPD29");
    assert.equal(account.component, "ACCRUL");
    assert.equal(account.layer, "database");
    assert.equal(account.kind, "PL/SQL package");
  });

  it("drops the UNUSED lines of field description files and indexes split identifiers", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "ifs-"));
    const file = path.join(root, "f.csv");
    await writeFile(file, 'colA;UNUSED;""\ncolSupplierTaxInfo;Tax info of the supplier;"Shown in the form"\ncolB;UNUSED;""');
    const { chunks } = await prepareDocument({ absPath: file, docKey: "f.csv", title: "f.csv", ext: ".csv" });
    assert.equal(chunks.length, 1);
    assert.ok(!/UNUSED/.test(chunks[0].content));
    assert.ok(/supplier tax info/.test(chunks[0].searchText) || /supplier/.test(chunks[0].searchText));
  });
});

describe("blog posts", async () => {
  const { htmlToText } = await import("../src/html-to-text.js");
  const { isIfsPost, postToDocument } = await import("../src/sources/dsj23-source.js");

  it("keeps headings, lists, inline code and code blocks", () => {
    const text = htmlToText(
      '<h2>Set up</h2><p>Use <code>Authorization</code> &amp; more.</p><ul><li>one</li><li>two</li></ul><pre>a &lt; b\n  c</pre>',
    );
    assert.match(text, /^## Set up/);
    assert.match(text, /Use `Authorization` & more\./);
    assert.match(text, /- one\n- two/);
    assert.match(text, /```\na < b\n {2}c\n```/);
  });

  it("drops scripts and decodes numeric entities", () => {
    assert.equal(htmlToText("<script>alert(1)</script><p>it&#8217;s &#x41;</p>"), "it’s A");
  });

  it("picks the IFS posts and links to the https page", () => {
    assert.equal(isIfsPost({ title: "Trip", tags: { Travel: {} } }), false);
    assert.equal(isIfsPost({ title: "Trip", tags: { "IFS Cloud": {} } }), true);
    assert.equal(isIfsPost({ title: "Using IFS Connect", tags: {} }), true);
    const doc = postToDocument({ ID: 1, URL: "http://dsj23.me/2024/a/", title: "A &amp; B", date: "2024-05-01T10:00:00", content: "<p>text</p>", tags: {} });
    assert.equal(doc.url, "https://dsj23.me/2024/a/");
    assert.equal(doc.title, "A & B");
    assert.equal(doc.version, "blog 2024");
    assert.match(doc.text, /^# A & B\n\ntext$/);
  });
});

describe("search with rewritten keywords", () => {
  const row = (id, text) => ({
    id, content: text, search_text: text, start_line: 1, end_line: 2, rank: 0.1,
    title: `T${id}`, doc_key: `doc${id}`, origin: "o", url: null, version: "", component: "", meta: {},
  });
  const fakeDb = (rows) => ({ async query(sql, params) { fakeDb.terms = params[0]; return { rows }; } });

  it("searches the keywords instead of the question and accepts a chunk with a quarter of them", async () => {
    // the Dutch question has no English words; the keywords carry the translation and synonyms
    const db = fakeDb([row(1, "customer order is released"), row(2, "unrelated text")]);
    const found = await searchKnowledge(db, "klantorder vrijgeven", {
      keywords: ["customer order", "release", "reserve", "deliver", "ship", "CUSTOMER_ORDER_API"],
    });
    assert.match(fakeDb.terms, /customer/);
    assert.doesNotMatch(fakeDb.terms, /klantorder/);
    assert.equal(found[0].title, "T1");
  });

  it("falls back to the question without keywords", async () => {
    await searchKnowledge(fakeDb([]), "currency amount", { keywords: [] });
    assert.match(fakeDb.terms, /currency/);
  });
});

describe("community topics", async () => {
  const { parseSitemap, parseTopicHtml, topicToDocument } = await import("../src/sources/community-source.js");
  const page = (accepted) => `<html><head>
    <script type="application/ld+json">{"@type":"BreadcrumbList","itemListElement":[{"name":"Community"},{"name":"IFS Solutions"},{"name":"Finance (Financials)"},{"name":"How to X"}]}</script>
    <script type="application/ld+json">{"@type":"QAPage","mainEntity":{"name":"How to X","dateCreated":"2025-09-18T15:38:09+00:00","answerCount":2,"acceptedAnswer":${accepted ? '{"url":"https://community.ifs.com/a/how-to-x-1?postid=22#post22"}' : "null"}}}</script>
    </head><body>
    <div id="topic1" class="qa-topic-first-post qa-topic-post-box"><div class="post__content"><p>Where do I set <code>X</code>?</p></div></div>
    <div id="post21" class="qa-topic-post-box"><time datetime="2025-09-19T08:00:00+00:00"></time><div class="post__content"><p>Try the page designer.</p></div></div>
    <div id="post22" class="qa-topic-post-box"><div class="post__content"><p>Steps:</p><ul><li>Open it</li><li>Save</li></ul></div></div>
  </body></html>`;

  it("reads the question, every reply and the category", () => {
    const rec = parseTopicHtml(page(true), "https://community.ifs.com/a/how-to-x-1");
    assert.equal(rec.title, "How to X");
    assert.equal(rec.category, "Finance (Financials)");
    assert.equal(rec.date, "2025-09-18");
    assert.equal(rec.question, "Where do I set `X`?");
    assert.equal(rec.replies.length, 2);
    assert.equal(rec.replies[0].date, "2025-09-19");
    assert.match(rec.replies[1].text, /- Open it\n- Save/);
  });

  it("marks the accepted answer, and says so when there is none", () => {
    const solved = parseTopicHtml(page(true), "u");
    assert.deepEqual(solved.replies.map((r) => r.accepted), [false, true]);
    assert.equal(solved.solved, true);
    assert.match(topicToDocument(solved).text, /### Reply 2 \(ACCEPTED ANSWER\)/);

    const open = parseTopicHtml(page(false), "u");
    assert.equal(open.solved, false);
    assert.match(topicToDocument(open).text, /Status: Not marked as solved/);
  });

  it("shows a post that the page repeats only once, and keeps the accepted copy", () => {
    const rec = {
      title: "T", category: "C", date: "2026-01-01", solved: true, question: "Q",
      replies: [
        { id: "1", text: "Try this.\n\nThen that.", accepted: false },
        { id: "2", text: "Other idea.", accepted: false },
        { id: "3", text: "Try this.\n\n\tThen that.", accepted: true },
      ],
    };
    const text = topicToDocument(rec).text;
    assert.equal((text.match(/Try this/g) ?? []).length, 1);
    assert.match(text, /### Reply 2 \(ACCEPTED ANSWER\)/);
    assert.match(text, /### Reply 1\n\nOther idea\./);
  });

  it("keeps a topic whose question has no text", () => {
    const html = page(false).replace("<p>Where do I set <code>X</code>?</p>", "");
    const rec = parseTopicHtml(html, "u");
    assert.match(rec.question, /no text/);
    assert.equal(rec.replies.length, 2);
  });

  it("returns nothing for a page that is not a topic and reads sitemaps", () => {
    assert.equal(parseTopicHtml("<html><body><p>hello</p></body></html>", "u"), null);
    const urls = parseSitemap("<urlset><url><loc>https://community.ifs.com/a-1</loc><lastmod>2026-01-02T00:00:00Z</lastmod></url></urlset>");
    assert.deepEqual(urls, [{ url: "https://community.ifs.com/a-1", lastmod: "2026-01-02T00:00:00Z" }]);
  });
});

describe("whole documents", () => {
  it("puts chunks back together without the lines they repeat", async () => {
    const rows = [
      { doc_key: "u1", start_line: 1, end_line: 4, content: "a\nb\nc\nd" },
      { doc_key: "u1", start_line: 3, end_line: 6, content: "c\nd\ne\nf" },
      { doc_key: "u2", start_line: 1, end_line: 2, content: "x\ny" },
    ];
    const db = { query: async () => ({ rows }) };
    const texts = await loadDocumentTexts(db, ["u1", "u2", "u1"]);
    assert.equal(texts.get("u1"), "a\nb\nc\nd\ne\nf");
    assert.equal(texts.get("u2"), "x\ny");
  });

  it("asks nothing when there are no documents", async () => {
    const db = { query: async () => assert.fail("no query expected") };
    assert.equal((await loadDocumentTexts(db, [])).size, 0);
  });
});

describe("codes with punctuation", () => {
  it("indexes the parts of CAMT.053 and ORA-20110 as plain words", () => {
    const words = splitIdentifiers("Error for CAMT.053 in 25R1: ORA-20110 raised in Customer_Order_API.Get_Objstate").split(" ");
    for (const w of ["camt", "053", "ora", "20110", "customer", "order", "objstate"]) assert.ok(words.includes(w), `missing ${w}`);
  });
});

describe("IFS technical documentation", async () => {
  const { groupPages, pageToDocument } = await import("../src/sources/ifs-docs-source.js");
  const index = {
    items: [
      { location: "", level: 1, title: "Home", text: "", path: ["Home"] },
      { location: "030_admin/010_security/", level: 1, title: "Security", text: "", path: ["Solution Manager User Guide", "Security"] },
      { location: "030_admin/010_security/#security", level: 1, title: "Security", text: "<p>Access is <code>role</code> based.</p>", path: ["Solution Manager User Guide", "Security"] },
      { location: "030_admin/010_security/#grants", level: 2, title: "Grants", text: "<ul><li>Projections</li><li>Lobbies</li></ul>", path: ["Solution Manager User Guide", "Security"] },
      { location: "empty/page/", level: 1, title: "Nothing here", text: "", path: ["X"] },
    ],
  };

  it("groups the sections of a page and drops pages without text", () => {
    const pages = groupPages(index);
    assert.equal(pages.length, 1);
    assert.equal(pages[0].sections.length, 2);
  });

  it("builds a document that links to the real page", () => {
    const doc = pageToDocument(groupPages(index)[0], "25R2");
    assert.equal(doc.url, "https://docs.ifs.com/techdocs/25r2/030_admin/010_security/");
    assert.equal(doc.version, "IFS Cloud 25R2");
    assert.equal(doc.component, "Solution Manager User Guide");
    assert.match(doc.text, /^# Security\n\nWhere: Solution Manager User Guide > Security\n\nAccess is `role` based\.\n\n### Grants\n\n- Projections\n- Lobbies$/);
  });
});

describe("guessed table names", async () => {
  const { guessIdentifiers } = await import("../src/search.js");

  it("guesses entity table names only when the question asks for a table, a view or a column", () => {
    const guesses = guessIdentifiers("which ifs cloud table can I find the work task information in?");
    assert.ok(guesses.includes("work_task"));
    assert.ok(guesses.includes("work_task_tab"));
    assert.deepEqual(guessIdentifiers("How do I fix the CAMT.053 error?"), []);
  });
});

describe("reading PowerPoint and Word files", async () => {
  const { strToU8, zipSync } = await import("fflate");
  const { extractDocx, extractPptx, extractFile } = await import("../src/extract-file.js");
  const slide = (...paragraphs) =>
    `<p:sld>${paragraphs.map((t) => `<a:p><a:r><a:t>${t}</a:t></a:r></a:p>`).join("")}</p:sld>`;

  it("reads slides in order, with their speaker notes, and decodes entities", () => {
    const zip = zipSync({
      "ppt/slides/slide2.xml": strToU8(slide("Second &amp; last")),
      "ppt/slides/slide1.xml": strToU8(slide("First slide", "Step one")),
      "ppt/notesSlides/notesSlide1.xml": strToU8(slide("Say this first", "1")),
    });
    const pages = extractPptx(zip);
    assert.equal(pages.length, 2);
    assert.equal(pages[0], "First slide\nStep one\nSpeaker notes:\nSay this first");
    assert.equal(pages[1], "Second & last");
  });

  it("reads Word paragraphs, tabs included", () => {
    const xml = "<w:document><w:p><w:r><w:t>Heading</w:t></w:r></w:p><w:p><w:r><w:t>A</w:t></w:r><w:tab/><w:r><w:t>B</w:t></w:r></w:p></w:document>";
    const pages = extractDocx(zipSync({ "word/document.xml": strToU8(xml) }));
    assert.deepEqual(pages, ["Heading\nA B"]);
  });

  it("picks the reader by the file name and refuses other types", async () => {
    await assert.rejects(() => extractFile("notes.txt", Buffer.from("x")), /no reader for \.txt/);
    const docx = zipSync({ "word/document.xml": strToU8("<w:p><w:t>Hello</w:t></w:p>") });
    const result = await extractFile("a.DOCX", Buffer.from(docx));
    assert.equal(result.kind, "Word");
  });
});

describe("pages saved from a browser", async () => {
  const { checksum, isValidRecord, pageToDocument, readRecords } = await import("../src/sources/ifs-pages-source.js");
  const rec = { url: "https://docs.ifs.com/policy/", title: "Policy", group: "Policies", text: "Line one.\n\nLine two." };
  const signed = { ...rec, h: checksum(rec) };

  it("accepts a page whose checksum matches and refuses an altered or foreign one", () => {
    assert.equal(isValidRecord(signed), true);
    assert.equal(isValidRecord({ ...signed, text: "Line one." }), false);
    assert.equal(isValidRecord({ ...signed, url: "https://example.com/policy/" }), false);
    assert.equal(isValidRecord({ ...signed, text: "" }), false);
  });

  it("reads every pages*.jsonl file, counts the refused lines and builds a document", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "pages-"));
    const other = { ...rec, url: "https://docs.ifs.com/pso/", title: "PSO" };
    await writeFile(path.join(dir, "pages.jsonl"), `${JSON.stringify(signed)}\nnot json\n`);
    await writeFile(path.join(dir, "pages-2.jsonl"), `${JSON.stringify({ ...other, h: checksum(other) })}\n${JSON.stringify({ ...signed, h: "wrong" })}\n`);
    await writeFile(path.join(dir, "notes.txt"), "ignored");
    const { records, rejected } = readRecords(dir);
    assert.equal(records.length, 2);
    assert.equal(rejected, 2);
    const doc = pageToDocument(records.find((r) => r.url.endsWith("/policy/")));
    assert.equal(doc.url, "https://docs.ifs.com/policy/");
    assert.equal(doc.text, "# Policy\n\nLine one.\n\nLine two.");
    assert.equal(doc.component, "Policies");
  });
});
