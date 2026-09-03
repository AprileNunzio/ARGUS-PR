#!/usr/bin/env bash
set -euo pipefail

REPO_URL="${ARGUS_REPO_URL:-https://github.com/AprileNunzio/ARGUS-PR.git}"
INSTALL_DIR="${ARGUS_INSTALL_DIR:-/opt/argus-pr}"
DATA_DIR="${ARGUS_DATA_DIR:-/var/lib/argus-pr}"
ENV_FILE="${ARGUS_ENV_FILE:-/etc/argus-pr/argus.env}"
SERVICE_USER="${ARGUS_SERVICE_USER:-argus}"
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

PKG=""
BROWSER_BIN=""
NODE_BIN=""
NPM_BIN=""

log()  { printf '\033[1;36m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m!!\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31mXX\033[0m %s\n' "$*" >&2; exit 1; }

usage() {
    cat <<'USAGE'
ARGUS-PR autoinstaller

  sudo bash autoinstaller.sh [opzioni]

Opzioni:
  --port <n>        Porta HTTPS del NVR (default 443)
  --http-port <n>   Porta del solo redirect verso HTTPS (default 80, 0 disabilita)
  --dir <path>      Directory di installazione (default /opt/argus-pr)
  --data <path>     Directory dati e registrazioni (default /var/lib/argus-pr)
  --ref <tag>       Tag o branch da installare (default: ultima release)
  --public          Consente la sola visione delle telecamere da internet
  --public-host <h> Nome DNS pubblico da inserire nel certificato (ripetibile)
  --trusted-net <c> Rete aggiuntiva trattata come locale, es. 10.8.0.0/24 (ripetibile)
  --wireguard <n>   Porta UDP di WireGuard da aprire sul firewall
  --kiosk           Forza il muro video a schermo intero sul monitor collegato
  --no-kiosk        Installa solo il servizio, nessuna interfaccia locale
  --no-shield       Non installa ARGUS-SHIELD, il firewall perimetrale
  --help            Mostra questo messaggio

Nessuna domanda viene posta: l'installazione e' completamente automatica.
USAGE
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
            *) die "Opzione sconosciuta: $1 (usa --help)" ;;
        esac
    done
    [[ "$PORT" =~ ^[0-9]+$ ]] || die "Porta non valida: $PORT"
    [[ "$HTTP_PORT" =~ ^[0-9]+$ ]] || die "Porta redirect non valida: $HTTP_PORT"
    [[ "$WIREGUARD_PORT" =~ ^[0-9]+$ ]] || die "Porta WireGuard non valida: $WIREGUARD_PORT"
}

require_root() {
    [[ $EUID -eq 0 ]] && return 0
    command -v sudo >/dev/null 2>&1 || die "Esegui come root."
    log "Elevazione privilegi con sudo"
    exec sudo -E bash "$0" "$@"
}

detect_pkg() {
    for candidate in apt-get dnf yum pacman zypper apk; do
        if command -v "$candidate" >/dev/null 2>&1; then PKG="$candidate"; return 0; fi
    done
    die "Nessun gestore pacchetti supportato (apt/dnf/yum/pacman/zypper/apk)."
}

pkg_refresh() {
    case "$PKG" in
        apt-get) DEBIAN_FRONTEND=noninteractive apt-get update -qq ;;
        pacman) pacman -Sy --noconfirm >/dev/null ;;
        apk) apk update >/dev/null ;;
        *) : ;;
    esac
}

pkg_install() {
    [[ $# -eq 0 ]] && return 0
    case "$PKG" in
        apt-get) DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends "$@" >/dev/null ;;
        dnf) dnf install -y -q "$@" >/dev/null ;;
        yum) yum install -y -q "$@" >/dev/null ;;
        pacman) pacman -S --needed --noconfirm "$@" >/dev/null ;;
        zypper) zypper --non-interactive install -y "$@" >/dev/null ;;
        apk) apk add --no-cache "$@" >/dev/null ;;
    esac
}

pkg_try() {
    for candidate in "$@"; do
        if pkg_install "$candidate" 2>/dev/null; then return 0; fi
    done
    return 1
}

install_base_packages() {
    log "Installazione prerequisiti di sistema"
    pkg_refresh
    case "$PKG" in
        apt-get) pkg_install ca-certificates curl git xz-utils python3 python3-pip python3-venv build-essential procps iproute2 || true ;;
        dnf|yum) pkg_install ca-certificates curl git xz python3 python3-pip gcc-c++ make iproute || true ;;
        pacman) pkg_install ca-certificates curl git xz python python-pip base-devel iproute2 || true ;;
        zypper) pkg_install ca-certificates curl git xz python3 python3-pip gcc-c++ make iproute2 || true ;;
        apk) pkg_install ca-certificates curl git xz python3 py3-pip build-base iproute2 bash || true ;;
    esac
    pkg_try ffmpeg ffmpeg-free || warn "ffmpeg assente nei repository: ARGUS-PR lo scarichera' da solo al primo avvio."
}


node_major() { "$1" -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0; }

install_node() {
    if command -v node >/dev/null 2>&1 && [[ "$(node_major node)" -ge "$NODE_MIN_MAJOR" ]]; then
        command -v npm >/dev/null 2>&1 || pkg_try npm || true
        if command -v npm >/dev/null 2>&1; then
            NODE_BIN="$(command -v node)"
            NPM_BIN="$(command -v npm)"
            log "Node.js gia' presente: $("$NODE_BIN" -v)"
            return 0
        fi
    fi

    local arch
    case "$(uname -m)" in
        x86_64|amd64) arch="x64" ;;
        aarch64|arm64) arch="arm64" ;;
        armv7l) arch="armv7l" ;;
        ppc64le) arch="ppc64le" ;;
        s390x) arch="s390x" ;;
        *) die "Architettura non supportata da Node.js: $(uname -m)" ;;
    esac

    local base="https://nodejs.org/dist/latest-${NODE_SERIES}"
    local tarball
    tarball="$(curl -fsSL "$base/" | grep -o "node-v[0-9.]*-linux-${arch}\.tar\.xz" | head -n1)"
    [[ -n "$tarball" ]] || die "Impossibile determinare la build Node.js per ${arch}."

    log "Installazione Node.js: ${tarball}"
    local target="/usr/local/lib/argus-node"
    rm -rf "$target"
    mkdir -p "$target"
    curl -fsSL "${base}/${tarball}" | tar -xJ -C "$target" --strip-components=1

    NODE_BIN="${target}/bin/node"
    NPM_BIN="${target}/bin/npm"
    ln -sf "${target}/bin/node" /usr/local/bin/node
    ln -sf "${target}/bin/npm" /usr/local/bin/npm
    ln -sf "${target}/bin/npx" /usr/local/bin/npx

    [[ "$(node_major "$NODE_BIN")" -ge "$NODE_MIN_MAJOR" ]] || die "Installazione Node.js fallita."
}

resolve_ref() {
    [[ -n "$REF" ]] && return 0
    REF="$(git -C "$INSTALL_DIR" tag --list 'v*' --sort=-v:refname | head -n1 || true)"
    [[ -n "$REF" ]] || REF="main"
}

fetch_sources() {
    log "Download del codice sorgente"
    if [[ -d "$INSTALL_DIR/.git" ]]; then
        git config --global --add safe.directory "$INSTALL_DIR" || true
        git -C "$INSTALL_DIR" remote set-url origin "$REPO_URL"
        git -C "$INSTALL_DIR" fetch --tags --prune --quiet origin
    else
        rm -rf "$INSTALL_DIR"
        git clone --quiet "$REPO_URL" "$INSTALL_DIR"
        git config --global --add safe.directory "$INSTALL_DIR" || true
    fi

    resolve_ref
    log "Versione selezionata: ${REF}"
    git -C "$INSTALL_DIR" -c advice.detachedHead=false checkout --quiet --force "$REF"

    log "Installazione dipendenze applicative"
    ( cd "$INSTALL_DIR" && "$NPM_BIN" install --omit=dev --no-audit --no-fund --loglevel=error )
}

create_users() {
    id -u "$SERVICE_USER" >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin "$SERVICE_USER"
    mkdir -p "$DATA_DIR" "$DATA_DIR/media" "$(dirname "$ENV_FILE")"
    chown -R "$SERVICE_USER":"$SERVICE_USER" "$DATA_DIR"
    chmod 750 "$DATA_DIR"
}

write_environment() {
    log "Configurazione ambiente in ${ENV_FILE}"
    cat > "$ENV_FILE" <<ENVEOF
NODE_ENV=production
ARGUS_HOST=0.0.0.0
ARGUS_PORT=${PORT}
ARGUS_HTTP_PORT=${HTTP_PORT}
ARGUS_DATA_DIR=${DATA_DIR}
ARGUS_MEDIA_DIR=${DATA_DIR}/media
ARGUS_LOG_LEVEL=info
ARGUS_PUBLIC_ACCESS=${PUBLIC_ACCESS}
ARGUS_PUBLIC_HOSTS=${PUBLIC_HOSTS}
ARGUS_TRUSTED_NETWORKS=${TRUSTED_NETS}
ENVEOF
    chmod 640 "$ENV_FILE"
    chown root:"$SERVICE_USER" "$ENV_FILE"
}

setup_vision() {
    log "Configurazione ambiente di visione artificiale e AI"
    local venv_dir="${DATA_DIR}/vision/venv"
    mkdir -p "${DATA_DIR}/vision" "${DATA_DIR}/models"

    if [[ ! -d "$venv_dir" ]]; then
        python3 -m venv "$venv_dir" || true
    fi

    if [[ -x "${venv_dir}/bin/pip" && -f "${INSTALL_DIR}/vision/requirements.txt" ]]; then
        "${venv_dir}/bin/pip" install --quiet --upgrade pip || true
        "${venv_dir}/bin/pip" install --quiet -r "${INSTALL_DIR}/vision/requirements.txt" || true
    fi

    if [[ -f "${INSTALL_DIR}/bin/argus.js" ]]; then
        ( cd "$INSTALL_DIR" && "$NODE_BIN" -e "
            import { ensureModel, loadCatalog } from './src/features/vision/vision_provision.js';
            const cat = loadCatalog('./vision/models_catalog.json');
            for (const m of cat.models) {
                ensureModel(m, '${DATA_DIR}/models').then(r => console.log('Modello ' + r.name + ': ' + r.status)).catch(e => console.warn(e.message));
            }
        " ) || true
    fi

    chown -R "$SERVICE_USER":"$SERVICE_USER" "${DATA_DIR}/vision" "${DATA_DIR}/models"
}

write_service() {
    log "Registrazione servizio systemd"
    mkdir -p "${INSTALL_DIR}/vendor" "$HELPER_DIR"
    chown -R "$SERVICE_USER":"$SERVICE_USER" "${INSTALL_DIR}/vendor"
    install -m 0755 "${INSTALL_DIR}/deploy/linux/pre-start.sh" "${HELPER_DIR}/pre-start.sh"

    cat > /etc/systemd/system/argus-pr.service <<UNITEOF
[Unit]
Description=ARGUS-PR Network Video Recorder
Documentation=https://github.com/AprileNunzio/ARGUS-PR
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${SERVICE_USER}
Group=${SERVICE_USER}
WorkingDirectory=${INSTALL_DIR}
EnvironmentFile=${ENV_FILE}
Environment=ARGUS_INSTALL_DIR=${INSTALL_DIR}
Environment=ARGUS_SERVICE_USER=${SERVICE_USER}
Environment=ARGUS_NODE_BIN=${NODE_BIN}
Environment=ARGUS_NPM_BIN=${NPM_BIN}
Environment="PATH=${DATA_DIR}/vision/venv/bin:/usr/local/bin:/usr/bin:/bin"
ExecStartPre=+${HELPER_DIR}/pre-start.sh
ExecStart=${NODE_BIN} ${INSTALL_DIR}/bin/argus.js serve
Restart=always
RestartSec=5
SuccessExitStatus=75
KillSignal=SIGTERM
TimeoutStopSec=20


NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
RestrictSUIDSGID=true
RestrictRealtime=true
LockPersonality=true
ReadWritePaths=${DATA_DIR} ${INSTALL_DIR}/vendor
CapabilityBoundingSet=CAP_NET_BIND_SERVICE
AmbientCapabilities=CAP_NET_BIND_SERVICE
RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX AF_NETLINK
SystemCallArchitectures=native
MemoryDenyWriteExecute=false
PrivateDevices=false
ProtectClock=true
ProtectHostname=true
ProtectProc=invisible
RemoveIPC=true
UMask=0027

StandardOutput=journal
StandardError=journal
SyslogIdentifier=argus-pr

[Install]
WantedBy=multi-user.target
UNITEOF

    systemctl daemon-reload
    systemctl enable --now argus-pr.service
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
        log "Firewall gestito da ARGUS-SHIELD, gestori esterni disattivati"
        if command -v ufw >/dev/null 2>&1; then ufw --force disable >/dev/null 2>&1 || true; fi
        systemctl disable --now firewalld >/dev/null 2>&1 || true
        return 0
    fi

    if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q "Status: active"; then
        ufw allow "${PORT}/tcp" >/dev/null 2>&1 || true
        [[ "$HTTP_PORT" != "0" ]] && ufw allow "${HTTP_PORT}/tcp" >/dev/null 2>&1 || true
        log "Porte ${PORT}/tcp e ${HTTP_PORT}/tcp aperte su ufw"
    elif command -v firewall-cmd >/dev/null 2>&1 && firewall-cmd --state >/dev/null 2>&1; then
        firewall-cmd --permanent --add-port="${PORT}/tcp" >/dev/null 2>&1 || true
        [[ "$HTTP_PORT" != "0" ]] && firewall-cmd --permanent --add-port="${HTTP_PORT}/tcp" >/dev/null 2>&1 || true
        firewall-cmd --reload >/dev/null 2>&1 || true
        log "Porte aperte su firewalld"
    fi
}

install_shield() {
    log "Installazione ARGUS-SHIELD, firewall perimetrale indipendente"

    pkg_try nftables || true
    command -v nft >/dev/null 2>&1 || { warn "nftables non disponibile: ARGUS-SHIELD non installato"; return 0; }

    mkdir -p "$SHIELD_DIR" "$SHIELD_STATE_DIR" "$(dirname "$SHIELD_CONFIG")"
    cp -r "${INSTALL_DIR}/shield/." "$SHIELD_DIR/"
    chmod 0755 "${SHIELD_DIR}/bin/argus-shield.js"
    chmod 0700 "$SHIELD_STATE_DIR"

    local public_ports lan_extra
    public_ports="${PORT}"
    [[ "$HTTP_PORT" != "0" ]] && public_ports="${public_ports}, ${HTTP_PORT}"

    lan_extra=""
    if [[ -n "$TRUSTED_NETS" ]]; then
        lan_extra="$(printf '%s' "$TRUSTED_NETS" | awk -F, '{for (i = 1; i <= NF; i++) printf ", \"%s\"", $i}')"
    fi

    cat > "$SHIELD_CONFIG" <<SHIELDEOF
{
    "httpsPort": ${PORT},
    "httpPort": ${HTTP_PORT},
    "publicPorts": [${public_ports}],
    "localOnlyPorts": [22],
    "wireguardPort": ${WIREGUARD_PORT},
    "lanNetworks": ["10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "169.254.0.0/16", "127.0.0.0/8", "fc00::/7", "fe80::/10", "::1/128"${lan_extra}],
    "allowlist": [],
    "eventsFile": "${DATA_DIR}/security-events.jsonl",
    "stateDir": "${SHIELD_STATE_DIR}"
}
SHIELDEOF
    chmod 0640 "$SHIELD_CONFIG"

    cat > /etc/systemd/system/argus-shield.service <<UNITEOF
[Unit]
Description=ARGUS-SHIELD perimeter firewall and intrusion response
Documentation=https://github.com/AprileNunzio/ARGUS-PR
After=network-pre.target
Wants=network-pre.target
Before=argus-pr.service

[Service]
Type=simple
User=root
WorkingDirectory=${SHIELD_DIR}
Environment=ARGUS_SHIELD_CONFIG=${SHIELD_CONFIG}
ExecStart=${NODE_BIN} ${SHIELD_DIR}/bin/argus-shield.js watch
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
ReadWritePaths=${SHIELD_STATE_DIR}
CapabilityBoundingSet=CAP_NET_ADMIN CAP_NET_RAW
AmbientCapabilities=CAP_NET_ADMIN CAP_NET_RAW

StandardOutput=journal
StandardError=journal
SyslogIdentifier=argus-shield

[Install]
WantedBy=multi-user.target
UNITEOF

    systemctl daemon-reload
    systemctl enable --now argus-shield.service

    sleep 2
    if systemctl is-active --quiet argus-shield.service; then
        log "ARGUS-SHIELD attivo: politica di rifiuto e risposta automatica agli attacchi"
    else
        warn "ARGUS-SHIELD non risulta attivo: controlla journalctl -u argus-shield"
    fi
}

has_display_hardware() {
    [[ -e /dev/dri/card0 ]] && return 0
    [[ -e /dev/fb0 ]] && return 0
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
    case "$PKG" in
        apt-get) pkg_install xserver-xorg xserver-xorg-legacy xinit x11-xserver-utils fonts-dejavu-core || true ;;
        dnf|yum) pkg_install xorg-x11-server-Xorg xorg-x11-xinit xorg-x11-server-utils dejavu-sans-fonts || true ;;
        pacman) pkg_install xorg-server xorg-xinit xorg-xset xorg-xsetroot ttf-dejavu || true ;;
        zypper) pkg_install xorg-x11-server xinit xorg-x11-essentials dejavu-fonts || true ;;
        apk) pkg_install xorg-server xinit xset xsetroot font-dejavu || true ;;
    esac
}

resolve_browser() {
    for candidate in chromium chromium-browser google-chrome-stable firefox-esr firefox; do
        if command -v "$candidate" >/dev/null 2>&1; then BROWSER_BIN="$(command -v "$candidate")"; return 0; fi
    done
    pkg_try chromium chromium-browser firefox-esr firefox || true
    for candidate in chromium chromium-browser firefox-esr firefox; do
        if command -v "$candidate" >/dev/null 2>&1; then BROWSER_BIN="$(command -v "$candidate")"; return 0; fi
    done
    return 1
}

install_kiosk() {
    log "Installazione muro video locale"
    install_display_stack

    if ! resolve_browser; then
        warn "Nessun browser disponibile: muro video locale non attivato."
        warn "Il NVR resta raggiungibile via web."
        return 0
    fi

    id -u "$KIOSK_USER" >/dev/null 2>&1 || useradd --system --home-dir "$KIOSK_HOME" --create-home --shell /bin/bash "$KIOSK_USER"
    for group in video input render tty; do
        getent group "$group" >/dev/null 2>&1 && usermod -aG "$group" "$KIOSK_USER" || true
    done
    mkdir -p "$KIOSK_HOME"
    chown -R "$KIOSK_USER":"$KIOSK_USER" "$KIOSK_HOME"
    pkg_try libnss3-tools nss-tools mozilla-nss-tools || true

    if [[ -d /etc/X11 ]]; then
        printf 'allowed_users=anybody\nneeds_root_rights=yes\n' > /etc/X11/Xwrapper.config
    fi

    mkdir -p "$HELPER_DIR"
    install -m 0755 "${INSTALL_DIR}/deploy/linux/kiosk-session.sh" "${HELPER_DIR}/kiosk-session.sh"

    cat > /etc/systemd/system/argus-pr-kiosk.service <<KIOSKEOF
[Unit]
Description=ARGUS-PR Kiosk Wall
After=argus-pr.service systemd-user-sessions.service
Wants=argus-pr.service
Conflicts=getty@tty1.service

[Service]
Type=simple
User=${KIOSK_USER}
PAMName=login
TTYPath=/dev/tty1
TTYReset=yes
TTYVHangup=yes
StandardInput=tty
StandardOutput=journal
StandardError=journal
Environment=HOME=${KIOSK_HOME}
Environment=ARGUS_WALL_URL=https://127.0.0.1:${PORT}/wall
Environment=ARGUS_CA_FILE=${DATA_DIR}/secrets/pki/ca.crt
Environment=ARGUS_BROWSER=${BROWSER_BIN}
ExecStart=${HELPER_DIR}/kiosk-session.sh
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
KIOSKEOF

    systemctl daemon-reload
    systemctl disable --now getty@tty1.service >/dev/null 2>&1 || true
    systemctl enable --now argus-pr-kiosk.service
}

primary_address() {
    ip -4 -o addr show scope global 2>/dev/null | awk '{split($4,a,"/"); print a[1]; exit}'
}

summary() {
    local address kiosk_state port_suffix fingerprint public_state shield_state
    address="$(primary_address)"
    [[ -n "$address" ]] || address="127.0.0.1"
    if [[ -n "$BROWSER_BIN" ]]; then kiosk_state="attivo sul monitor collegato (tty1)"; else kiosk_state="non attivo"; fi

    port_suffix=""
    [[ "$PORT" != "443" ]] && port_suffix=":${PORT}"

    fingerprint="$(cd "$INSTALL_DIR" && ARGUS_DATA_DIR="$DATA_DIR" "$NODE_BIN" bin/argus.js cert 2>/dev/null | awk '/Impronta/ { print $2 }')"
    [[ -n "$fingerprint" ]] || fingerprint="esegui il comando: argus cert"

    if [[ "$PUBLIC_ACCESS" == "true" ]]; then
        public_state="consentito, sola visione delle telecamere"
    else
        public_state="disabilitato"
    fi

    if systemctl is-active --quiet argus-shield.service 2>/dev/null; then
        shield_state="ARGUS-SHIELD attivo"
    else
        shield_state="ARGUS-SHIELD non attivo"
    fi

    cat <<SUMEOF

  ARGUS-PR e' installato e in esecuzione.

  Interfaccia web        https://${address}${port_suffix}
  Impronta certificato   ${fingerprint}
  Autorita interna       ${DATA_DIR}/secrets/pki/ca.crt
  Accesso da internet    ${public_state}
  Firewall perimetrale   ${shield_state}
  Muro video locale      ${kiosk_state}
  Versione installata    ${REF}
  Codice                 ${INSTALL_DIR}
  Dati e registrazioni   ${DATA_DIR}
  Configurazione         ${ENV_FILE}

  Al primo accesso web viene chiesta la configurazione iniziale:
  creazione dell'account amministratore e aggiunta delle telecamere.

  Il browser mostra un avviso sul certificato: confronta l impronta qui
  sopra prima di accettare, oppure installa ca.crt sui dispositivi client.

  Comandi utili:
    systemctl status argus-pr
    journalctl -u argus-pr -f
    argus-shield status
    systemctl restart argus-pr-kiosk

SUMEOF
}

main() {
    parse_args "$@"
    require_root "$@"
    detect_pkg
    install_base_packages
    install_node
    create_users
    fetch_sources
    write_environment
    setup_vision
    write_service
    open_firewall
    if want_shield; then install_shield; else log "ARGUS-SHIELD non richiesto"; fi
    if want_kiosk; then install_kiosk; else log "Muro video locale non richiesto"; fi
    summary
}


main "$@"
