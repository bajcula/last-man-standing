# Build stage
FROM golang:1.25-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o pocketbase .

# Runtime stage
FROM alpine:3.21
RUN apk add --no-cache ca-certificates wget

# Create non-root user and group
RUN addgroup -S pbgroup && adduser -S pbuser -G pbgroup

# Create data directory and set ownership
COPY --from=builder /app/pocketbase /pb/pocketbase
RUN mkdir -p /pb/pb_data /pb/pb_migrations && \
    chown -R pbuser:pbgroup /pb

WORKDIR /pb

USER pbuser

EXPOSE 8090

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://localhost:8090/api/health || exit 1

CMD ["/pb/pocketbase", "serve", "--http=0.0.0.0:8090"]
