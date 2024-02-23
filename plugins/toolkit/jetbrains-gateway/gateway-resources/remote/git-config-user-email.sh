#!/bin/sh

name_value=''
email_value=''

print_usage() {
  echo "Usage: $0 [-n <name>] [-e <email>]" >&2
}

while getopts ':n:e:' flag; do
  case "${flag}" in
    n) name_value=${OPTARG};;
    e) email_value=${OPTARG};;
    *) print_usage
       exit 1 ;;
  esac
done

set -x

if [ -n "$name_value" ]; then
    git config --global 'user.name' "$name_value"
fi

if [ -n "$email_value" ]; then
    git config --global 'user.email' "$email_value"
fi
