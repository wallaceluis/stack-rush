(function () {
  'use strict';

  // ---------- Configuração ----------
  const BASE = 10;            // lado do bloco inicial (unidades do mundo)
  const LAYER = 2;            // altura de cada camada
  const RANGE = 12;           // distância de onde o bloco vem
  const PERFECT_TOL = 0.3;    // tolerância para "perfeito"
  const GROW_AFTER = 3;       // perfeitos seguidos para começar a crescer
  const GROW_BY = 0.6;
  const INTERSTITIAL_EVERY = 3;      // partidas entre intersticiais
  const INTERSTITIAL_MIN_GAP = 45e3; // ms mínimos entre intersticiais
  const CONTINUE_MIN_SCORE = 3;
  const DAILY_BONUS = 50;
  const FREE_COINS = 100;
  const SKU_REMOVE_ADS = 'remove_ads';

  const THEMES = [
    { id: 'classic', name: 'Clássico', price: 0,    bg: ['#1b1f3b', '#3a2f6b'], hue: 200, step: 6,  sat: 65, light: 58 },
    { id: 'neon',    name: 'Neon',     price: 150,  bg: ['#05010f', '#1a0638'], hue: 290, step: 9,  sat: 95, light: 55 },
    { id: 'sunset',  name: 'Pôr do sol', price: 300, bg: ['#ff7e5f', '#5b2a86'], hue: 20, step: 4,  sat: 85, light: 60 },
    { id: 'ocean',   name: 'Oceano',   price: 500,  bg: ['#012a4a', '#2c7da0'], hue: 180, step: 3,  sat: 70, light: 55 },
    { id: 'candy',   name: 'Doce',     price: 800,  bg: ['#ffafcc', '#a2d2ff'], hue: 330, step: 12, sat: 80, light: 72 },
    { id: 'gold',    name: 'Ouro',     price: 1500, bg: ['#1a1405', '#4a3b0b'], hue: 45,  step: 1,  sat: 90, light: 55 },
  ];

  const I18N_EN = {
    best: 'Best', tap: 'Tap to play', shop: 'Themes', gameover: 'Game over', newbest: 'New best!',
    continue: 'Continue', double: 'Double coins', retry: 'Play again', home: 'Menu', themes: 'Themes',
    freecoins: '+100 free coins', noads: 'Remove ads', perfect: 'PERFECT!', daily: 'Daily bonus',
    owned: 'Owned', noadsSoon: 'Coming soon', notReady: 'Ad not available right now',
    notEnough: 'Not enough coins',
  };
  const I18N_PT = {
    perfect: 'PERFEITO!', daily: 'Bônus diário', owned: 'Seu', noadsSoon: 'Em breve',
    notReady: 'Anúncio indisponível agora', notEnough: 'Moedas insuficientes',
  };
  const isPt = (navigator.language || 'pt').toLowerCase().startsWith('pt');
  function t(key) { return (isPt ? I18N_PT[key] : I18N_EN[key]) || key; }
  if (!isPt) {
    document.documentElement.lang = 'en';
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      const v = I18N_EN[el.dataset.i18n];
      if (v) el.textContent = v;
    });
  }

  // ---------- Persistência ----------
  const STORE_KEY = 'stackrush.v1';
  const save = Object.assign(
    { best: 0, coins: 0, theme: 'classic', owned: ['classic'], sound: true, lastDaily: '', games: 0 },
    (function () { try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch (e) { return {}; } })()
  );
  function persist() { try { localStorage.setItem(STORE_KEY, JSON.stringify(save)); } catch (e) { /* sem storage */ } }

  // ---------- Elementos ----------
  const $ = function (id) { return document.getElementById(id); };
  const canvas = $('game');
  const ctx = canvas.getContext('2d');
  const ui = {
    hud: $('hud'), score: $('score'), combo: $('combo'),
    menu: $('menu'), over: $('over'), shop: $('shop'),
    menuCoins: $('menu-coins'), menuBest: $('menu-best'), shopCoins: $('shop-coins'),
    overScore: $('over-score'), overBest: $('over-best'), overCoins: $('over-coins'), newBest: $('new-best'),
    btnContinue: $('btn-continue'), btnDouble: $('btn-double'), btnRetry: $('btn-retry'), btnHome: $('btn-home'),
    btnShop: $('btn-shop'), btnShopBack: $('btn-shop-back'), btnSound: $('btn-sound'),
    btnFreeCoins: $('btn-free-coins'), btnNoAds: $('btn-noads'), themeList: $('theme-list'), toast: $('toast'),
  };

  // ---------- Som ----------
  let audio = null;
  function tone(freq, dur, type, vol) {
    if (!save.sound) return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      const o = audio.createOscillator();
      const g = audio.createGain();
      o.type = type || 'sine';
      o.frequency.value = freq;
      g.gain.setValueAtTime(vol || 0.15, audio.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + dur);
      o.connect(g); g.connect(audio.destination);
      o.start(); o.stop(audio.currentTime + dur);
    } catch (e) { /* sem áudio */ }
  }

  // ---------- Estado do jogo ----------
  let W = 0, H = 0, DPR = 1, S = 1;
  let state = 'menu';
  let stack = [];       // blocos fixos: {cx, cz, w, d, y, hue}
  let cur = null;       // bloco em movimento: {cx, cz, w, d, y, hue, axis, off, dir}
  let falling = [];     // pedaços caindo
  let rings = [];       // efeito de perfeito
  let camY = 0;
  let score = 0, combo = 0, perfects = 0;
  let runCoins = 0, usedContinue = false, usedDouble = false;
  let overTimer = 0;
  let gamesSinceAd = 0, lastAdAt = 0;

  function theme() { return THEMES.find(function (th) { return th.id === save.theme; }) || THEMES[0]; }

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    // o bloco base ocupa ~55% da largura (ou cabe na altura em telas largas)
    S = Math.min(W * 0.55, H * 0.4) / (2 * BASE * 0.866);
  }

  function resetWorld() {
    stack = [];
    for (let i = 0; i < 6; i++) stack.push({ cx: 0, cz: 0, w: BASE, d: BASE, y: -i * LAYER, hue: theme().hue });
    stack.reverse();
    falling = []; rings = [];
    camY = 0; score = 0; combo = 0; perfects = 0;
    cur = null;
  }

  function top() { return stack[stack.length - 1]; }

  function spawn() {
    const p = top();
    const axis = stack.length % 2 === 0 ? 'x' : 'z';
    const th = theme();
    cur = {
      cx: p.cx, cz: p.cz, w: p.w, d: p.d, y: p.y + LAYER,
      hue: th.hue + (score + 1) * th.step, axis: axis, off: -RANGE, dir: 1,
    };
    if (axis === 'x') cur.cx = p.cx - RANGE; else cur.cz = p.cz - RANGE;
  }

  function speed() { return Math.min(11 + score * 0.22, 24); }

  // ---------- Lógica de colocação ----------
  function place() {
    const p = top();
    const ax = cur.axis;
    const size = ax === 'x' ? cur.w : cur.d;
    const delta = ax === 'x' ? cur.cx - p.cx : cur.cz - p.cz;
    const abs = Math.abs(delta);

    if (abs <= PERFECT_TOL) {
      if (ax === 'x') cur.cx = p.cx; else cur.cz = p.cz;
      combo++; perfects++;
      if (combo >= GROW_AFTER) {
        if (ax === 'x') cur.w = Math.min(BASE, cur.w + GROW_BY); else cur.d = Math.min(BASE, cur.d + GROW_BY);
      }
      rings.push({ cx: cur.cx, cz: cur.cz, w: cur.w, d: cur.d, y: cur.y + LAYER, t: 0 });
      tone(440 * Math.pow(2, Math.min(combo, 12) / 12), 0.18, 'triangle', 0.18);
      Platform.vibrate(25);
      showCombo();
    } else {
      const overlap = size - abs;
      if (overlap <= 0) return miss();
      combo = 0;
      // pedaço que sobra cai
      const lo = (ax === 'x' ? cur.cx : cur.cz) - size / 2;
      const hi = lo + size;
      const plo = (ax === 'x' ? p.cx : p.cz) - (ax === 'x' ? p.w : p.d) / 2;
      const phi = plo + (ax === 'x' ? p.w : p.d);
      const keepLo = Math.max(lo, plo), keepHi = Math.min(hi, phi);
      const cutLo = delta > 0 ? keepHi : lo;
      const cutHi = delta > 0 ? hi : keepLo;
      const piece = { cx: cur.cx, cz: cur.cz, w: cur.w, d: cur.d, y: cur.y, hue: cur.hue, vy: 0 };
      if (ax === 'x') { piece.cx = (cutLo + cutHi) / 2; piece.w = cutHi - cutLo; cur.cx = (keepLo + keepHi) / 2; cur.w = keepHi - keepLo; }
      else { piece.cz = (cutLo + cutHi) / 2; piece.d = cutHi - cutLo; cur.cz = (keepLo + keepHi) / 2; cur.d = keepHi - keepLo; }
      falling.push(piece);
      tone(220, 0.12, 'sine', 0.12);
      Platform.vibrate(12);
      ui.combo.classList.add('hidden');
    }
    stack.push({ cx: cur.cx, cz: cur.cz, w: cur.w, d: cur.d, y: cur.y, hue: cur.hue });
    score++;
    ui.score.textContent = score;
    spawn();
  }

  function miss() {
    falling.push({ cx: cur.cx, cz: cur.cz, w: cur.w, d: cur.d, y: cur.y, hue: cur.hue, vy: 0 });
    cur = null;
    combo = 0;
    state = 'dying';
    overTimer = 0.7;
    tone(110, 0.4, 'sawtooth', 0.12);
    Platform.vibrate(80);
  }

  let comboTimer = null;
  function showCombo() {
    ui.combo.textContent = combo > 1 ? t('perfect') + ' x' + combo : t('perfect');
    ui.combo.classList.remove('hidden');
    // reinicia a animação
    ui.combo.style.animation = 'none'; void ui.combo.offsetWidth; ui.combo.style.animation = '';
    clearTimeout(comboTimer);
    comboTimer = setTimeout(function () { ui.combo.classList.add('hidden'); }, 900);
  }

  // ---------- Telas ----------
  function show(screen) {
    ['menu', 'over', 'shop'].forEach(function (s) { ui[s].classList.toggle('hidden', s !== screen); });
    ui.hud.classList.toggle('hidden', !(screen === null));
    // banner só fora da partida, para não gerar clique acidental durante o jogo
    Platform.showBanner(screen !== null && !Platform.isAdFree());
  }

  function goMenu() {
    state = 'menu';
    resetWorld();
    ui.menuCoins.textContent = save.coins;
    ui.menuBest.textContent = save.best;
    ui.btnSound.textContent = save.sound ? '🔊' : '🔇';
    show('menu');
  }

  function startGame() {
    resetWorld();
    usedContinue = false; usedDouble = false;
    ui.score.textContent = '0';
    ui.combo.classList.add('hidden');
    state = 'playing';
    show(null);
    spawn();
    Platform.logEvent('game_start', save.games);
  }

  function gameOver() {
    state = 'over';
    save.games++;
    gamesSinceAd++;
    runCoins = score + perfects;
    save.coins += runCoins;
    const isBest = score > save.best;
    if (isBest) save.best = score;
    persist();

    ui.overScore.textContent = score;
    ui.overBest.textContent = save.best;
    ui.overCoins.textContent = runCoins;
    ui.newBest.classList.toggle('hidden', !isBest);
    ui.btnContinue.classList.toggle('hidden', usedContinue || score < CONTINUE_MIN_SCORE);
    ui.btnDouble.classList.toggle('hidden', usedDouble || runCoins <= 0);
    ui.btnDouble.disabled = false; ui.btnContinue.disabled = false;
    show('over');
    Platform.logEvent('game_over', score);
  }

  function maybeInterstitial() {
    if (Platform.isAdFree()) return;
    if (gamesSinceAd >= INTERSTITIAL_EVERY && Date.now() - lastAdAt > INTERSTITIAL_MIN_GAP) {
      gamesSinceAd = 0; lastAdAt = Date.now();
      Platform.showInterstitial();
    }
  }

  function continueGame() {
    usedContinue = true;
    state = 'playing';
    show(null);
    spawn();
    Platform.logEvent('continue', score);
  }

  function toast(msg) {
    ui.toast.textContent = msg;
    ui.toast.classList.remove('hidden');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { ui.toast.classList.add('hidden'); }, 1600);
  }

  function rewarded(placement, onGranted) {
    if (!Platform.isRewardedReady()) { toast(t('notReady')); return; }
    Platform.showRewarded(placement, function (granted) { if (granted) onGranted(); });
  }

  // ---------- Loja ----------
  function renderShop() {
    ui.shopCoins.textContent = save.coins;
    ui.themeList.innerHTML = '';
    THEMES.forEach(function (th) {
      const owned = save.owned.indexOf(th.id) >= 0;
      const el = document.createElement('div');
      el.className = 'theme' + (save.theme === th.id ? ' selected' : '');
      const sw = [0, 1, 2, 3].map(function (i) { return 'hsl(' + (th.hue + i * th.step * 3) + ',' + th.sat + '%,' + th.light + '%)'; });
      el.innerHTML =
        '<div class="swatch" style="background:linear-gradient(135deg,' + th.bg[0] + ',' + th.bg[1] + ');display:flex;align-items:flex-end;justify-content:center;gap:4px;padding:6px">' +
        sw.map(function (c) { return '<i style="display:block;width:16px;height:16px;border-radius:3px;background:' + c + '"></i>'; }).join('') +
        '</div><div class="name">' + th.name + '</div>' +
        '<div class="price">' + (owned ? t('owned') : '<span class="coin-ico"></span>' + th.price) + '</div>';
      el.addEventListener('click', function () {
        if (owned) { save.theme = th.id; }
        else if (save.coins >= th.price) { save.coins -= th.price; save.owned.push(th.id); save.theme = th.id; tone(660, 0.2, 'triangle'); Platform.logEvent('theme_buy', th.id); }
        else { toast(t('notEnough')); return; }
        persist(); resetWorld(); renderShop();
      });
      ui.themeList.appendChild(el);
    });
    ui.btnNoAds.classList.toggle('hidden', Platform.isAdFree());
  }

  // ---------- Entrada ----------
  function onTap(e) {
    if (e && e.target && e.target.closest && e.target.closest('button, .theme, #shop, #over')) return;
    if (state === 'playing' && cur) place();
    else if (state === 'menu') startGame();
  }
  window.addEventListener('pointerdown', onTap);
  window.addEventListener('keydown', function (e) { if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); onTap(null); } });

  ui.btnRetry.addEventListener('click', function () { maybeInterstitial(); startGame(); });
  ui.btnHome.addEventListener('click', function () { maybeInterstitial(); goMenu(); });
  ui.btnContinue.addEventListener('click', function () { rewarded('continue', continueGame); });
  ui.btnDouble.addEventListener('click', function () {
    rewarded('double', function () {
      usedDouble = true;
      save.coins += runCoins; persist();
      ui.overCoins.textContent = runCoins * 2;
      ui.btnDouble.classList.add('hidden');
      tone(880, 0.25, 'triangle');
    });
  });
  ui.btnShop.addEventListener('click', function () { state = 'shop'; renderShop(); show('shop'); });
  ui.btnShopBack.addEventListener('click', goMenu);
  ui.btnSound.addEventListener('click', function () { save.sound = !save.sound; persist(); ui.btnSound.textContent = save.sound ? '🔊' : '🔇'; });
  ui.btnFreeCoins.addEventListener('click', function () {
    rewarded('coins', function () { save.coins += FREE_COINS; persist(); renderShop(); toast('+' + FREE_COINS); });
  });
  ui.btnNoAds.addEventListener('click', function () {
    Platform.purchase(SKU_REMOVE_ADS, function (ok) {
      if (ok) { renderShop(); Platform.showBanner(false); } else toast(t('noadsSoon'));
    });
  });

  // Botão "voltar" do Android: retorna true se o jogo tratou.
  window.onBackPressed = function () {
    if (state === 'shop' || state === 'over') { goMenu(); return true; }
    if (state === 'playing' || state === 'dying') return true;
    return false;
  };

  // ---------- Renderização ----------
  const C30 = Math.cos(Math.PI / 6), S30 = 0.5;
  function proj(x, y, z) {
    return [W / 2 + (x - z) * C30 * S, H * 0.6 + ((x + z) * S30 - (y - camY)) * S];
  }
  function poly(pts, fill) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    ctx.fillStyle = fill; ctx.fill();
  }
  function color(hue, dl) {
    const th = theme();
    return 'hsl(' + (((hue % 360) + 360) % 360) + ',' + th.sat + '%,' + Math.max(0, Math.min(100, th.light + dl)) + '%)';
  }
  function drawBox(b, alpha) {
    const x0 = b.cx - b.w / 2, x1 = b.cx + b.w / 2, z0 = b.cz - b.d / 2, z1 = b.cz + b.d / 2;
    const y0 = b.y, y1 = b.y + LAYER;
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    poly([proj(x1, y1, z0), proj(x1, y1, z1), proj(x1, y0, z1), proj(x1, y0, z0)], color(b.hue, -14)); // face +x
    poly([proj(x0, y1, z1), proj(x1, y1, z1), proj(x1, y0, z1), proj(x0, y0, z1)], color(b.hue, -4));  // face +z
    poly([proj(x0, y1, z0), proj(x1, y1, z0), proj(x1, y1, z1), proj(x0, y1, z1)], color(b.hue, 10));  // topo
    ctx.globalAlpha = 1;
  }

  function drawBackground() {
    const th = theme();
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, th.bg[0]); g.addColorStop(1, th.bg[1]);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }

  function render() {
    drawBackground();
    // só desenha o que está na tela
    const minY = camY - H / S;
    for (let i = 0; i < stack.length; i++) if (stack[i].y > minY) drawBox(stack[i]);
    for (let i = 0; i < falling.length; i++) drawBox(falling[i], 0.95);
    if (cur) drawBox(cur);
    for (let i = 0; i < rings.length; i++) {
      const r = rings[i];
      const k = 1 + r.t * 0.6;
      const w = r.w * k / 2, d = r.d * k / 2;
      const pts = [proj(r.cx - w, r.y, r.cz - d), proj(r.cx + w, r.y, r.cz - d), proj(r.cx + w, r.y, r.cz + d), proj(r.cx - w, r.y, r.cz + d)];
      ctx.globalAlpha = Math.max(0, 1 - r.t * 2);
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
      for (let j = 1; j < 4; j++) ctx.lineTo(pts[j][0], pts[j][1]);
      ctx.closePath(); ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  // ---------- Loop ----------
  let last = performance.now();
  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;

    if (state === 'playing' && cur) {
      cur.off += cur.dir * speed() * dt;
      if (cur.off > RANGE) { cur.off = RANGE; cur.dir = -1; }
      if (cur.off < -RANGE) { cur.off = -RANGE; cur.dir = 1; }
      const p = top();
      if (cur.axis === 'x') cur.cx = p.cx + cur.off; else cur.cz = p.cz + cur.off;
    }
    if (state === 'dying') {
      overTimer -= dt;
      if (overTimer <= 0) gameOver();
    }

    for (let i = falling.length - 1; i >= 0; i--) {
      const f = falling[i];
      f.vy += 60 * dt; f.y -= f.vy * dt;
      if (f.y < camY - 60) falling.splice(i, 1);
    }
    for (let i = rings.length - 1; i >= 0; i--) { rings[i].t += dt; if (rings[i].t > 0.6) rings.splice(i, 1); }

    const target = top().y + (state === 'menu' ? 0 : LAYER);
    camY += (target - camY) * Math.min(1, dt * 5);

    render();
    requestAnimationFrame(frame);
  }

  // ---------- Início ----------
  window.addEventListener('resize', resize);
  resize();

  const today = new Date().toISOString().slice(0, 10);
  if (save.lastDaily !== today) {
    const first = !save.lastDaily;
    save.lastDaily = today;
    if (!first) { save.coins += DAILY_BONUS; setTimeout(function () { toast(t('daily') + ' +' + DAILY_BONUS); }, 400); }
    persist();
  }

  goMenu();
  requestAnimationFrame(frame);

  // exposto para testes automatizados
  window.__game = {
    get state() { return state; }, get score() { return score; }, get cur() { return cur; },
    top: top, place: function () { if (cur) place(); }, save: save,
  };
})();
