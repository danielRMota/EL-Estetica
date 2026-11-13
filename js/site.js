/* EL Saúde & Estética — animações, galeria, conversa de pré-atendimento e agenda */
(() => {
  'use strict';

  const WHATSAPP = '5583991239706';
  const $ = (id) => document.getElementById(id);
  const semMovimento = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const esperar = (ms) => new Promise((ok) => setTimeout(ok, semMovimento ? 0 : ms));

  function criar(tag, classe, texto) {
    const no = document.createElement(tag);
    if (classe) no.className = classe;
    if (texto != null) no.textContent = texto;
    return no;
  }

  /* =====================================================================
     Animações da página
     ===================================================================== */

  // Título da abertura: cada palavra sobe em sequência.
  const titulo = $('titulo-abertura');
  const textoTitulo = titulo.textContent.trim();
  titulo.setAttribute('aria-label', textoTitulo);
  titulo.replaceChildren(
    ...textoTitulo.split(/\s+/).flatMap((palavra, i) => {
      const fora = criar('span', 'palavra');
      fora.setAttribute('aria-hidden', 'true');
      const dentro = criar('span', null, palavra);
      dentro.style.animationDelay = `${0.1 + i * 0.07}s`;
      fora.append(dentro);
      return [fora, ' '];
    }),
  );

  // Blocos que aparecem conforme a página rola.
  const revelar = new IntersectionObserver(
    (entradas) => {
      for (const entrada of entradas) {
        if (!entrada.isIntersecting) continue;
        entrada.target.classList.add('visivel');
        revelar.unobserve(entrada.target);
      }
    },
    { threshold: 0.12, rootMargin: '0px 0px -6% 0px' },
  );
  document.querySelectorAll('[data-revelar]').forEach((no) => revelar.observe(no));

  const passos = $('passos');
  [...passos.children].forEach((li, i) => (li.style.transitionDelay = `${0.2 + i * 0.18}s`));
  revelar.observe(passos);

  // Topo: sombra ao rolar e barra de progresso da leitura.
  const topo = $('topo');
  const progresso = $('progresso-pagina');
  let quadroPedido = false;
  function aoRolar() {
    quadroPedido = false;
    const total = document.documentElement.scrollHeight - innerHeight;
    topo.classList.toggle('rolou', scrollY > 8);
    progresso.style.transform = `scaleX(${total > 0 ? Math.min(scrollY / total, 1) : 0})`;
  }
  addEventListener(
    'scroll',
    () => {
      if (!quadroPedido) {
        quadroPedido = true;
        requestAnimationFrame(aoRolar);
      }
    },
    { passive: true },
  );
  aoRolar();

  // Menu: destaca a seção que está na tela.
  const linksDoMenu = [...document.querySelectorAll('.menu a')];
  const secaoAtual = new IntersectionObserver(
    (entradas) => {
      for (const entrada of entradas) {
        if (!entrada.isIntersecting) continue;
        for (const link of linksDoMenu) {
          const atual = link.getAttribute('href') === '#' + entrada.target.id;
          if (atual) link.setAttribute('aria-current', 'true');
          else link.removeAttribute('aria-current');
        }
      }
    },
    { rootMargin: '-45% 0px -50% 0px' },
  );
  document.querySelectorAll('main section[id]').forEach((secao) => secaoAtual.observe(secao));

  // Menu do celular: abre e fecha pelo botão, fecha ao escolher uma seção, tocar fora ou apertar Esc.
  const menuBotao = $('menu-botao');
  function abrirMenu(abrir) {
    topo.classList.toggle('menu-aberto', abrir);
    menuBotao.setAttribute('aria-expanded', String(abrir));
    menuBotao.setAttribute('aria-label', abrir ? 'Fechar menu' : 'Abrir menu');
  }
  menuBotao.addEventListener('click', () => abrirMenu(!topo.classList.contains('menu-aberto')));
  $('menu').addEventListener('click', (evento) => {
    if (evento.target.closest('a')) abrirMenu(false);
  });
  document.addEventListener('click', (evento) => {
    if (topo.classList.contains('menu-aberto') && !topo.contains(evento.target)) abrirMenu(false);
  });
  document.addEventListener('keydown', (evento) => {
    if (evento.key === 'Escape' && topo.classList.contains('menu-aberto')) {
      abrirMenu(false);
      menuBotao.focus();
    }
  });
  matchMedia('(min-width: 961px)').addEventListener('change', (m) => {
    if (m.matches) abrirMenu(false);
  });

  // A logo da abertura acompanha o ponteiro, e um anel dourado segue o mouse pela página.
  const logoCentral = document.querySelector('.logo-central');
  const cursor = $('cursor');
  if (!semMovimento && matchMedia('(pointer: fine)').matches) {
    $('inicio').addEventListener('pointermove', (evento) => {
      const x = evento.clientX / innerWidth - 0.5;
      const y = evento.clientY / innerHeight - 0.5;
      logoCentral.style.setProperty('--px', `${(x * 16).toFixed(1)}px`);
      logoCentral.style.setProperty('--py', `${(y * 16).toFixed(1)}px`);
    });

    let alvoX = 0;
    let alvoY = 0;
    let cursorX = 0;
    let cursorY = 0;
    let seguindo = false;
    const seguir = () => {
      cursorX += (alvoX - cursorX) * 0.18;
      cursorY += (alvoY - cursorY) * 0.18;
      cursor.style.transform = `translate(${cursorX.toFixed(1)}px, ${cursorY.toFixed(1)}px)`;
      if (Math.abs(alvoX - cursorX) + Math.abs(alvoY - cursorY) > 0.3) requestAnimationFrame(seguir);
      else seguindo = false;
    };
    addEventListener('pointermove', (evento) => {
      if (evento.pointerType !== 'mouse') return;
      alvoX = evento.clientX;
      alvoY = evento.clientY;
      if (!cursor.classList.contains('ligado')) {
        cursorX = alvoX;
        cursorY = alvoY;
        cursor.classList.add('ligado');
      }
      cursor.classList.toggle('sobre', Boolean(evento.target.closest('a, button, summary, input')));
      if (!seguindo) {
        seguindo = true;
        requestAnimationFrame(seguir);
      }
    });
    document.documentElement.addEventListener('pointerleave', () => cursor.classList.remove('ligado'));
  }

  // Aberto direto do computador (sem o servidor): avisa e, se a agenda estiver ligada, vai para ela.
  const abertoComoArquivo = !/^https?:$/.test(location.protocol);
  if (abertoComoArquivo) {
    $('aviso-local').hidden = false;
    const teste = new Image();
    teste.onload = () => location.replace('http://localhost:3000/' + location.hash);
    teste.src = 'http://localhost:3000/assets/favicon.png?' + Date.now();
  }

  /* =====================================================================
     Galeria e foto ampliada
     ===================================================================== */

  const galeria = $('galeria');
  const rolarGaleria = (sentido) =>
    galeria.scrollBy({ left: sentido * galeria.clientWidth * 0.7, behavior: semMovimento ? 'auto' : 'smooth' });
  $('galeria-voltar').addEventListener('click', () => rolarGaleria(-1));
  $('galeria-avancar').addEventListener('click', () => rolarGaleria(1));

  const fotos = [...galeria.querySelectorAll('.foto')];
  const visor = $('visor');
  let fotoAberta = 0;

  function mostrarFoto(i) {
    fotoAberta = (i + fotos.length) % fotos.length;
    const origem = fotos[fotoAberta].querySelector('img');
    $('visor-imagem').src = origem.currentSrc || origem.src;
    $('visor-imagem').alt = origem.alt;
    $('visor-legenda').textContent = fotos[fotoAberta].parentElement.querySelector('figcaption').textContent;
  }

  fotos.forEach((foto, i) =>
    foto.addEventListener('click', () => {
      mostrarFoto(i);
      visor.showModal();
    }),
  );
  $('visor-fechar').addEventListener('click', () => visor.close());
  $('visor-voltar').addEventListener('click', () => mostrarFoto(fotoAberta - 1));
  $('visor-avancar').addEventListener('click', () => mostrarFoto(fotoAberta + 1));
  visor.addEventListener('click', (evento) => {
    if (evento.target === visor) visor.close();
  });
  visor.addEventListener('keydown', (evento) => {
    if (evento.key === 'ArrowLeft') mostrarFoto(fotoAberta - 1);
    if (evento.key === 'ArrowRight') mostrarFoto(fotoAberta + 1);
  });

  /* =====================================================================
     Agenda: dados e formatos
     ===================================================================== */

  const el = {
    proximos: $('proximos-lista'),
    proximosNota: $('proximos-nota'),
    painel: $('painel-agendar'),
    etapas: [...$('etapas').children],
    etapaConversa: $('etapa-conversa'),
    etapaHorario: $('etapa-horario'),
    etapaConfirmado: $('etapa-confirmado'),
    paciente: $('escolha-paciente'),
    comAgenda: $('agenda-conteudo'),
    semAgenda: $('agenda-indisponivel'),
    semAgendaWhats: $('sem-agenda-whats'),
    dias: $('agenda-dias'),
    horas: $('agenda-horas'),
    diaEscolhido: $('agenda-dia-escolhido'),
    resumo: $('agenda-resumo'),
    erro: $('agenda-erro'),
    enviar: $('agenda-enviar'),
    confirmadoTexto: $('confirmado-texto'),
    confirmadoWhats: $('confirmado-whats'),
  };

  let agenda = null;
  let agendaTentada = false;
  let dia = null;
  let hora = null;
  let enviando = false;

  const utc = { timeZone: 'UTC' };
  const fSemanaCurta = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', ...utc });
  const fMesCurto = new Intl.DateTimeFormat('pt-BR', { month: 'short', ...utc });
  const fLonga = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', ...utc });

  const paraData = (iso) => new Date(iso + 'T12:00:00Z');
  const semPonto = (texto) => texto.replace('.', '');
  const maiuscula = (texto) => texto.charAt(0).toUpperCase() + texto.slice(1);

  function somarDias(iso, n) {
    const d = paraData(iso);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }

  function nomeDoDia(iso) {
    const longa = fLonga.format(paraData(iso));
    if (agenda && iso === agenda.hoje) return 'Hoje, ' + longa;
    if (agenda && iso === somarDias(agenda.hoje, 1)) return 'Amanhã, ' + longa;
    return maiuscula(longa);
  }

  function formatarTelefone(valor) {
    const d = String(valor).replace(/\D/g, '').slice(0, 11);
    if (d.length <= 2) return d.length ? '(' + d : '';
    if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
    if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  }

  function linkWhats(mensagem) {
    return `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(mensagem)}`;
  }

  function avisoSemAgenda(texto) {
    const p = criar('p', 'aviso-agenda', texto + ' ');
    const a = criar('a', null, 'Agende pelo WhatsApp');
    a.href = linkWhats('Olá! Vim pelo site da EL Saúde & Estética e gostaria de agendar uma avaliação.');
    a.target = '_blank';
    a.rel = 'noopener';
    p.append(a, '.');
    return p;
  }

  async function carregar() {
    try {
      const resposta = await fetch('/api/agenda', { headers: { Accept: 'application/json' } });
      if (!resposta.ok) throw new Error('agenda indisponível');
      aplicarAgenda(await resposta.json());
      return true;
    } catch {
      if (!agenda) {
        // sem agenda nenhuma: avisa e mantém uma saída pelo WhatsApp
        el.proximos.replaceChildren(avisoSemAgenda('Não foi possível carregar a agenda agora.'));
        desenharDias();
      }
      return false;
    }
  }

  /** Sem dia escolhido, já abre o primeiro dia com horário livre para os horários aparecerem. */
  function escolherPrimeiroDiaLivre() {
    if (dia || !agenda) return;
    const primeiro = agenda.dias.find((d) => d.livres.length);
    if (primeiro) dia = primeiro.data;
  }

  function aplicarAgenda(nova) {
    agenda = nova;
    const diaAtual = dia && agenda.dias.find((d) => d.data === dia);
    if (!diaAtual || !diaAtual.livres.length) {
      dia = null;
      hora = null;
    } else if (hora && !diaAtual.livres.includes(hora)) {
      hora = null;
    }
    if (!dia) el.proximosNota.hidden = true;
    if (!el.etapaHorario.hidden) escolherPrimeiroDiaLivre();
    desenharProximos();
    desenharDias();
    desenharHoras();
    atualizarResumo();
  }

  /* ---------- próximos horários livres ---------- */

  function desenharProximos() {
    const comVaga = agenda.dias.filter((d) => d.livres.length).slice(0, 3);
    if (!comVaga.length) {
      el.proximos.replaceChildren(avisoSemAgenda('Não há horários livres nos próximos dias.'));
      return;
    }
    el.proximos.replaceChildren(
      ...comVaga.map((d) => {
        const bloco = criar('div', 'proximos-dia');
        bloco.append(criar('p', 'proximos-dia-nome', nomeDoDia(d.data)));
        const linha = criar('div', 'proximos-horas');
        for (const h of d.livres.slice(0, 4)) {
          const botao = criar('button', 'hora', h);
          botao.type = 'button';
          botao.setAttribute('aria-pressed', String(d.data === dia && h === hora));
          botao.setAttribute('aria-label', `${nomeDoDia(d.data)} às ${h}`);
          botao.addEventListener('click', () => preferirHorario(d.data, h));
          linha.append(botao);
        }
        if (d.livres.length > 4) linha.append(criar('span', 'proximos-mais', `+${d.livres.length - 4}`));
        bloco.append(linha);
        return bloco;
      }),
    );
  }

  function preferirHorario(data, h) {
    dia = data;
    hora = h;
    desenharProximos();
    desenharDias();
    desenharHoras();
    atualizarResumo();
    if (conversaPronta) {
      el.proximosNota.hidden = true;
      mostrarEtapa('horario');
    } else {
      el.proximosNota.textContent =
        `Anotei ${nomeDoDia(data).toLowerCase()} às ${h}. Responda às perguntas da assistente para confirmar: ` +
        'o horário só fica reservado depois da confirmação.';
      el.proximosNota.hidden = false;
      iniciarConversa();
    }
    el.painel.scrollIntoView({ block: 'nearest', behavior: semMovimento ? 'auto' : 'smooth' });
  }

  /* =====================================================================
     Conversa de pré-atendimento
     ===================================================================== */

  const chat = {
    mensagens: $('chat-mensagens'),
    opcoes: $('chat-opcoes'),
    form: $('chat-form'),
    campo: $('chat-campo'),
    isca: $('campo-site'),
    enviar: $('chat-enviar'),
    barra: $('chat-barra'),
    estado: $('chat-estado'),
  };

  const primeiroNome = (nome) => nome.split(' ')[0];

  const ROTEIRO = [
    {
      id: 'inicio',
      falas: [
        'Oi! Eu sou a assistente virtual da EL Saúde & Estética.',
        'Antes de escolher o horário, vou fazer algumas perguntas rápidas. Assim a Dra. Ericka já chega na avaliação conhecendo o seu caso. Leva uns 2 minutos.',
        'Suas respostas ficam visíveis só para a Dra. Ericka. Podemos começar?',
      ],
      opcoes: ['Podemos, sim'],
    },
    {
      id: 'nome',
      rotulo: 'Nome',
      falas: ['Como você se chama? Me diga nome e sobrenome.'],
      texto: { placeholder: 'Seu nome completo', autocomplete: 'name', max: 80 },
      validar: (v) => (v.length >= 3 && /\p{L}{2,}/u.test(v) ? null : 'Me diga o seu nome para eu continuar.'),
    },
    {
      id: 'areas',
      rotulo: 'O que quer cuidar',
      falas: (f) => [`Prazer, ${primeiroNome(f.nome)}! O que você gostaria de cuidar? Pode marcar mais de uma opção.`],
      multi: true,
      opcoes: ['Rosto', 'Lábios', 'Pele', 'Corpo', 'Glúteos', 'Ainda não sei'],
    },
    {
      id: 'queixa',
      rotulo: 'Queixa',
      falas: ['Agora me conte com as suas palavras: o que te incomoda hoje ou o que você gostaria de mudar?'],
      texto: { placeholder: 'Conte o que te incomoda', max: 600 },
      validar: (v) =>
        v.length >= 5 ? null : 'Pode contar com um pouco mais de detalhe? Isso ajuda muito a Dra. Ericka.',
    },
    {
      id: 'tempo',
      rotulo: 'Há quanto tempo',
      falas: ['Entendi. Há quanto tempo isso te incomoda?'],
      opcoes: ['Menos de 6 meses', 'De 6 meses a 2 anos', 'Mais de 2 anos', 'Não sei dizer'],
    },
    {
      id: 'procedimentos',
      rotulo: 'Procedimentos anteriores',
      falas: ['Você já fez algum procedimento estético antes?'],
      opcoes: ['Nunca fiz', 'Já fiz'],
      detalhe: { quando: 'Já fiz', fala: 'Qual procedimento e mais ou menos quando?', placeholder: 'Ex.: botox, há 1 ano' },
    },
    {
      id: 'idade',
      rotulo: 'Idade',
      falas: ['Qual é a sua idade?'],
      texto: { placeholder: 'Sua idade', modo: 'numeric', max: 3 },
      validar: (v) => {
        const n = Number(v);
        return /^\d{1,3}$/.test(v) && n >= 10 && n <= 110 ? null : 'Me diga a sua idade em números, por exemplo 34.';
      },
      depois: (v) => (Number(v) < 18 ? 'Anotado. Menores de 18 anos precisam vir com um responsável.' : null),
    },
    {
      id: 'gestante',
      rotulo: 'Gravidez ou amamentação',
      falas: ['Agora três perguntas de saúde, importantes para a sua segurança.', 'Você está grávida ou amamentando?'],
      opcoes: ['Não', 'Estou grávida', 'Estou amamentando', 'Não se aplica'],
    },
    {
      id: 'alergias',
      rotulo: 'Alergias e remédios',
      falas: ['Tem alguma alergia ou toma algum remédio de uso contínuo?'],
      opcoes: ['Não', 'Sim'],
      detalhe: { quando: 'Sim', fala: 'Quais?', placeholder: 'Alergias e remédios' },
    },
    {
      id: 'condicoes',
      rotulo: 'Condições de saúde',
      falas: [
        'Tem alguma condição de saúde que a Dra. Ericka precise saber? Por exemplo diabetes, doença autoimune, herpes labial ou dificuldade de cicatrização.',
      ],
      opcoes: ['Não', 'Sim', 'Prefiro falar na avaliação'],
      detalhe: { quando: 'Sim', fala: 'Qual?', placeholder: 'Condição de saúde' },
    },
    {
      id: 'expectativa',
      rotulo: 'Resultado esperado',
      falas: ['Quase lá. Que tipo de resultado você espera?'],
      opcoes: ['Bem natural, discreto', 'Uma mudança visível', 'Quero ouvir a opinião da Dra. Ericka'],
    },
    {
      id: 'recado',
      rotulo: 'Recado',
      falas: ['Quer deixar algum recado para a Dra. Ericka? Pode escrever ou pular.'],
      opcoes: ['Não, é só isso'],
      texto: { placeholder: 'Escreva seu recado', max: 600 },
      gravar: (v) => (v === 'Não, é só isso' ? '' : v),
    },
    {
      id: 'telefone',
      rotulo: 'WhatsApp',
      falas: ['Por último, qual é o seu WhatsApp com DDD? É por ele que a clínica confirma o horário.'],
      texto: { placeholder: '(83) 99999-9999', tipo: 'tel', modo: 'numeric', autocomplete: 'tel-national', max: 16 },
      validar: (v) => {
        const d = v.replace(/\D/g, '');
        return d.length === 10 || d.length === 11 ? null : 'Preciso do número com DDD, por exemplo (83) 99999-9999.';
      },
      gravar: (v) => v.replace(/\D/g, ''),
    },
  ];

  let ficha = {};
  let indice = -1;
  let aguardando = null; // 'texto' ou 'detalhe'
  let sessao = 0; // muda quando a conversa recomeça, para cancelar falas pendentes
  let conversaIniciada = false;
  let conversaPronta = false;
  let jaInteragiu = false;

  const passoAtual = () => ROTEIRO[indice];

  function rolarConversa() {
    chat.mensagens.scrollTo({ top: chat.mensagens.scrollHeight, behavior: semMovimento ? 'auto' : 'smooth' });
  }

  async function falaBot(texto, daSessao) {
    const digitando = criar('div', 'msg msg-bot digitando');
    digitando.append(criar('span'), criar('span'), criar('span'));
    digitando.setAttribute('aria-hidden', 'true');
    chat.mensagens.append(digitando);
    chat.estado.textContent = 'digitando…';
    rolarConversa();
    await esperar(450 + Math.min(texto.length * 13, 900));
    digitando.remove();
    chat.estado.textContent = 'Assistente virtual';
    if (daSessao !== sessao) return false;
    chat.mensagens.append(criar('div', 'msg msg-bot', texto));
    rolarConversa();
    return true;
  }

  function falaEu(texto) {
    chat.mensagens.append(criar('div', 'msg msg-eu', texto));
    rolarConversa();
  }

  function fecharEntrada() {
    aguardando = null;
    chat.opcoes.replaceChildren();
    chat.campo.value = '';
    chat.campo.disabled = true;
    chat.campo.placeholder = 'Aguarde a próxima pergunta';
    chat.enviar.disabled = true;
  }

  function abrirTexto(config, modo) {
    aguardando = modo;
    chat.campo.disabled = false;
    chat.enviar.disabled = false;
    chat.campo.type = config.tipo || 'text';
    chat.campo.placeholder = config.placeholder || 'Escreva sua resposta';
    chat.campo.inputMode = config.modo || 'text';
    chat.campo.autocomplete = config.autocomplete || 'off';
    chat.campo.maxLength = config.max || 600;
    if (jaInteragiu) chat.campo.focus({ preventScroll: true });
  }

  function mostrarOpcoes(passo) {
    const marcadas = new Set();
    const botoes = passo.opcoes.map((texto, i) => {
      const botao = criar('button', 'opcao', texto);
      botao.type = 'button';
      botao.style.animationDelay = `${i * 0.06}s`;
      if (passo.multi) {
        botao.setAttribute('aria-pressed', 'false');
        botao.addEventListener('click', () => {
          if (marcadas.has(texto)) marcadas.delete(texto);
          else marcadas.add(texto);
          botao.setAttribute('aria-pressed', String(marcadas.has(texto)));
          continuar.disabled = marcadas.size === 0;
        });
      } else {
        botao.addEventListener('click', () => aoEscolher(texto));
      }
      return botao;
    });

    const continuar = criar('button', 'opcao opcao-continuar', 'Continuar');
    continuar.type = 'button';
    continuar.disabled = true;
    continuar.addEventListener('click', () => {
      const escolhidas = passo.opcoes.filter((o) => marcadas.has(o));
      jaInteragiu = true;
      fecharEntrada();
      falaEu(escolhidas.join(', '));
      ficha[passo.id] = escolhidas;
      avancar();
    });

    chat.opcoes.replaceChildren(...botoes, ...(passo.multi ? [continuar] : []));
    if (!passo.texto) chat.campo.placeholder = 'Escolha uma opção acima';
    rolarConversa();
  }

  async function perguntar() {
    const daSessao = sessao;
    const passo = passoAtual();
    chat.barra.style.transform = `scaleX(${indice / ROTEIRO.length})`;
    let falas = typeof passo.falas === 'function' ? passo.falas(ficha) : passo.falas;
    if (passo.id === 'inicio' && agendaTentada && !agenda) {
      // Agenda fora do ar: avisa antes de a pessoa responder tudo.
      falas = [
        falas[0],
        'A agenda de horários está fora do ar neste momento. Você pode responder às perguntas mesmo assim e, no final, enviar tudo pelo WhatsApp para a clínica combinar o horário.',
        'Suas respostas ficam visíveis só para a Dra. Ericka. Podemos começar?',
      ];
    }
    for (const fala of falas) {
      if (!(await falaBot(fala, daSessao))) return;
    }
    if (passo.opcoes) mostrarOpcoes(passo);
    if (passo.texto) abrirTexto(passo.texto, 'texto');
  }

  function avancar() {
    indice += 1;
    if (indice < ROTEIRO.length) perguntar();
    else concluirConversa();
  }

  function guardar(passo, valor) {
    ficha[passo.id] = passo.gravar ? passo.gravar(valor) : valor;
  }

  async function aoEscolher(texto) {
    const daSessao = sessao;
    const passo = passoAtual();
    jaInteragiu = true;
    fecharEntrada();
    falaEu(texto);

    if (passo.id === 'fim') {
      if (texto === FIM_SIM) {
        conversaPronta = true;
        el.proximosNota.hidden = true;
        mostrarEtapa('horario');
      } else {
        reiniciarConversa();
      }
      return;
    }
    if (passo.detalhe && texto === passo.detalhe.quando) {
      if (await falaBot(passo.detalhe.fala, daSessao)) abrirTexto(passo.detalhe, 'detalhe');
      return;
    }
    if (passo.id !== 'inicio') guardar(passo, texto);
    avancar();
  }

  chat.campo.addEventListener('input', () => {
    if (passoAtual() && passoAtual().id === 'telefone') chat.campo.value = formatarTelefone(chat.campo.value);
  });

  chat.form.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const valor = chat.campo.value.replace(/\s+/g, ' ').trim();
    if (!aguardando || !valor) return;
    const daSessao = sessao;
    const passo = passoAtual();
    const modo = aguardando;
    jaInteragiu = true;
    fecharEntrada();
    falaEu(valor);

    const problema =
      modo === 'detalhe' ? (valor.length >= 2 ? null : 'Pode escrever um pouco mais?') : passo.validar?.(valor);
    if (problema) {
      if (await falaBot(problema, daSessao)) {
        if (modo === 'texto' && passo.opcoes) mostrarOpcoes(passo);
        abrirTexto(modo === 'detalhe' ? passo.detalhe : passo.texto, modo);
      }
      return;
    }

    guardar(passo, valor);
    const comentario = passo.depois?.(valor);
    if (comentario && !(await falaBot(comentario, daSessao))) return;
    avancar();
  });

  const FIM_SIM = 'Sim, escolher meu horário';
  const PASSO_FINAL = { id: 'fim', opcoes: [FIM_SIM, 'Quero refazer as respostas'] };

  function itensDoResumo() {
    const itens = ROTEIRO.filter((p) => p.rotulo).map((p) => {
      let valor = ficha[p.id];
      if (Array.isArray(valor)) valor = valor.join(', ');
      if (p.id === 'telefone') valor = formatarTelefone(valor);
      if (p.id === 'idade') valor = `${valor} anos`;
      return [p.rotulo, valor];
    });
    return itens.filter(([, valor]) => valor);
  }

  async function concluirConversa() {
    const daSessao = sessao;
    chat.barra.style.transform = 'scaleX(1)';
    const abertura = `Obrigada, ${primeiroNome(ficha.nome)}! Este é o resumo que a Dra. Ericka vai receber:`;
    if (!(await falaBot(abertura, daSessao))) return;

    const cartao = criar('div', 'msg msg-resumo');
    const lista = criar('dl');
    for (const [rotulo, valor] of itensDoResumo()) {
      const item = criar('div');
      item.append(criar('dt', null, rotulo), criar('dd', null, valor));
      lista.append(item);
    }
    cartao.append(lista);
    chat.mensagens.append(cartao);
    rolarConversa();

    if (!(await falaBot('Está tudo certo?', daSessao))) return;
    ROTEIRO.push(PASSO_FINAL);
    mostrarOpcoes(PASSO_FINAL);
  }

  function reiniciarConversa() {
    sessao += 1;
    if (ROTEIRO.at(-1) === PASSO_FINAL) ROTEIRO.pop();
    ficha = {};
    indice = -1;
    conversaPronta = false;
    chat.mensagens.replaceChildren();
    fecharEntrada();
    avancar();
  }

  function iniciarConversa() {
    if (conversaIniciada) return;
    conversaIniciada = true;
    reiniciarConversa();
  }

  // A conversa começa quando o painel aparece na tela.
  new IntersectionObserver(
    (entradas, observador) => {
      if (entradas.some((e) => e.isIntersecting)) {
        observador.disconnect();
        iniciarConversa();
      }
    },
    { threshold: 0.3 },
  ).observe(el.painel);
  // Garantias extras, caso o navegador não avise que o painel apareceu.
  for (const evento of ['pointerenter', 'focusin', 'touchstart']) {
    el.painel.addEventListener(evento, iniciarConversa, { passive: true });
  }
  document.querySelectorAll('a[href="#agendar"]').forEach((link) => link.addEventListener('click', iniciarConversa));
  document.addEventListener('sem-animacao', iniciarConversa);
  if (document.documentElement.classList.contains('sem-animacao')) iniciarConversa();

  /* =====================================================================
     Etapas: conversa → horário → confirmação
     ===================================================================== */

  function mostrarEtapa(nome) {
    const ordem = ['conversa', 'horario', 'confirmado'];
    const atual = ordem.indexOf(nome);
    el.etapaConversa.hidden = nome !== 'conversa';
    el.etapaHorario.hidden = nome !== 'horario';
    el.etapaConfirmado.hidden = nome !== 'confirmado';
    el.etapas.forEach((li, i) => {
      li.classList.toggle('feita', i < atual || nome === 'confirmado');
      if (i === atual && nome !== 'confirmado') li.setAttribute('aria-current', 'step');
      else li.removeAttribute('aria-current');
    });
    if (nome === 'horario') {
      el.paciente.textContent = `${ficha.nome}, ${formatarTelefone(ficha.telefone)}`;
      el.erro.hidden = true;
      el.semAgendaWhats.href = linkWhats(
        'Olá! Respondi às perguntas no site da EL Saúde & Estética e gostaria de agendar uma avaliação.\n\n' +
          itensDoResumo()
            .map(([rotulo, valor]) => `${rotulo}: ${valor}`)
            .join('\n'),
      );
      escolherPrimeiroDiaLivre();
      desenharProximos();
      desenharDias();
      desenharHoras();
      atualizarResumo();
    }
  }

  $('refazer-conversa').addEventListener('click', () => {
    mostrarEtapa('conversa');
    reiniciarConversa();
  });

  $('sem-agenda-tentar').addEventListener('click', async (evento) => {
    const botao = evento.currentTarget;
    botao.disabled = true;
    botao.textContent = 'Abrindo a agenda…';
    const abriu = await carregar();
    botao.disabled = false;
    botao.textContent = 'Tentar de novo';
    if (!abriu) $('sem-agenda-texto').textContent =
      'Ainda não foi possível abrir a agenda. Suas respostas continuam guardadas: envie pelo WhatsApp e a clínica combina o horário com você.';
  });

  function desenharDias() {
    el.comAgenda.hidden = !agenda;
    el.semAgenda.hidden = Boolean(agenda);
    if (!agenda) return;
    if (!agenda.dias.length) {
      el.dias.replaceChildren(avisoSemAgenda('A agenda dos próximos dias ainda não foi aberta.'));
      return;
    }
    const botoes = agenda.dias.map((d) => {
      const data = paraData(d.data);
      const botao = criar('button', 'dia');
      botao.type = 'button';
      botao.setAttribute('aria-pressed', String(d.data === dia));
      const vagas = d.livres.length;
      const textoVagas = vagas === 0 ? 'lotado' : vagas === 1 ? '1 horário' : `${vagas} horários`;
      botao.setAttribute('aria-label', `${nomeDoDia(d.data)}, ${textoVagas}`);
      botao.disabled = vagas === 0;
      botao.append(
        criar('span', 'dia-semana', d.data === agenda.hoje ? 'hoje' : semPonto(fSemanaCurta.format(data))),
        criar('span', 'dia-numero', String(data.getUTCDate())),
        criar('span', 'dia-mes', semPonto(fMesCurto.format(data))),
        criar('span', 'dia-vagas', textoVagas),
      );
      botao.addEventListener('click', () => {
        dia = d.data;
        hora = null;
        desenharProximos();
        desenharDias();
        desenharHoras();
        atualizarResumo();
      });
      return botao;
    });
    el.dias.replaceChildren(...botoes);
    const marcado = el.dias.querySelector('[aria-pressed="true"]');
    if (marcado && !el.etapaHorario.hidden) marcado.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  function desenharHoras() {
    const d = agenda && dia && agenda.dias.find((x) => x.data === dia);
    el.diaEscolhido.textContent = d ? nomeDoDia(d.data) : '';
    if (!d) {
      el.horas.replaceChildren(criar('p', 'agenda-dica', 'Escolha um dia para ver os horários.'));
      return;
    }
    const todas = [...d.livres, ...d.ocupados].sort();
    el.horas.replaceChildren(
      ...todas.map((h, i) => {
        const livre = d.livres.includes(h);
        const botao = criar('button', 'hora', h);
        botao.type = 'button';
        botao.disabled = !livre;
        botao.style.animationDelay = `${i * 0.04}s`;
        if (livre) {
          botao.setAttribute('aria-pressed', String(h === hora));
          botao.addEventListener('click', () => {
            hora = h;
            el.horas.querySelectorAll('.hora:not(:disabled)').forEach((b) => {
              b.setAttribute('aria-pressed', String(b.textContent === h));
            });
            desenharProximos();
            atualizarResumo();
          });
        } else {
          botao.setAttribute('aria-label', `${h}, ocupado`);
        }
        return botao;
      }),
    );
  }

  function atualizarResumo() {
    if (dia && hora) el.resumo.textContent = `${nomeDoDia(dia)}, às ${hora}, em Queimadas.`;
    else if (dia) el.resumo.textContent = 'Escolha um horário para continuar.';
    else el.resumo.textContent = 'Escolha um dia e um horário para continuar.';
    el.enviar.disabled = !(dia && hora) || enviando;
  }

  function mostrarErro(mensagem) {
    el.erro.textContent = mensagem;
    el.erro.hidden = false;
  }

  el.enviar.addEventListener('click', async () => {
    if (enviando || !dia || !hora || !conversaPronta) return;
    el.erro.hidden = true;
    enviando = true;
    el.enviar.textContent = 'Confirmando…';
    atualizarResumo();

    const { nome, telefone, ...respostas } = ficha;
    try {
      const resposta = await fetch('/api/agendamentos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: dia, hora, nome, telefone, ficha: respostas, site: chat.isca.value }),
      });
      const corpo = await resposta.json().catch(() => ({}));
      enviando = false;
      if (!resposta.ok) {
        if (resposta.status === 409) await carregar();
        mostrarErro(corpo.erro || 'Não foi possível agendar agora. Tente de novo ou chame no WhatsApp.');
        return;
      }
      mostrarConfirmacao(corpo.agendamento);
      aplicarAgenda(corpo.agenda);
    } catch {
      enviando = false;
      mostrarErro('Sem conexão com a agenda. Verifique sua internet e tente de novo.');
    } finally {
      el.enviar.textContent = 'Confirmar agendamento';
      atualizarResumo();
    }
  });

  function mostrarConfirmacao(ag) {
    const quando = `${fLonga.format(paraData(ag.data))}, às ${ag.hora}`;
    el.confirmadoTexto.textContent = `${primeiroNome(ag.nome)}, seu horário é ${quando}, em Queimadas.`;
    el.confirmadoWhats.href = linkWhats(`Olá! Agendei pelo site: ${ag.nome}, ${quando}.`);
    dia = null;
    hora = null;
    conversaPronta = false;
    mostrarEtapa('confirmado');
    el.etapaConfirmado.focus({ preventScroll: true });
    el.painel.scrollIntoView({ block: 'nearest' });
  }

  $('confirmado-novo').addEventListener('click', () => {
    mostrarEtapa('conversa');
    reiniciarConversa();
  });

  /* ---------- manter a agenda em dia ---------- */

  carregar().then(() => (agendaTentada = true));
  setInterval(() => {
    if (!document.hidden && !enviando) carregar();
  }, 60000);
  // Enquanto a agenda não abrir, tenta de novo a cada poucos segundos.
  const insistir = setInterval(() => {
    if (agenda) clearInterval(insistir);
    else if (!document.hidden) carregar();
  }, 6000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && !enviando) carregar();
  });
})();
