#!/bin/bash

echo "================================================"
echo "   VPNaaS - Script de instalacion automatica"
echo "================================================"
echo ""

# Comprobar que existe el .env.example rellenado
if [ ! -f ".env.example" ]; then
  echo "ERROR: No se encuentra el archivo .env.example"
  echo "Clona el repositorio correctamente antes de ejecutar este script."
  exit 1
fi

# Comprobar que las variables obligatorias estan rellenas
source .env.example

if [ -z "$DOMINIO" ] || [ -z "$ADMIN_USERNAME" ] || [ -z "$ADMIN_PASSWORD" ] || [ -z "$POSTGRES_USER" ] || [ -z "$POSTGRES_PASSWORD" ] || [ -z "$JWT_SECRET" ]; then
  echo "ERROR: Hay variables obligatorias sin rellenar en .env.example"
  echo "Abre el archivo .env.example y rellena todos los campos vacios."
  exit 1
fi

echo "Variables cargadas correctamente desde .env.example"
echo ""

# Instalar Docker si no esta instalado
if ! command -v docker &> /dev/null; then
  echo "Docker no encontrado. Instalando Docker..."
  curl -fsSL https://get.docker.com | sh
  sudo usermod -aG docker $USER
  echo "Docker instalado correctamente."
else
  echo "Docker detectado correctamente."
fi

# Instalar Docker Compose si no esta instalado
if ! docker compose version &> /dev/null; then
  echo "Docker Compose no encontrado. Instalando..."
  sudo apt-get update
  sudo apt-get install -y docker-compose-plugin
  echo "Docker Compose instalado correctamente."
else
  echo "Docker Compose detectado correctamente."
fi

echo ""
echo "Generando configuracion..."

# Crear carpetas necesarias
mkdir -p wireguard/config
mkdir -p nginx
mkdir -p certbot/www
mkdir -p certbot/conf

# Construir imagen temporal para generar claves WireGuard
echo "Generando claves WireGuard..."
docker build -t wg-temp wireguard/ -q
PRIVKEY=$(docker run --rm --entrypoint sh wg-temp -c "wg genkey")
PUBKEY=$(echo $PRIVKEY | docker run --rm -i --entrypoint sh wg-temp -c "wg pubkey")
docker rmi wg-temp -f > /dev/null 2>&1

# Crear wg0.conf
cat > wireguard/config/wg0.conf << EOF
[Interface]
Address = 10.0.0.1/24
ListenPort = ${WG_PORT}
PrivateKey = ${PRIVKEY}

PostUp   = iptables -A FORWARD -i wg0 -j ACCEPT; iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE
PostDown = iptables -D FORWARD -i wg0 -j ACCEPT; iptables -t nat -D POSTROUTING -o eth0 -j MASQUERADE
EOF

sudo chmod 600 wireguard/config/wg0.conf

# Crear .env copiando desde .env.example y añadiendo las claves generadas
cp .env.example .env
echo "SERVER_PUBLIC_KEY=${PUBKEY}" >> .env
echo "SERVER_ENDPOINT=${DOMINIO}:${WG_PORT}" >> .env

# Crear nginx.conf temporal solo HTTP para obtener certificado
cat > nginx/nginx.conf << EOF
server {
    listen 80;
    server_name ${DOMINIO};

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        proxy_pass http://mi-backend:3000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
    }
}
EOF

echo ""
echo "Levantando contenedores..."
docker compose up -d --build

echo ""
echo "Esperando a que Nginx este listo..."
sleep 10

# Obtener certificado SSL
echo "Obteniendo certificado SSL de Let's Encrypt..."
docker compose run --rm certbot certonly --webroot \
  -w /var/www/certbot \
  -d ${DOMINIO} \
  --register-unsafely-without-email \
  --agree-tos

# Actualizar nginx.conf con HTTPS
cat > nginx/nginx.conf << EOF
server {
    listen 80;
    server_name ${DOMINIO};

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 301 https://\$host\$request_uri;
    }
}

server {
    listen 443 ssl;
    server_name ${DOMINIO};

    ssl_certificate /etc/letsencrypt/live/${DOMINIO}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${DOMINIO}/privkey.pem;

    location / {
        proxy_pass http://mi-backend:3000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
    }
}
EOF

# Reiniciar Nginx con HTTPS
docker compose restart nginx

echo ""
echo "================================================"
echo "   Instalacion completada correctamente"
echo "================================================"
echo ""
echo "Accede a tu panel en: https://${DOMINIO}"
echo "Usuario admin: ${ADMIN_USERNAME}"
echo ""
echo "IMPORTANTE: Abre el puerto ${WG_PORT}/UDP y los"
echo "puertos 80/TCP y 443/TCP en tu router."
echo "================================================"
