#!/usr/bin/env bash

set -Eeuo pipefail

# The installer intentionally downloads only the deployment files when it is
# piped from GitHub. Application code is already packaged in GHCR images.
RAW_DEPLOY_URL="https://raw.githubusercontent.com/egorrrmiller/nook/main/deploy"

SCRIPT_DIR=""
COMPOSE_FILE=""
ENV_FILE=""
ENV_EXAMPLE=""
BOOTSTRAP_ROOT=""
BOOTSTRAP_TMP=""

usage() {
  cat <<'EOF'
Usage: bash install.sh [--no-start]

Prepare deploy/.env, validate Docker Compose, pull the release images from
GHCR, and start Nook.

  --no-start  only prepare and validate the configuration

For private GHCR images, export GHCR_USERNAME and GHCR_TOKEN before running
the installer. The token is used only for `docker login` and is not saved.

When run from the raw GitHub URL outside a checkout, the deployment files are
downloaded to NOOK_INSTALL_DIR or the current directory automatically.
EOF
}

fail() {
  printf 'install: %s\n' "$1" >&2
  exit 1
}

NO_START=0
for argument in "$@"; do
  case "$argument" in
    --help|-h)
      usage
      exit 0
      ;;
    --no-start)
      NO_START=1
      ;;
    *)
      usage >&2
      exit 2
      ;;
  esac
done

check_docker() {
  command -v docker >/dev/null 2>&1 || fail "Docker is not installed or is not on PATH"
  docker info >/dev/null 2>&1 || fail "Docker Engine is not running; start Docker and run this script again"
  docker compose version >/dev/null 2>&1 || fail "Docker Compose v2 is not available as 'docker compose'"
}

login_to_ghcr_if_configured() {
  if [[ -n "${GHCR_TOKEN:-}" ]]; then
    [[ -n "${GHCR_USERNAME:-}" ]] || fail "GHCR_USERNAME is required when GHCR_TOKEN is set"
    printf '%s' "$GHCR_TOKEN" | docker login ghcr.io --username "$GHCR_USERNAME" --password-stdin \
      || fail "could not log in to GHCR"
    printf 'install: authenticated to GHCR as %s\n' "$GHCR_USERNAME"
  fi
}

resolve_existing_script_dir() {
  local source_path="${BASH_SOURCE[0]:-}"
  local candidate

  if [[ -n "$source_path" && "$source_path" != /dev/fd/* && "$source_path" != /proc/self/fd/* && -f "$source_path" ]]; then
    candidate="$(cd -- "$(dirname -- "$source_path")" && pwd)"
    if [[ -f "$candidate/docker-compose.yml" && -f "$candidate/.env.example" ]]; then
      printf '%s\n' "$candidate"
      return
    fi
  fi

  if [[ -f "$PWD/deploy/docker-compose.yml" && -f "$PWD/deploy/.env.example" ]]; then
    printf '%s\n' "$PWD/deploy"
  elif [[ -f "$PWD/docker-compose.yml" && -f "$PWD/.env.example" ]]; then
    printf '%s\n' "$PWD"
  fi
}

bootstrap_deploy_files() {
  local install_root="${NOOK_INSTALL_DIR:-$PWD}"
  local deploy_dir

  [[ "$install_root" != "/" ]] || fail "NOOK_INSTALL_DIR cannot be /"
  command -v curl >/dev/null 2>&1 || fail "curl is required to download Nook"

  mkdir -p "$install_root"
  BOOTSTRAP_ROOT="$(cd -- "$install_root" && pwd)"
  deploy_dir="$BOOTSTRAP_ROOT/deploy"
  mkdir -p "$deploy_dir"

  BOOTSTRAP_TMP="$(mktemp -d)"
  trap 'if [[ -n "$BOOTSTRAP_TMP" ]]; then rm -rf -- "$BOOTSTRAP_TMP"; fi' EXIT

  printf 'install: downloading deployment files\n'
  curl -fsSL --retry 3 --retry-all-errors "$RAW_DEPLOY_URL/docker-compose.yml" -o "$deploy_dir/docker-compose.yml"
  curl -fsSL --retry 3 --retry-all-errors "$RAW_DEPLOY_URL/.env.example" -o "$deploy_dir/.env.example"
  curl -fsSL --retry 3 --retry-all-errors "$RAW_DEPLOY_URL/backup.sh" -o "$deploy_dir/backup.sh"
  chmod 700 "$deploy_dir/backup.sh"

  [[ -s "$deploy_dir/docker-compose.yml" ]] || fail "downloaded docker-compose.yml is empty"
  [[ -s "$deploy_dir/.env.example" ]] || fail "downloaded .env.example is empty"
  printf 'install: deployment files installed in %s\n' "$deploy_dir"
}

check_docker

SCRIPT_DIR="$(resolve_existing_script_dir || true)"
if [[ -z "$SCRIPT_DIR" ]]; then
  bootstrap_deploy_files
  SCRIPT_DIR="$BOOTSTRAP_ROOT/deploy"
fi

COMPOSE_FILE="$SCRIPT_DIR/docker-compose.yml"
ENV_FILE="$SCRIPT_DIR/.env"
ENV_EXAMPLE="$SCRIPT_DIR/.env.example"

[[ -f "$COMPOSE_FILE" ]] || fail "missing $COMPOSE_FILE"
[[ -f "$ENV_EXAMPLE" ]] || fail "missing $ENV_EXAMPLE"

umask 077
if [[ ! -f "$ENV_FILE" ]]; then
  cp "$ENV_EXAMPLE" "$ENV_FILE"
  printf 'install: created %s\n' "$ENV_FILE"
fi
chmod 600 "$ENV_FILE"

get_env_value() {
  local key="$1"
  awk -F= -v wanted="$key" '$1 == wanted { sub(/^[^=]*=/, ""); print; exit }' "$ENV_FILE"
}

is_missing_or_placeholder() {
  local value="$1"
  [[ -z "$value" || "$value" == replace-with-* || "$value" == generated-by-install.sh ]]
}

set_env_value() {
  local key="$1"
  local value="$2"
  local tmp

  tmp="$(mktemp "$ENV_FILE.XXXXXX")"
  ENV_KEY="$key" ENV_VALUE="$value" awk '
    BEGIN {
      key = ENVIRON["ENV_KEY"]
      value = ENVIRON["ENV_VALUE"]
      found = 0
    }
    index($0, key "=") == 1 {
      if (!found) print key "=" value
      found = 1
      next
    }
    { print }
    END {
      if (!found) print key "=" value
    }
  ' "$ENV_FILE" > "$tmp"
  mv "$tmp" "$ENV_FILE"
}

remove_legacy_values() {
  local tmp

  tmp="$(mktemp "$ENV_FILE.XXXXXX")"
  awk '
    BEGIN {
      split("POSTGRES_IMAGE NODE_IMAGE NGINX_IMAGE NPM_REGISTRY NOOK_DOMAIN NOOK_COLLAB_WS_URL WEB_PORT NOOK_AUTO_MIGRATE NOOK_BACKGROUND_JOBS NOOK_MAX_UPLOAD_MB LOG_LEVEL", keys, " ")
      for (i in keys) obsolete[keys[i]] = 1
    }
    {
      key = $0
      sub(/=.*/, "", key)
      if (!(key in obsolete)) print
    }
  ' "$ENV_FILE" > "$tmp"
  mv "$tmp" "$ENV_FILE"
}

random_hex() {
  local bytes="$1"

  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex "$bytes"
    return
  fi

  command -v od >/dev/null 2>&1 || fail "openssl or od is required to generate secrets"
  od -An -tx1 -N "$bytes" /dev/urandom | tr -d ' \n'
}

remove_legacy_values

generated_owner_password=0

value="$(get_env_value POSTGRES_PASSWORD)"
if is_missing_or_placeholder "$value"; then
  set_env_value POSTGRES_PASSWORD "$(random_hex 32)"
  printf 'install: generated POSTGRES_PASSWORD\n'
fi

value="$(get_env_value NOOK_OWNER_EMAIL)"
if is_missing_or_placeholder "$value"; then
  set_env_value NOOK_OWNER_EMAIL "owner@localhost"
  printf 'install: set NOOK_OWNER_EMAIL=owner@localhost\n'
fi

value="$(get_env_value NOOK_OWNER_PASSWORD)"
if is_missing_or_placeholder "$value"; then
  value="$(random_hex 24)"
  set_env_value NOOK_OWNER_PASSWORD "$value"
  generated_owner_password=1
  printf 'install: generated NOOK_OWNER_PASSWORD\n'
fi

value="$(get_env_value NOOK_COLLAB_JWT_SECRET)"
if is_missing_or_placeholder "$value"; then
  set_env_value NOOK_COLLAB_JWT_SECRET "$(random_hex 32)"
  printf 'install: generated NOOK_COLLAB_JWT_SECRET\n'
fi

value="$(get_env_value NOOK_INTERNAL_TOKEN)"
if is_missing_or_placeholder "$value"; then
  set_env_value NOOK_INTERNAL_TOKEN "$(random_hex 32)"
  printf 'install: generated NOOK_INTERNAL_TOKEN\n'
fi

for key in POSTGRES_PASSWORD NOOK_OWNER_EMAIL NOOK_OWNER_PASSWORD NOOK_COLLAB_JWT_SECRET NOOK_INTERNAL_TOKEN; do
  value="$(get_env_value "$key")"
  is_missing_or_placeholder "$value" && fail "$key is empty in $ENV_FILE"
done

docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" config --quiet \
  || fail "Docker Compose configuration is invalid"

printf 'install: configuration is ready\n'
if (( generated_owner_password )); then
  printf 'install: initial owner email: %s\n' "$(get_env_value NOOK_OWNER_EMAIL)"
  printf 'install: initial owner password: %s\n' "$(get_env_value NOOK_OWNER_PASSWORD)"
  printf 'install: save these credentials; the password is shown only on first generation\n'
fi

if (( NO_START )); then
  printf 'install: skipped image pull and startup (--no-start)\n'
  exit 0
fi

login_to_ghcr_if_configured
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" pull \
  || fail "could not pull Nook images from GHCR"
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d --remove-orphans
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" ps
