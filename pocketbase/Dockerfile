FROM alpine:3.19

ARG PB_VERSION=0.22.22

RUN apk add --no-cache ca-certificates unzip wget

RUN wget -O /tmp/pb.zip \
    "https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_amd64.zip" \
    && unzip /tmp/pb.zip -d /pb/ \
    && rm /tmp/pb.zip

WORKDIR /pb

COPY pb_migrations/ /pb/pb_migrations/
COPY pb_hooks/ /pb/pb_hooks/

EXPOSE 8090

CMD ["/pb/pocketbase", "serve", "--http=0.0.0.0:8090"]
