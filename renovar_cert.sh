#!/bin/bash
cd /home/fourcraft222/tfg
docker compose run --rm certbot renew
docker compose restart nginx
