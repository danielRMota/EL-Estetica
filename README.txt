EL SAÚDE & ESTÉTICA — SITE E AGENDA ONLINE
==========================================

O que tem aqui
--------------
- index.html, css/, js/, assets/   o site público, com o agendamento online
- admin/                           o painel da Dra. Ericka (endereço do site + /admin)
- server.js                        o servidor que guarda a agenda (Node.js, sem instalar nada além dele)
- dados/                           criado na primeira vez que o servidor roda:
                                   agenda.json (agendamentos e horários) e SENHA-INICIAL.txt


Como rodar no computador
------------------------
1. Instale o Node.js (versão 18 ou mais nova): https://nodejs.org
2. Dê dois cliques em "Abrir o site.bat" (abre o site) ou "Abrir o painel.bat" (abre o
   painel da Dra. Ericka e mostra a senha inicial na janela preta). Os dois ligam a
   agenda; se ela já estiver ligada, só abrem o navegador.
   (Quem preferir o terminal: node server.js)
3. Endereços:  http://localhost:3000        (site)
               http://localhost:3000/admin  (painel)

Deixe a janela preta aberta enquanto usa o site; fechar a janela desliga a agenda.

IMPORTANTE: abrir o index.html direto (dois cliques no arquivo, ou a pré-visualização
de um editor) mostra o site, mas SEM os horários, porque a agenda vem do servidor.
Nesse caso o site mostra um aviso no topo e a assistente oferece o WhatsApp no final.


Primeiro acesso ao painel
-------------------------
Na primeira vez, o servidor cria uma senha e grava em  dados/SENHA-INICIAL.txt.
Entre no painel com ela, abra "Configurações" e troque por uma senha sua.
O arquivo é apagado quando a senha é trocada.

Se preferir definir a senha antes de ligar o servidor, crie a variável de ambiente
SENHA_ADMIN (mínimo de 8 caracteres) antes do primeiro "node server.js".

Esqueceu a senha? Pare o servidor, abra dados/agenda.json, apague o bloco "admin"
(deixe  "admin": null ) e ligue o servidor de novo: ele cria outra senha inicial.


Como a paciente agenda
----------------------
1. Conversa: a assistente virtual do site faz perguntas (nome, o que quer cuidar,
   queixa, há quanto tempo, procedimentos anteriores, idade, gravidez ou amamentação,
   alergias e remédios, condições de saúde, resultado esperado, recado e WhatsApp).
2. Horário: ela escolhe o dia e o horário livres.
3. Confirmação: o horário fica reservado e as respostas vão para o painel.

A assistente segue um roteiro fixo de perguntas (não usa inteligência artificial).
Para mudar as perguntas, edite a lista ROTEIRO em js/site.js.


O que a Dra. Ericka faz no painel
---------------------------------
Agenda
  - vê as pacientes de cada dia e a lista das próximas
  - abre a ficha de cada paciente ("Ver ficha"): queixa, histórico e respostas de
    saúde, com os pontos de atenção em destaque (gravidez, amamentação, alergias,
    condições de saúde, menor de idade)
  - marca, edita (nome, telefone, dia, horário) e exclui agendamentos
    (ao excluir, o horário volta a aparecer como livre no site)
  - bloqueia ou libera um horário, adiciona um horário extra, fecha o dia inteiro
  - toca no telefone da paciente para abrir a conversa no WhatsApp
Horários de atendimento
  - define os horários que se repetem toda semana
Configurações
  - quantos dias à frente a agenda fica aberta e a antecedência mínima
  - troca da senha


Publicar na internet
--------------------
A agenda precisa de uma hospedagem que rode Node.js e mantenha a pasta dados/ gravada
(por exemplo um VPS, Railway ou Render com disco persistente). Hospedagem só de
arquivos (HTML estático) mostra o site, mas não faz o agendamento funcionar.

Variáveis de ambiente opcionais:
  PORT            porta do servidor (padrão 3000)
  PASTA_DADOS     onde gravar a agenda (padrão: pasta dados/ ao lado do server.js)
  SENHA_ADMIN     senha do painel no primeiro uso
  CONFIAR_PROXY   use 1 quando o site estiver atrás de um proxy da hospedagem

Use sempre HTTPS no endereço público: o painel envia a senha pela conexão.
Faça cópia de segurança da pasta dados/ de tempos em tempos.


Observações
-----------
- A pasta dados/ contém nome, telefone e respostas de saúde das pacientes, que são
  dados sensíveis pela LGPD. Não publique essa pasta em repositórios nem a
  compartilhe. Agendamentos com mais de 90 dias são apagados junto com a ficha.
- As fotos de resultados devem ser usadas somente com autorização das pacientes.
- As fotos originais ficam em assets/; o site usa as versões leves de assets/web/.
