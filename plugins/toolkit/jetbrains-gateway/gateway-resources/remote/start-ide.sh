#!/bin/sh

if [ "$#" -ne 2 ]; then
  echo "Usage: $0 </path/to/remote-dev-server.sh> <project root>" >&2
  exit 1
fi

set -x
set -o pipefail

projectRoot=$2

if [ ! -d "$projectRoot" ]; then
    echo "$projectRoot does not exist, falling back to /projects"
    projectRoot='/projects'
fi

# retry if the backend exits under the threshold
secondsThreshold=20
endTime=$(( $(date +%s) + secondsThreshold ))
lastExit=0
# date +%s is technically not POSIX, but the alternative is an obscure trick with awk that uses the fact that srand() is seeded with the epoch by default
while [ "$(date +%s)" -lt "$endTime" ]
do
  case "$lastExit" in
    # 2: backend already open
    # 7: backend expired
    # 127: provided backend path was invalid
    2|7|127) exit "$lastExit"
  esac

  echo "Backend not available yet. Attempting to start"
  endTime=$(( $(date +%s) + secondsThreshold ))
  nohup "$1" run "$projectRoot" | tee $HOME/start.log &
  wait $!
  lastExit=$?
  sleep 3
done
