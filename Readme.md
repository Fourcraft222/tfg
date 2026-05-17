# VPNaaS

Sistema de VPN doméstico construido desde cero con WireGuard, Docker y una plataforma web propia para gestionar usuarios y dispositivos.

---

## Qué hace

Convierte una Raspberry Pi o cualquier linux en un servidor VPN privado desde el que puedes dar acceso a clientes externos de forma controlada. Cada usuario tiene su propia cuenta, puede conectar hasta 5 dispositivos y descargar su configuración directamente desde el panel web. Las credenciales se renuevan automáticamente cada año. Destacar que todos los usuarios saldran con la misma IP al exterior (a Internet) que sera la IP pública del host de este sistema.

El sistema está compuesto por cinco contenedores Docker que trabajan juntos: WireGuard (implementado desde cero), un backend Node.js con API REST, PostgreSQL, Nginx como reverse proxy y Certbot para el certificado SSL.

---

## Requisitos previos

Antes de instalar necesitas tener listo lo siguiente:

- S.O: Raspberry Pi OS Bookworm, Linux o derivados
- Un dominio DDNS apuntando a tu IP pública (puedes usar [DuckDNS](https://www.duckdns.org) gratis)
- Port forwarding en tu router:
  - Puerto **80/TCP** → IP de la Pi o dispositivo linux
  - Puerto **443/TCP** → IP de la Pi o dispositivo linux
  - Puerto **51820/UDP** (o el que elijas) → IP de la Pi o dispositivo linux

---

## Instalación

Antes de iniciar el script introduzca las variables que estan en el .env.example

```bash
git clone https://github.com/fourcraft222/tfg.git
cd tfg
chmod +x autoInstall.sh
./autoInstall.sh
```

El script te pedirá los datos necesarios y se encarga del resto: instala Docker si no está, genera las claves WireGuard, crea la configuración, levanta los contenedores y obtiene el certificado SSL automáticamente.

Al terminar, accede al panel en `https://tudominio.duckdns.org`.

---

## Uso básico

**Como administrador** puedes crear usuarios, ver todos los dispositivos conectados, monitorizar el tráfico en tiempo real y cambiar el modo de acceso web entre abierto (accesible desde Internet) y cerrado (solo red local y VPN).

**Como usuario** puedes añadir tus dispositivos, descargar el archivo `.conf` o escanear el QR desde la app de WireGuard, y gestionar la renovación automática de tus credenciales.

---

## Stack

| Componente | Tecnología |
|---|---|
| VPN | WireGuard (Dockerfile propio) |
| Backend | Node.js + Express |
| Base de datos | PostgreSQL |
| Reverse proxy | Nginx + Let's Encrypt |
| Orquestación | Docker Compose |
| Hardware | Raspberry Pi 5 |

---

## Estructura del proyecto

```
tfg/
├── wireguard/          # Dockerfile e entrypoint de WireGuard
├── backend/            # Dockerfile, API REST y lógica del sistema
│   └── src/
│       ├── admin.js    # Rutas de administración
│       ├── usuario.js  # Rutas de usuario
│       ├── auth.js     # Autenticación JWT
│       └── renovacion.js # Renovación automática de credenciales
├── frontend/           # Panel web (HTML, CSS, JS)
├── autoInstall.sh          # Script de instalación automática
└── docker-compose.yml
```
