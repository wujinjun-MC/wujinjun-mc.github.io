#!/usr/bin/env bash
# Report the Android battery to the repository through GitHub Actions.
#
# Requirements on the phone:
#   pkg install termux-api jq curl
#   install the Termux:API app (F-Droid) and grant it permission
#
# Setup:
#   mkdir -p ~/.config
#   cp live-status.env.example ~/.config/live-status.env
#   chmod 600 ~/.config/live-status.env
#   edit the token/repository values
#   bash report-battery.sh
#
# Schedule (Termux:JobScheduler; verify options with -h on your device):
#   mkdir -p ~/bin && cp report-battery.sh ~/bin/
#   termux-job-scheduler --script ~/bin/report-battery.sh --period-ms 900000 --persisted true
#
# Alternative schedule: cronie + Termux:Boot:
#   pkg install cronie termux-services
#   sv-enable crond
#   crontab -e   # */15 * * * * bash ~/bin/report-battery.sh
#
# Disable battery optimization for Termux; Android may otherwise delay jobs.

set -euo pipefail

ENV_FILE="${LIVE_STATUS_ENV:-$HOME/.config/live-status.env}"
if [ -f "$ENV_FILE" ]; then
    # shellcheck disable=SC1090
    . "$ENV_FILE"
fi

for command_name in termux-battery-status jq curl; do
    if ! command -v "$command_name" >/dev/null 2>&1; then
        echo "missing dependency: $command_name (pkg install termux-api jq curl)" >&2
        exit 1
    fi
done

: "${STATUS_GH_TOKEN:?set STATUS_GH_TOKEN in $ENV_FILE}"
: "${GITHUB_REPO:=wujinjun-MC/wujinjun-mc.github.io}"
: "${REF:=master}"
: "${WORKFLOW_FILE:=phone-battery.yml}"

battery_json="$(termux-battery-status)"
level="$(printf '%s' "$battery_json" | jq -r '.percentage // empty')"
status="$(printf '%s' "$battery_json" | jq -r '.status // ""')"

case "$level" in
    ''|*[!0-9]*)
        echo "invalid battery level: $level" >&2
        exit 1
        ;;
esac
if [ "$level" -lt 0 ] || [ "$level" -gt 100 ]; then
    echo "battery level out of range: $level" >&2
    exit 1
fi

charging=false
case "$status" in
    CHARGING|FULL) charging=true ;;
esac

payload="$(jq -nc \
    --arg ref "$REF" \
    --arg level "$level" \
    --arg charging "$charging" \
    --arg ts "$(date +%s)" \
    '{ref: $ref, inputs: {level: $level, charging: $charging, ts: $ts}}')"

curl -fsS -X POST \
    -H "Authorization: Bearer $STATUS_GH_TOKEN" \
    -H "Accept: application/vnd.github+json" \
    -H "X-GitHub-Api-Version: 2022-11-28" \
    -H "Content-Type: application/json" \
    "https://api.github.com/repos/$GITHUB_REPO/actions/workflows/$WORKFLOW_FILE/dispatches" \
    -d "$payload" >/dev/null

echo "dispatched: ${level}% charging=${charging}"
