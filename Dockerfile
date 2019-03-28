FROM ubuntu:latest

RUN apt-get update && apt-get -y upgrade && apt-get -y install xvfb \
    libgtk-3-0 \
    git \
    gnupg \
    curl \
    libxss1 \
    libgconf2-4 \
    libnss3 \
    libasound2 

# Install node/npm - https://tecadmin.net/install-latest-nodejs-npm-on-ubuntu/
RUN curl -sL https://deb.nodesource.com/setup_10.x | bash - && apt-get install -y nodejs

# Environment variables required for headless
ENV CXX="g++-4.9" CC="gcc-4.9" DISPLAY=:99.0

WORKDIR /code

# See https://github.com/npm/npm/issues/3497 for --unsafe-perm arg 
# See http://elementalselenium.com/tips/38-headless for running headless
# Here we use option 2, but you might be able to do option 1 in code build. exe is Xvfb not xvfb.
CMD npm install --unsafe-perm && npm run vscode:prepublish && xvfb-run npm test --silent