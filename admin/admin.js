/* EL Saúde & Estética — painel da clínica */
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);

  let p = null; // dados do painel vindos do servidor
  let ultimaChave = '';
  let diaSel = null; // "AAAA-MM-DD"
  let mesVisivel = null; // "AAAA-MM"
  let rascunho = null; // horários da semana em edição
  let sujo = false;
  let editando = null;
  let excluindo = null;
  let abaAtual = 'agenda';

  /* ---------- datas e formatos ---------- */

  const utc = { timeZone: 'UTC' };
  const fLonga = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', ...utc });
  const fMes = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', ...utc });
  const fDiaMes = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long', ...utc });

  const NOMES_SEMANA = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
  const ORDEM_SEMANA = [1, 2, 3, 4, 5, 6, 0];

  const paraData = (iso) => new Date(iso + 'T12:00:00Z');
  const maiuscula = (t) => t.charAt(0).toUpperCase() + t.slice(1);
  const dataLonga = (iso) => maiuscula(fLonga.format(paraData(iso)));
  const plural = (n, um, varios) => (n === 1 ? `1 ${um}` : `${n} ${varios}`);
  const clonar = (obj) => JSON.parse(JSON.stringify(obj));

  function somarDias(iso, n) {
    const d = paraData(iso);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }

  function formatarTelefone(valor) {
    const d = String(valor).replace(/\D/g, '').slice(0, 11);
    if (d.length <= 2) return d.length ? '(' + d : '';
    if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
    if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  }

  const jaPassou = (data, hora) => `${data} ${hora}` < `${p.hoje} ${p.agora}`;
  const diaDe = (data) => p.dias.find((d) => d.data === data);

  /* ---------- DOM ---------- */

  function criar(tag, classe, texto) {
    const no = document.createElement(tag);
    if (classe) no.className = classe;
    if (texto != null) no.textContent = texto;
    return no;
  }

  function botao(texto, classe, aoClicar) {
    const b = criar('button', classe, texto);
    b.type = 'button';
    b.addEventListener('click', aoClicar);
    return b;
  }

  let relogioRecado;
  function recado(texto) {
    const caixa = $('recado');
    caixa.textContent = texto;
    caixa.hidden = false;
    clearTimeout(relogioRecado);
    relogioRecado = setTimeout(() => (caixa.hidden = true), 5000);
  }

  function mostrarErro(id, mensagem) {
    const no = $(id);
    no.textContent = mensagem;
    no.hidden = !mensagem;
  }

  /* ---------- servidor ---------- */

  async function api(metodo, rota, corpo) {
    let resposta;
    try {
      resposta = await fetch('/api/admin/' + rota, {
        method: metodo,
        credentials: 'same-origin',
        headers: corpo ? { 'Content-Type': 'application/json' } : {},
        body: corpo ? JSON.stringify(corpo) : undefined,
      });
    } catch {
      throw new Error('Sem conexão com o servidor. Verifique a internet e tente de novo.');
    }
    const dados = await resposta.json().catch(() => ({}));
    if (resposta.status === 401 && rota !== 'login' && rota !== 'senha') {
      mostrarEntrada(p ? 'Sua sessão terminou. Entre de novo.' : '');
      throw new Error('');
    }
    if (!resposta.ok) throw new Error(dados.erro || 'Não foi possível concluir. Tente de novo.');
    return dados;
  }

  /** Executa uma ação do painel e mostra o resultado. */
  async function executar(acao, mensagemOk) {
    try {
      receber(await acao(), true);
      if (mensagemOk) recado(mensagemOk);
      return true;
    } catch (erro) {
      if (erro.message) recado(erro.message);
      return false;
    }
  }

  function receber(novo, forcar) {
    const chave = JSON.stringify({ ...novo, agora: null });
    p = novo;
    if (!diaSel || !diaDe(diaSel)) diaSel = p.hoje;
    if (!mesVisivel) mesVisivel = diaSel.slice(0, 7);
    if (!forcar && chave === ultimaChave) return;
    ultimaChave = chave;

    $('aviso-senha').hidden = !p.senhaProvisoria;
    desenharNumeros();
    desenharCalendario();
    desenharDia();
    desenharProximas();
    if (!sujo && (forcar || abaAtual !== 'horarios')) {
      rascunho = clonar(p.config.semana);
      desenharSemana();
    }
    if (!$('form-config').contains(document.activeElement)) {
      $('config-dias').value = p.config.diasAbertos;
      $('config-antecedencia').value = p.config.antecedenciaHoras;
    }
  }

  /* ---------- entrada ---------- */

  function mostrarEntrada(mensagem) {
    document.querySelectorAll('dialog[open]').forEach((d) => d.close());
    $('painel').hidden = true;
    $('tela-entrada').hidden = false;
    mostrarErro('entrada-erro', mensagem || '');
    $('entrada-senha').value = '';
    $('entrada-senha').focus();
  }

  function mostrarPainel() {
    $('tela-entrada').hidden = true;
    $('painel').hidden = false;
  }

  $('form-entrada').addEventListener('submit', async (evento) => {
    evento.preventDefault();
    mostrarErro('entrada-erro', '');
    try {
      const dados = await api('POST', 'login', { senha: $('entrada-senha').value });
      $('entrada-senha').value = '';
      diaSel = null;
      mesVisivel = null;
      receber(dados, true);
      mostrarPainel();
    } catch (erro) {
      mostrarErro('entrada-erro', erro.message);
    }
  });

  $('botao-sair').addEventListener('click', async () => {
    await fetch('/api/admin/logout', { method: 'POST', credentials: 'same-origin' }).catch(() => {});
    p = null;
    ultimaChave = '';
    mostrarEntrada('');
  });

  /* ---------- abas ---------- */

  const abas = ['agenda', 'horarios', 'config'];

  function abrirAba(nome) {
    abaAtual = nome;
    for (const aba of abas) {
      const ativa = aba === nome;
      $('tab-' + aba).setAttribute('aria-selected', String(ativa));
      $('tab-' + aba).tabIndex = ativa ? 0 : -1;
      $('aba-' + aba).hidden = !ativa;
    }
  }

  abas.forEach((aba, i) => {
    const tab = $('tab-' + aba);
    tab.addEventListener('click', () => abrirAba(aba));
    tab.addEventListener('keydown', (evento) => {
      const passo = evento.key === 'ArrowRight' ? 1 : evento.key === 'ArrowLeft' ? -1 : 0;
      if (!passo) return;
      const destino = abas[(i + passo + abas.length) % abas.length];
      abrirAba(destino);
      $('tab-' + destino).focus();
    });
  });

  $('aviso-senha-ir').addEventListener('click', () => {
    abrirAba('config');
    $('senha-atual').focus();
  });

  /* ---------- agenda: números ---------- */

  function desenharNumeros() {
    const proximos7 = p.dias.filter((d) => d.data >= p.hoje && d.data <= somarDias(p.hoje, 6));
    const conta = (dias, situacao) =>
      dias.reduce(
        (total, d) => total + d.horarios.filter((h) => h.situacao === situacao && !jaPassou(d.data, h.hora)).length,
        0,
      );
    const hoje = diaDe(p.hoje);
    const pacientesHoje = hoje.horarios.filter((h) => h.situacao === 'agendado').length;

    const itens = [
      ['Hoje', plural(pacientesHoje, 'paciente', 'pacientes')],
      ['Próximos 7 dias', plural(conta(proximos7, 'agendado'), 'paciente', 'pacientes')],
      ['Livres nos próximos 7 dias', plural(conta(proximos7, 'livre'), 'horário', 'horários')],
    ];
    $('numeros').replaceChildren(
      ...itens.map(([rotulo, valor]) => {
        const item = criar('p');
        item.append(criar('span', null, rotulo + ': '), criar('strong', null, valor));
        return item;
      }),
    );
  }

  /* ---------- agenda: calendário ---------- */

  function desenharCalendario() {
    const [ano, mesNumero] = mesVisivel.split('-').map(Number);
    const primeiro = new Date(Date.UTC(ano, mesNumero - 1, 1, 12));
    const diasNoMes = new Date(Date.UTC(ano, mesNumero, 0, 12)).getUTCDate();
    $('mes-nome').textContent = maiuscula(fMes.format(primeiro));
    $('mes-voltar').disabled = mesVisivel <= p.dias[0].data.slice(0, 7);
    $('mes-avancar').disabled = mesVisivel >= p.dias[p.dias.length - 1].data.slice(0, 7);

    const celulas = [];
    const vazios = (primeiro.getUTCDay() + 6) % 7; // semana começa na segunda
    for (let i = 0; i < vazios; i++) celulas.push(criar('span'));

    for (let n = 1; n <= diasNoMes; n++) {
      const iso = `${mesVisivel}-${String(n).padStart(2, '0')}`;
      const d = diaDe(iso);
      const celula = criar('button', 'cal-dia', String(n));
      celula.type = 'button';
      if (!d) {
        celula.disabled = true;
      } else {
        const pacientes = d.horarios.filter((h) => h.situacao === 'agendado').length;
        const livres = d.horarios.filter((h) => h.situacao === 'livre').length;
        if (pacientes) celula.classList.add('com-pacientes');
        if (!d.horarios.length || d.fechado) celula.classList.add('sem-atendimento');
        if (iso === p.hoje) celula.classList.add('hoje');
        celula.setAttribute('aria-pressed', String(iso === diaSel));
        let descricao = `${fDiaMes.format(paraData(iso))}, ${plural(pacientes, 'paciente', 'pacientes')}`;
        if (d.fechado) descricao += ', dia fechado';
        else descricao += `, ${plural(livres, 'horário livre', 'horários livres')}`;
        celula.setAttribute('aria-label', descricao);
        celula.addEventListener('click', () => escolherDia(iso));
      }
      celulas.push(celula);
    }
    $('calendario-dias').replaceChildren(...celulas);
  }

  function mudarMes(passo) {
    const [ano, mesNumero] = mesVisivel.split('-').map(Number);
    mesVisivel = new Date(Date.UTC(ano, mesNumero - 1 + passo, 1, 12)).toISOString().slice(0, 7);
    desenharCalendario();
  }

  $('mes-voltar').addEventListener('click', () => mudarMes(-1));
  $('mes-avancar').addEventListener('click', () => mudarMes(1));

  function escolherDia(iso) {
    if (!diaDe(iso)) return;
    diaSel = iso;
    mesVisivel = iso.slice(0, 7);
    desenharCalendario();
    desenharDia();
  }

  $('dia-voltar').addEventListener('click', () => escolherDia(somarDias(diaSel, -1)));
  $('dia-avancar').addEventListener('click', () => escolherDia(somarDias(diaSel, 1)));
  $('dia-hoje').addEventListener('click', () => escolherDia(p.hoje));

  /* ---------- agenda: o dia ---------- */

  /** O que a Dra. Ericka precisa notar antes de atender, a partir das respostas da conversa. */
  function pontosDeAtencao(ficha) {
    const pontos = [];
    if (!ficha) return pontos;
    if (ficha.idade && Number(ficha.idade) < 18) pontos.push('Menor de 18 anos: precisa de responsável.');
    if (ficha.gestante === 'Estou grávida') pontos.push('Está grávida.');
    if (ficha.gestante === 'Estou amamentando') pontos.push('Está amamentando.');
    if (ficha.alergias && ficha.alergias !== 'Não') pontos.push('Alergias ou remédios: ' + ficha.alergias);
    if (ficha.condicoes === 'Prefiro falar na avaliação') {
      pontos.push('Condição de saúde: prefere falar na avaliação.');
    } else if (ficha.condicoes && ficha.condicoes !== 'Não') {
      pontos.push('Condição de saúde: ' + ficha.condicoes);
    }
    return pontos;
  }

  const dialogoFicha = $('dialogo-ficha');

  function abrirFicha(ag) {
    const f = ag.ficha;
    const idade = f.idade ? `, ${f.idade} anos` : '';
    $('ficha-titulo').textContent = ag.nome + idade;
    $('ficha-quem').textContent =
      `${formatarTelefone(ag.telefone)}. Avaliação: ${fLonga.format(paraData(ag.data))}, às ${ag.hora}.`;
    $('ficha-whats').href = `https://wa.me/55${ag.telefone}`;

    const pontos = pontosDeAtencao(f);
    $('ficha-atencao').hidden = !pontos.length;
    $('ficha-atencao-lista').replaceChildren(...pontos.map((texto) => criar('li', null, texto)));

    const campos = [
      ['Queixa principal', f.queixa, true],
      ['O que quer cuidar', (f.areas || []).join(', ')],
      ['Há quanto tempo incomoda', f.tempo],
      ['Procedimentos anteriores', f.procedimentos],
      ['Resultado esperado', f.expectativa],
      ['Gravidez ou amamentação', f.gestante],
      ['Alergias e remédios', f.alergias],
      ['Condições de saúde', f.condicoes],
      ['Recado para a Dra. Ericka', f.recado],
      ['Respondido em', new Date(ag.criadoEm).toLocaleString('pt-BR', { dateStyle: 'long', timeStyle: 'short' })],
    ];
    $('ficha-lista').replaceChildren(
      ...campos
        .filter(([, valor]) => valor)
        .map(([rotulo, valor, destaque]) => {
          const item = criar('div', destaque ? 'destaque' : null);
          item.append(criar('dt', null, rotulo), criar('dd', null, valor));
          return item;
        }),
    );
    dialogoFicha.showModal();
    dialogoFicha.scrollTop = 0;
  }

  $('ficha-fechar').addEventListener('click', () => dialogoFicha.close());

  function linhaDePaciente(data, h) {
    const ag = h.agendamento;
    const info = criar('div', 'horario-info');
    const nome = criar('strong', null, ag.nome);
    if (pontosDeAtencao(ag.ficha).length) nome.append(criar('span', 'selo-atencao', 'atenção'));
    info.append(nome);
    const contato = criar('p');
    const link = criar('a', null, formatarTelefone(ag.telefone));
    link.href = `https://wa.me/55${ag.telefone}`;
    link.target = '_blank';
    link.rel = 'noopener';
    link.title = 'Abrir conversa no WhatsApp';
    contato.append(link, criar('span', 'origem', ag.origem === 'site' ? 'marcou pelo site' : 'marcada pela clínica'));
    info.append(contato);
    if (ag.ficha && ag.ficha.queixa) info.append(criar('p', 'queixa', 'Queixa: ' + ag.ficha.queixa));

    const acoes = criar('div', 'horario-acoes');
    if (ag.ficha) acoes.append(botao('Ver ficha', 'botao-texto', () => abrirFicha(ag)));
    acoes.append(
      botao('Editar', 'botao-texto', () => abrirPaciente({ agendamento: ag })),
      botao('Excluir', 'botao-texto perigo', () => abrirExcluir(ag)),
    );
    return [info, acoes];
  }

  function desenharDia() {
    const d = diaDe(diaSel);
    const pacientes = d.horarios.filter((h) => h.situacao === 'agendado').length;
    const livres = d.horarios.filter((h) => h.situacao === 'livre').length;
    $('dia-titulo').textContent = (diaSel === p.hoje ? 'Hoje, ' : '') + (diaSel === p.hoje ? fLonga.format(paraData(diaSel)) : dataLonga(diaSel));
    $('dia-resumo').textContent = d.horarios.length
      ? `${plural(pacientes, 'paciente', 'pacientes')}, ${plural(livres, 'horário livre', 'horários livres')}`
      : 'Sem atendimento neste dia.';
    $('dia-fechado').hidden = !d.fechado;
    $('botao-fechar-dia').textContent = d.fechado ? 'Reabrir o dia' : 'Fechar o dia';
    $('dia-voltar').disabled = diaSel === p.dias[0].data;
    $('dia-avancar').disabled = diaSel === p.dias[p.dias.length - 1].data;

    if (!d.horarios.length) {
      const vazio = criar('li', 'horarios-vazio', 'Nenhum horário neste dia. Para atender, adicione um horário abaixo.');
      $('horarios').replaceChildren(vazio);
      return;
    }

    const linhas = d.horarios.map((h) => {
      const linha = criar('li', `horario horario-${h.situacao}`);
      if (jaPassou(diaSel, h.hora)) linha.classList.add('passado');
      linha.append(criar('span', 'horario-hora', h.hora));

      if (h.situacao === 'agendado') {
        linha.append(...linhaDePaciente(diaSel, h));
        return linha;
      }

      const info = criar('div', 'horario-info');
      const acoes = criar('div', 'horario-acoes');
      if (h.situacao === 'livre') {
        info.append(criar('span', 'situacao', h.extra ? 'Livre (horário extra)' : 'Livre'));
        acoes.append(
          botao('Marcar paciente', 'botao-texto', () => abrirPaciente({ data: diaSel, hora: h.hora })),
          botao(h.extra ? 'Remover' : 'Bloquear', 'botao-texto', () =>
            executar(
              () => api('PUT', 'horario', { data: diaSel, hora: h.hora, acao: 'bloquear' }),
              h.extra ? `Horário das ${h.hora} removido.` : `Horário das ${h.hora} bloqueado. Ele não aparece mais no site.`,
            ),
          ),
        );
      } else {
        info.append(criar('span', 'situacao', d.fechado ? 'Fechado' : 'Bloqueado'));
        if (!d.fechado) {
          acoes.append(
            botao('Liberar', 'botao-texto', () =>
              executar(
                () => api('PUT', 'horario', { data: diaSel, hora: h.hora, acao: 'liberar' }),
                `Horário das ${h.hora} liberado.`,
              ),
            ),
          );
        } else {
          acoes.append(botao('Marcar paciente', 'botao-texto', () => abrirPaciente({ data: diaSel, hora: h.hora })));
        }
      }
      linha.append(info, acoes);
      return linha;
    });
    $('horarios').replaceChildren(...linhas);
  }

  $('form-novo-horario').addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const hora = $('novo-horario-hora').value;
    if (!hora) return;
    const ok = await executar(
      () => api('PUT', 'horario', { data: diaSel, hora, acao: 'adicionar' }),
      `Horário das ${hora} adicionado.`,
    );
    if (ok) $('novo-horario-hora').value = '';
  });

  $('botao-fechar-dia').addEventListener('click', () => {
    const fechar = !diaDe(diaSel).fechado;
    executar(
      () => api('PUT', 'dia', { data: diaSel, fechado: fechar }),
      fechar ? 'Dia fechado. Os horários saíram do site.' : 'Dia reaberto.',
    );
  });

  /* ---------- agenda: próximas pacientes ---------- */

  function desenharProximas() {
    const grupos = [];
    for (const d of p.dias) {
      if (d.data < p.hoje) continue;
      const marcados = d.horarios.filter((h) => h.situacao === 'agendado' && !jaPassou(d.data, h.hora));
      if (marcados.length) grupos.push([d.data, marcados]);
    }
    if (!grupos.length) {
      $('proximas-lista').replaceChildren(
        criar('p', 'vazio', 'Nenhuma paciente marcada. Os agendamentos feitos no site aparecem aqui.'),
      );
      return;
    }
    $('proximas-lista').replaceChildren(
      ...grupos.map(([data, marcados]) => {
        const grupo = criar('div', 'proximas-grupo');
        const titulo = criar('h3');
        titulo.append(
          botao((data === p.hoje ? 'Hoje, ' + fLonga.format(paraData(data)) : dataLonga(data)), 'botao-texto', () => {
            escolherDia(data);
            $('dia-titulo').scrollIntoView({ block: 'center' });
          }),
        );
        const lista = criar('ul', 'horarios');
        for (const h of marcados) {
          const linha = criar('li', 'horario horario-agendado');
          linha.append(criar('span', 'horario-hora', h.hora), ...linhaDePaciente(data, h));
          lista.append(linha);
        }
        grupo.append(titulo, lista);
        return grupo;
      }),
    );
  }

  /* ---------- marcar e editar paciente ---------- */

  const dialogoPaciente = $('dialogo-paciente');

  function abrirPaciente({ agendamento, data, hora }) {
    editando = agendamento || null;
    $('paciente-titulo').textContent = editando ? 'Editar agendamento' : 'Marcar paciente';
    $('paciente-nome').value = editando ? editando.nome : '';
    $('paciente-telefone').value = editando ? formatarTelefone(editando.telefone) : '';
    $('paciente-data').value = editando ? editando.data : data;
    $('paciente-hora').value = editando ? editando.hora : hora;
    $('paciente-data').min = p.dias[0].data;
    $('paciente-data').max = p.dias[p.dias.length - 1].data;
    mostrarErro('paciente-erro', '');
    dialogoPaciente.showModal();
    $('paciente-nome').focus();
  }

  $('paciente-telefone').addEventListener('input', () => {
    $('paciente-telefone').value = formatarTelefone($('paciente-telefone').value);
  });
  $('paciente-cancelar').addEventListener('click', () => dialogoPaciente.close());

  $('form-paciente').addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const corpo = {
      nome: $('paciente-nome').value.replace(/\s+/g, ' ').trim(),
      telefone: $('paciente-telefone').value.replace(/\D/g, ''),
      data: $('paciente-data').value,
      hora: $('paciente-hora').value,
    };
    if (corpo.nome.length < 3) return mostrarErro('paciente-erro', 'Informe o nome da paciente.');
    if (corpo.telefone.length < 10) return mostrarErro('paciente-erro', 'Informe o telefone com DDD.');
    if (!corpo.data || !corpo.hora) return mostrarErro('paciente-erro', 'Informe o dia e o horário.');

    try {
      const dados = editando
        ? await api('PUT', 'agendamentos/' + editando.id, corpo)
        : await api('POST', 'agendamentos', corpo);
      dialogoPaciente.close();
      diaSel = corpo.data;
      mesVisivel = corpo.data.slice(0, 7);
      receber(dados, true);
      recado(`${corpo.nome} marcada para ${fLonga.format(paraData(corpo.data))}, às ${corpo.hora}.`);
    } catch (erro) {
      if (erro.message) mostrarErro('paciente-erro', erro.message);
    }
  });

  /* ---------- excluir agendamento ---------- */

  const dialogoExcluir = $('dialogo-excluir');

  function abrirExcluir(agendamento) {
    excluindo = agendamento;
    $('excluir-texto').textContent =
      `${agendamento.nome}, ${fLonga.format(paraData(agendamento.data))}, às ${agendamento.hora}.`;
    dialogoExcluir.showModal();
  }

  $('excluir-cancelar').addEventListener('click', () => dialogoExcluir.close());
  $('excluir-confirmar').addEventListener('click', async () => {
    const ag = excluindo;
    dialogoExcluir.close();
    await executar(
      () => api('DELETE', 'agendamentos/' + ag.id),
      `Agendamento excluído. O horário das ${ag.hora} voltou a ficar livre.`,
    );
  });

  /* ---------- horários de atendimento ---------- */

  function marcarSujo(valor) {
    sujo = valor;
    $('botao-salvar-semana').disabled = !sujo;
    $('botao-desfazer-semana').disabled = !sujo;
    $('semana-estado').textContent = sujo ? 'Há mudanças que ainda não foram salvas.' : '';
  }

  function desenharSemana() {
    $('semana').replaceChildren(
      ...ORDEM_SEMANA.map((dia) => {
        const nome = NOMES_SEMANA[dia];
        const linha = criar('div', 'semana-dia');
        linha.append(criar('h3', null, nome));

        const horas = criar('div', 'semana-horas');
        if (!rascunho[dia].length) horas.append(criar('span', 'vazio', 'Sem atendimento'));
        for (const hora of rascunho[dia]) {
          const etiqueta = criar('span', 'etiqueta', hora);
          const remover = botao('×', 'etiqueta-remover', () => {
            rascunho[dia] = rascunho[dia].filter((h) => h !== hora);
            marcarSujo(true);
            desenharSemana();
          });
          remover.setAttribute('aria-label', `Remover ${hora} de ${nome.toLowerCase()}`);
          etiqueta.append(remover);
          horas.append(etiqueta);
        }

        const form = criar('form', 'semana-adicionar');
        const campo = criar('input');
        campo.type = 'time';
        campo.required = true;
        campo.setAttribute('aria-label', `Novo horário de ${nome.toLowerCase()}`);
        const adicionar = criar('button', 'botao botao-contorno botao-compacto', 'Adicionar');
        adicionar.type = 'submit';
        form.append(campo, adicionar);
        form.addEventListener('submit', (evento) => {
          evento.preventDefault();
          if (!campo.value || rascunho[dia].includes(campo.value)) return;
          rascunho[dia] = [...rascunho[dia], campo.value].sort();
          marcarSujo(true);
          desenharSemana();
        });

        linha.append(horas, form);
        return linha;
      }),
    );
  }

  // Marcadores de dias para "preencher vários dias"
  $('preencher-dias').replaceChildren(
    ...ORDEM_SEMANA.map((dia) => {
      const rotulo = criar('label', 'marcador');
      const caixa = criar('input');
      caixa.type = 'checkbox';
      caixa.value = String(dia);
      caixa.checked = dia >= 1 && dia <= 5;
      rotulo.append(caixa, criar('span', null, NOMES_SEMANA[dia].replace('-feira', '')));
      return rotulo;
    }),
  );

  $('form-preencher').addEventListener('submit', (evento) => {
    evento.preventDefault();
    const paraMinutos = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));
    const de = paraMinutos($('preencher-de').value || '08:00');
    const ate = paraMinutos($('preencher-ate').value || '17:00');
    const intervalo = Number($('preencher-intervalo').value);
    const dias = [...document.querySelectorAll('#preencher-dias input:checked')].map((c) => Number(c.value));
    if (ate < de) return recado('O último horário precisa ser depois do primeiro.');
    if (!dias.length) return recado('Marque pelo menos um dia da semana.');
    const horas = [];
    for (let m = de; m <= ate; m += intervalo) {
      horas.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
    }
    for (const dia of dias) rascunho[dia] = [...horas];
    marcarSujo(true);
    desenharSemana();
    recado('Horários preenchidos. Confira e clique em "Salvar horários".');
  });

  $('botao-salvar-semana').addEventListener('click', async () => {
    const enviado = clonar(rascunho);
    marcarSujo(false);
    const ok = await executar(() => api('PUT', 'semana', { semana: enviado }), 'Horários de atendimento salvos.');
    if (!ok) {
      rascunho = enviado;
      marcarSujo(true);
      desenharSemana();
    }
  });

  $('botao-desfazer-semana').addEventListener('click', () => {
    rascunho = clonar(p.config.semana);
    marcarSujo(false);
    desenharSemana();
  });

  window.addEventListener('beforeunload', (evento) => {
    if (sujo) evento.preventDefault();
  });

  /* ---------- configurações ---------- */

  $('form-config').addEventListener('submit', (evento) => {
    evento.preventDefault();
    executar(
      () =>
        api('PUT', 'config', {
          diasAbertos: Number($('config-dias').value),
          antecedenciaHoras: Number($('config-antecedencia').value),
        }),
      'Configurações salvas.',
    );
  });

  $('form-senha').addEventListener('submit', async (evento) => {
    evento.preventDefault();
    mostrarErro('senha-erro', '');
    const atual = $('senha-atual').value;
    const nova = $('senha-nova').value;
    if (nova.length < 8) return mostrarErro('senha-erro', 'A nova senha precisa ter pelo menos 8 caracteres.');
    if (nova !== $('senha-repetir').value) return mostrarErro('senha-erro', 'As duas senhas novas não são iguais.');
    try {
      const dados = await api('POST', 'senha', { atual, nova });
      $('form-senha').reset();
      receber(dados, true);
      recado('Senha trocada.');
    } catch (erro) {
      mostrarErro('senha-erro', erro.message);
    }
  });

  /* ---------- início e atualização automática ---------- */

  async function atualizar() {
    if ($('painel').hidden || document.hidden || document.querySelector('dialog[open]')) return;
    try {
      receber(await api('GET', 'painel'));
    } catch {
      /* tenta de novo na próxima volta */
    }
  }

  setInterval(atualizar, 45000);
  document.addEventListener('visibilitychange', atualizar);

  // Aberto direto do computador (sem o servidor): explica e, se a agenda estiver ligada, vai para ela.
  if (!/^https?:$/.test(location.protocol)) {
    const aviso = criar(
      'p',
      'entrada-aviso',
      'Este arquivo foi aberto direto do computador, por isso o painel não funciona. ' +
        'Dê dois cliques em "Abrir o painel.bat", na pasta do site, e o painel abre ligado à agenda.',
    );
    $('form-entrada').insertBefore(aviso, $('form-entrada').querySelector('.campo'));
    $('tela-entrada').hidden = false;
    const teste = new Image();
    teste.onload = () => location.replace('http://localhost:3000/admin/');
    teste.src = 'http://localhost:3000/assets/favicon.png?' + Date.now();
    return;
  }

  // Na primeira vez, mostra onde está a senha inicial.
  fetch('/api/admin/primeiro-acesso')
    .then((r) => r.json())
    .then((dados) => ($('entrada-dica').hidden = !dados.senhaInicial))
    .catch(() => {});

  (async () => {
    try {
      receber(await api('GET', 'painel'), true);
      mostrarPainel();
    } catch (erro) {
      if ($('tela-entrada').hidden) mostrarEntrada(erro.message);
    }
  })();
})();
