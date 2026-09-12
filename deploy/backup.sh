#!/usr/bin/env bash
# Full backup: database dump + blob store. Usage: deploy/backup.sh /path/to/backups
set -euo pipefail
dest="${1:?backup dir}"; stamp="$(date +%Y%m%d-%H%M%S)"; mkdir -p "$dest"
docker compose -f "$(dirname "$0")/docker-compose.yml" exec -T postgres pg_dump -U nook -Fc nook > "$dest/nook-$stamp.dump"
docker run --rm -v nook_nookdata:/data -v "$dest":/backup alpine tar czf "/backup/blobs-$stamp.tar.gz" -C /data .
echo "backup written to $dest ($stamp)"
