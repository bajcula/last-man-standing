FROM alpine:latest

RUN apk update && apk add --no-cache \
    unzip \
    ca-certificates \
    wget

WORKDIR /app

RUN wget https://github.com/pocketbase/pocketbase/releases/download/v0.22.21/pocketbase_0.22.21_linux_amd64.zip \
    && unzip pocketbase_0.22.21_linux_amd64.zip \
    && rm pocketbase_0.22.21_linux_amd64.zip \
    && chmod +x pocketbase

COPY pocketbase/pb_data ./pb_data
COPY pocketbase/pb_migrations ./pb_migrations

EXPOSE 8080

CMD ["./pocketbase", "serve", "--http=0.0.0.0:8080"]