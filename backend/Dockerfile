# Build stage
FROM golang:1.25-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o pocketbase .

# Runtime stage
FROM alpine:3.21
RUN apk add --no-cache ca-certificates
COPY --from=builder /app/pocketbase /pb/pocketbase
WORKDIR /pb
EXPOSE 8090
CMD ["/pb/pocketbase", "serve", "--http=0.0.0.0:8090"]
