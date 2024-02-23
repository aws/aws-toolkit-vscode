#!/bin/sh

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 </path/to/build.txt>" >&2
  exit 1
fi

cat "$1" | cut -d"-" -f2 | cut -d"." -f1
