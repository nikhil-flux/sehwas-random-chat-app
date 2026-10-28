#!/usr/bin/env bash
# One-time setup for a fresh Amazon Linux 2023 EC2 instance.
# Run AFTER you attach the Elastic IP:   sudo bash setup-ec2.sh
# Optional: pass the IP yourself:        sudo bash setup-ec2.sh 3.110.5.20
set -euo pipefail

REPO_URL="https://github.com/nikhil-flux/sehwas-random-chat-app.git"
APP_DIR="/opt/sehwas"

if [ "$(id -u)" -ne 0 ]; then
  echo "Run with sudo: sudo bash $0" >&2
  exit 1
fi

echo "==> Installing Docker and git"
dnf install -y docker git
systemctl enable --now docker

echo "==> Installing Docker Compose plugin"
mkdir -p /usr/local/lib/docker/cli-plugins
curl -fsSL "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-$(uname -m)" \
  -o /usr/local/lib/docker/cli-plugins/docker-compose
chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
docker compose version

if ! swapon --show | grep -q .; then
  echo "==> Adding 1 GB swap (t3.micro has only 1 GB RAM)"
  dd if=/dev/zero of=/swapfile bs=1M count=1024 status=none
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  echo "/swapfile none swap sw 0 0" >> /etc/fstab
fi

IP="${1:-}"
if [ -z "$IP" ]; then
  TOKEN="$(curl -fsS -X PUT http://169.254.169.254/latest/api/token -H 'X-aws-ec2-metadata-token-ttl-seconds: 60')"
  IP="$(curl -fsS -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/public-ipv4)"
fi
if ! echo "$IP" | grep -Eq '^[0-9]{1,3}(\.[0-9]{1,3}){3}$'; then
  echo "Could not detect a public IPv4 address (got '$IP'). Attach the Elastic IP first, or pass the IP as an argument." >&2
  exit 1
fi
SITE_HOST="${IP//./-}.sslip.io"

echo "==> Cloning the app into $APP_DIR"
if [ ! -d "$APP_DIR/.git" ]; then
  git clone "$REPO_URL" "$APP_DIR"
fi
cd "$APP_DIR"

if [ ! -f .env ]; then
  cat > .env <<EOF
SITE_HOST=$SITE_HOST
TURN_URL=
TURN_USERNAME=
TURN_CREDENTIAL=
EOF
fi

echo "==> Starting the app"
docker compose up -d --build

echo "==> Enabling auto-update (checks GitHub every minute)"
chmod +x deploy/update.sh
cat > /etc/systemd/system/sehwas-update.service <<'EOF'
[Unit]
Description=Update Sehwas from GitHub
After=docker.service network-online.target

[Service]
Type=oneshot
ExecStart=/opt/sehwas/deploy/update.sh
EOF
cat > /etc/systemd/system/sehwas-update.timer <<'EOF'
[Unit]
Description=Check GitHub for a new Sehwas release every minute

[Timer]
OnBootSec=2min
OnUnitActiveSec=1min

[Install]
WantedBy=timers.target
EOF
systemctl daemon-reload
systemctl enable --now sehwas-update.timer

echo
echo "Done. Open  https://$SITE_HOST  in your browser."
echo "The first load can take up to a minute while the HTTPS certificate is issued."
echo "To add TURN: edit $APP_DIR/.env, then run: cd $APP_DIR && sudo docker compose up -d"
