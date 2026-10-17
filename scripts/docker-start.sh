#!/bin/sh
# Container entry point. Runs the bridge and the Studio, forwards docker stop's SIGTERM to both so the bridge
# exits cleanly (and drops its lock file), and exits if either one dies so Docker's restart policy can act.
mkdir -p /data
node fleet-axi/bin/fleet-axi.js init || exit 1
node fleet-axi/bin/fleet-axi.js serve --port 8787 --host 0.0.0.0 &
bridge=$!
node_modules/.bin/vite --host 0.0.0.0 --port 5173 &
studio=$!
stopping=
trap 'stopping=1; kill -TERM $bridge $studio 2>/dev/null' TERM INT
while [ -z "$stopping" ] && kill -0 $bridge 2>/dev/null && kill -0 $studio 2>/dev/null; do
  sleep 1 &
  wait $!
done
kill -TERM $bridge $studio 2>/dev/null
wait $bridge 2>/dev/null
wait $studio 2>/dev/null
[ -n "$stopping" ] && exit 0
echo '{"error":"bridge or studio exited; stopping the container"}' >&2
exit 1
