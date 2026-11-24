#!/usr/bin/env bash
# =====================================================================
#  EL Saúde & Estética — atualizar o site no VPS depois de um "git push"
#
#  Uso (como root, dentro do VPS):
#    bash /home/el/site/deploy/atualizar.sh
#
#  Os agendamentos e a senha do painel ficam em /home/el/dados e não são tocados.
# =====================================================================
set -euo pipefail

SITE=/home/el/site
RAMO="${RAMO:-master}"

if [ "$(id -u)" -ne 0 ]; then
  echo "Rode como root."
  exit 1
fi

echo "==> Guardando uma cópia dos agendamentos antes de atualizar"
sudo -u el /bin/bash "$SITE/deploy/backup.sh"

echo "==> Baixando a versão nova do GitHub"
sudo -u el git -C "$SITE" fetch --quiet origin "$RAMO"
sudo -u el git -C "$SITE" reset --hard "origin/$RAMO"
sudo -u el git -C "$SITE" log -1 --format='    versão: %h  %s  (%cr)'

echo "==> Reiniciando o site"
install -m 644 "$SITE/deploy/el-saude.service" /etc/systemd/system/el-saude.service
systemctl daemon-reload
systemctl restart el-saude

sleep 2
if curl -fsS http://127.0.0.1:3000/api/agenda >/dev/null; then
  echo -e "\033[1;32mSite atualizado e funcionando.\033[0m"
else
  echo -e "\033[1;31mO site não respondeu depois da atualização. Veja:\033[0m journalctl -u el-saude -n 50"
  exit 1
fi
