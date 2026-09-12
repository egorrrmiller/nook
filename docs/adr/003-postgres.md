# ADR-003: PostgreSQL, а не SQLite

Статус: принято (2026-09-13)

jsonb + GIN для свойств строк базы и фильтров; FTS с `russian`/`english`; `pg_trgm` для quick find; фоновые воркеры (Hangfire) параллельно с редактором; несколько пользователей. Dev — локальный PostgreSQL 18; деплой — Postgres 17 в compose.
