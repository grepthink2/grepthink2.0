# ---- Build stage ----
FROM node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

# Copy source and the root .env so Vite can inline VITE_* vars at build time
COPY . .
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_KEY
ARG VITE_API_URL

RUN npm run build

# ---- Production stage ----
FROM nginx:alpine

# Custom nginx config to proxy /api to the backend and serve the SPA
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
