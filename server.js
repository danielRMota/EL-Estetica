'use strict';

/*
 * EL Saúde & Estética — servidor do site e da agenda.
 * Sem dependências: basta ter o Node.js instalado e rodar "node server.js".
 * Os dados ficam em dados/agenda.json (faça backup dessa pasta).
 */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const RAIZ = __dirname;
const PORTA = Number(process.env.PORT) || 3000;
const PASTA_DADOS = process.env.PASTA_DADOS || path.join(RAIZ, 'dados');
const ARQUIVO = path.join(PASTA_DADOS, 'agenda.json');
const ARQUIVO_SENHA = path.join(PASTA_DADOS, 'SENHA-INICIAL.txt');
const FUSO = 'America/Fortaleza';
const CONFIAR_PROXY = process.env.CONFIAR_PROXY === '1';
// De onde tirar o IP do visitante quando há um proxy na frente (Nginx, Render...).
// Vazio: X-Real-IP (Nginx) ou o último valor do X-Forwarded-For.
// "x-forwarded-for": primeiro valor do X-Forwarded-For. Outro nome: usa esse cabeçalho.
const CABECALHO_IP = (process.env.CABECALHO_IP || '').trim().toLowerCase();

const DIAS_PASSADOS_NO_PAINEL = 14;
const DIAS_FUTUROS_NO_PAINEL = 120;
const DIAS_GUARDANDO_HISTORICO = 90;
const SESSAO_MS = 14 * 24 * 60 * 60 * 1000;
const MAX_AGENDAMENTOS_POR_TELEFONE = 2;

class Erro extends Error {
  constructor(status, mensagem) {
    super(mensagem);
    this.status = status;
  }
}

/* ---------- datas (sempre no horário da Paraíba) ---------- */

const formatoLocal = new Intl.DateTimeFormat('sv-SE', {
  timeZone: FUSO,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

function agoraLocal(deslocamentoMs = 0) {
  const texto = formatoLocal.format(new Date(Date.now() + deslocamentoMs)); // "2026-11-12 10:05"
  return { data: texto.slice(0, 10), hora: texto.slice(11, 16), carimbo: texto.slice(0, 16) };
}

function dataValida(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function horaValida(s) {
  return typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
}

function somarDias(data, n) {
  const d = new Date(data + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function diaDaSemana(data) {
  return new Date(data + 'T00:00:00Z').getUTCDay();
}

/* ---------- armazenamento ---------- */

function estadoInicial() {
  const manhaETarde = ['08:00', '09:00', '10:00', '11:00', '14:00', '15:00', '16:00', '17:00'];
  return {
    config: {
      diasAbertos: 30,
      antecedenciaHoras: 2,
      semana: {
        0: [],
        1: [...manhaETarde],
        2: [...manhaETarde],
        3: [...manhaETarde],
        4: [...manhaETarde],
        5: [...manhaETarde],
        6: ['08:00', '09:00', '10:00', '11:00'],
      },
    },
    excecoes: {},
    agendamentos: [],
    admin: null,
  };
}

let estado;

function carregar() {
  fs.mkdirSync(PASTA_DADOS, { recursive: true });
  if (fs.existsSync(ARQUIVO)) {
    estado = JSON.parse(fs.readFileSync(ARQUIVO, 'utf8'));
    const base = estadoInicial();
    estado.config = { ...base.config, ...estado.config };
    estado.excecoes = estado.excecoes || {};
    estado.agendamentos = estado.agendamentos || [];
  } else {
    estado = estadoInicial();
  }
  if (!estado.admin || !estado.admin.hash) criarSenhaInicial();
  limparAntigos();
  salvar();
}

function salvar() {
  const texto = JSON.stringify(estado, null, 2);
  const temporario = ARQUIVO + '.tmp';
  try {
    fs.writeFileSync(temporario, texto);
    fs.renameSync(temporario, ARQUIVO);
  } catch {
    // Pastas sincronizadas (OneDrive etc.) às vezes bloqueiam o rename: grava direto.
    fs.writeFileSync(ARQUIVO, texto);
    fs.rmSync(temporario, { force: true });
  }
}

function limparAntigos() {
  const hoje = agoraLocal().data;
  const corteAgendamentos = somarDias(hoje, -DIAS_GUARDANDO_HISTORICO);
  const corteExcecoes = somarDias(hoje, -DIAS_PASSADOS_NO_PAINEL);
  estado.agendamentos = estado.agendamentos.filter((a) => a.data >= corteAgendamentos);
  for (const data of Object.keys(estado.excecoes)) {
    const ex = estado.excecoes[data];
    const vazia = !ex.fechado && !(ex.bloqueados || []).length && !(ex.extras || []).length;
    if (data < corteExcecoes || vazia) delete estado.excecoes[data];
  }
}

/* ---------- senha e sessão ---------- */

function gerarHash(senha, sal) {
  return crypto.scryptSync(senha, sal, 64).toString('hex');
}

function definirSenha(senha, provisoria) {
  const sal = crypto.randomBytes(16).toString('hex');
  estado.admin = {
    sal,
    hash: gerarHash(senha, sal),
    segredo: crypto.randomBytes(32).toString('hex'), // trocar a senha encerra as sessões abertas
    provisoria: Boolean(provisoria),
  };
}

function criarSenhaInicial() {
  const doAmbiente = process.env.SENHA_ADMIN;
  if (doAmbiente && doAmbiente.length >= 8) {
    definirSenha(doAmbiente, false);
    return;
  }
  const senha = crypto.randomBytes(9).toString('base64url');
  definirSenha(senha, true);
  fs.writeFileSync(
    ARQUIVO_SENHA,
    [
      'EL Saúde & Estética — senha inicial do painel',
      '',
      'Senha: ' + senha,
      '',
      'Entre no painel (endereço do site + /admin), abra "Configurações"',
      'e troque por uma senha sua. Este arquivo é apagado quando a senha é trocada.',
      '',
    ].join('\r\n'),
  );
  console.log('Senha inicial do painel criada. Veja o arquivo: ' + ARQUIVO_SENHA);
}

function senhaConfere(senha) {
  if (typeof senha !== 'string' || !estado.admin) return false;
  const esperado = Buffer.from(estado.admin.hash, 'hex');
  const recebido = Buffer.from(gerarHash(senha, estado.admin.sal), 'hex');
  return esperado.length === recebido.length && crypto.timingSafeEqual(esperado, recebido);
}

function assinar(validade) {
  return crypto.createHmac('sha256', estado.admin.segredo).update(String(validade)).digest('hex');
}

function novoToken() {
  const validade = Date.now() + SESSAO_MS;
  return validade + '.' + assinar(validade);
}

function tokenValido(token) {
  if (typeof token !== 'string') return false;
  const [validade, assinatura] = token.split('.');
  if (!validade || !assinatura || !/^\d+$/.test(validade) || Number(validade) < Date.now()) return false;
  const a = Buffer.from(assinatura, 'hex');
  const b = Buffer.from(assinar(validade), 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function lerCookie(req, nome) {
  for (const parte of (req.headers.cookie || '').split(';')) {
    const [k, ...v] = parte.trim().split('=');
    if (k === nome) return v.join('=');
  }
  return null;
}

function cookieDeSessao(req, valor, maxAgeSeg) {
  const https = (CONFIAR_PROXY && req.headers['x-forwarded-proto'] === 'https') || req.socket.encrypted;
  return `sessao=${valor}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSeg}${https ? '; Secure' : ''}`;
}

function exigirLogin(req) {
  if (!tokenValido(lerCookie(req, 'sessao'))) throw new Erro(401, 'Entre com a senha para continuar.');
}

/* ---------- limite de tentativas ---------- */

const janelas = new Map();

function tentativasRecentes(chave, ms) {
  const agora = Date.now();
  const lista = (janelas.get(chave) || []).filter((t) => agora - t < ms);
  janelas.set(chave, lista);
  return lista;
}

function registrarTentativa(chave) {
  const lista = janelas.get(chave) || [];
  lista.push(Date.now());
  janelas.set(chave, lista);
}

setInterval(() => {
  const agora = Date.now();
  for (const [chave, lista] of janelas) {
    if (!lista.some((t) => agora - t < 60 * 60 * 1000)) janelas.delete(chave);
  }
}, 10 * 60 * 1000).unref();

function ipDe(req) {
  if (CONFIAR_PROXY) {
    if (CABECALHO_IP === 'x-forwarded-for') {
      const primeiro = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
      if (primeiro) return primeiro;
    } else if (CABECALHO_IP) {
      const valor = String(req.headers[CABECALHO_IP] || '').split(',')[0].trim();
      if (valor) return valor;
    }
    // O Nginx grava o IP verdadeiro em X-Real-IP. No X-Forwarded-For só o último valor
    // é confiável: os primeiros podem ter sido inventados pelo próprio visitante.
    const real = req.headers['x-real-ip'];
    if (real) return String(real).trim();
    const lista = String(req.headers['x-forwarded-for'] || '').split(',').map((v) => v.trim()).filter(Boolean);
    if (lista.length) return lista[lista.length - 1];
  }
  return req.socket.remoteAddress || 'desconhecido';
}

/* ---------- regras da agenda ---------- */

function excecaoDe(data) {
  const ex = estado.excecoes[data] || {};
  return { fechado: Boolean(ex.fechado), bloqueados: ex.bloqueados || [], extras: ex.extras || [] };
}

function alterarExcecao(data, mudar) {
  const ex = excecaoDe(data);
  mudar(ex);
  ex.bloqueados = [...new Set(ex.bloqueados)].sort();
  ex.extras = [...new Set(ex.extras)].sort();
  estado.excecoes[data] = ex;
}

/** Todos os horários de um dia, com a situação de cada um. */
function horariosDoDia(data) {
  const ex = excecaoDe(data);
  const daSemana = estado.config.semana[diaDaSemana(data)] || [];
  const marcados = estado.agendamentos.filter((a) => a.data === data);
  const horas = new Set([...daSemana, ...ex.extras, ...marcados.map((a) => a.hora)]);
  return [...horas].sort().map((hora) => {
    const agendamento = marcados.find((a) => a.hora === hora) || null;
    let situacao = 'livre';
    if (agendamento) situacao = 'agendado';
    else if (ex.fechado || ex.bloqueados.includes(hora)) situacao = 'bloqueado';
    return { hora, situacao, extra: !daSemana.includes(hora), agendamento };
  });
}

/** O que a paciente vê: só horários, nunca nomes. */
function agendaPublica() {
  const hoje = agoraLocal().data;
  const limite = agoraLocal(estado.config.antecedenciaHoras * 60 * 60 * 1000).carimbo;
  const dias = [];
  for (let i = 0; i <= estado.config.diasAbertos; i++) {
    const data = somarDias(hoje, i);
    const futuros = horariosDoDia(data).filter((h) => `${data} ${h.hora}` >= limite);
    const livres = futuros.filter((h) => h.situacao === 'livre').map((h) => h.hora);
    const ocupados = futuros.filter((h) => h.situacao === 'agendado').map((h) => h.hora);
    if (livres.length || ocupados.length) dias.push({ data, livres, ocupados });
  }
  return { hoje, dias };
}

function painel() {
  const agora = agoraLocal();
  const dias = [];
  for (let i = -DIAS_PASSADOS_NO_PAINEL; i <= DIAS_FUTUROS_NO_PAINEL; i++) {
    const data = somarDias(agora.data, i);
    dias.push({ data, fechado: excecaoDe(data).fechado, horarios: horariosDoDia(data) });
  }
  return {
    hoje: agora.data,
    agora: agora.hora,
    config: estado.config,
    senhaProvisoria: Boolean(estado.admin.provisoria),
    dias,
  };
}

function limparNome(valor) {
  const nome = String(valor ?? '').replace(/\s+/g, ' ').trim();
  if (nome.length < 3 || nome.length > 80 || !/\p{L}{2,}/u.test(nome)) {
    throw new Erro(400, 'Informe o nome completo da paciente.');
  }
  return nome;
}

function limparTelefone(valor) {
  let digitos = String(valor ?? '').replace(/\D/g, '');
  if (digitos.length > 11 && digitos.startsWith('55')) digitos = digitos.slice(2);
  if (digitos.length !== 10 && digitos.length !== 11) {
    throw new Erro(400, 'Informe o telefone com DDD, por exemplo (83) 99999-9999.');
  }
  return digitos;
}

const CAMPOS_DA_FICHA = {
  queixa: 800,
  tempo: 80,
  procedimentos: 400,
  idade: 3,
  gestante: 60,
  alergias: 400,
  condicoes: 400,
  expectativa: 80,
  recado: 800,
};

/** Respostas da conversa de pré-atendimento, limpas e com tamanho limitado. */
function limparFicha(valor) {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return null;
  const texto = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
  const ficha = {
    areas: Array.isArray(valor.areas)
      ? valor.areas.slice(0, 8).map((a) => texto(a, 40)).filter(Boolean)
      : [],
  };
  for (const [campo, max] of Object.entries(CAMPOS_DA_FICHA)) ficha[campo] = texto(valor[campo], max);
  return ficha.queixa || ficha.areas.length ? ficha : null;
}

function lerDataEHora(corpo) {
  if (!dataValida(corpo.data)) throw new Erro(400, 'Data inválida.');
  if (!horaValida(corpo.hora)) throw new Erro(400, 'Horário inválido.');
  return { data: corpo.data, hora: corpo.hora };
}

function agendarPeloSite(corpo, ip) {
  if (corpo.site) throw new Erro(400, 'Não foi possível concluir o agendamento.'); // campo-isca para robôs
  if (tentativasRecentes('agendar:' + ip, 60 * 60 * 1000).length >= 20) {
    throw new Erro(429, 'Muitos agendamentos em pouco tempo. Tente mais tarde ou fale pelo WhatsApp.');
  }
  const { data, hora } = lerDataEHora(corpo);
  const nome = limparNome(corpo.nome);
  const telefone = limparTelefone(corpo.telefone);

  const agora = agoraLocal();
  const limite = agoraLocal(estado.config.antecedenciaHoras * 60 * 60 * 1000).carimbo;
  const dentroDoPrazo = data <= somarDias(agora.data, estado.config.diasAbertos) && `${data} ${hora}` >= limite;
  const horario = horariosDoDia(data).find((h) => h.hora === hora);
  if (!dentroDoPrazo || !horario || horario.situacao !== 'livre') {
    throw new Erro(409, 'Esse horário não está mais disponível. Escolha outro, por favor.');
  }
  const jaMarcados = estado.agendamentos.filter(
    (a) => a.telefone === telefone && `${a.data} ${a.hora}` >= agora.carimbo,
  );
  if (jaMarcados.length >= MAX_AGENDAMENTOS_POR_TELEFONE) {
    throw new Erro(409, 'Este telefone já tem horários marcados. Para marcar outro, fale com a clínica pelo WhatsApp.');
  }

  registrarTentativa('agendar:' + ip);
  const ficha = limparFicha(corpo.ficha);
  const agendamento = criarAgendamento({ data, hora, nome, telefone, origem: 'site', ficha });
  return { data: agendamento.data, hora: agendamento.hora, nome: agendamento.nome };
}

function criarAgendamento({ data, hora, nome, telefone, origem, ficha = null }) {
  const agendamento = {
    id: crypto.randomUUID(),
    data,
    hora,
    nome,
    telefone,
    origem,
    ficha,
    criadoEm: new Date().toISOString(),
  };
  estado.agendamentos.push(agendamento);
  salvar();
  return agendamento;
}

function exigirHorarioSemPaciente(data, hora, ignorarId) {
  const ocupado = estado.agendamentos.some((a) => a.data === data && a.hora === hora && a.id !== ignorarId);
  if (ocupado) throw new Erro(409, 'Já existe uma paciente marcada nesse dia e horário.');
}

function lerSemana(valor) {
  const semana = {};
  for (let dia = 0; dia <= 6; dia++) {
    const horas = (valor && valor[dia]) || [];
    if (!Array.isArray(horas) || horas.length > 48 || !horas.every(horaValida)) {
      throw new Erro(400, 'Horários de atendimento inválidos.');
    }
    semana[dia] = [...new Set(horas)].sort();
  }
  return semana;
}

/* ---------- HTTP ---------- */

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
};

// Só estas pastas são públicas. server.js e dados/ nunca são servidos.
const CAMINHOS_PUBLICOS = [
  /^\/assets\/[\w\-./]+$/,
  /^\/css\/[\w\-.]+$/,
  /^\/js\/[\w\-.]+$/,
  /^\/admin\/[\w\-.]+$/,
];

const SEGURANCA = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy':
    "default-src 'self'; img-src 'self' data:; style-src 'self' https://fonts.googleapis.com; " +
    "font-src https://fonts.gstatic.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
};

function responderJson(res, status, corpo, cabecalhos = {}) {
  res.writeHead(status, {
    ...SEGURANCA,
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...cabecalhos,
  });
  res.end(JSON.stringify(corpo));
}

function lerCorpo(req) {
  return new Promise((resolve, reject) => {
    if (!String(req.headers['content-type'] || '').startsWith('application/json')) {
      reject(new Erro(415, 'Envie os dados em JSON.'));
      return;
    }
    let tamanho = 0;
    const partes = [];
    req.on('data', (parte) => {
      tamanho += parte.length;
      if (tamanho > 30000) {
        reject(new Erro(413, 'Dados grandes demais.'));
        req.destroy();
        return;
      }
      partes.push(parte);
    });
    req.on('end', () => {
      try {
        const corpo = JSON.parse(Buffer.concat(partes).toString('utf8') || '{}');
        if (!corpo || typeof corpo !== 'object' || Array.isArray(corpo)) throw new Error();
        resolve(corpo);
      } catch {
        reject(new Erro(400, 'Dados inválidos.'));
      }
    });
    req.on('error', reject);
  });
}

function servirArquivo(req, res, caminhoUrl) {
  let relativo = null;
  if (caminhoUrl === '/' || caminhoUrl === '/index.html') relativo = 'index.html';
  else if (caminhoUrl === '/sobre' || caminhoUrl === '/sobre.html') relativo = 'sobre.html';
  else if (caminhoUrl === '/admin/' || caminhoUrl === '/admin/index.html') relativo = 'admin/index.html';
  else if (caminhoUrl === '/favicon.ico') relativo = 'assets/favicon.png';
  else if (!caminhoUrl.includes('..') && CAMINHOS_PUBLICOS.some((r) => r.test(caminhoUrl))) {
    relativo = caminhoUrl.slice(1);
  }

  const arquivo = relativo && path.resolve(RAIZ, relativo);
  const tipo = arquivo && TIPOS[path.extname(arquivo).toLowerCase()];
  if (!arquivo || !tipo || !arquivo.startsWith(RAIZ + path.sep) || !fs.existsSync(arquivo) || !fs.statSync(arquivo).isFile()) {
    res.writeHead(404, { ...SEGURANCA, 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Página não encontrada.');
    return;
  }

  const midia = tipo.startsWith('image/') || tipo.startsWith('video/');
  const tamanho = fs.statSync(arquivo).size;
  const cabecalhos = {
    ...SEGURANCA,
    'Content-Type': tipo,
    'Cache-Control': midia ? 'public, max-age=86400' : 'no-cache',
    'Accept-Ranges': 'bytes',
  };
  if (relativo.startsWith('admin/')) cabecalhos['X-Robots-Tag'] = 'noindex, nofollow';

  // Vídeos são enviados em pedaços: o navegador pede só o trecho que vai tocar
  // (obrigatório no iPhone, e deixa o vídeo começar sem baixar o arquivo inteiro).
  const faixa = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
  if (faixa && (faixa[1] || faixa[2])) {
    let inicio = faixa[1] ? Number(faixa[1]) : tamanho - Number(faixa[2]);
    let fim = faixa[1] && faixa[2] ? Number(faixa[2]) : tamanho - 1;
    inicio = Math.max(0, inicio);
    fim = Math.min(fim, tamanho - 1);
    if (inicio > fim || inicio >= tamanho) {
      res.writeHead(416, { ...SEGURANCA, 'Content-Range': `bytes */${tamanho}` });
      res.end();
      return;
    }
    res.writeHead(206, {
      ...cabecalhos,
      'Content-Range': `bytes ${inicio}-${fim}/${tamanho}`,
      'Content-Length': fim - inicio + 1,
    });
    if (req.method === 'HEAD') res.end();
    else fs.createReadStream(arquivo, { start: inicio, end: fim }).pipe(res);
    return;
  }

  res.writeHead(200, { ...cabecalhos, 'Content-Length': tamanho });
  if (req.method === 'HEAD') res.end();
  else fs.createReadStream(arquivo).pipe(res);
}

async function tratarApi(req, res, rota) {
  const metodo = req.method;

  /* --- público --- */
  if (rota === '/api/agenda' && metodo === 'GET') {
    return responderJson(res, 200, agendaPublica());
  }
  if (rota === '/api/agendamentos' && metodo === 'POST') {
    const feito = agendarPeloSite(await lerCorpo(req), ipDe(req));
    return responderJson(res, 201, { agendamento: feito, agenda: agendaPublica() });
  }

  /* --- entrar e sair --- */
  if (rota === '/api/admin/login' && metodo === 'POST') {
    const chave = 'login:' + ipDe(req);
    // Limite por IP e um limite geral: mesmo que alguém consiga disfarçar o IP,
    // não dá para testar milhares de senhas.
    if (
      tentativasRecentes(chave, 15 * 60 * 1000).length >= 8 ||
      tentativasRecentes('login:todos', 15 * 60 * 1000).length >= 40
    ) {
      throw new Erro(429, 'Muitas tentativas. Aguarde 15 minutos e tente de novo.');
    }
    const corpo = await lerCorpo(req);
    if (!senhaConfere(corpo.senha)) {
      registrarTentativa(chave);
      registrarTentativa('login:todos');
      throw new Erro(401, 'Senha incorreta.');
    }
    return responderJson(res, 200, painel(), {
      'Set-Cookie': cookieDeSessao(req, novoToken(), Math.floor(SESSAO_MS / 1000)),
    });
  }
  if (rota === '/api/admin/primeiro-acesso' && metodo === 'GET') {
    // Só diz se a senha ainda é a inicial (para o painel mostrar onde encontrá-la).
    return responderJson(res, 200, { senhaInicial: Boolean(estado.admin.provisoria) });
  }
  if (rota === '/api/admin/logout' && metodo === 'POST') {
    return responderJson(res, 200, { ok: true }, { 'Set-Cookie': cookieDeSessao(req, '', 0) });
  }

  /* --- painel (exige login) --- */
  if (!rota.startsWith('/api/admin/')) throw new Erro(404, 'Rota não encontrada.');
  exigirLogin(req);

  if (rota === '/api/admin/painel' && metodo === 'GET') {
    return responderJson(res, 200, painel());
  }

  // Diagnóstico (só com login): mostra como a hospedagem informa o IP e o HTTPS,
  // para escolher o valor certo de CABECALHO_IP.
  if (rota === '/api/admin/diagnostico' && metodo === 'GET') {
    const ver = (nome) => (req.headers[nome] === undefined ? null : String(req.headers[nome]));
    return responderJson(res, 200, {
      ipUsadoPeloSite: ipDe(req),
      configuracao: { CONFIAR_PROXY, CABECALHO_IP: CABECALHO_IP || '(vazio)' },
      cabecalhos: {
        'x-forwarded-for': ver('x-forwarded-for'),
        'x-real-ip': ver('x-real-ip'),
        'true-client-ip': ver('true-client-ip'),
        'cf-connecting-ip': ver('cf-connecting-ip'),
        'x-forwarded-proto': ver('x-forwarded-proto'),
      },
      ipDaConexao: req.socket.remoteAddress,
    });
  }

  if (rota === '/api/admin/agendamentos' && metodo === 'POST') {
    const corpo = await lerCorpo(req);
    const { data, hora } = lerDataEHora(corpo);
    const nome = limparNome(corpo.nome);
    const telefone = limparTelefone(corpo.telefone);
    exigirHorarioSemPaciente(data, hora, null);
    criarAgendamento({ data, hora, nome, telefone, origem: 'clinica' });
    return responderJson(res, 201, painel());
  }

  const comId = rota.match(/^\/api\/admin\/agendamentos\/([0-9a-f-]{36})$/);
  if (comId) {
    const agendamento = estado.agendamentos.find((a) => a.id === comId[1]);
    if (!agendamento) throw new Erro(404, 'Agendamento não encontrado. Ele pode já ter sido excluído.');
    if (metodo === 'PUT') {
      const corpo = await lerCorpo(req);
      const { data, hora } = lerDataEHora(corpo);
      const nome = limparNome(corpo.nome);
      const telefone = limparTelefone(corpo.telefone);
      exigirHorarioSemPaciente(data, hora, agendamento.id);
      Object.assign(agendamento, { data, hora, nome, telefone });
      salvar();
      return responderJson(res, 200, painel());
    }
    if (metodo === 'DELETE') {
      estado.agendamentos = estado.agendamentos.filter((a) => a.id !== agendamento.id);
      salvar();
      return responderJson(res, 200, painel());
    }
  }

  if (rota === '/api/admin/horario' && metodo === 'PUT') {
    const corpo = await lerCorpo(req);
    const { data, hora } = lerDataEHora(corpo);
    const daSemana = (estado.config.semana[diaDaSemana(data)] || []).includes(hora);
    alterarExcecao(data, (ex) => {
      if (corpo.acao === 'bloquear') {
        if (daSemana) ex.bloqueados.push(hora);
        else ex.extras = ex.extras.filter((h) => h !== hora); // horário extra: bloquear = retirar
      } else if (corpo.acao === 'liberar') {
        ex.bloqueados = ex.bloqueados.filter((h) => h !== hora);
      } else if (corpo.acao === 'adicionar') {
        ex.bloqueados = ex.bloqueados.filter((h) => h !== hora);
        if (!daSemana) ex.extras.push(hora);
      } else {
        throw new Erro(400, 'Ação inválida.');
      }
    });
    limparAntigos();
    salvar();
    return responderJson(res, 200, painel());
  }

  if (rota === '/api/admin/dia' && metodo === 'PUT') {
    const corpo = await lerCorpo(req);
    if (!dataValida(corpo.data)) throw new Erro(400, 'Data inválida.');
    alterarExcecao(corpo.data, (ex) => {
      ex.fechado = Boolean(corpo.fechado);
    });
    limparAntigos();
    salvar();
    return responderJson(res, 200, painel());
  }

  if (rota === '/api/admin/semana' && metodo === 'PUT') {
    const corpo = await lerCorpo(req);
    estado.config.semana = lerSemana(corpo.semana);
    salvar();
    return responderJson(res, 200, painel());
  }

  if (rota === '/api/admin/config' && metodo === 'PUT') {
    const corpo = await lerCorpo(req);
    const dias = Number(corpo.diasAbertos);
    const horas = Number(corpo.antecedenciaHoras);
    if (!Number.isInteger(dias) || dias < 1 || dias > 90) {
      throw new Erro(400, 'A agenda pode ficar aberta de 1 a 90 dias.');
    }
    if (!Number.isInteger(horas) || horas < 0 || horas > 72) {
      throw new Erro(400, 'A antecedência mínima vai de 0 a 72 horas.');
    }
    estado.config.diasAbertos = dias;
    estado.config.antecedenciaHoras = horas;
    salvar();
    return responderJson(res, 200, painel());
  }

  if (rota === '/api/admin/senha' && metodo === 'POST') {
    const corpo = await lerCorpo(req);
    if (!senhaConfere(corpo.atual)) throw new Erro(401, 'A senha atual não confere.');
    if (typeof corpo.nova !== 'string' || corpo.nova.length < 8 || corpo.nova.length > 200) {
      throw new Erro(400, 'A nova senha precisa ter pelo menos 8 caracteres.');
    }
    definirSenha(corpo.nova, false);
    salvar();
    fs.rmSync(ARQUIVO_SENHA, { force: true });
    return responderJson(res, 200, painel(), {
      'Set-Cookie': cookieDeSessao(req, novoToken(), Math.floor(SESSAO_MS / 1000)),
    });
  }

  throw new Erro(404, 'Rota não encontrada.');
}

const servidor = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const rota = decodeURIComponent(url.pathname);
    if (rota.startsWith('/api/')) {
      await tratarApi(req, res, rota);
    } else if (rota === '/admin') {
      res.writeHead(301, { Location: '/admin/' });
      res.end();
    } else if (req.method === 'GET' || req.method === 'HEAD') {
      servirArquivo(req, res, rota);
    } else {
      res.writeHead(405, SEGURANCA);
      res.end();
    }
  } catch (erro) {
    if (res.headersSent) {
      res.end();
    } else if (erro instanceof Erro) {
      responderJson(res, erro.status, { erro: erro.message });
    } else {
      console.error(erro);
      responderJson(res, 500, { erro: 'Algo deu errado no servidor. Tente de novo em instantes.' });
    }
  }
});

carregar();
// No VPS: HOST=127.0.0.1, assim só o Nginx (na mesma máquina) fala com o servidor.
const ENDERECO = process.env.HOST || '0.0.0.0';
servidor.listen(PORTA, ENDERECO, () => {
  console.log(`Site:   http://localhost:${PORTA}`);
  console.log(`Painel: http://localhost:${PORTA}/admin`);
});
