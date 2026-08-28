# ─── Stage 1: build the React app ─────────────────────────────────
FROM node:18-alpine AS builder
WORKDIR /app

# Public browser endpoint compiled into the Vite bundle; never pass secrets here.
ARG VITE_API_BASE_URL=http://localhost:8080
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}

# 1) Copy only lockfile & manifest → install deps (cacheable)
COPY package.json package-lock.json ./
RUN npm ci

# 2) Copy app sources → build
COPY . ./
RUN npm run build

# ─── Stage 2: serve with Nginx ────────────────────────────────────
FROM nginx:stable-alpine
# remove default site
RUN rm /etc/nginx/conf.d/default.conf
# copy your custom nginx.conf (if you have one) or just serve /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d
# copy built assets into nginx’s web root
COPY --from=builder /app/dist/ /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
