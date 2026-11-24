#!/usr/bin/env bash
# =====================================================================
#  EL Saúde & Estética — instalação no VPS (Ubuntu 22.04 ou 24.04)
#
#  Uso (como root, dentro do VPS):
#    bash instalar.sh seudominio.com.br
#  Sem domínio ainda? Rode sem nada:  bash instalar.sh
#  (o site abre pelo IP do servidor; o domínio pode ser colocado depois
#   rodando o mesmo comando de novo com o domínio)
# =====================================================================
set -euo pipefail

DOMINIO="${1:-}"
REPO="${REPO:-https://github.com/danielRMota/EL-Estetica.git}"
RAMO="${RAMO:-master}"
CASA=/home/el
SITE=$CASA/site
DADOS=$CASA/dados
BACKUPS=$CASA/backups

passo() { printf '\n\033[1;33m==> %s\033[0m\n' "$1"; }

if [ "$(id -u)" -ne 0 ]; then
  echo "Rode como root (no VPS da Hostinger, entre como root)."
  exit 1
fi

passo "1/8 Atualizando a lista de programas"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y ca-certificates curl git nginx ufw

passo "2/8 Instalando o Node.js 22"
NODE_MAIOR=0
if command -v node >/dev/null 2>&1; then
  NODE_MAIOR=$(node -v | sed 's/^v//' | cut -d. -f1)
fi
if [ "$NODE_MAIOR" -lt 18 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
echo "Node.js $(node -v)"

passo "3/8 Criando o usuário 'el', que roda o site (sem poderes de administrador)"
if ! id el >/dev/null 2>&1; then
  adduser --system --group --home "$CASA" --shell /usr/sbin/nologin el
fi
mkdir -p "$DADOS" "$BACKUPS"
chown el:el "$CASA" "$DADOS" "$BACKUPS"
chmod 700 "$DADOS" "$BACKUPS"

passo "4/8 Baixando o site do GitHub"
if [ -d "$SITE/.git" ]; then
  sudo -u el git -C "$SITE" fetch --quiet origin "$RAMO"
  sudo -u el git -C "$SITE" reset --hard "origin/$RAMO"
else
  sudo -u el git clone --branch "$RAMO" "$REPO" "$SITE"
fi
if [ ! -d "$SITE/admin" ]; then
  echo "ATENÇÃO: a pasta admin/ (painel da Dra. Ericka) não veio do GitHub."
  echo "Confira se ela foi enviada (ela não pode estar no .gitignore)."
fi

passo "5/8 Ligando o site como serviço (liga sozinho e volta se cair)"
install -m 644 "$SITE/deploy/el-saude.service" /etc/systemd/system/el-saude.service
systemctl daemon-reload
systemctl enable el-saude >/dev/null
systemctl restart el-saude

passo "6/8 Configurando o Nginx"
if [ -n "$DOMINIO" ] && [ -d "/etc/letsencrypt/live/$DOMINIO" ] && [ -f /etc/nginx/sites-available/el-saude ]; then
  # o HTTPS já foi configurado pelo certbot: não sobrescreve a configuração dele
  echo "HTTPS já configurado para $DOMINIO; mantendo a configuração do Nginx."
else
NOME="${DOMINIO:-_}"
if [ -n "$DOMINIO" ]; then
  NOME="$DOMINIO www.$DOMINIO"
fi
sed "s/__DOMINIO__/$NOME/" "$SITE/deploy/nginx-el-saude.conf" > /etc/nginx/sites-available/el-saude
if [ -z "$DOMINIO" ]; then
  # sem domínio: este vira o site padrão, que responde pelo IP
  sed -i 's/listen 80;/listen 80 default_server;/; s/listen \[::\]:80;/listen [::]:80 default_server;/' /etc/nginx/sites-available/el-saude
fi
fi
ln -sf /etc/nginx/sites-available/el-saude /etc/nginx/sites-enabled/el-saude
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

passo "7/8 Firewall: liberando só SSH, HTTP e HTTPS"
ufw allow OpenSSH >/dev/null
ufw allow 'Nginx Full' >/dev/null
ufw --force enable >/dev/null
ufw status | sed -n '1,8p'

passo "8/8 Cópia de segurança diária dos agendamentos (3h30 da manhã)"
cat > /etc/cron.d/el-saude-backup <<EOF
30 3 * * * el /bin/bash $SITE/deploy/backup.sh
EOF
chmod 644 /etc/cron.d/el-saude-backup

# confere se o site respondeu
sleep 2
if curl -fsS http://127.0.0.1:3000/api/agenda >/dev/null; then
  echo -e "\n\033[1;32mSite e agenda funcionando!\033[0m"
else
  echo -e "\n\033[1;31mO site não respondeu. Veja o motivo com:\033[0m journalctl -u el-saude -n 50"
  exit 1
fi

IP=$(curl -fsS -4 https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}')
echo
echo "------------------------------------------------------------"
if [ -n "$DOMINIO" ]; then
  echo " Site:   http://$DOMINIO   (e pelo IP enquanto o domínio propaga)"
  echo " Painel: http://$DOMINIO/admin"
  echo
  echo " Próximo passo (depois que o domínio apontar para $IP):"
  echo "   apt-get install -y certbot python3-certbot-nginx"
  echo "   certbot --nginx -d $DOMINIO -d www.$DOMINIO"
else
  echo " Site:   http://$IP"
  echo " Painel: http://$IP/admin"
fi
echo
if [ -f "$DADOS/SENHA-INICIAL.txt" ]; then
  grep '^Senha:' "$DADOS/SENHA-INICIAL.txt" | sed 's/^/ Senha inicial do painel -> /'
  echo " (troque em Configurações no primeiro acesso)"
fi
echo "------------------------------------------------------------"
