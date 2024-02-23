#!/bin/sh

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 <ssh-target>" >&2
  exit 1
fi

set -x
mkdir -p ~/.ssh && (ssh-keygen -F "$1" || (ssh-keyscan "$1" >> "$HOME"/.ssh/known_hosts))
