FROM node:26-alpine@sha256:aadf416b2cdce311a8811ba3f0608a61b77dbf997500e2eafe781b51f6a0b019 AS web
WORKDIR /src
COPY frontend/ frontend/
RUN npm --prefix frontend ci
RUN frontend/node_modules/.bin/vite build frontend
# vite copies frontend/public/ into dist/, the gitignored local config.json with it; where a
# deployment's configuration comes from instead is ADR 0021 rev 1's and ADR 0020 rev 2's.
RUN rm -f frontend/dist/config.json

FROM golang:1.27-alpine@sha256:4c9fe60190a2a3350ddc51de80d0224b8a6698d12bdfc999fee45ea9d6c46dbc AS build
WORKDIR /src/backend
COPY backend/ ./
RUN CGO_ENABLED=0 go build -o /out/wisekiosk ./cmd

FROM alpine:3.24@sha256:28bd5fe8b56d1bd048e5babf5b10710ebe0bae67db86916198a6eec434943f8b
# Why the image carries trust anchors is docs/ARCHITECTURE.md § Deployment's.
RUN apk add --no-cache ca-certificates
RUN adduser -D -u 10001 kiosk
COPY --from=build /out/wisekiosk /usr/local/bin/wisekiosk
COPY --from=web /src/frontend/dist /srv/kiosk
USER kiosk
EXPOSE 8080
# No --timeout: the bound the self-check applies is ADR 0020 rev 2's.
HEALTHCHECK CMD ["/usr/local/bin/wisekiosk", "-health-check"]
ENTRYPOINT ["/usr/local/bin/wisekiosk", "-static-root", "/srv/kiosk"]
