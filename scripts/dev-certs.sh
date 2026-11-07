#!/bin/sh
# 開発と E2E 用の HTTPS 証明書を .certs/ に生成する(mkcert -install を事前に実行しておくこと)
set -eu
mkdir -p .certs
mkcert -cert-file .certs/localhost.pem -key-file .certs/localhost-key.pem localhost 127.0.0.1 ::1
