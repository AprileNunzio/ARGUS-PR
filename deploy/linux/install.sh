#!/usr/bin/env bash
set -euo pipefail

INSTALL_DIR="${INSTALL_DIR:-/opt/argus-pr}"
DATA_DIR="${DATA_DIR:-/var/lib/argus-pr}"
SERVICE_USER="${SERVICE_USER:-argus}"
PORT="${PORT:-443}"

if [[ $EUID -ne 0 ]]; then
    echo "Esegui come root: sudo $0" >&2
    exit 1
fi

echo "==> Verifica prerequisiti"

if ! command -v node >/dev/null 2>&1; then
    echo "Node.js non trovato. Installa Node.js 20 o superiore." >&2
    echo "  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt-get install -y nodejs" >&2
    exit 1
fi

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if (( NODE_MAJOR < 20 )); then
    echo "Node.js 20 o superiore richiesto (trovato ${NODE_MAJOR})." >&2
    exit 1
fi

if ! command -v ffmpeg >/dev/null 2>&1; then
    echo "ATTENZIONE: ffmpeg non trovato. Installalo con: apt-get install -y ffmpeg"
fi

echo "==> Creazione utente di servizio"
id -u "$SERVICE_USER" >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin "$SERVICE_USER"

echo "==> Copia in ${INSTALL_DIR}"
SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
mkdir -p "$INSTALL_DIR"
rsync -a --delete \
    --exclude '.git' \
    --exclude 'node_modules' \
    --exclude 'data' \
    "$SOURCE_DIR/" "$INSTALL_DIR/"

echo "==> Installazione dipendenze"
cd "$INSTALL_DIR"
npm install --omit=dev --no-audit --no-fund
npm rebuild better-sqlite3 >/dev/null 2>&1 || true

echo "==> Preparazione archivio"
mkdir -p "$DATA_DIR/media"
chown -R "$SERVICE_USER:$SERVICE_USER" "$DATA_DIR"
chmod 750 "$DATA_DIR"

echo "==> Registrazione servizio systemd"
install -m 644 "$INSTALL_DIR/deploy/systemd/argus-pr.service" /etc/systemd/system/argus-pr.service
systemctl daemon-reload
systemctl enable argus-pr
systemctl restart argus-pr

sleep 2

echo
echo "ARGUS-PR installato."
echo "  Interfaccia: https://$(hostname -I | awk '{print $1}'):${PORT}"
echo "  Stato:       systemctl status argus-pr"
echo "  Log:         journalctl -u argus-pr -f"
echo
echo "La password iniziale dell'amministratore e' nel log di avvio:"
echo "  journalctl -u argus-pr | grep -A3 'First run'"
echo
