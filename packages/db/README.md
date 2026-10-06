# Database

The PostgreSQL schema of the Advisor, and a Docker setup for a local database with the pgvector extension.

## Local database

```powershell
cd packages/db
copy .env.example .env        # then set POSTGRES_PASSWORD, and use the same password in DATABASE_URL
docker compose up -d          # PostgreSQL 16 with pgvector, on 127.0.0.1:5433
```

Open it in pgAdmin: host `localhost`, port `5433`, database `advisor`, user `advisor`.
Your normal PostgreSQL on port 5432 is not touched.

Create the tables with `npm run db:init` in `packages/knowledge`.

## Files

- `schema/001_knowledge.sql`: documents and chunks, with a full-text index. Works on any PostgreSQL.
- Vectors (pgvector) are added in a later numbered file, once the embeddings model is chosen: the size of the vectors depends on it.

`.env` is ignored by git. Never commit passwords or connection strings.
