#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

say() { printf '%s\n' "$1"; }

confirm() {
  say "$1"
  printf 'Are you sure? Type yes: '
  read -r answer
  [ "$answer" = "yes" ]
}

fill() {
  confirm "This adds sample tasks to PAY. It does not wipe existing rows." || { say "Cancelled."; exit 0; }
  npx fleet-axi init
  npx fleet-axi task create --as fm --project PAY --title "Checkout 504s" --status progress --assignee m6 --priority urgent --fm_task fm-checkout
  npx fleet-axi task create --as fm --project PAY --title "No autoscale on payments" --status progress --assignee m6 --priority urgent --fm_task fm-checkout
  npx fleet-axi task create --as fm --project PAY --title "Grant on-call access" --status review --assignee m6 --priority medium --fm_task fm-oncall
  npx fleet-axi task create --as fm --project PAY --title "Autoscale the worker pool" --status todo --assignee m6 --priority high --fm_task fm-scale
  say "Filled. Open the studio. It reads http://127.0.0.1:8787/store"
}

clear_all() {
  confirm "This deletes every row and returns to the empty default: captain, first mate, Marcus, PAY." || { say "Cancelled."; exit 0; }
  npx fleet-axi reset
  say "Cleared."
}

case "${1:-}" in
  fill) fill ;;
  clear) clear_all ;;
  *) say "Use: ./demo.sh fill    or    ./demo.sh clear"; exit 1 ;;
esac
