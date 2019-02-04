FROM node:10-alpine
WORKDIR /app
COPY package.json /app
RUN npm install
ENV CHROME_BIN=/usr/bin/chromium-browser
RUN echo @v3.8 http://nl.alpinelinux.org/alpine/v3.8/community >> /etc/apk/repositories && \
    echo @v3.8 http://nl.alpinelinux.org/alpine/v3.8/main >> /etc/apk/repositories && \
    apk add --no-cache \
      chromium@v3.8 \
      nss@v3.8
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD true
COPY . /app
CMD node main.js
EXPOSE 4001