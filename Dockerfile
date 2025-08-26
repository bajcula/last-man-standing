FROM alpine:latest

RUN apk update && apk add --no-cache \
    unzip \
    ca-certificates

COPY . /app
WORKDIR /app

RUN chmod +x pocketbase/pocketbase

EXPOSE 8080

CMD ["./pocketbase/pocketbase", "serve", "--http=0.0.0.0:8080"]