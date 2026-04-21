#!/bin/bash
set -e

# Levantar la interfaz WireGuard
wg-quick up wg0

echo "WireGuard activo:"
wg show

# Mantener el contenedor vivo
tail -f /dev/null
