#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

need() {
  command -v "$1" >/dev/null 2>&1 || { echo "missing $1"; exit 1; }
}

need node
need npm

major=$(node -p "process.versions.node.split('.')[0]")
if [ "$major" -lt 20 ]; then
  echo "Node 20 or newer is required. Found $(node -v)."
  exit 1
fi

echo "Node $(node -v)"
npm install
npm test
npx gr8r-axi init

echo
echo "Installed. Database is ./gr8r.db"
echo "Next: npx gr8r-axi doctor"
echo "Page bridge: npx gr8r-axi serve"
