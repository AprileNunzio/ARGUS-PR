#!/usr/bin/env bash
set -uo pipefail

INSTALL_DIR="${ARGUS_INSTALL_DIR:-/opt/argus-pr}"
DATA_DIR="${ARGUS_DATA_DIR:-/var/lib/argus-pr}"
SERVICE_USER="${ARGUS_SERVICE_USER:-argus}"
STATE_FILE="${DATA_DIR}/update-state.json"
MAX_ATTEMPTS=2
OFFICIAL_REMOTE="https://github.com/AprileNunzio/ARGUS-PR.git"
NODE_BIN="${ARGUS_NODE_BIN:-$(command -v node || echo /usr/local/bin/node)}"
NPM_BIN="${ARGUS_NPM_BIN:-$(command -v npm || echo /usr/local/bin/npm)}"

log() { printf 'argus-pre-start: %s\n' "$*"; }

[[ -f "$STATE_FILE" ]] || exit 0
[[ -d "${INSTALL_DIR}/.git" ]] || { log "installazione non git, nessuna azione"; exit 0; }

state_field() {
    "$NODE_BIN" -e '
        const fs = require("fs");
        try {
            const s = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
            const v = s[process.argv[2]];
            process.stdout.write(v === undefined || v === null ? "" : String(v));
        } catch { process.stdout.write(""); }
    ' "$STATE_FILE" "$1" 2>/dev/null
}

write_state() {
    "$NODE_BIN" -e '
        const fs = require("fs");
        const file = process.argv[1];
        const patch = JSON.parse(process.argv[2]);
        let current = {};
        try { current = JSON.parse(fs.readFileSync(file, "utf8")); } catch {}
        fs.writeFileSync(file + ".tmp", JSON.stringify({ ...current, ...patch }, null, 2) + "\n", { mode: 0o640 });
        fs.renameSync(file + ".tmp", file);
    ' "$STATE_FILE" "$1" 2>/dev/null
    chown "$SERVICE_USER":"$SERVICE_USER" "$STATE_FILE" 2>/dev/null || true
}

install_dependencies() {
    ( cd "$INSTALL_DIR" && "$NPM_BIN" install --omit=dev --no-audit --no-fund --loglevel=error ) >/dev/null 2>&1
}

PHASE="$(state_field phase)"
TARGET="$(state_field targetRef)"
PREVIOUS="$(state_field previousRef)"
ATTEMPTS="$(state_field attempts)"
[[ "$ATTEMPTS" =~ ^[0-9]+$ ]] || ATTEMPTS=0

case "$PHASE" in
    requested)
        if [[ ! "$TARGET" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
            log "riferimento rifiutato: ${TARGET}"
            write_state '{"phase":"failed","message":"Riferimento non valido"}'
            exit 0
        fi

        log "applico ${TARGET}"

        git -C "$INSTALL_DIR" remote set-url origin "$OFFICIAL_REMOTE"

        if ! git -C "$INSTALL_DIR" fetch --tags --force --prune --quiet origin; then
            log "fetch fallito, avvio la versione corrente"
            write_state '{"phase":"failed","message":"Download da GitHub fallito"}'
            exit 0
        fi

        if ! git -C "$INSTALL_DIR" rev-parse --verify --quiet "refs/tags/${TARGET}^{commit}" >/dev/null; then
            log "tag ${TARGET} inesistente sul remoto"
            write_state '{"phase":"failed","message":"Tag non trovato sul repository ufficiale"}'
            exit 0
        fi

        if ! git -C "$INSTALL_DIR" -c advice.detachedHead=false checkout --quiet --force "$TARGET"; then
            log "checkout fallito"
            write_state '{"phase":"failed","message":"Checkout fallito"}'
            exit 0
        fi

        if ! install_dependencies; then
            log "npm install fallito, ripristino ${PREVIOUS}"
            [[ -n "$PREVIOUS" ]] && git -C "$INSTALL_DIR" checkout --quiet --force "$PREVIOUS"
            install_dependencies
            write_state '{"phase":"rolled-back","message":"Installazione dipendenze fallita"}'
            exit 0
        fi

        chown -R "$SERVICE_USER":"$SERVICE_USER" "${INSTALL_DIR}/vendor" 2>/dev/null || true
        write_state '{"phase":"pending","attempts":1}'
        log "applicato ${TARGET}, in attesa della conferma di salute"
        ;;

    pending)
        NEXT=$((ATTEMPTS + 1))
        if (( NEXT > MAX_ATTEMPTS )); then
            log "la nuova versione non si stabilizza, ripristino ${PREVIOUS}"
            if [[ -n "$PREVIOUS" ]] && git -C "$INSTALL_DIR" checkout --quiet --force "$PREVIOUS"; then
                install_dependencies
                write_state '{"phase":"rolled-back","message":"Ripristino automatico: la nuova versione non si e avviata"}'
            else
                write_state '{"phase":"failed","message":"Ripristino automatico non riuscito"}'
            fi
        else
            write_state "{\"phase\":\"pending\",\"attempts\":${NEXT}}"
        fi
        ;;

    *)
        exit 0
        ;;
esac

exit 0
