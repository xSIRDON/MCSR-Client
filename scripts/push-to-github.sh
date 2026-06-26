#!/usr/bin/env bash
# Create the GitHub repo under xSIRDON and push.
#
# Usage:
#   GITHUB_TOKEN=<personal-access-token> bash scripts/push-to-github.sh
#
# The token needs "repo" scope. It is read from the environment only and is
# never written to disk or committed.

set -euo pipefail

OWNER="xSIRDON"
REPO="obsidian-mcsr-client"
DESC="Obsidian — a clean, MCSR-Ranked themed Minecraft 1.16.1 speedrunning client (Ranked + RSG, built-in paceman)."

if [ -z "${GITHUB_TOKEN:-}" ]; then
  echo "ERROR: set GITHUB_TOKEN to a personal access token with 'repo' scope." >&2
  echo "  GITHUB_TOKEN=ghp_xxx bash scripts/push-to-github.sh" >&2
  exit 1
fi

echo "→ Ensuring repo ${OWNER}/${REPO} exists…"
http_code=$(curl -s -o /tmp/ghresp.json -w "%{http_code}" \
  -X POST "https://api.github.com/user/repos" \
  -H "Authorization: Bearer ${GITHUB_TOKEN}" \
  -H "Accept: application/vnd.github+json" \
  -d "{\"name\":\"${REPO}\",\"description\":\"${DESC}\",\"private\":false}")

if [ "$http_code" = "201" ]; then
  echo "  created."
elif [ "$http_code" = "422" ]; then
  echo "  already exists — continuing."
else
  echo "  GitHub API returned ${http_code}:" >&2
  cat /tmp/ghresp.json >&2
  exit 1
fi
rm -f /tmp/ghresp.json

# Use a credential-embedded URL only for this push, then reset to a clean remote.
PUSH_URL="https://${OWNER}:${GITHUB_TOKEN}@github.com/${OWNER}/${REPO}.git"
CLEAN_URL="https://github.com/${OWNER}/${REPO}.git"

git remote remove origin 2>/dev/null || true
git remote add origin "${CLEAN_URL}"

echo "→ Pushing main…"
git push "${PUSH_URL}" main:main

echo "✓ Done: ${CLEAN_URL}"
