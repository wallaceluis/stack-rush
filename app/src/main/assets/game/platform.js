// Camada de plataforma: conversa com o app Android (window.Android, injetado pelo
// GameBridge.kt) ou, no navegador, simula anúncios para dar para testar tudo.
(function () {
  const native = window.Android;
  const rewardCallbacks = {};
  const purchaseCallbacks = {};

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
    el.classList.remove('hidden');
    setTimeout(function () { el.classList.add('hidden'); done(); }, ms);
  }

  window.Platform = {
    isNative: !!native,

    showBanner(visible) {
      if (native) native.showBanner(!!visible);
    },

    showInterstitial() {
      if (native) native.showInterstitial();
      else fakeAd(700, function () {});
    },

    isRewardedReady() {
      return native ? native.isRewardedReady() : true;
    },

    // placement: identificador do ponto do jogo ("continue", "double", "coins").
    showRewarded(placement, cb) {
      rewardCallbacks[placement] = cb;
      if (native) native.showRewarded(placement);
      else fakeAd(1200, function () { window.__onRewardResult(placement, true); });
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
      else if (navigator.vibrate) navigator.vibrate(ms);
    },

    logEvent(name, value) {
      if (native) native.logEvent(String(name), String(value == null ? '' : value));
    },
  };
})();
