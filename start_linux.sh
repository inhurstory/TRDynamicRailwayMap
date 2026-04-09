#!/usr/bin/env sh

PORT=8000
URL="http://localhost:${PORT}/"
SESSION_NAME="tr_dynamic_railway_map"

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
cd "$SCRIPT_DIR" || exit 1

if command -v python3 >/dev/null 2>&1; then
    PYTHON_CMD="python3"
elif command -v python >/dev/null 2>&1; then
    PYTHON_CMD="python"
else
    echo "Python not found. Install Python first, then run this file again."
    exit 1
fi

if ! command -v screen >/dev/null 2>&1; then
    echo "screen not found. Install screen first, then run this file again."
    exit 1
fi

if screen -list | grep -q "[.]${SESSION_NAME}[[:space:]]"; then
    echo "screen session '${SESSION_NAME}' is already running."
else
    screen -dmS "$SESSION_NAME" "$PYTHON_CMD" -m http.server "$PORT"
    echo "Started server in screen session '${SESSION_NAME}'."
fi

if command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$URL" >/dev/null 2>&1 &
elif command -v open >/dev/null 2>&1; then
    open "$URL" >/dev/null 2>&1 &
fi

echo "Open: ${URL}"
echo "Attach with: screen -r ${SESSION_NAME}"
