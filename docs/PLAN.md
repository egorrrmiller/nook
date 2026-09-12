# План: персональный self-hosted Notion (рабочее имя — `Nook`)

## Контекст

Цель — личная (1–2 человека) self-hosted база знаний с редакционными возможностями Notion в максимальной подписке, без SaaS-обвязки для компаний. Красивый интерфейс в стиле Notion — с первого дня, не «потом». Обязательное требование: **расширяемость через блоки интеграций** (ИИ-написание текстов, Telegram-боты, spaced-repetition-тренажёр слов, импорт из Obsidian и т.п.) без переписывания ядра.

Стек, зафиксированный пользователем: C# / ASP.NET Core / PostgreSQL, «трёхслойная» (onion) архитектура; фронт — React. Ниже стек подтверждён/уточнён по результатам анализа. Требования собраны самостоятельно по актуальной документации Notion (сентябрь 2026, версия Notion 3.6). Каталог `/Volumes/SSD/notion` пуст — гринфилд. Локально: .NET SDK 10.0.301; Node, pnpm, Docker/Postgres **не установлены** (см. «Подготовка окружения»).

---

## 1. Инвентарь Notion 3.6 → решение по каждой возможности

Легенда: **K** — делаем как в Notion; **S** — делаем упрощённо; **P** — как плагин (через контракт интеграций); **D** — не делаем (командное/SaaS).

### 1.1 Редактор: блоки

| Возможность | Реш. | Комментарий |
|---|---|---|
| Text, H1–H3, **H4** (добавлен в 3.4), toggle-headings | K | |
| Bulleted / numbered / to-do / toggle списки, вложенность | K | |
| Quote, Callout (иконка + цвет фона), Divider | K | |
| Page (вложенная страница), Link to page, Breadcrumb | K | |
| Columns (произвольное число, ресайз, вложенные) | K | BlockNote `xl-multi-column` (AGPL — для личного self-hosted допустимо) |
| Simple table: header row/col, цвета ячеек, **merge cells** (05.2026), convert to database | K | |
| Code: подсветка (Shiki), wrap, caption, copy, выбор языка; **Mermaid** | K | BlockNote 0.54 имеет math + diagram блоки из коробки |
| Inline и block equations (KaTeX) | K | |
| Image / Video / Audio / File / PDF (viewer) с caption, ресайзом, выравниванием | K | |
| Web bookmark (карточка с oEmbed/OpenGraph), Embed (iframe) | K | резолвинг OG/oEmbed — на сервере, фоновой задачей |
| Embeds конкретных провайдеров (Figma, Maps, Loom, Gist, Tweet…) | S | один generic embed + таблица known-providers (URL→iframe) |
| Table of contents | K | |
| **Tabs block** (03.2026) | K | контейнер с N вкладками, каждая — список блоков |
| Synced block (оригинал + копии, unsync, «editing in N pages») | K | блок-ссылка на блок; модель «блоки как строки» делает это тривиальным |
| Button block (insert blocks / add page / edit pages / open URL / webhook / confirm / variables) | K | реализуется поверх ядра автоматизаций (см. §4) |
| Template button / database templates | K | |
| **HTML block** (07.2026, интерактивный HTML в sandboxed iframe) | K | дёшево и очень полезно для плагинов (квизы, калькуляторы) |
| Inline / full-page database, **linked view of data source** | K | см. §1.3 |
| Mention: страница, дата, напоминание; `@`, `[[`, `+` | K | «напоминание» = уведомление в Inbox/Telegram через плагин |
| Mention: человек | D | нет пользователей |
| Emoji `:` picker, custom emoji | S | picker да, custom emoji — нет |
| Comments, suggest edits (agents' suggestions) | D | одиночная работа; при необходимости — плагин позже |
| Word/character count (block-level) | K | |

### 1.2 Редактор: поведение и страница

| Возможность | Реш. |
|---|---|
| Slash-команды, `/turn`, `/color`, `/moveto`, `/duplicate`, `/delete` | K |
| Markdown-шорткаты при вводе, вставка markdown/HTML из буфера, вставка URL→bookmark/embed | K |
| Форматирование: bold, italic, underline, strike, code, text color, highlight, link (`⌘K`) | K |
| Drag-handle, `+`, `⋮⋮`-меню, мультивыделение блоков, `⌘D`, `⌘⇧↑↓`, Esc-выделение, Tab/Shift-Tab | K |
| Turn into (любой блок → любой), block → page, page → database | K |
| Anchor на блок, «copy link to block» | K |
| Undo/redo, включая структурные операции | K |
| Настройки страницы: font (default/serif/mono), small text, full width, lock page | K |
| Иконка (emoji / upload / URL), обложка (библиотека + upload + reposition + download) | K |
| **Presentation mode** (03.2026) | S — фаза полировки |
| Page history с **snapshot diffs** (05.2026), restore | K — без лимита дней |
| Page archive (скрыть из поиска/вью, 03.2026) | K |
| Trash (30 дней) с restore в исходное место | K — срок настраиваемый |
| Offline: чтение recents/favorites, очередь правок | S — PWA + очередь операций |
| Dark mode, high-contrast (07.2026) | K |
| Полный набор keyboard shortcuts | K — отдельный аудит в фазе полировки |
| Sidebar: Home, Favorites, Private, Templates, Trash; секции toggle, ресайз, DnD-дерево, breadcrumbs c sibling-dropdown (04.2026) | K |
| Sidebar: Inbox (уведомления), Meetings, Chats with AI, Teamspaces, Shared | D / P — «Inbox» переосмысляется как *quick capture* (Telegram-плагин) |
| Search: quick find (`⌘K`/`⌘P`), фильтры (title only, in page, date), сортировка, точная фраза в кавычках, recent | K |
| Search: AI-search по подключённым приложениям, Enterprise search | P — семантический поиск (pgvector) как плагин |
| Notion Home (виджеты: recents, upcoming, my tasks, database views) | S — стартовая страница с настраиваемыми виджетами (это же основа для dashboards) |
| Export: Markdown+CSV (zip, nested folders), HTML, PDF, print | K — PDF через print CSS в MVP, серверный PDF позже (P) |
| Import: Markdown/CSV/HTML/txt/zip; Word/PDF/Evernote/Trello/… | S — MD/CSV/HTML/zip в ядре; **Obsidian — плагин**; остальное D |

### 1.3 Базы данных (модель Notion 3.0+: database → data sources → views)

| Возможность | Реш. |
|---|---|
| Строка = страница со своим содержимым | K |
| Database как контейнер **нескольких data sources**; linked data sources; views не смешивают источники | K — наша модель: `collection` (= data source) + `database` (= набор views, каждая на любую collection). Multi-source и linked views получаются из модели бесплатно |
| Inline vs full-page database, `/lv`, `/da`, `/bt` | K |
| Layouts: Table, Board, List, Gallery, Calendar, Timeline, **Chart** | K — Chart и Timeline во второй фазе баз |
| Per-view: видимые свойства и порядок, ширины, wrap, row height, card size/preview/cover source, freeze columns, open as side/center peek/full page, group/sub-group (hide empty, manual order), фильтры с вложенными группами AND/OR до 3 уровней, многоуровневые сортировки, calculations в футере и по группам, ручной порядок строк, поиск в базе, **conditional row colors** (05.2026) | K |
| Property types: text, number (format, currency, progress bar/ring), select, multi-select, **status** (группы To-do/In progress/Complete), date (range, time, tz, reminder), checkbox, URL, email, phone, files, relation (1-way/2-way, self, limit 1/N, **filterable picker**), rollup (все функции: count*, percent*, sum/avg/median/min/max/range, earliest/latest/date range, show original/unique + number formatting), formula, created/last-edited time, unique ID с префиксом, button, place | K — place: S (текст + ссылка на карту) |
| Property: person, created/last-edited by | D |
| Formula language (типы, `if`, тернарник, списки `.map/.filter/.first/.length`, даты, `prop()`, `style()`, `current`, доступ через relation) | K — собственный парсер/интерпретатор на C#, редактор с подсказками |
| Sub-items и dependencies (Business-функция) | K — вторая фаза баз |
| Database templates: default, pre-filled props+content, **repeating templates** по расписанию, вложенность | K |
| Page layouts для страниц базы: pinned props (до 15) в заголовке, property group с секциями, details panel, tabbed layout, modules, показ backlinks | S — pinned + секции + panel; без workspace-wide только-одного-layout ограничения (layout на collection) |
| Database automations: триггеры page added / property edited / recurring; действия edit property / add page / edit pages / webhook / variables; Slack/Gmail | K (ядро §4) — Slack/Gmail: D, Telegram: P |
| Charts: vertical/horizontal bar, line, donut, **number (KPI)**; X/Y настройки, group by, cumulative, drilldown, стили | K — фаза баз v2 |
| Dashboards (до 12 виджетов, 4 в ряд, global filters, cross-source) | K — фаза баз v2, поверх «Home» |
| Forms (public), 1-way database syncs (Jira/GitHub), org chart, people directory | D |
| Database Agents («librarians»), AI autofill | P — через ИИ-плагин |

### 1.4 Что вырезано целиком (командное/SaaS)

Teamspaces, guests, permissions/roles, permission groups, comments/suggestions, mentions of people, notifications inbox, Meetings/AI Meeting Notes, Notion Mail/Calendar (как продукты), Sites/publishing, Forms, Slack/Gmail/Jira/GitHub-коннекторы, Enterprise (SSO/SCIM/audit/DLP), Custom Agents/Workers/credits, External Agents (**заменяем своим MCP-сервером**, см. §4), billing.

---

## 2. Ключевые архитектурные решения (с обоснованием)

### 2.1 Синхронизация и одновременное редактирование: **Yjs (BlockNote collaboration) + Hocuspocus**, блоки-строки — производная проекция

Требование одновременного редактирования одной заметки двумя людьми (и одним человеком с двух устройств) означает посимвольный мердж внутри абзаца — это CRDT. Рассмотрены три варианта:

| | JSON-документ на страницу | **Yjs + Hocuspocus (Node)** | Блоки как строки + ops (LWW) |
|---|---|---|---|
| Одновременная правка одного абзаца | потери | **посимвольный мердж, live-курсоры, presence** | потери нажатий (LWW на блок) |
| Мультиустройство / оффлайн | конфликт на документ | мердж автоматически | очередь ops, конфликты на блок |
| Сервер понимает содержимое | да | через проекцию `blocks` (строится при каждом сохранении) | да |
| Серверная запись (ИИ, боты, импорт) | JSON | headless-редактор в collab-сервисе (`@blocknote/server-util`) | INSERT |
| Synced blocks, block anchors, SQL по блокам | производный индекс | производная проекция `blocks` | нативно |
| История | снапшоты | журнал Y-апдейтов → restore в любую точку + снапшоты для diff | per-block revisions |
| Доп. рантайм | нет | **Node-сервис `collab`** | нет |

**Решение: Yjs.** BlockNote даёт коллаборацию из коробки (`withCollaboration`: курсоры, presence, per-user undo, оффлайн-мердж) — весь кастомный sync-код исчезает, а с ним и главный риск фазы 2.

Почему collab-сервис на Node, а не YDotNet в C#: формат документа — ProseMirror-схема BlockNote, она живёт в JS; конвертации Y.Doc↔блоки↔Markdown и серверные правки делает `@blocknote/server-util` (headless `ServerBlockNoteEditor`). YDotNet 0.6 — «early, API subject to change», а собирать PM-схему BlockNote из C# хрупко. **Hocuspocus** (MIT, от авторов Tiptap) — стандартный Yjs-сервер с хуками `onAuthenticate` / `onLoadDocument` / `onStoreDocument`. C# остаётся владельцем всего остального (дерево, пользователи, файлы, базы, поиск, плагины, автоматизации).

Потоки данных:
- **Открытие страницы**: клиент → C# `GET /api/nodes/{id}` (мета) и `GET /api/collab/token?node={id}` (JWT на 10 минут: userId, nodeId, role) → `wss://host/collab` (Hocuspocus, `onAuthenticate` проверяет подпись общим секретом; viewer → read-only) → BlockNote с `withCollaboration`. Заголовок страницы хранится в том же Y.Doc (`doc.getText('title')`) — тоже мерджится посимвольно.
- **Загрузка/сохранение**: `onLoadDocument` → C# `GET /internal/documents/{id}` (bytea Y.Doc); `onStoreDocument` (debounce 2 с) → конвертация Y.Doc → BlockNote JSON → C# `PUT /internal/documents/{id}` `{ydoc, blocks, title}`; C# транзакционно сохраняет Y.Doc, дописывает `document_updates`, diff-обновляет проекцию `blocks` (сохраняя `version`/`updated_at` неизменённых), перестраивает `links`/теги/tsvector, публикует события в `events_outbox`.
- **Серверные правки** (ИИ, боты, импорт, автоматизации): C# → `POST collab/internal/docs/{id}/ops` `[{insert|update|remove|replace, …}]` → headless-редактор применяет к живому Y.Doc → подключённые клиенты видят мгновенно → обычное сохранение. Импорт страницы целиком: C# формирует блоки → collab `blocksToYDoc`.
- **Не текст** (свойства строк базы, перемещения в дереве, иконки): REST в C#, per-field LWW, бродкаст через SignalR; presence «кто на какой странице» — SignalR.
- **История**: `document_updates(node_id, seq, update bytea, user_id, at)` — восстановление состояния на любой момент; компакция в снапшот каждые N апдейтов; `page_snapshots` (JSON-блоки) для просмотра diff и «restore version».

Формат блока = формат BlockNote (`{id, type, props, content, children}`), проекция `blocks` хранит его плоско (строка на блок, `parent_id`, `position`). `schema_version` + миграции на сервере.

### 2.2 Редактор: **BlockNote** (core MPL-2.0, `xl-*` AGPL-3.0)

Актуально на 09.2026: v0.54 — math/KaTeX и Mermaid-блоки, `source-with-preview` примитив для кастомных блоков, таблицы (цвета, merge), shadcn-UI пакет, Yjs вынесен в опциональный `withCollaboration`, markdown/HTML import-export, comments (не используем). Кастомные блоки — `createReactBlockSpec`; кастомные inline — `createReactInlineContentSpec` (mentions, `[[`-подсказки). Доступ к ProseMirror сохраняется (`editor._tiptapEditor`) — для тонких вещей.

Альтернативы отвергнуты: **Plate** — Notion-подобный шаблон Potion платный (Plate Pro), бесплатный playground требует собирать Notion-UX самому, Slate капризнее на мобильном IME; **TipTap** — базовые Pro-расширения открыты, но блочный UX (side menu, slash, вложенность, колонки) всё равно собирать руками (+4–6 недель); **Lexical** — то же, ещё дальше.

### 2.3 PostgreSQL — подтверждён (а не SQLite)

`jsonb` + GIN для свойств строк базы и фильтров; FTS `russian`+`english` (два `tsvector`) + `pg_trgm` для quick find; `pgvector` для семантического поиска плагином; параллельные фоновые воркеры. Postgres 17.

### 2.4 Бэкенд: ASP.NET Core 10, Minimal API, EF Core 10 + Npgsql, onion

`Domain` → `Application` (use cases по вертикальным слайсам: `Pages/`, `Blocks/`, `Collections/`…) → `Infrastructure` (EF, blob store, FTS, jobs) ← `Api` (host). **Без Repository поверх EF Core** — `DbContext` сам UoW; Application видит `IAppDbContext`. Realtime — SignalR. Фоновые задачи — **Hangfire + Hangfire.PostgreSql** (retry, recurring, dashboard — нужны для repeating templates, автоматизаций, ботов). Логи — Serilog.

### 2.5 Фронт

React 19 + TS + Vite, pnpm workspaces (monorepo). TanStack Router / Query / Table / Virtual; Zustand для UI-состояния; **Tailwind 4 + shadcn (base-ui)** — совпадает с `@blocknote/shadcn`, единая тема; `dnd-kit` (дерево, board, колонки); `cmdk` (палитра); `lucide-react`; `date-fns`; Shiki, KaTeX, Mermaid (через BlockNote); `@microsoft/signalr`; `vite-plugin-pwa`; ECharts для charts (фаза баз v2). Дизайн: воспроизводим визуальный язык Notion (типографика Inter, 14–16px, сайдбар 240px, hover-меню блоков, peek-панели), тема через CSS-переменные, светлая/тёмная/high-contrast.

### 2.6 Файлы

Content-addressed blob store на диске (`data/blobs/ab/cd/<sha256>`), дедупликация, оригиналы неизменяемы; `attachments` связывает блок/свойство → blob. Превью — **NetVips** (libvips: быстрый, HEIC, EXIF-autorotate; MIT-биндинг, LGPL native) в фоновой задаче; превью удаляемы и пересчитываемы. Видео/аудио — без транскодинга, отдача с Range. Текст из PDF — PdfPig, из docx — OpenXml SDK. ImageSharp не берём (Split License).

### 2.7 Аутентификация и деплой

Один аккаунт-владелец (+опционально второй): пароль (PBKDF2/`PasswordHasher`), cookie-сессия, опциональный TOTP, rate-limit на логин; **API-токены** (для ботов/MCP/CLI) с областями. Все файлы отдаются только авторизованно. Docker Compose: `api` (внутри же раздаёт собранный фронт — один origin, без CORS), `collab` (Node), `postgres`, `caddy` (HTTPS; `/collab` проксируется на collab-сервис). Бэкап — команда `nook backup` (pg_dump + tar blobs) + restore; плюс «Export all» в Markdown как escape hatch.


### 2.8 Пользователи, личные пространства, шаринг

- `users` (email, password_hash PBKDF2, display_name, avatar, totp_secret). Первый пользователь — владелец инстанса, создаётся из env при старте. **Публичной регистрации нет**: владелец создаёт invite-ссылку, по ней регистрируется новый пользователь.
- `workspaces` (id, owner_id, name, icon). При регистрации каждому автоматически создаётся личное пространство; можно создавать дополнительные. `workspace_members(workspace_id, user_id, role: owner|editor|viewer)`.
- `nodes.workspace_id NOT NULL`; Application-слой всегда работает в `WorkspaceContext` — ни один запрос не выполняется без фильтра по пространству; файлы, поиск, индексы, Hangfire-задачи — scoped.
- Шаринг между пользователями инстанса: (а) членство в пространстве (editor/viewer); (б) `node_shares(node_id, user_id, role)` — доступ к поддереву; эффективная роль = максимум по цепочке предков. В сайдбаре — раздел «Shared with me». Публичных ссылок нет.
- Сессии: cookie (HttpOnly, SameSite=Lax), rate-limit на логин, опциональный TOTP; API-токены на пользователя с областями (`read`, `write`, `admin`); collab-JWT (§2.1).
- Blobs общие для инстанса (content-addressed), `attachments` — per workspace; доступ к файлу проверяется через attachment → node → права.

---

## 3. Модель данных (ядро)

```text
users, workspaces, workspace_members, node_shares, invites, sessions, api_tokens   -- §2.8
documents        -- node_id pk, ydoc bytea (Y.Doc state), version, updated_at     -- источник истины содержимого
document_updates -- node_id, seq, update bytea, user_id, at  (журнал Yjs-апдейтов; компакция)
nodes            -- всё дерево: workspace_id NOT NULL,: id uuid, parent_id, kind (page|collection_row|folder|database|file), title, icon jsonb,
                 -- cover jsonb, position (fractional index), page_settings jsonb (font, small, fullwidth, locked),
                 -- collection_id (если это строка базы), properties jsonb (значения свойств; GIN),
                 -- archived_at, deleted_at, created_at, updated_at
blocks           -- ПРОЕКЦИЯ Y.Doc: id uuid, node_id, parent_block_id, position, type, props jsonb, content jsonb,
                 -- schema_version, version int, text_ru/text_en tsvector (generated), updated_at
page_snapshots   -- node_id, taken_at, blocks jsonb, user_id (для diff-просмотра и restore)
links            -- source_node, source_block, target_node, target_block (nullable), kind (mention|wikilink|embed|synced|relation)
tags             -- id, name, color; node_tags (node_id, tag_id)
aliases          -- node_id, alias
collections      -- id, name, property_schema jsonb [{id,name,type,config}], templates jsonb, row_layout jsonb
databases        -- id (node), views jsonb? -> нет: views отдельной таблицей
views            -- id, database_id, collection_id, kind (table|board|list|gallery|calendar|timeline|chart|dashboard),
                 -- config jsonb (filters tree, sorts, groups, visible props, widths, …), position
relations        -- (source_row, property_id, target_row) для relation-свойств; rollup/formula считаются на чтение с кешем
attachments      -- id, blob_sha, node_id, block_id?, property_id?, filename, mime, size, meta jsonb (w,h,duration,exif-lite)
blobs            -- sha256 pk, size, mime, stored_at; derivatives (blob_sha, kind, params, path)
favorites, recents, tabs_state(client-side), settings(key,value jsonb), api_tokens, jobs (Hangfire)
plugin_state     -- plugin_id, key, value jsonb  (у плагинов также могут быть собственные миграции/таблицы с префиксом)
events_outbox    -- id, type, payload jsonb, occurred_at, dispatched_at  (шина событий для автоматизаций/плагинов)
```

Ключевые инварианты: удаление — только soft (`deleted_at`); `nodes.id` постоянен (перемещение/переименование не рвёт ссылки); `links` — производные, перестраиваются из блоков; formula/rollup — вычисляемые, с инвалидацией по `events_outbox`.

---

## 4. Контракт интеграций (плагины) — закладывается в фазе 0, валидируется в фазе 4

Плагин = пара «C#-проект + TS-пакет» в монорепо, включается/выключается в настройках. Загрузка — статическая (проекты подключены к host, обнаружение через DI при старте). Динамическая загрузка DLL сознательно **не** делается (конфликты зависимостей, hot-reload — не стоит того для личного проекта); контракт спроектирован так, чтобы out-of-tree можно было добавить позже.

**Бэкенд `Nook.Plugins.Sdk`** — плагин регистрирует:
- типы блоков (серверная схема/валидация props, извлечение текста для поиска, рендер в Markdown/HTML для экспорта);
- типы свойств коллекций (валидация, сортировка/фильтрация, calculations);
- обработчики событий шины (`PageCreated`, `BlockChanged`, `PropertyChanged`, `Schedule`, `WebhookReceived`, `InboundMessage`…);
- **действия** автоматизаций (общий реестр для Button-блока, database automations и ботов): `EditProperty`, `AddPage`, `InsertBlocks`, `SendWebhook`, `RunPrompt`, `SendTelegram`…;
- Minimal-API группу `/api/plugins/{id}/…` и фоновые/recurring задачи (Hangfire);
- импортёры/экспортёры; провайдеров ИИ; схему настроек (JSON Schema → UI генерируется автоматически); собственные EF-миграции.

**Фронт `@nook/plugin-sdk`** — плагин регистрирует: BlockNote custom blocks / inline content, пункты slash-меню и палитры, рендереры/редакторы свойств, панели сайдбара, страницы/вью, экраны настроек, действия для кнопок.

**Внешний доступ** (то, что у Notion — Developer Platform/External Agents): публичный REST-API (тот же, что у фронта) с API-токенами, вебхуки, и **встроенный MCP-сервер** (`/mcp`, C# MCP SDK) с инструментами `search`, `get_page`, `append_blocks`, `update_properties`, `query_collection` — так Claude Code/Claude Desktop/любой агент работает с базой знаний без отдельного ИИ-плагина.

**Плагины в объёме плана** (доказательство контракта, в порядке приоритета): 1) Obsidian import (vault: frontmatter→properties, `[[wikilinks]]`/`![[embeds]]`→ links/embeds, callouts, теги, вложения, `.canvas` — пропуск); 2) AI writing (Claude API: продолжить/переписать/сократить/перевести/по-своему-промпту на выбранных блоках; autofill свойств; при реализации — сверяться со skill `claude-api`); 3) Telegram capture-bot (сообщение → страница в коллекции Inbox; напоминания из `@remind`; команды); 4) Spaced repetition (коллекция карточек, FSRS-планировщик, режим повторения, генерация карточек из любой коллекции/страницы).

---

## 5. Структура репозитория

```text
/Volumes/SSD/notion
├─ backend/
│  ├─ src/Nook.Domain          (сущности, инварианты, value objects — без зависимостей)
│  ├─ src/Nook.Application     (use cases по слайсам, IAppDbContext, события, контракты плагинов используются отсюда)
│  ├─ src/Nook.Infrastructure  (EF Core, миграции, blob store, FTS, NetVips, Hangfire, SignalR-хаб)
│  ├─ src/Nook.Api             (host: Minimal API, auth, static files фронта, MCP endpoint)
│  ├─ src/Nook.Plugins.Sdk     (контракты §4)
│  ├─ plugins/Nook.Plugin.{ObsidianImport,Ai,Telegram,Srs}
│  └─ tests/{Unit,Integration (Testcontainers Postgres)}
├─ services/collab/            (Node 22 + TS: Hocuspocus, persistence-хуки → C#, headless BlockNote для серверных правок)
├─ frontend/
│  ├─ apps/web                 (SPA, PWA)
│  ├─ packages/{ui, editor, api-client (генерируется из OpenAPI), plugin-sdk}
│  └─ plugins/{obsidian-import, ai, telegram, srs}
├─ deploy/  docker-compose.yml, Caddyfile, backup.sh
├─ docs/adr/  (решения §2 как ADR-001…007)
└─ CLAUDE.md, README.md
```

---

## 6. Фазы и оценка (full-time, один опытный разработчик; по вечерам — ×2.5)

| # | Фаза | Результат | Недели |
|---|---|---|---:|
| 0 | Фундамент | монорепо, compose (postgres, caddy), EF + первые миграции, users/workspaces/members/invites, auth (cookie, TOTP-опция, API-токены, collab-JWT), SignalR, Hangfire, events_outbox, каркас collab-сервиса (Hocuspocus + persistence-хуки в C#), OpenAPI→api-client, каркас SPA c дизайн-системой (тема Notion, light/dark), контракт плагинов (интерфейсы, регистрация), CI (dotnet test, vitest, playwright smoke) | 1.5 |
| 1 | Пространство | дерево `nodes` (DnD, fractional index), сайдбар с секциями, иконки/обложки, favorites, recents, вкладки, breadcrumbs, корзина/restore, архив, палитра `⌘K` (навигация+команды), поиск по заголовкам (trgm) | 2 |
| 2 | Редактор | BlockNote + `withCollaboration` через Hocuspocus (§2.1): live-курсоры, presence, оффлайн-мердж, все блоки §1.1 «K» кроме баз/synced/button/tabs, inline-слой, mentions/`[[`, page settings, markdown/HTML paste, blob store + upload + превью + viewers (image/video/audio/pdf), bookmark/oEmbed-резолвер, TOC, колонки, простые таблицы, code/math/mermaid, ревизии + snapshot diffs + restore, мультиустройственный sync, PWA (кеш чтения) | 4.5 |
| 3 | Знания | индекс `links`, backlinks-панель, битые ссылки, теги, свойства страниц (frontmatter-стиль), алиасы, embed страницы/блока, synced blocks, block anchors, полнотекстовый поиск (ru+en, фильтры, сортировка, кавычки), граф связей, экспорт Markdown/HTML (zip), импорт MD/CSV/HTML/zip | 2.5 |
| 4 | Интеграции v1 | ядро автоматизаций (триггеры/действия/переменные), Button-блок, вебхуки, MCP-сервер, генерация UI настроек; плагины **Obsidian import** и **AI writing v1** как приёмочные тесты контракта | 3 |
| 5 | Базы v1 | collections/databases/views, все не-вычисляемые свойства, Table/Board/List/Gallery/Calendar, фильтры (дерево AND/OR), сортировки, группы/подгруппы, calculations, per-view настройки, inline/full-page/linked views, templates (в т.ч. repeating), side/center peek, row layout (pinned + секции), conditional colors, convert table↔database | 6 |
| 6 | Базы v2 | formula-язык + редактор, relations 2-way + filterable picker, rollups, Timeline + dependencies, sub-items, Charts (5 типов), Dashboards (Home-виджеты + global filters), database automations, unique ID | 5 |
| 7 | Полировка | аудит всех шорткатов Notion, Tabs-блок, HTML-блок, presentation mode, high-contrast, мобильная вёрстка + мобильный тулбар редактора, производительность (виртуализация длинных страниц/таблиц), бэкап/restore-команды, Tauri-обёртка (опционально) | 4 |
| 8 | Интеграции v2 | Telegram-бот, Spaced repetition, серверный PDF (Playwright), семантический поиск (pgvector), пользовательские блоки через HTML-блок | открыто |

Итого фазы 0–7: **~28 недель full-time (~7 месяцев)**; полезно с конца фазы 2 (~8 недель). Самый рискованный участок — фаза 5 (объём per-view настроек); в обеих заложен запас.

---

## 7. Порядок работ внутри фазы 0 (первый спринт, конкретно)

1. Подготовка окружения: Node 22 LTS + pnpm через brew; локальная БД — уже установленный Postgres.app 18 (Docker отсутствует; compose — для деплоя); `dotnet` 10 есть.
2. `backend/`: solution с 5 проектами, `Directory.Build.props` (nullable, warnings as errors), EF Core + Npgsql, миграция `Initial` с таблицами §3 (без коллекций/вью — их добавит фаза 5), Testcontainers-тест «миграции применяются».
3. Users/workspaces: `users`, `workspaces`, `workspace_members`, `invites`; `POST /auth/login|logout`, `POST /auth/register?invite=`, cookie, `PasswordHasher`, seed владельца из env; API-токены (`Authorization: Bearer`); `GET /api/collab/token`.
3a. `services/collab` (Node 22, TS): Hocuspocus с `onAuthenticate` (JWT), `onLoadDocument`/`onStoreDocument` → внутренние эндпоинты C# (`/internal/documents/{id}`, service-token), `POST /internal/docs/{id}/ops` на headless `ServerBlockNoteEditor`.
4. Каркас Minimal API по слайсам (`MapNodes`, `MapBlocks`…), ProblemDetails, OpenAPI (Scalar UI), SignalR hub `/hub`, Hangfire + dashboard за auth, `events_outbox` + диспетчер.
5. `Nook.Plugins.Sdk`: `IPlugin`, `IBlockTypeDefinition`, `IPropertyTypeDefinition`, `IAutomationAction`, `IEventHandler<T>`, `IImporter/IExporter`, `PluginSettingsSchema`; регистрация через `AddNookPlugins()`.
6. `frontend/`: pnpm workspace, Vite SPA, Tailwind 4 + shadcn, тема (CSS-переменные светлая/тёмная), layout «сайдбар + контент + peek», TanStack Router/Query, генерация клиента из OpenAPI, `@nook/plugin-sdk` с реестром.
7. `deploy/docker-compose.yml`, `Caddyfile`, `README` с запуском; CI (GitHub Actions: build+test обоих).
8. `docs/adr/`: зафиксировать решения §2.

---

## 8. Верификация

- **Бэкенд**: xUnit; интеграционные тесты на локальном Postgres (Postgres.app; Docker на машине нет — база на тест создаётся/дропается скриптом) для прав доступа (workspace/share-изоляция), persistence-хуков collab (PUT документа → корректная проекция `blocks`, ссылки, tsvector), фильтров/сортировок коллекций, formula-интерпретатора (таблица кейсов из документации Notion), импорта Obsidian-vault (фикстура с wikilinks/embeds/frontmatter/callouts).
- **Фронт**: Vitest на преобразование `getChanges()` → ops и применение входящих ops; Playwright e2e: набор «Notion-сценариев» (slash-меню, turn into, DnD блока, колонки, `[[`-линк, upload картинки, восстановление версии), плюс тест «два пользователя в одной странице» (два браузерных контекста, одновременный ввод в один абзац → оба текста сохранены, курсоры видны).
- **Ручная проверка** через встроенный Browser (preview) после каждой фазы: чек-лист по §1 для завершённых пунктов, мобильный пресет для фазы 7.
- **Экспорт как тест модели**: полный экспорт в Markdown после фазы 3 → импорт обратно → сравнение дерева/ссылок.
- **Приёмка контракта плагинов** (фаза 4): Obsidian-импорт и ИИ-плагин реализуются *только* через `Nook.Plugins.Sdk`/`@nook/plugin-sdk`, без правок ядра — иначе контракт дорабатывается.

---

## 9. Риски и как закрыты

| Риск | Митигация |
|---|---|
| Второй рантайм (Node collab-сервис) | сервис маленький (Hocuspocus + хуки + server-util), без собственной БД — всё состояние в Postgres через C#; при недоступности collab страница открывается read-only из проекции `blocks` |
| Рассинхрон Y.Doc и проекции `blocks` | проекция перестраивается целиком при каждом сохранении; команда `nook reindex` пересобирает все проекции из Y.Doc |
| Смена редактора в будущем | формат хранения = flatten BlockNote-блоков с `schema_version`; миграции блоков на сервере; экспорт в Markdown как страховка |
| AGPL у `xl-multi-column` | личное self-hosted использование; при публикации кода — репозиторий под AGPL-совместимой лицензией либо своя реализация колонок позднее |
| Объём баз данных | две фазы, v1 без вычисляемых свойств; view-config как jsonb с версионированием |
| Мобильный редактор | BlockNote на мобильном работает базово; глубокая мобильная полировка вынесена в фазу 7 и не блокирует продукт |
| Нативные зависимости (libvips) | только в фоновом воркере; при сбое превью не блокируют загрузку файла |

---

## 10. Разбивка по агентам (workstreams)

Правила: каждый агент работает в своём git-worktree на ветке `ws/<name>`, только внутри своих каталогов; общие контракты (OpenAPI C#-бэкенда, JSON-формат блоков BlockNote, JWT-схема collab, `Nook.Plugins.Sdk`, `@nook/plugin-sdk`) фиксируются в волне 0 и меняются только через координатора (главную сессию). Мердж в `main` — координатор, после зелёного CI. Агент заканчивает работу отчётом: что сделано, как проверено, что не доделано.

**Волна 0 — фундамент (параллельно, непересекающиеся каталоги):**

| Агент | Каталоги | Результат |
|---|---|---|
| `backend-foundation` | `backend/` | solution (Domain/Application/Infrastructure/Api/Plugins.Sdk/tests), EF Core + Npgsql, миграция Initial (§3 без коллекций), users/workspaces/auth/invites/API-tokens/collab-JWT, `/internal/documents` эндпоинты для collab, SignalR hub, Hangfire, events_outbox, OpenAPI (Scalar), тесты на локальном Postgres, `dotnet test` зелёный |
| `frontend-foundation` | `frontend/` | pnpm workspace, Vite SPA, Tailwind 4 + shadcn, тема Notion (light/dark/high-contrast, CSS-переменные), каркас «сайдбар + контент + peek», TanStack Router/Query, генерация клиента из OpenAPI (openapi-ts), экраны login/register-by-invite, `@nook/plugin-sdk` каркас, Vitest + Playwright smoke |
| `collab-foundation` | `services/collab/` | Hocuspocus-сервер, JWT-auth, хуки load/store → C# internal API, `POST /internal/docs/{id}/ops` на headless BlockNote, Dockerfile, тесты (два клиента Y.Doc → сходятся) |
| координатор | корень, `deploy/`, `docs/adr/`, `CLAUDE.md`, CI | git init, compose, Caddyfile, ADR-001…008, GitHub Actions |

**Волна 1 — пространство, редактор, знания (параллельно):** `backend-tree` (nodes/дерево/favorites/recents/trash/archive/search-по-заголовкам), `backend-files` (blob store, upload, NetVips, streaming, text extraction), `backend-knowledge` (проекция blocks → links/backlinks/tags/FTS/graph, экспорт MD/HTML, импорт MD/CSV/HTML), `frontend-shell` (сайдбар DnD, вкладки, палитра, breadcrumbs, страницы-настроек), `frontend-editor` (BlockNote + collaboration, все блоки §1.1, mentions/`[[`, upload-UI, viewers, page settings, история/diff), `frontend-knowledge` (backlinks-панель, теги, свойства, поиск-модал, граф).

**Волна 2 — базы и интеграции:** `backend-collections` (schema/properties/filters/sorts/groups/calculations/templates), `frontend-views` (Table/Board/List/Gallery/Calendar + view-настройки + peek), `plugins-core` (автоматизации, Button, вебхуки, MCP-сервер, settings-UI), `plugin-obsidian`, `plugin-ai`.

**Волна 3:** `backend-formulas` (язык формул, relations 2-way, rollups), `frontend-views-2` (Timeline, Charts, Dashboards), `polish-mobile`, `e2e`.

---

## Источники (документация Notion, сентябрь 2026)

- [Writing & editing basics](https://www.notion.com/help/writing-and-editing-basics) · [Keyboard shortcuts](https://www.notion.com/help/keyboard-shortcuts) · [Columns, headings, dividers](https://www.notion.com/help/columns-headings-and-dividers) · [Code blocks](https://www.notion.com/help/code-blocks) · [Synced blocks](https://www.notion.com/help/synced-blocks) · [Buttons](https://www.notion.com/help/buttons)
- [Database properties](https://www.notion.com/help/database-properties) · [Views, filters & sorts](https://www.notion.com/help/views-filters-and-sorts) · [Data sources & linked databases](https://www.notion.com/help/data-sources-and-linked-databases) · [Relations & rollups](https://www.notion.com/help/relations-and-rollups) · [Formulas](https://www.notion.com/help/formulas) · [Database automations](https://www.notion.com/help/database-automations) · [Database templates](https://www.notion.com/help/database-templates) · [Layouts](https://www.notion.com/help/layouts) · [Charts](https://www.notion.com/help/charts) · [Dashboards](https://www.notion.com/help/dashboards)
- [Search](https://www.notion.com/help/search) · [Sidebar](https://www.notion.com/help/navigate-with-the-sidebar) · [Export](https://www.notion.com/help/export-your-content) · [Import](https://www.notion.com/help/import-data-into-notion) · [Pricing (feature matrix)](https://www.notion.com/pricing)
- Релизы: [3.4 (03.2026)](https://www.notion.com/releases/2026-03-26) · [3.6 (07.2026)](https://www.notion.com/releases/2026-07-01) · [хронология обновлений](https://matthiasfrank.de/en/notion-updates/)
- Стек: [BlockNote releases](https://github.com/TypeCellOS/BlockNote/releases) · [BlockNote pricing/licensing](https://www.blocknotejs.org/pricing) · [YDotNet](https://github.com/y-crdt/ydotnet) · [YDotNet.Server on NuGet](https://www.nuget.org/packages/YDotNet.Server) · [Plate Potion (paid)](https://pro.platejs.org/docs/templates/potion) · [Tiptap](https://github.com/ueberdosis/tiptap)
