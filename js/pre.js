// Liga as animações só quando o JavaScript está ativo (sem ele, tudo aparece normalmente).
document.documentElement.classList.add('js');

// Segurança: se o navegador não estiver rodando animações (janela congelada, visualização
// embutida, economia de energia), mostra todo o conteúdo parado em vez de deixá-lo invisível.
(function () {
  function conferir() {
    var inicio = document.timeline ? document.timeline.currentTime : null;
    setTimeout(function () {
      var agora = document.timeline ? document.timeline.currentTime : null;
      if (agora === null || agora === inicio) {
        document.documentElement.classList.add('sem-animacao');
        document.dispatchEvent(new Event('sem-animacao'));
      }
    }, 1200);
  }
  if (document.visibilityState === 'visible') conferir();
  else document.addEventListener('visibilitychange', function aoVoltar() {
    if (document.visibilityState !== 'visible') return;
    document.removeEventListener('visibilitychange', aoVoltar);
    conferir();
  });
})();
