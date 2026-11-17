/* EL Saúde & Estética — página "Sobre a Dra. Ericka": menu, animações e vídeos */
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const semMovimento = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- título: cada palavra sobe em sequência ---------- */

  const titulo = $('titulo-sobre');
  const texto = titulo.textContent.trim();
  titulo.setAttribute('aria-label', texto);
  titulo.replaceChildren(
    ...texto.split(/\s+/).flatMap((palavra, i) => {
      const fora = document.createElement('span');
      fora.className = 'palavra';
      fora.setAttribute('aria-hidden', 'true');
      const dentro = document.createElement('span');
      dentro.textContent = palavra;
      dentro.style.animationDelay = `${0.15 + i * 0.12}s`;
      fora.append(dentro);
      return [fora, ' '];
    }),
  );

  /* ---------- blocos aparecem ao rolar ---------- */

  const revelar = new IntersectionObserver(
    (entradas) => {
      for (const entrada of entradas) {
        if (!entrada.isIntersecting) continue;
        entrada.target.classList.add('visivel');
        revelar.unobserve(entrada.target);
      }
    },
    { threshold: 0.15, rootMargin: '0px 0px -6% 0px' },
  );
  document.querySelectorAll('[data-revelar]').forEach((no) => revelar.observe(no));

  // Animações sem fim da abertura param quando ela sai da tela.
  const pausarFora = new IntersectionObserver((entradas) => {
    for (const entrada of entradas) entrada.target.classList.toggle('fora-da-tela', !entrada.isIntersecting);
  });
  document.querySelectorAll('.sobre-abertura').forEach((parte) => pausarFora.observe(parte));

  /* ---------- topo: sombra e barra de leitura ---------- */

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

  /* ---------- menu do celular ---------- */

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

  /* ---------- vídeos ---------- */
  // Tocam sem som quando aparecem na tela (as legendas já estão no vídeo) e pausam ao sair.
  // "Ativar som" recomeça o vídeo do início com som; só um vídeo fica com som por vez.

  const videos = [...document.querySelectorAll('.video')].map((figura) => ({
    figura,
    video: figura.querySelector('video'),
    tocar: figura.querySelector('.video-tocar'),
    som: figura.querySelector('.video-som'),
    barra: figura.querySelector('.video-progresso span'),
    pausadoPeloUsuario: false,
  }));

  function atualizarEstado(item) {
    const tocando = !item.video.paused && !item.video.ended;
    item.figura.classList.toggle('tocando', tocando);
    item.tocar.setAttribute('aria-label', tocando ? 'Pausar vídeo' : 'Tocar vídeo');
  }

  function definirSom(item, ligado) {
    item.video.muted = !ligado;
    item.som.setAttribute('aria-pressed', String(ligado));
    item.som.setAttribute('aria-label', ligado ? 'Desativar som' : 'Ativar som');
  }

  function tocar(item) {
    const promessa = item.video.play();
    if (promessa) promessa.catch(() => atualizarEstado(item));
  }

  videos.forEach((item) => {
    definirSom(item, false);
    ['play', 'pause', 'ended'].forEach((evento) => item.video.addEventListener(evento, () => atualizarEstado(item)));
    item.video.addEventListener('timeupdate', () => {
      const parte = item.video.duration ? item.video.currentTime / item.video.duration : 0;
      item.barra.style.transform = `scaleX(${parte})`;
    });

    const alternar = () => {
      if (item.video.paused) {
        item.pausadoPeloUsuario = false;
        tocar(item);
      } else {
        item.pausadoPeloUsuario = true;
        item.video.pause();
      }
    };
    item.video.addEventListener('click', alternar);
    item.tocar.addEventListener('click', alternar);

    item.som.addEventListener('click', () => {
      const ligar = item.video.muted;
      if (ligar) {
        videos.forEach((outro) => outro !== item && definirSom(outro, false));
        item.video.currentTime = 0;
        item.pausadoPeloUsuario = false;
      }
      definirSom(item, ligar);
      tocar(item);
    });
  });

  // Toca quando pelo menos metade do vídeo está visível; pausa quando sai da tela.
  const observarVideos = new IntersectionObserver(
    (entradas) => {
      for (const entrada of entradas) {
        const item = videos.find((v) => v.figura === entrada.target);
        if (!item) continue;
        if (entrada.isIntersecting) {
          if (!semMovimento && !item.pausadoPeloUsuario) tocar(item);
        } else if (!item.video.paused) {
          item.video.pause();
        }
      }
    },
    { threshold: 0.5 },
  );
  videos.forEach((item) => observarVideos.observe(item.figura));

  // Aba em segundo plano: pausa os vídeos; ao voltar, retoma o que estava na tela.
  const tocandoAntes = new Set();
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      videos.forEach((item) => {
        if (!item.video.paused) {
          tocandoAntes.add(item);
          item.video.pause();
        }
      });
    } else {
      tocandoAntes.forEach((item) => tocar(item));
      tocandoAntes.clear();
    }
  });
})();
