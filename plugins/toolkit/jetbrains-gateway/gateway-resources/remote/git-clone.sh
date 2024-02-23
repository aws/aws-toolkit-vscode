#!/bin/sh

if [ "$#" -eq 0 ] || [ "$#" -gt 2 ]; then
  echo "Usage: $0 <git repo> [git branch]" >&2
  exit 1
fi

set -x
cd /projects
PROJECT_DIR=$(basename $1 .git)
if [ -d $PROJECT_DIR ]; then
  cd $PROJECT_DIR
  if [ ! -d ".git" ]; then
    git init && git remote add origin "$1" && git fetch origin && git remote set-head origin --auto
    # use provided branch if available, else infer from remote
    DEFAULT_BRANCH=${2:-$(basename $(git rev-parse --abbrev-ref origin/HEAD))}
    git checkout -b "$DEFAULT_BRANCH" --track && git reset 'origin/'"$DEFAULT_BRANCH"
  else
    echo 'Skipping git clone since "'$PROJECT_DIR'/.git" already exists'
  fi
else
  # if branch was provided, pass along to clone command
  git clone "$1" -v ${2:+--branch "$2"};
fi
