#!/usr/bin/env bash
# Stage, commit, and push any changes found under wiki/.
# Usage: ./scripts/sync-wiki.sh ["commit message"]
set -euo pipefail

cd "$(dirname "$0")/.."

git add wiki/

if git diff --cached --quiet -- wiki/; then
  echo "No changes found under wiki/."
  exit 0
fi

echo "Changes staged from wiki/:"
git diff --cached --stat -- wiki/

msg="${1:-Update wiki notes}"
git commit -m "$msg"

branch=$(git rev-parse --abbrev-ref HEAD)
git push origin "$branch"

read -r -p "Push to main to deploy the live site? [y/N] " confirm
if [[ "$confirm" =~ ^[Yy]$ ]]; then
  git push origin "$branch:main"
  echo "Pushed to main. Check the Actions tab on GitHub for the deploy."
else
  echo "Skipped deploy. Run 'git push origin $branch:main' later to publish."
fi
