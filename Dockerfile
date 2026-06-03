# syntax=docker/dockerfile:1

FROM node:20-alpine AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm install

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Las NEXT_PUBLIC_* se inyectan en el bundle del cliente EN TIEMPO DE BUILD.
# Si no se pasan aquí como --build-arg, quedan vacías en producción y rompen, p.ej.,
# el CAPTCHA de Turnstile (el widget no carga → login da 400). No son secretos:
# viajan al navegador por diseño.
ARG NEXT_PUBLIC_TURNSTILE_SITE_KEY
ARG NEXT_PUBLIC_AGENTFLOW_API_URL
ARG NEXT_PUBLIC_AGENTFLOWHUB_URL
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_ASSIST_SCRIPT_URL
ARG NEXT_PUBLIC_SENTRY_DSN
ARG NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_TURNSTILE_SITE_KEY=$NEXT_PUBLIC_TURNSTILE_SITE_KEY \
    NEXT_PUBLIC_AGENTFLOW_API_URL=$NEXT_PUBLIC_AGENTFLOW_API_URL \
    NEXT_PUBLIC_AGENTFLOWHUB_URL=$NEXT_PUBLIC_AGENTFLOWHUB_URL \
    NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL \
    NEXT_PUBLIC_ASSIST_SCRIPT_URL=$NEXT_PUBLIC_ASSIST_SCRIPT_URL \
    NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN \
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=$NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY

RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3201

RUN addgroup -S nextjs && adduser -S nextjs -G nextjs

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

USER nextjs
EXPOSE 3201

CMD ["node", "server.js"]
