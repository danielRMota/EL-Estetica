# Colocar o site no ar com agendamentos (Render)

Este passo a passo coloca no ar o site, a agenda online e o painel da Dra. Ericka no **Render**.
O Render lê o arquivo `render.yaml` deste projeto e configura quase tudo sozinho.

**Custo:** plano **Starter** (US$ 7/mês) + disco de 1 GB para os agendamentos (US$ 0,25/mês).
O plano gratuito não serve: ele apaga os arquivos a cada atualização, e os agendamentos sumiriam.

**Tempo:** uns 20 minutos, mais a espera do domínio (se for usar um).

---

## Parte 1 — Enviar o projeto atualizado para o GitHub

No seu computador, na pasta do projeto, rode um comando de cada vez:

```bash
git add -A
```

```bash
git commit -m "Prepara o site para o Render"
```

```bash
git push
```

> A pasta `dados/` (agendamentos e senha do seu computador) **não** vai para o GitHub. Isso é proposital.

---

## Parte 2 — Criar a conta no Render

1. Entre em **render.com** e clique em **Get Started** (ou **Sign up**).
2. Entre **com a sua conta do GitHub**. Assim o Render já enxerga o repositório `EL-Estetica`.
3. Cadastre um **cartão** em **Billing** (Cobrança). Ele é exigido para o plano pago.

---

## Parte 3 — Criar o site a partir do `render.yaml`

1. No painel do Render, clique em **New +** → **Blueprint**.
2. Escolha o repositório **EL-Estetica** (se não aparecer, clique em **Configure GitHub** e libere o acesso a ele).
3. O Render lê o `render.yaml` e mostra o serviço **el-saude-estetica** com o disco **dados**.
4. Ele pede o valor de **SENHA_ADMIN**: digite a **senha inicial do painel** da Dra. Ericka.
   - Pelo menos 8 caracteres; de preferência 12 ou mais, misturando letras e números.
   - Anote: é com ela que você entra no painel pela primeira vez.
5. Clique em **Apply** (ou **Deploy Blueprint**).

O Render instala e liga o site. Acompanhe em **Logs**: quando aparecer `Site: http://localhost:...` e o status ficar **Live**, está no ar.

O endereço fica no topo da página do serviço, algo como **https://el-saude-estetica.onrender.com**.

---

## Parte 4 — Testar

1. Abra o endereço do site. Os **próximos horários livres** devem aparecer na seção de agendamento.
2. Abra **/admin** no fim do endereço (ex.: `https://el-saude-estetica.onrender.com/admin`) e entre com a senha da Parte 3.
3. Em **Configurações**, troque por uma senha só da Dra. Ericka.
4. Em **Horários de atendimento**, ajuste os dias e horários reais da clínica.
5. Faça um agendamento de teste pelo site (link **Testar agendamento no site**), confira se aparece no painel e depois exclua.

---

## Parte 5 — Conferir o IP dos visitantes (uma vez só)

O site limita tentativas de senha e agendamentos por IP. Para isso funcionar direito, precisamos ver como o Render informa o IP:

1. Com o painel aberto (logado), abra no mesmo navegador: **/api/admin/diagnostico**
   (ex.: `https://el-saude-estetica.onrender.com/api/admin/diagnostico`).
2. Copie o que aparecer na tela e mande para o Claude. Ali aparece o IP da sua própria internet.
3. Se for preciso, a correção é só adicionar uma variável **CABECALHO_IP** em **Environment** no Render.

---

## Parte 6 — Domínio próprio (opcional)

1. No Render, na página do serviço: **Settings** → **Custom Domains** → **Add Custom Domain** → digite o domínio (ex.: `elsaudeestetica.com.br`). O Render adiciona o `www` sozinho.
2. No lugar onde o domínio está registrado (Hostinger, Registro.br, etc.), em **DNS**, crie:

| Tipo  | Nome | Aponta para |
|-------|------|-------------|
| A     | @    | `216.24.57.1` |
| CNAME | www  | o endereço do Render, ex.: `el-saude-estetica.onrender.com` |

   - Apague registros **AAAA** do domínio, se existirem.
   - Apague outros registros **A** de `@` e registros de `www` que já existam.
   - Se o seu DNS tiver registro **ALIAS** ou **ANAME**, pode usar no lugar do **A**, apontando para o endereço do Render.
3. Volte no Render e clique em **Verify**. Pode levar de minutos a algumas horas.

O **HTTPS (cadeado) é automático**: o Render cria e renova o certificado sozinho.

---

## Atualizar o site depois

Sempre que mudar algo no site, no computador:

```bash
git add -A
```

```bash
git commit -m "o que mudou"
```

```bash
git push
```

O Render publica sozinho em poucos minutos. Os agendamentos ficam no disco e **não são apagados**.
Durante a troca de versão, o site fica fora do ar por alguns segundos (é normal com disco).

---

## Cópias de segurança

- O Render tira uma **foto diária do disco** e guarda por 7 dias. Para restaurar: página do serviço → **Disks**.
- De tempos em tempos, guarde uma cópia no seu computador: no Render, abra **Shell** e rode `cat /var/data/agenda.json`. Copie o texto para um arquivo `agenda.json` no seu computador.

---

## Problemas comuns

- **O deploy falhou:** abra **Logs** no Render e veja a última mensagem de erro.
- **"Não foi possível carregar a agenda" no site do Render:** confira em **Logs** se o serviço está **Live**.
- **O painel não abre (erro 404):** a pasta `admin/` não foi para o GitHub. Confira se ela não está no `.gitignore` e faça o push de novo.
- **Esqueci a senha do painel:** no Render, abra **Shell** e rode:

  ```bash
  node -e "const fs=require('fs');const f='/var/data/agenda.json';const d=JSON.parse(fs.readFileSync(f,'utf8'));d.admin=null;fs.writeFileSync(f,JSON.stringify(d,null,2))"
  ```

  Depois clique em **Manual Deploy** → **Restart service** (ou **Deploy latest commit**). A senha volta a ser a da variável **SENHA_ADMIN** (em **Environment**, você pode trocá-la antes de reiniciar). Os agendamentos continuam.
- **O tamanho do disco foi recusado:** se o Render pedir um disco maior que 1 GB, mude `sizeGB` no `render.yaml` para o mínimo que ele indicar.

---

## Depois que estiver no ar

- **GitHub Pages:** a versão do GitHub Pages não tem agenda. Para não ter dois sites diferentes, desligue-a no GitHub: repositório → **Settings** → **Pages** → **Source: None**.
- **Privacidade (LGPD):** o disco guarda nome, telefone e respostas de saúde das pacientes. Não compartilhe o arquivo `agenda.json` nem o acesso à conta do Render.

---

> Os arquivos da pasta `deploy/` são para a alternativa com VPS (servidor próprio). No Render eles não são usados.
