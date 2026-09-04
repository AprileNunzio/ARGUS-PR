#!/usr/bin/env bash
set -uo pipefail

INSTALL_DIR="${ARGUS_INSTALL_DIR:-/opt/argus-pr}"
DATA_DIR="${ARGUS_DATA_DIR:-/var/lib/argus-pr}"
SERVICE_USER="${ARGUS_SERVICE_USER:-argus}"
STATE_FILE="${DATA_DIR}/update-state.json"
KEYRING="${ARGUS_UPDATE_KEYRING:-/etc/argus-pr/update-key.asc}"
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

verify_signature() {
    local tag="$1" home status

    if [[ ! -r "$KEYRING" ]]; then
        log "ATTENZIONE: nessuna chiave di firma in ${KEYRING}, aggiornamento applicato senza verifica"
        return 0
    fi

    if ! command -v gpg >/dev/null 2>&1; then
        log "gpg assente: impossibile verificare la firma di ${tag}"
        return 1
    fi

    home="$(mktemp -d)" || return 1
    chmod 700 "$home"

    if ! GNUPGHOME="$home" gpg --batch --quiet --import "$KEYRING" >/dev/null 2>&1; then
        log "chiave di firma non importabile"
        rm -rf "$home"
        return 1
    fi

    GNUPGHOME="$home" git_repo verify-tag "$tag" >/dev/null 2>&1
    status=$?
    rm -rf "$home"

    if (( status != 0 )); then
        log "firma di ${tag} non valida o assente"
        return 1
    fi

    log "firma di ${tag} verificata"
    return 0
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

        git_repo remote set-url origin "$OFFICIAL_REMOTE"

        if ! git_repo fetch --tags --force --quiet origin; then
            log "fetch da GitHub non riuscito, verifico se il tag e gia presente in locale"
        fi

        if ! git_repo rev-parse --verify --quiet "refs/tags/${TARGET}^{commit}" >/dev/null; then
            log "tag ${TARGET} non disponibile ne da GitHub ne in locale"
            write_state '{"phase":"failed","message":"Tag non trovato: repository irraggiungibile e nessun pacchetto offline importato"}'
            exit 0
        fi

        if ! verify_signature "$TARGET"; then
            write_state '{"phase":"failed","message":"Firma della release non verificata"}'
            exit 0
        fi

        if ! git_repo -c advice.detachedHead=false checkout --quiet --force "$TARGET"; then
            log "checkout fallito"
            write_state '{"phase":"failed","message":"Checkout fallito"}'
            exit 0
        fi

        if ! install_dependencies; then
            log "npm install fallito, ripristino ${PREVIOUS}"
            [[ -n "$PREVIOUS" ]] && git_repo checkout --quiet --force "$PREVIOUS"
            install_dependencies
            write_state '{"phase":"rolled-back","message":"Installazione dipendenze fallita"}'
            exit 0
        fi

        chown -R "$SERVICE_USER":"$SERVICE_USER" "${INSTALL_DIR}" 2>/dev/null || true
        chmod -R a+rX "${INSTALL_DIR}" 2>/dev/null || true
        write_state '{"phase":"pending","attempts":1}'
        log "applicato ${TARGET}, in attesa della conferma di salute"
        ;;

    pending)
        NEXT=$((ATTEMPTS + 1))
        if (( NEXT > MAX_ATTEMPTS )); then
            log "la nuova versione non si stabilizza, ripristino ${PREVIOUS}"
            if [[ -n "$PREVIOUS" ]] && git_repo checkout --quiet --force "$PREVIOUS"; then
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
