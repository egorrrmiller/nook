#!/usr/bin/env bash
# Full backup: database dump + blob store. Usage: deploy/backup.sh /path/to/backups
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "$0")" && pwd)"
compose_file="$script_dir/docker-compose.yml"
env_file="$script_dir/.env"
dest="${1:?backup dir}"
stamp="$(date +%Y%m%d-%H%M%S)"
mkdir -p "$dest"
dest="$(cd -- "$dest" && pwd)"
compose=(docker compose --env-file "$env_file" -f "$compose_file")

"${compose[@]}" exec -T postgres pg_dump -U nook -Fc nook > "$dest/nook-$stamp.dump"

api_container="$("${compose[@]}" ps -q api)"
[[ -n "$api_container" ]] || { echo "backup: api container is not running" >&2; exit 1; }
data_volume="$(docker inspect -f '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Name}}{{end}}{{end}}' "$api_container")"
[[ -n "$data_volume" ]] || { echo "backup: api data volume was not found" >&2; exit 1; }

docker run --rm \
  -v "$data_volume:/data:ro" \
  -v "$dest:/backup" \
  mirror.gcr.io/library/alpine:3.20 \
  tar czf "/backup/blobs-$stamp.tar.gz" -C /data .

echo "backup written to $dest ($stamp)"
