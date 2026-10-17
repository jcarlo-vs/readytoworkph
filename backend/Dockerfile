# Backend image for Cloud Run. Secrets come from Cloud Run settings, never from a baked-in .env.
FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src ./src
USER node
CMD ["npm", "start"]
