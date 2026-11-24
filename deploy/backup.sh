#!/usr/bin/env bash
# Cópia de segurança dos agendamentos e da configuração da agenda.
# Roda todo dia às 3h30 (configurado pelo instalar.sh) e antes de cada atualização.
# Guarda 30 dias de cópias em /home/el/backups.
set -euo pipefail

DADOS=/home/el/dados
BACKUPS=/home/el/backups
mkdir -p "$BACKUPS"

if [ -f "$DADOS/agenda.json" ]; then
  cp "$DADOS/agenda.json" "$BACKUPS/agenda-$(date +%Y-%m-%d_%H%M).json"
  chmod 600 "$BACKUPS"/agenda-*.json
fi

# apaga cópias com mais de 30 dias
find "$BACKUPS" -name 'agenda-*.json' -mtime +30 -delete
