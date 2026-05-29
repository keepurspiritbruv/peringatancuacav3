FROM node:22-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY bridge.mjs ./
CMD ["node", "bridge.mjs"]
