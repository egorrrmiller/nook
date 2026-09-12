# ADR-008: Файлы — content-addressed blob store, NetVips для превью

Статус: принято (2026-09-13)

`data/blobs/ab/cd/<sha256>`; оригиналы неизменяемы, дедупликация бесплатно; превью — производные, пересчитываемые. NetVips (libvips) вместо ImageSharp (Six Labors Split License) и SkiaSharp (нет HEIC, EXIF вручную). Видео/аудио без транскодинга, отдача с Range. Текст: PdfPig, OpenXml SDK.
