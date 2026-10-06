# Knowledge

Code that fills and searches the Advisor's knowledge base: it reads documents, splits them into chunks and stores them in PostgreSQL (see `packages/db`).

**The documents themselves are never committed.** This repository is public, and the IFS source files and 12Guide documents are not. Keep them in a folder outside the repo and point the scripts at it.

## Run

```powershell
cd packages/knowledge
npm install

# 1. Only count what would be indexed (no database needed)
npm run ingest:ifs:dry -- --dir D:\Gotli\advisor-knowledge\ifs-apps10-upd29

# 2. Create the tables, then store the chunks (needs the database from packages/db and its .env)
npm run db:init
npm run ingest:ifs -- --dir D:\Gotli\advisor-knowledge\ifs-apps10-upd29
```

Ingestion can be run again at any time. Files that did not change are skipped (the file's hash is kept in `meta`), changed files replace what was stored for them, and new files are added, so there are no duplicates and a repeat run takes seconds. Add `--prune` to also remove documents whose file is no longer in the folder, for example when the source folder is reorganised.

Try the search with `npm run search -- "your question"`.

## What is indexed from the IFS source

Kept: `.plsql`, `.plsvc`, `.views`, `.apv`, `.cdb`, `.cre`, `.storage`, `.upg`, `.cs`, `.csv`, `.xml`, `.java`.
Left out: installation data (`.ins`), UI resource files (`.resx`), generated form layouts (`*.Designer.cs`), icons, project files. In the field description files, the `UNUSED` lines are dropped.

Each chunk is about 1,600 characters, cut at a blank line or the start of a declaration, with a few lines repeated at the start of the next chunk. It carries its file path, version, component and layer, so an answer can say where it came from.

For the keyword search, the words inside identifiers are indexed too (`Customer_Order_API` also matches "customer order").

## Tests

```bash
npm test
```
