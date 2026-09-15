# Nook deploy

Требуется Docker Engine с Compose v2.

## Настройка `.env`

Из каталога репозитория:

```bash
cp deploy/.env.example deploy/.env
chmod 600 deploy/.env
```

Заполни `deploy/.env`:

```dotenv
POSTGRES_PASSWORD=<openssl rand -hex 32>
NOOK_OWNER_EMAIL=owner@example.com
NOOK_OWNER_PASSWORD=<openssl rand -hex 24>
NOOK_COLLAB_JWT_SECRET=<openssl rand -hex 32>
NOOK_INTERNAL_TOKEN=<openssl rand -hex 32>
NOOK_IMAGE_TAG=latest
# NOOK_HTTP_PORT=80
```

Для каждого секрета можно выполнить `openssl rand -hex 32` и вставить
полученное значение вместо placeholder.

Если GHCR-пакеты приватные, авторизуй Docker перед запуском:

```bash
echo "$GHCR_TOKEN" | docker login ghcr.io \
  --username "$GHCR_USERNAME" --password-stdin
```

## Запуск

```bash
docker compose --env-file deploy/.env -f deploy/docker-compose.yml pull
docker compose --env-file deploy/.env -f deploy/docker-compose.yml up -d --remove-orphans
```

Фронтенд будет доступен на `http://<server-ip>/` или на порту из
`NOOK_HTTP_PORT`.

## Обновление

```bash
docker compose --env-file deploy/.env -f deploy/docker-compose.yml pull
docker compose --env-file deploy/.env -f deploy/docker-compose.yml up -d --remove-orphans
```

Для локальной сборки вместо GHCR используй отдельный override:

```bash
docker compose \
  --env-file deploy/.env \
  -f deploy/docker-compose.yml \
  -f deploy/docker-compose.build.yml \
  up -d --build
```
