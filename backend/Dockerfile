FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache curl python3 make g++

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

RUN mkdir -p /app/data

EXPOSE 3000

CMD ["sh", "-c", "node src/seed.js && node src/app.js"]
