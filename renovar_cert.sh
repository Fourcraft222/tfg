#!/bin/bash
cd "$(dirname "$0")"
docker compose run --rm certbot renew
docker compose restart nginx
