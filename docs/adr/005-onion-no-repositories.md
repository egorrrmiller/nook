# ADR-005: Onion-слои, вертикальные слайсы, без Repository над EF Core

Статус: принято (2026-09-13)

Domain → Application (use cases по фичам, `IAppDbContext`) → Infrastructure ← Api. `DbContext` — уже UoW+Repository; отдельный слой репозиториев только мешает писать запросы с проекциями. Каждая операция выполняется в `WorkspaceContext` — запросов без `workspace_id` не существует.
