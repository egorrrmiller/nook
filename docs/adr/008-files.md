# ADR-008: Файлы — content-addressed blob store, NetVips для превью

Статус: принято (2026-09-13)

`data/blobs/ab/cd/<sha256>`; оригиналы неизменяемы, дедупликация бесплатно; превью — производные, пересчитываемые. NetVips (libvips) вместо ImageSharp (Six Labors Split License) и SkiaSharp (нет HEIC, EXIF вручную). Видео/аудио без транскодинга, отдача с Range. Текст: PdfPig, OpenXml SDK.

## Реализация (wave 1, `backend-files`)

- Пакеты: `NetVips` 3.2.0 (MIT-обёртка) + `NetVips.Native` 8.18.6 (бинарники libvips, **LGPL-2.1+**, динамическая линковка — допустимо, исходники не модифицируются); `PdfPig` 0.1.16 (Apache-2.0); `DocumentFormat.OpenXml` 3.5.1 (MIT); `AngleSharp` 1.8.1 (MIT) для разбора OpenGraph/oEmbed-ссылок.
- Если libvips не загрузился, `IImageProcessor.IsAvailable == false`: загрузки работают, `GET /api/files/{id}/thumb` отвечает 503, размеры картинок не извлекаются.
- Производные: `derivatives/<sha256>/w<W>.webp`, W ∈ {160, 320, 640, 1280, 1920}; генерируются лениво, EXIF-поворот, без апскейла.
- SSRF-guard (`from-url`, `links/preview`): только http(s), DNS резолвится заранее и в `SocketsHttpHandler.ConnectCallback` (каждый hop редиректа), приватные/loopback/link-local/multicast/CGNAT/NAT64/6to4 диапазоны отклоняются; редиректы вручную (≤5), 10 с на заголовки, лимит байт тела.
- Активный контент (SVG, HTML, XML, JS) отдаётся как `application/octet-stream` + `nosniff` + `CSP: sandbox`, если не `?download=1`.
- `GET /api/files/{id}`, `/thumb`, `/meta`, `DELETE` принимают запрос без `X-Workspace-Id` (для `<img src>`): workspace берётся из самого вложения, проверка членства/шары + роли на узле сохраняется.
- Галерея обложек — 32 SVG, сгенерированы `backend/scripts/gen-covers.py`, лежат в `wwwroot/covers/` и раздаются статикой даже без собранного SPA.
