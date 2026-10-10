// Camada de plataforma. O jogo só fala com window.Platform; aqui se decide para onde vai:
//  - "android":    app nativo (window.Android, injetado pelo GameBridge.kt) com AdMob e Play Billing
//  - "crazygames": portal CrazyGames (SDK v3, incluído no pacote gerado por scripts/build-crazygames.sh)
//  - "web":        navegador comum (GitHub Pages). Sem anúncios; em localhost simula para testar.
(function () {
  const native = window.Android;
  const cg = window.CrazyGames && window.CrazyGames.SDK;
  const isLocal = location.protocol === 'file:' || /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  const name = native ? 'android' : cg ? 'crazygames' : 'web';

  const rewardCallbacks = {};
  const purchaseCallbacks = {};
  let muteHandler = function () {};

  // Chamados pelo lado nativo via evaluateJavascript.
  window.__onRewardResult = function (placement, granted) {
    const cb = rewardCallbacks[placement];
    delete rewardCallbacks[placement];
    if (cb) cb(!!granted);
  };
  window.__onPurchaseResult = function (sku, ok) {
    const cb = purchaseCallbacks[sku];
    delete purchaseCallbacks[sku];
    if (cb) cb(!!ok);
  };

  function fakeAd(ms, done) {
    const el = document.getElementById('fake-ad');
    muteHandler(true);
    el.classList.remove('hidden');
    setTimeout(function () { el.classList.add('hidden'); muteHandler(false); done(); }, ms);
  }

  // Anúncio da CrazyGames: o áudio do jogo tem que ficar mudo enquanto ele roda.
  function cgAd(type, done) {
    cg.ad.requestAd(type, {
      adStarted: function () { muteHandler(true); },
      adFinished: function () { muteHandler(false); done(true); },
      adError: function () { muteHandler(false); done(false); },
    });
  }

  // CrazyGames sincroniza o progresso pela conta do jogador quando o módulo de dados está ativo.
  function store() {
    if (cg && cg.data && name === 'crazygames') return cg.data;
    try { return window.localStorage; } catch (e) { return null; }
  }

  const ready = (function () {
    if (!cg) return Promise.resolve();
    return Promise.resolve()
      .then(function () { return cg.init(); })
      .catch(function (e) { console.warn('CrazyGames SDK init falhou', e); });
  })();

  window.Platform = {
    name: name,
    isNative: !!native,
    canPurchase: !!native,
    ready: ready,

    onMute(fn) { muteHandler = fn; },

    getItem(key) {
      const s = store();
      try { return s ? s.getItem(key) : null; } catch (e) { return null; }
    },
    setItem(key, value) {
      const s = store();
      try { if (s) s.setItem(key, value); } catch (e) { /* sem storage */ }
    },

    // Avisos de ciclo de jogo (usados pela CrazyGames para medir e posicionar anúncios).
    loadingStop() { if (cg) try { cg.game.loadingStop(); } catch (e) { /* ok */ } },
    gameplayStart() { if (cg) try { cg.game.gameplayStart(); } catch (e) { /* ok */ } },
    gameplayStop() { if (cg) try { cg.game.gameplayStop(); } catch (e) { /* ok */ } },
    happytime() { if (cg) try { cg.game.happytime(); } catch (e) { /* ok */ } },

    showBanner(visible) {
      if (native) native.showBanner(!!visible);
    },

    showInterstitial() {
      if (native) native.showInterstitial();
      else if (cg) cgAd('midgame', function () {});
      else if (isLocal) fakeAd(700, function () {});
    },

    isRewardedReady() {
      return native ? native.isRewardedReady() : true;
    },

    // placement: identificador do ponto do jogo ("continue", "double", "coins").
    // cb(granted) — granted=false quando o anúncio não rodou até o fim.
    showRewarded(placement, cb) {
      if (native) { rewardCallbacks[placement] = cb; native.showRewarded(placement); }
      else if (cg) cgAd('rewarded', cb);
      else if (isLocal) fakeAd(1200, function () { cb(true); });
      else cb(true); // web sem anúncios: recompensa liberada
    },

    isAdFree() {
      return native ? native.isAdFree() : false;
    },

    purchase(sku, cb) {
      purchaseCallbacks[sku] = cb;
      if (native) native.purchase(sku);
      else window.__onPurchaseResult(sku, false);
    },

    vibrate(ms) {
      if (native) native.vibrate(ms | 0);
      else if (navigator.vibrate) try { navigator.vibrate(ms); } catch (e) { /* ok */ }
    },

    logEvent(name, value) {
      if (native) native.logEvent(String(name), String(value == null ? '' : value));
    },
  };
})();
