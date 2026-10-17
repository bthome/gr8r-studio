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
npx fleet-axi init

echo
echo "Installed. Database is ./fleet.db"
echo "Next: npx fleet-axi doctor"
echo "Page bridge: npx fleet-axi serve"
