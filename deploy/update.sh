#!/usr/bin/env bash
# Runs every minute from a systemd timer (installed by setup-ec2.sh).
# Deploys the "release" branch (which CI updates only after tests pass).
# Falls back to "main" until the first CI run has created "release".
set -euo pipefail

cd /opt/sehwas
exec 9>/tmp/sehwas-update.lock
flock -n 9 || exit 0

git fetch --quiet origin
if git show-ref --verify --quiet refs/remotes/origin/release; then
  TARGET="origin/release"
else
  TARGET="origin/main"
fi

if [ "$(git rev-parse HEAD)" != "$(git rev-parse "$TARGET")" ]; then
  echo "Deploying $(git rev-parse --short "$TARGET") from $TARGET"
  git reset --hard "$TARGET"
  docker compose up -d --build
  docker image prune -f >/dev/null
fi
