# ADR-004: Формат блока = BlockNote JSON, хранится плоско, `schema_version`

Статус: принято (2026-09-13)

`{id, type, props, content, children}` → строка на блок (`parent_block_id`, `position`). Неизвестные типы (плагинов) — opaque, текст извлекается обобщённо из `content`. Смена редактора в будущем = миграция проекции + экспорт в Markdown как страховка.
