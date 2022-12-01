#!/bin/sh

if [ "$#" -ne 2 ]; then
  echo "Usage: $0 <id-runtime-dir> <plugin-url>" >&2
  exit 1
fi

set -x
pluginFile="$(mktemp -d)/plugin.zip"
mkdir -p "$1" && curl  -SL -o "$pluginFile" "$2" && unzip -oq "$pluginFile" -d "$1/plugins" && rm "$pluginFile"
