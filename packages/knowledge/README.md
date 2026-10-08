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

The folder layout is `<root>/<Version>/<component>/<layer>/…/<file>`, for example `Apps10_UPD29/accrul/database/Voucher_API.plsql`. The first folder becomes the version label shown with every passage, so two code versions (Apps 10 and IFS Cloud) can be loaded side by side without mixing: give each its own version folder. Keep a version's files together in one root folder; a folder that has an extra level (such as `25.2.4/checkout/<component>`) must be arranged to match before loading.

## Tests

```bash
npm test
```

## More sources

| Source | Command | How it is read |
|---|---|---|
| IFS source code | `npm run ingest:ifs -- --dir <folder>` | Files from the SharePoint zip (kept outside the repository) |
| dsj23.me blog | `npm run ingest:dsj23` | The public WordPress.com API; only posts about IFS; links to the real post |
| IFS Community | `npm run crawl:community -- --out <folder>`, then `npm run ingest:community -- --dir <folder>` | Every public topic from the sitemap, with all replies (long topics are read page by page) and the accepted answer marked; see below |
| IFS technical documentation | `npm run ingest:docs -- --file <search.json> --release 25R2` | The text of every page, from the one search index file the site itself loads (`docs.ifs.com/techdocs/<release>/search.json`); each page is stored with its real link |
| IFS.ai and Lifecycle Experience documentation | `npm run ingest:docs -- --file <search.json> --release aidocs --source ifs-aidocs --base-url https://docs.ifs.com/aidocs/ --version "IFS.ai documentation"` (and the same with `ifs-ale`, `https://docs.ifs.com/techdocs/ale/en/`) | The same kind of search index file, with their own address and label |
| IFS guides as files (PDF, PowerPoint, Word) | `npm run ingest:files -- --dir <folder>` | The folder holds the downloaded files and a `manifest.json` (title, link, file name, group). Every page or slide is marked in the text (`[Page 12]`). |
| Single docs.ifs.com pages (Power BI example reports, policies, PSO start page) | `npm run ingest:pages -- --dir <folder>` | Pages behind the site's browser check, read in a browser and saved as `pages*.jsonl`; every page carries a checksum and a page that does not match is refused |
| IFS Community articles (release notes, support policies, webinars, country solutions) | `npm run ingest:pages -- --dir <folder>` (same loader) | Article-type items that only signed-in members can open. A signed-in browser reads them and saves `pages*.jsonl`; each record names its own `source`, `origin` and `version` and is stored like a Community topic |

All loaders skip what did not change, so they can be run again at any time.

## What is loaded now

| Source | Origin shown in answers | Size |
|---|---|---|
| IFS Community topics (all public ones, with replies and the accepted answer marked) | IFS community | about 43,600 topics |
| IFS Community articles (signed-in members only) | IFS community | 121 articles (17 link-only pages left out) |
| IFS technical documentation 25R2, IFS.ai, Lifecycle Experience, guide files, single pages | IFS documentation | about 2,700 pages and files |
| IFS source code, Apps 10 UPD29 | IFS source code | 1,047 files |
| dsj23.me blog (IFS posts) | IFS technical blog | 34 posts |

Not loaded yet: the IFS Cloud source code (25R2), the rest of the Apps 10 code (only a part of the components came in the SharePoint zip, and the zip has no PL/SQL), other documentation releases, Maintenix help, and the roughly 11 Community topics restricted to a select group of members.

## How search mixes the sources

Every word of the question is weighted by how rare it is (`knowledge_term_stats`, rebuilt by the loaders): a word found in few chunks, such as `payee` or `INVVOUTYPE2`, counts far more than `payment` or `error`. Codes with punctuation (`CAMT.053`, `ORA-20110`) are indexed as plain words as well. The best chunks of every source are collected first, so the large source code cannot push the others out. The official documentation gets the largest boost, question-and-answer sources (community, blog) a smaller one, in proportion to how well the chunk matches, field description files a small penalty, and no single source may fill more than half of the results while others have matches.

`searchKnowledge(db, query, options)` takes `limit`, `perDocument`, `keywords` (the words an AI rewrite made of the question, see `apps/api`) and `origin` (search one origin only, for example `"IFS source code"`). `findByTitle(db, phrases)` returns the documents whose title is exactly one of the phrases, used when a question quotes a title. There is no vector search and no embeddings provider: the search is PostgreSQL full-text search.

## The IFS Community crawl

`crawl:community` reads the topic list the community publishes itself (`sitemap-topics-1.xml`), fetches each public topic page and saves it as JSON lines (`topics-0001.jsonl` and so on, in a folder outside the repository). It waits between requests (about 100 topics a minute, two at a time), identifies itself with its own name, and can be stopped and started again: `done.jsonl` remembers what is saved, together with the topic's last-modified date, so a later run reads only what changed.

- Every reply is kept, with the accepted answer marked, and a topic is marked solved or not. Author names are not stored.
- Topics the community restricts to a select group of members answer "403" or "Access denied" and are left out. They are listed in `errors.jsonl`.
- Article-type items (release notes, policies, webinars) are not public. They are loaded separately with `ingest:pages` from a signed-in browser, see the table above.
- `ingest:community` builds one document per topic (question, then each reply) and stores it with its real link, so every answer can point to the topic.
- A full run takes about 7 hours and downloads roughly 10 GB, so it is meant to be run once and then refreshed.

