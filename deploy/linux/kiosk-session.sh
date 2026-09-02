#!/usr/bin/env bash
set -euo pipefail

WALL_URL="${ARGUS_WALL_URL:-http://127.0.0.1:8088/wall}"
BROWSER="${ARGUS_BROWSER:-}"
PROFILE="${HOME:-/var/lib/argus-kiosk}/browser-profile"

if [[ "${1:-}" != "--inner" ]]; then
    exec xinit "$0" --inner -- :0 vt1 -keeptty -nolisten tcp
fi

xset s off || true
xset -dpms || true
xset s noblank || true
command -v xsetroot >/dev/null 2>&1 && xsetroot -solid black || true

for _ in $(seq 1 60); do
    if curl -fsS -o /dev/null --max-time 2 "${WALL_URL%/wall}/api/console/status"; then break; fi
    sleep 2
done

mkdir -p "$PROFILE"

case "$(basename "$BROWSER")" in
    firefox|firefox-esr)
        exec "$BROWSER" --kiosk --profile "$PROFILE" "$WALL_URL"
        ;;
    *)
        exec "$BROWSER" \
            --kiosk \
            --app="$WALL_URL" \
            --user-data-dir="$PROFILE" \
            --no-first-run \
            --noerrdialogs \
            --disable-infobars \
            --disable-session-crashed-bubble \
            --disable-features=TranslateUI \
            --autoplay-policy=no-user-gesture-required \
            --check-for-update-interval=31536000 \
            --password-store=basic \
            --start-fullscreen
        ;;
esac
