#!/usr/bin/env bash
set -euo pipefail

WALL_URL="${ARGUS_WALL_URL:-https://127.0.0.1/wall}"
BROWSER="${ARGUS_BROWSER:-}"
CA_FILE="${ARGUS_CA_FILE:-}"
PROFILE="${HOME:-/home/argus-kiosk}/browser-profile"
NSS_DB="${HOME:-/home/argus-kiosk}/.pki/nssdb"
CA_TRUSTED="no"

if [[ "${1:-}" != "--inner" ]]; then
    exec xinit "$0" --inner -- :0 vt1 -keeptty -nolisten tcp
fi

xset s off || true
xset -dpms || true
xset s noblank || true
command -v xsetroot >/dev/null 2>&1 && xsetroot -solid black || true

trust_authority() {
    [[ -n "$CA_FILE" && -r "$CA_FILE" ]] || return 1
    command -v certutil >/dev/null 2>&1 || return 1

    mkdir -p "$NSS_DB"
    if [[ ! -f "${NSS_DB}/cert9.db" ]]; then
        certutil -d "sql:${NSS_DB}" -N --empty-password >/dev/null 2>&1 || return 1
    fi

    certutil -d "sql:${NSS_DB}" -D -n "ARGUS-PR Internal Authority" >/dev/null 2>&1 || true
    certutil -d "sql:${NSS_DB}" -A -t "C,," -n "ARGUS-PR Internal Authority" -i "$CA_FILE" >/dev/null 2>&1 || return 1

    return 0
}

wait_for_service() {
    local probe="${WALL_URL%/wall}/api/console/status"
    local args=(-fsS -o /dev/null --max-time 2)

    if [[ -n "$CA_FILE" && -r "$CA_FILE" ]]; then
        args+=(--cacert "$CA_FILE")
    else
        args+=(--insecure)
    fi

    for _ in $(seq 1 60); do
        if curl "${args[@]}" "$probe"; then return 0; fi
        sleep 2
    done

    return 1
}

if trust_authority; then CA_TRUSTED="yes"; fi

wait_for_service || true

mkdir -p "$PROFILE"

case "$(basename "$BROWSER")" in
    firefox|firefox-esr)
        if [[ "$CA_TRUSTED" == "yes" && ! -f "${PROFILE}/cert9.db" ]]; then
            cp "${NSS_DB}/cert9.db" "${NSS_DB}/key4.db" "${NSS_DB}/pkcs11.txt" "$PROFILE/" 2>/dev/null || true
        fi
        exec "$BROWSER" --kiosk --profile "$PROFILE" "$WALL_URL"
        ;;
    *)
        CHROME_ARGS=(
            --kiosk
            --app="$WALL_URL"
            --user-data-dir="$PROFILE"
            --no-first-run
            --noerrdialogs
            --disable-infobars
            --disable-session-crashed-bubble
            --disable-features=TranslateUI
            --autoplay-policy=no-user-gesture-required
            --check-for-update-interval=31536000
            --password-store=basic
            --start-fullscreen
        )

        if [[ "$CA_TRUSTED" != "yes" ]]; then
            CHROME_ARGS+=(--ignore-certificate-errors)
        fi

        exec "$BROWSER" "${CHROME_ARGS[@]}"
        ;;
esac
