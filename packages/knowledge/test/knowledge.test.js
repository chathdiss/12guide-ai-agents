import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { chunkText } from "../src/chunk.js";
import { splitIdentifiers } from "../src/identifiers.js";
import { prepareDocument } from "../src/prepare.js";
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
