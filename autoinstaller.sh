#!/usr/bin/env bash
set -euo pipefail

REPO_URL="${ARGUS_REPO_URL:-https://github.com/AprileNunzio/ARGUS-PR.git}"
INSTALL_DIR="${ARGUS_INSTALL_DIR:-/opt/argus-pr}"
DATA_DIR="${ARGUS_DATA_DIR:-/var/lib/argus-pr}"
ENV_FILE="${ARGUS_ENV_FILE:-/etc/argus-pr/argus.env}"
SERVICE_USER="${ARGUS_SERVICE_USER:-root}"
KIOSK_USER="${ARGUS_KIOSK_USER:-argus-kiosk}"
KIOSK_HOME="/home/argus-kiosk"
HELPER_DIR="/usr/local/lib/argus-pr"
SHIELD_DIR="/usr/local/lib/argus-shield"
SHIELD_STATE_DIR="/var/lib/argus-shield"
SHIELD_CONFIG="/etc/argus-pr/shield.json"
PORT="${ARGUS_PORT:-443}"
HTTP_PORT="${ARGUS_HTTP_PORT:-80}"
PUBLIC_ACCESS="${ARGUS_PUBLIC_ACCESS:-false}"
PUBLIC_HOSTS="${ARGUS_PUBLIC_HOSTS:-}"
TRUSTED_NETS="${ARGUS_TRUSTED_NETWORKS:-}"
WIREGUARD_PORT="${ARGUS_WIREGUARD_PORT:-0}"
SHIELD_MODE="${ARGUS_SHIELD:-auto}"
REF="${ARGUS_REF:-}"
KIOSK_MODE="${ARGUS_KIOSK:-auto}"
NODE_SERIES="${ARGUS_NODE_SERIES:-v22.x}"
NODE_MIN_MAJOR=20
PKG="" BROWSER_BIN="" NODE_BIN="" NPM_BIN=""

C_CYAN="\033[1;36m" C_GRN="\033[1;32m" C_YLW="\033[1;33m" C_RED="\033[1;31m"
C_MAG="\033[1;35m" C_BLU="\033[1;34m" C_BLD="\033[1m" C_DIM="\033[2m" C_RST="\033[0m"

log() { printf "${C_CYAN}==>${C_RST} %s\n" "$*"; }
substep() { printf "  ${C_BLU}->${C_RST} %s\n" "$*"; }
warn() { printf "${C_YLW}[WARN]${C_RST} %s\n" "$*" >&2; }
die() { printf "${C_RED}[FAIL]${C_RST} %s\n" "$*" >&2; exit 1; }

phase() {
    local step="$1" total="$2" pct="$3" bar_w=18
    shift 3
    local filled=$(( pct * bar_w / 100 )) empty=$(( bar_w - filled )) bar=""
    for ((i=0; i<filled; i++)); do bar="${bar}█"; done
    for ((i=0; i<empty; i++)); do bar="${bar}░"; done
    printf "\n${C_MAG}[FASE %s/%s]${C_RST} [${C_GRN}%s${C_RST}] ${C_BLD}%3d%%${C_RST} — ${C_CYAN}%s${C_RST}\n" "$step" "$total" "$bar" "$pct" "$*"
}

show_banner() {
    printf "${C_CYAN}\n   ___   ___  ____ _   _ ____        ____  ____\n  / _ \\ / _ \\/ ___| | | / ___|      |  _ \\|  _ \\\n / /_\\ / /_\\ | |  _| | | \\___ \\ _____| |_) | |_) |\n/ ___ / ___ \\| |_| | |_| |___) |_____|  __/|  _ < \n/_/   /_/   \\_\\\\____|\\___/|____/      |_|   |_| \\_\\\n${C_RST}"
    printf "  ${C_GRN}ARGUS-PR Autonomous Appliance & NVR Core${C_RST}\n  ${C_DIM}Zero-Trust • Bare-Metal • Full Hardware Access • Real-Time AI${C_RST}\n\n"
}

primary_address() {
    ip -4 -o addr show scope global 2>/dev/null | awk '{split($4,a,"/"); print a[1]; exit}' || echo "127.0.0.1"
}

show_system_specs() {
    local kver arch cpu mem disk ip_a
    kver="$(uname -r 2>/dev/null || echo unknown)"
    arch="$(uname -m 2>/dev/null || echo unknown)"
    cpu="$(awk -F: '/model name/ {sub(/^[ \t]+/, "", $2); print $2; exit}' /proc/cpuinfo 2>/dev/null || echo "$arch")"
    mem="$(free -h 2>/dev/null | awk '/^Mem:/ {print $3 " / " $2}')"
    disk="$(df -h / 2>/dev/null | awk 'NR==2 {print $3 " usati su " $2}')"
    ip_a="$(primary_address)"
    printf "  ${C_BLD}Hardware:${C_RST}   %s (%s)\n" "$cpu" "$arch"
    printf "  ${C_BLD}Kernel:${C_RST}     Linux %s\n" "$kver"
    printf "  ${C_BLD}Memoria:${C_RST}    %s | Disco: %s\n" "${mem:-N/D}" "${disk:-N/D}"
    printf "  ${C_BLD}Rete / IP:${C_RST}  %s (UID=%d)\n\n" "$ip_a" "$EUID"
}

usage() {
    cat <<'EOF'
ARGUS-PR autoinstaller: sudo bash autoinstaller.sh [opzioni]
  --port <n>        Porta HTTPS (default 443)
  --http-port <n>   Porta redirect HTTPS (default 80)
  --dir <path>      Directory installazione (default /opt/argus-pr)
  --data <path>     Directory dati (default /var/lib/argus-pr)
  --ref <tag>       Tag release (default ultima release)
  --public          Consente sola visione da internet
  --public-host <h> Nome DNS per certificato
  --trusted-net <c> Rete locale fidata (es. 10.8.0.0/24)
  --wireguard <n>   Porta UDP WireGuard
  --kiosk           Forza console HDMI locale
  --no-kiosk        Disabilita console HDMI
  --no-shield       Disabilita firewall ARGUS-SHIELD
  --help            Mostra questo aiuto
EOF
}

parse_args() {
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --port) PORT="${2:?}"; shift 2 ;;
            --http-port) HTTP_PORT="${2:?}"; shift 2 ;;
            --public) PUBLIC_ACCESS="true"; shift ;;
            --public-host) PUBLIC_HOSTS="${PUBLIC_HOSTS:+$PUBLIC_HOSTS,}${2:?}"; shift 2 ;;
            --trusted-net) TRUSTED_NETS="${TRUSTED_NETS:+$TRUSTED_NETS,}${2:?}"; shift 2 ;;
            --wireguard) WIREGUARD_PORT="${2:?}"; shift 2 ;;
            --no-shield) SHIELD_MODE="no"; shift ;;
            --dir) INSTALL_DIR="${2:?}"; shift 2 ;;
            --data) DATA_DIR="${2:?}"; shift 2 ;;
            --ref) REF="${2:?}"; shift 2 ;;
            --kiosk) KIOSK_MODE="yes"; shift ;;
            --no-kiosk) KIOSK_MODE="no"; shift ;;
            --help|-h) usage; exit 0 ;;
            *) die "Opzione sconosciuta: $1" ;;
        esac
    done
    [[ "$PORT" =~ ^[0-9]+$ ]] || die "Porta non valida: $PORT"
    [[ "$HTTP_PORT" =~ ^[0-9]+$ ]] || die "Porta HTTP non valida: $HTTP_PORT"
    [[ "$WIREGUARD_PORT" =~ ^[0-9]+$ ]] || die "Porta WireGuard non valida: $WIREGUARD_PORT"
}

require_root() {
    [[ $EUID -eq 0 ]] && return 0
    command -v sudo >/dev/null 2>&1 || die "Esegui come root."
    exec sudo -E bash "$0" "$@"
}

wait_dpkg_lock() {
    local lf="/var/lib/dpkg/lock-frontend" ld="/var/lib/dpkg/lock" waited=0
    while fuser "$lf" "$ld" >/dev/null 2>&1; do
        [[ $waited -eq 0 ]] && warn "Lock dpkg occupato da altro processo. In attesa..."
        sleep 2; waited=$((waited + 2))
        [[ $waited -gt 180 ]] && die "Timeout lock dpkg superato (3m). Riprova piu tardi."
    done
    [[ $waited -gt 0 ]] && log "Lock gestore pacchetti rilasciato (${waited}s)"
}

detect_pkg() {
    for c in apt-get dnf yum pacman zypper apk; do
        if command -v "$c" >/dev/null 2>&1; then PKG="$c"; return 0; fi
    done
    die "Nessun gestore pacchetti supportato (apt/dnf/yum/pacman/zypper/apk)."
}

pkg_refresh() {
    wait_dpkg_lock; substep "Aggiornamento indici repository ($PKG)..."
    case "$PKG" in
        apt-get) DEBIAN_FRONTEND=noninteractive apt-get update -o Acquire::Retries=3 -qq ;;
        pacman) pacman -Sy --noconfirm >/dev/null ;;
        apk) apk update >/dev/null ;;
        *) : ;;
    esac
}

pkg_stream_apt() {
    local tmp_out; tmp_out="$(mktemp)"; set +e
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends -o Acquire::Retries=3 "$@" 2>&1 | tee "$tmp_out" | while IFS= read -r line; do
        if [[ "$line" =~ ^(Unpacking|Preparing|Setting up|Processing triggers) ]]; then
            printf "[K  ${C_DIM}[dpkg]${C_RST} %s" "${line:0:72}"
        fi
    done
    local code=${PIPESTATUS[0]}; printf "[K"; set -e
    if [[ $code -ne 0 ]]; then
        substep "Tentativo di recupero con --fix-missing..."
        DEBIAN_FRONTEND=noninteractive apt-get install -y --fix-missing -o Acquire::Retries=3 "$@" || {
            tail -n 12 "$tmp_out" >&2; rm -f "$tmp_out"; return 1
        }
    fi
    rm -f "$tmp_out"; return 0
}

pkg_install() {
    [[ $# -eq 0 ]] && return 0
    wait_dpkg_lock; substep "Installazione: $*"
    case "$PKG" in
        apt-get) pkg_stream_apt "$@" ;;
        dnf|yum) dnf install -y -q "$@" 2>/dev/null || yum install -y -q "$@" ;;
        pacman) pacman -S --needed --noconfirm "$@" ;;
        zypper) zypper --non-interactive install -y "$@" ;;
        apk) apk add --no-cache "$@" ;;
    esac
}

pkg_try() {
    for cand in "$@"; do
        if pkg_install "$cand" 2>/dev/null; then return 0; fi
    done
    return 1
}

install_base_packages() {
    pkg_refresh
    case "$PKG" in
        apt-get) pkg_install ca-certificates curl git xz-utils python3 python3-pip python3-venv build-essential procps iproute2 sudo dbus systemd || true ;;
        dnf|yum) pkg_install ca-certificates curl git xz python3 python3-pip gcc-c++ make iproute sudo dbus systemd || true ;;
        pacman) pkg_install ca-certificates curl git xz python python-pip base-devel iproute2 sudo dbus systemd || true ;;
        zypper) pkg_install ca-certificates curl git xz python3 python3-pip gcc-c++ make iproute2 sudo dbus systemd || true ;;
        apk) pkg_install ca-certificates curl git xz python3 py3-pip build-base iproute2 bash sudo dbus || true ;;
    esac
    pkg_try ffmpeg ffmpeg-free || substep "ffmpeg gestito automaticamente al primo avvio."
}

node_major() { "$1" -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0; }

install_node() {
    if command -v node >/dev/null 2>&1 && [[ "$(node_major node)" -ge "$NODE_MIN_MAJOR" ]]; then
        command -v npm >/dev/null 2>&1 || pkg_try npm || true
        if command -v npm >/dev/null 2>&1; then
            NODE_BIN="$(command -v node)"; NPM_BIN="$(command -v npm)"
            substep "Node.js attivo: $($NODE_BIN -v)"; return 0
        fi
    fi
    local arch
    case "$(uname -m)" in
        x86_64|amd64) arch="x64" ;;
        aarch64|arm64) arch="arm64" ;;
        armv7l) arch="armv7l" ;;
        *) die "Architettura CPU non supportata da Node.js: $(uname -m)" ;;
    esac
    local base="https://nodejs.org/dist/latest-${NODE_SERIES}"
    local tarball; tarball="$(curl -fsSL "$base/" | grep -o "node-v[0-9.]*-linux-${arch}\.tar\.xz" | head -n1)"
    [[ -n "$tarball" ]] || die "Impossibile determinare pacchetto Node.js per ${arch}."
    substep "Download tarball ufficiale: ${tarball}"
    local target="/usr/local/lib/argus-node"
    rm -rf "$target"; mkdir -p "$target"
    curl -# -fSL "${base}/${tarball}" | tar -xJ -C "$target" --strip-components=1
    NODE_BIN="${target}/bin/node"; NPM_BIN="${target}/bin/npm"
    ln -sf "${target}/bin/node" /usr/local/bin/node
    ln -sf "${target}/bin/npm" /usr/local/bin/npm
    ln -sf "${target}/bin/npx" /usr/local/bin/npx
    [[ "$(node_major "$NODE_BIN")" -ge "$NODE_MIN_MAJOR" ]] || die "Installazione Node.js fallita."
    substep "Node.js pronto: $($NODE_BIN -v)"
}

resolve_ref() {
    [[ -n "$REF" ]] && return 0
    REF="$(git -C "$INSTALL_DIR" tag --list 'v*' --sort=-v:refname 2>/dev/null | head -n1 || true)"
    [[ -n "$REF" ]] || REF="main"
}

fetch_sources() {
    if [[ -d "$INSTALL_DIR/.git" ]]; then
        substep "Aggiornamento sorgenti in $INSTALL_DIR..."
        git config --global --add safe.directory "$INSTALL_DIR" || true
        git -C "$INSTALL_DIR" remote set-url origin "$REPO_URL"
        git -C "$INSTALL_DIR" fetch --tags --prune --quiet origin
    else
        substep "Clonazione repository $REPO_URL..."
        rm -rf "$INSTALL_DIR"; git clone --quiet "$REPO_URL" "$INSTALL_DIR"
        git config --global --add safe.directory "$INSTALL_DIR" || true
    fi
    resolve_ref
    substep "Checkout release ${REF}"
    git -C "$INSTALL_DIR" -c advice.detachedHead=false checkout --quiet --force "$REF"
    substep "Installazione moduli npm (better-sqlite3, ws)..."
    ( cd "$INSTALL_DIR" && "$NPM_BIN" install --omit=dev --no-audit --no-fund --loglevel=error )
}

create_users() {
    id -u "$SERVICE_USER" >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin "$SERVICE_USER"
    mkdir -p "$DATA_DIR" "$DATA_DIR/media" "$DATA_DIR/models" "$DATA_DIR/vision" "$(dirname "$ENV_FILE")"
    chown -R "$SERVICE_USER":"$SERVICE_USER" "$DATA_DIR"; chmod 750 "$DATA_DIR"
}

write_environment() {
    substep "Parametri di esecuzione scritti in ${ENV_FILE}"
    printf 'NODE_ENV=production
ARGUS_HOST=0.0.0.0
ARGUS_PORT=%s
ARGUS_HTTP_PORT=%s
ARGUS_DATA_DIR=%s
ARGUS_MEDIA_DIR=%s/media
ARGUS_LOG_LEVEL=info
ARGUS_PUBLIC_ACCESS=%s
ARGUS_PUBLIC_HOSTS=%s
ARGUS_TRUSTED_NETWORKS=%s
' "$PORT" "$HTTP_PORT" "$DATA_DIR" "$DATA_DIR" "$PUBLIC_ACCESS" "$PUBLIC_HOSTS" "$TRUSTED_NETS" > "$ENV_FILE"
    chmod 640 "$ENV_FILE"; chown root:"$SERVICE_USER" "$ENV_FILE"
}

setup_vision() {
    local venv_dir="${DATA_DIR}/vision/venv"
    if [[ ! -d "$venv_dir" ]]; then
        substep "Creazione venv Python (${venv_dir})..."
        python3 -m venv "$venv_dir" || true
    fi
    if [[ -x "${venv_dir}/bin/pip" && -f "${INSTALL_DIR}/vision/requirements.txt" ]]; then
        substep "Verifica runtime di inferenza e computer vision..."
        "${venv_dir}/bin/pip" install --quiet --upgrade pip || true
        "${venv_dir}/bin/pip" install --quiet -r "${INSTALL_DIR}/vision/requirements.txt" || true
    fi
    if [[ -f "${INSTALL_DIR}/bin/argus.js" ]]; then
        substep "Verifica integrita e provisioning modelli neurali..."
        ( cd "$INSTALL_DIR" && "$NODE_BIN" -e "
            import { ensureModels, loadCatalog } from './src/features/vision/vision_provision.js';
            const catalog = loadCatalog('./vision/models_catalog.json');
            const results = await ensureModels(null, '${DATA_DIR}/models', { catalog, root: process.cwd() });
            for (const r of results) console.log('    • ' + r.name + ': ' + r.status + (r.error ? ' (' + r.error + ')' : ''));
        " ) || true
    fi
    chown -R "$SERVICE_USER":"$SERVICE_USER" "${DATA_DIR}/vision" "${DATA_DIR}/models"
}

has_display_hardware() {
    [[ -e /dev/dri/card0 || -e /dev/fb0 ]] && return 0
    compgen -G "/sys/class/drm/card*" >/dev/null && return 0
    return 1
}

in_container() {
    [[ -f /.dockerenv ]] && return 0
    grep -qaE 'docker|lxc|containerd' /proc/1/cgroup 2>/dev/null && return 0
    return 1
}

want_kiosk() {
    case "$KIOSK_MODE" in
        yes) return 0 ;;
        no) return 1 ;;
        *) ! in_container && has_display_hardware ;;
    esac
}

install_display_stack() {
    substep "Installazione stack grafico X11 e utilita display..."
    case "$PKG" in
        apt-get)
            pkg_install xserver-xorg xserver-xorg-legacy xinit x11-xserver-utils matchbox-window-manager unclutter fonts-dejavu-core || true
            pkg_try libgl1-mesa-dri mesa-va-drivers mesa-vulkan-drivers intel-media-va-driver va-driver-all libva-drm2 || true ;;
        dnf|yum)
            pkg_install xorg-x11-server-Xorg xorg-x11-xinit xorg-x11-server-utils matchbox-window-manager unclutter dejavu-sans-fonts || true
            pkg_try mesa-dri-drivers libva-intel-driver || true ;;
        pacman)
            pkg_install xorg-server xorg-xinit xorg-xset xorg-xsetroot matchbox-window-manager unclutter ttf-dejavu || true
            pkg_try mesa libva-mesa-driver intel-media-driver || true ;;
        zypper)
            pkg_install xorg-x11-server xinit xorg-x11-essentials matchbox-window-manager unclutter dejavu-fonts || true
            pkg_try Mesa-dri libva-intel-driver || true ;;
        apk)
            pkg_install xorg-server xinit xset xsetroot matchbox-window-manager unclutter font-dejavu || true
            pkg_try mesa-dri-gallium || true ;;
    esac
}

resolve_browser() {
    for cand in chromium chromium-browser google-chrome-stable firefox-esr firefox; do
        if command -v "$cand" >/dev/null 2>&1; then BROWSER_BIN="$(command -v "$cand")"; return 0; fi
    done
    substep "Ricerca e download browser kiosk..."
    pkg_try chromium chromium-browser firefox-esr firefox || true
    for cand in chromium chromium-browser firefox-esr firefox; do
        if command -v "$cand" >/dev/null 2>&1; then BROWSER_BIN="$(command -v "$cand")"; return 0; fi
    done
    return 1
}

install_kiosk() {
    install_display_stack
    if ! resolve_browser; then
        warn "Nessun browser web disponibile per X11. Kiosk disattivato."; return 0
    fi
    substep "Browser muro video: ${BROWSER_BIN}"
    id -u "$KIOSK_USER" >/dev/null 2>&1 || useradd --system --home-dir "$KIOSK_HOME" --create-home --shell /bin/bash "$KIOSK_USER"
    for grp in video input render tty; do
        getent group "$grp" >/dev/null 2>&1 && usermod -aG "$grp" "$KIOSK_USER" || true
    done
    mkdir -p "$KIOSK_HOME"; chown -R "$KIOSK_USER":"$KIOSK_USER" "$KIOSK_HOME"
    pkg_try libnss3-tools nss-tools mozilla-nss-tools || true
    [[ -d /etc/X11 ]] && printf 'allowed_users=anybody\nneeds_root_rights=yes\n' > /etc/X11/Xwrapper.config
    mkdir -p "$HELPER_DIR"
    install -m 0755 "${INSTALL_DIR}/deploy/linux/kiosk-session.sh" "${HELPER_DIR}/kiosk-session.sh"

    printf '[Unit]
Description=ARGUS-PR Kiosk Wall
After=argus-pr.service systemd-user-sessions.service
Wants=argus-pr.service
Conflicts=getty@tty1.service
[Service]
Type=simple
User=%s
PAMName=login
TTYPath=/dev/tty1
TTYReset=yes
TTYVHangup=yes
StandardInput=tty
StandardOutput=journal
StandardError=journal
Environment=HOME=%s
Environment=ARGUS_WALL_URL=https://127.0.0.1:%s/wall
Environment=ARGUS_CA_FILE=%s/secrets/pki/ca.crt
Environment=ARGUS_BROWSER=%s
ExecStart=%s/kiosk-session.sh
Restart=always
RestartSec=5
[Install]
WantedBy=multi-user.target
' "$KIOSK_USER" "$KIOSK_HOME" "$PORT" "$DATA_DIR" "$BROWSER_BIN" "$HELPER_DIR" > /etc/systemd/system/argus-pr-kiosk.service

    systemctl daemon-reload
    systemctl disable --now getty@tty1.service >/dev/null 2>&1 || true
    systemctl enable --now argus-pr-kiosk.service
    substep "Servizio argus-pr-kiosk.service abilitato su tty1"
}

write_service() {
    mkdir -p "${INSTALL_DIR}/vendor" "$HELPER_DIR"
    chown -R "$SERVICE_USER":"$SERVICE_USER" "${INSTALL_DIR}/vendor"
    install -m 0755 "${INSTALL_DIR}/deploy/linux/pre-start.sh" "${HELPER_DIR}/pre-start.sh"

    printf '[Unit]
Description=ARGUS-PR Network Video Recorder
Documentation=https://github.com/AprileNunzio/ARGUS-PR
After=network-online.target
Wants=network-online.target
[Service]
Type=simple
User=%s
Group=%s
WorkingDirectory=%s
EnvironmentFile=%s
Environment=ARGUS_INSTALL_DIR=%s
Environment=ARGUS_SERVICE_USER=%s
Environment=ARGUS_NODE_BIN=%s
Environment=ARGUS_NPM_BIN=%s
Environment="PATH=%s/vision/venv/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
ExecStartPre=+%s/pre-start.sh
ExecStart=%s %s/bin/argus.js serve
Restart=always
RestartSec=5
SuccessExitStatus=75
KillSignal=SIGTERM
TimeoutStopSec=20
PrivateTmp=true
MemoryDenyWriteExecute=false
PrivateDevices=false
StandardOutput=journal
StandardError=journal
SyslogIdentifier=argus-pr
[Install]
WantedBy=multi-user.target
' "$SERVICE_USER" "$SERVICE_USER" "$INSTALL_DIR" "$ENV_FILE" "$INSTALL_DIR" "$SERVICE_USER" "$NODE_BIN" "$NPM_BIN" "$DATA_DIR" "$HELPER_DIR" "$NODE_BIN" "$INSTALL_DIR" > /etc/systemd/system/argus-pr.service

    systemctl daemon-reload
    systemctl enable --now argus-pr.service
    substep "Servizio argus-pr.service abilitato ed avviato"
}

want_shield() {
    case "$SHIELD_MODE" in
        yes) return 0 ;;
        no) return 1 ;;
        *) command -v nft >/dev/null 2>&1 || pkg_try nftables >/dev/null 2>&1; command -v nft >/dev/null 2>&1 ;;
    esac
}

open_firewall() {
    if want_shield; then
        command -v ufw >/dev/null 2>&1 && ufw --force disable >/dev/null 2>&1 || true
        systemctl disable --now firewalld >/dev/null 2>&1 || true
        return 0
    fi
    if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q "Status: active"; then
        ufw allow "${PORT}/tcp" >/dev/null 2>&1 || true
        [[ "$HTTP_PORT" != "0" ]] && ufw allow "${HTTP_PORT}/tcp" >/dev/null 2>&1 || true
    elif command -v firewall-cmd >/dev/null 2>&1 && firewall-cmd --state >/dev/null 2>&1; then
        firewall-cmd --permanent --add-port="${PORT}/tcp" >/dev/null 2>&1 || true
        [[ "$HTTP_PORT" != "0" ]] && firewall-cmd --permanent --add-port="${HTTP_PORT}/tcp" >/dev/null 2>&1 || true
        firewall-cmd --reload >/dev/null 2>&1 || true
    fi
}

install_shield() {
    pkg_try nftables || true
    command -v nft >/dev/null 2>&1 || { warn "nftables non disponibile: ARGUS-SHIELD omesso."; return 0; }
    mkdir -p "$SHIELD_DIR" "$SHIELD_STATE_DIR" "$(dirname "$SHIELD_CONFIG")"
    cp -r "${INSTALL_DIR}/shield/." "$SHIELD_DIR/"
    chmod 0755 "${SHIELD_DIR}/bin/argus-shield.js"
    chmod 0700 "$SHIELD_STATE_DIR"

    local pub_ports="${PORT}" lan_extra=""
    [[ "$HTTP_PORT" != "0" ]] && pub_ports="${pub_ports}, ${HTTP_PORT}"
    if [[ -n "$TRUSTED_NETS" ]]; then
        lan_extra="$(printf '%s' "$TRUSTED_NETS" | awk -F, '{for (i = 1; i <= NF; i++) printf ", \"%s\"", $i}')"
    fi

    printf '{
  "httpsPort": %d,
  "httpPort": %d,
  "publicPorts": [%s],
  "localOnlyPorts": [22],
  "wireguardPort": %d,
  "lanNetworks": ["10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "169.254.0.0/16", "127.0.0.0/8", "fc00::/7", "fe80::/10", "::1/128"%s],
  "allowlist": [],
  "eventsFile": "%s/security-events.jsonl",
  "stateDir": "%s"
}
' "$PORT" "$HTTP_PORT" "$pub_ports" "$WIREGUARD_PORT" "$lan_extra" "$DATA_DIR" "$SHIELD_STATE_DIR" > "$SHIELD_CONFIG"
    chmod 0640 "$SHIELD_CONFIG"

    printf '[Unit]
Description=ARGUS-SHIELD perimeter firewall and intrusion response
Documentation=https://github.com/AprileNunzio/ARGUS-PR
After=network-pre.target
Wants=network-pre.target
Before=argus-pr.service
[Service]
Type=simple
User=root
WorkingDirectory=%s
Environment=ARGUS_SHIELD_CONFIG=%s
ExecStart=%s %s/bin/argus-shield.js watch
Restart=always
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ProtectKernelModules=true
ProtectControlGroups=true
RestrictSUIDSGID=true
RestrictRealtime=true
LockPersonality=true
ReadWritePaths=%s
CapabilityBoundingSet=CAP_NET_ADMIN CAP_NET_RAW
AmbientCapabilities=CAP_NET_ADMIN CAP_NET_RAW
StandardOutput=journal
StandardError=journal
SyslogIdentifier=argus-shield
[Install]
WantedBy=multi-user.target
' "$SHIELD_DIR" "$SHIELD_CONFIG" "$NODE_BIN" "$SHIELD_DIR" "$SHIELD_STATE_DIR" > /etc/systemd/system/argus-shield.service

    systemctl daemon-reload
    systemctl enable --now argus-shield.service
    sleep 1
    if systemctl is-active --quiet argus-shield.service; then
        substep "ARGUS-SHIELD attivo: protezione nftables perimetrale online"
    fi
}

summary() {
    local address kiosk_state p_suffix fingerprint shield_state
    address="$(primary_address)"; [[ -n "$address" ]] || address="127.0.0.1"
    if systemctl is-active --quiet argus-pr-kiosk.service 2>/dev/null; then
        kiosk_state="ONLINE (schermo intero HDMI)"
    elif [[ -n "$BROWSER_BIN" ]]; then
        kiosk_state="CONFIGURATO (avvio in corso)"
    else
        kiosk_state="NON RICHIESTO"
    fi
    p_suffix=""; [[ "$PORT" != "443" ]] && p_suffix=":${PORT}"
    fingerprint="$(cd "$INSTALL_DIR" && ARGUS_DATA_DIR="$DATA_DIR" "$NODE_BIN" bin/argus.js cert 2>/dev/null | awk '/Impronta/ { print $2 }')"
    [[ -n "$fingerprint" ]] || fingerprint="esegui: argus cert"
    if systemctl is-active --quiet argus-shield.service 2>/dev/null; then
        shield_state="ATTIVO (nftables autonomo)"
    else
        shield_state="NON ATTIVO"
    fi

    cat <<SUMEOF

[1;32m==============================================================================[0m
[1;36m       ARGUS-PR APPLIANCE OPERATIVA — INSTALLAZIONE COMPLETATA CON SUCCESSO   [0m
[1;32m==============================================================================[0m

  [1mURL Console Web:[0m        [1;32mhttps://${address}${p_suffix}[0m
  [1mImpronta TLS SHA-256:[0m   [1;33m${fingerprint}[0m
  [1mCertificato CA:[0m         ${DATA_DIR}/secrets/pki/ca.crt
  [1mFirewall SHIELD:[0m        ${shield_state}
  [1mMuro Video HDMI:[0m        ${kiosk_state}
  [1mVersione Eseguita:[0m      ${REF}
  [1mDirectory Servizio:[0m     ${INSTALL_DIR}
  [1mArchivio Registrazioni:[0m ${DATA_DIR}/media

[1;34m------------------------------------------------------------------------------[0m
  [1mPRIMO ACCESSO:[0m Apri il browser all'indirizzo sopra indicato per configurare
  l'account amministratore e iniziare ad acquisire flussi video dalle telecamere.
[1;34m------------------------------------------------------------------------------[0m
  [2mComandi rapidi per gestione ed ispezione:[0m
    • systemctl status argus-pr
    • journalctl -u argus-pr -f
    • argus-shield status
    • systemctl status argus-pr-kiosk

SUMEOF
}

main() {
    parse_args "$@"
    require_root "$@"
    show_banner
    show_system_specs
    phase 1 8 12 "Rilevamento e verifica gestore pacchetti"
    detect_pkg
    substep "Gestore pacchetti identificato: ${PKG}"
    phase 2 8 25 "Installazione librerie di sistema e compilatori nativi"
    install_base_packages
    phase 3 8 37 "Verifica e predisposizione runtime Node.js LTS"
    install_node
    phase 4 8 50 "Download sorgente ARGUS-PR e moduli applicativi"
    create_users
    fetch_sources
    phase 5 8 62 "Configurazione ambiente operativo, AI e modelli ONNX"
    write_environment
    setup_vision
    phase 6 8 75 "Configurazione stack grafico locale HDMI (Kiosk)"
    if want_kiosk; then install_kiosk; else substep "Muro video locale non richiesto o display assente"; fi
    phase 7 8 87 "Registrazione e avvio del demone di sistema ARGUS-PR"
    write_service
    phase 8 8 100 "Attivazione ARGUS-SHIELD e perimetro di sicurezza"
    open_firewall
    if want_shield; then install_shield; else substep "ARGUS-SHIELD non richiesto"; fi
    summary
}

main "$@"
