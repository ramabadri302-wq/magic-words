(function (G) {
  'use strict';
  var MAX_WORDS = 3;
  var NEG = ['not', 'isnt', 'aint', 'never', 'no', 'nope', 'wasnt', 'arent', 'hardly', 'nt'];
  var subtle = G.crypto.subtle, enc = new TextEncoder();
  function canon(w) { return w.replace(/(.)\1+/g, '$1'); }
  function rawWords(s) { return (s || '').trim().split(/\s+/).filter(Boolean); }
  function normalize(s) {
    return (s || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
      .replace(/['\u2018\u2019`]/g, '').replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
  }
  function hexOf(buf) { return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ('0' + b.toString(16)).slice(-2); }).join(''); }
  function hash(D, w) { return subtle.digest('SHA-256', enc.encode(D.s + ':' + canon(w))).then(hexOf); }
  function b64(s) { var b = atob(s), u = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }
  // Resolves to the matched key token (string) when correct, otherwise null.
  async function check(D, input) {
    if (rawWords(input).length > MAX_WORDS) return null;
    var words = normalize(input);
    if (words.length < 2 || words.length > MAX_WORDS) return null;
    if (words.some(function (w) { return NEG.indexOf(w) >= 0; })) return null;
    var hs = await Promise.all(words.map(function (w) { return hash(D, w); }));
    var keyWord = null, praised = false;
    hs.forEach(function (h, i) {
      if (h === D.n && keyWord === null) keyWord = canon(words[i]);
      else if (D.p.indexOf(h) >= 0) praised = true;
    });
    return keyWord && praised ? keyWord : null;
  }
  async function unlock(D, keyWord) {
    var base = await subtle.importKey('raw', enc.encode(keyWord), 'PBKDF2', false, ['deriveKey']);
    var key = await subtle.deriveKey({ name: 'PBKDF2', salt: b64(D.k), iterations: 150000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
    var pt = await subtle.decrypt({ name: 'AES-GCM', iv: b64(D.i) }, key, b64(D.c));
    return JSON.parse(new TextDecoder().decode(pt));
  }
  function clampWords(v) {
    if (rawWords(v).length <= MAX_WORDS && !/^\s*\S+\s+\S+\s+\S+\s/.test(v)) return v;
    var m = v.match(/^\s*\S+(\s+\S+){0,2}/);
    return m ? m[0] : '';
  }
  var api = { check: check, unlock: unlock, normalize: normalize, rawWords: rawWords, clampWords: clampWords, MAX_WORDS: MAX_WORDS };
  if (typeof module !== 'undefined') { module.exports = api; return; }

  // ---------- UI ----------
  var D = G.__D;
  var $ = function (id) { return document.getElementById(id); };
  var form = $('f'), inp = $('q'), cnt = $('cnt'), msg = $('msg'), card = $('card'), win = $('win'), poemEl = $('poem');
  var tries = 0, poems = null, lastPoem = -1;
  var nudges = [
    "Not quite! Put your thinking cap on 🧢",
    "Close… or maybe not. Think harder! 🤔",
    "Hmm, the magic hasn't happened yet. Try again! ✨",
    "Nope! But your persistence is admirable 💪",
    "Your brain is warming up… give it another go! 🔥",
    "So near, yet so far. Keep going! 🚀",
    "Wrong words, right attitude. Once more! 🎯",
    "Even Sherlock needed a few tries. Again! 🕵️",
    "The secret is shy. Coax it out! 🙈",
    "Think, think, think… then type! 🧠"
  ];
  function updateCount() {
    var n = rawWords(inp.value).length;
    cnt.textContent = n + ' / ' + MAX_WORDS + ' words';
    cnt.classList.toggle('full', n >= MAX_WORDS);
  }
  inp.addEventListener('input', function () {
    var c = clampWords(inp.value);
    if (c !== inp.value) { inp.value = c; cnt.classList.remove('bump'); void cnt.offsetWidth; cnt.classList.add('bump'); }
    updateCount();
  });
  inp.addEventListener('keydown', function (e) {
    if (e.key === ' ' && rawWords(inp.value).length >= MAX_WORDS && inp.selectionStart === inp.value.length) e.preventDefault();
  });
  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    var v = inp.value;
    if (!v.trim()) { say("Type something first! 😄"); return; }
    if (rawWords(v).length > MAX_WORDS) { say("3 words max, please! ✋"); return; }
    var k = await check(D, v);
    if (!k) {
      tries++;
      var t = nudges[Math.floor(Math.random() * nudges.length)];
      say(t + (tries > 2 ? '  (attempt #' + tries + ')' : ''));
      card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake');
      return;
    }
    try { poems = poems || await unlock(D, k); } catch (err) { say("Something went wrong, try again!"); return; }
    var i; do { i = Math.floor(Math.random() * poems.length); } while (poems.length > 1 && i === lastPoem);
    lastPoem = i;
    poemEl.textContent = poems[i];
    card.hidden = true; win.hidden = false;
    confetti();
  });
  $('again').addEventListener('click', function () {
    var i; do { i = Math.floor(Math.random() * poems.length); } while (poems.length > 1 && i === lastPoem);
    lastPoem = i; poemEl.textContent = poems[i];
    poemEl.classList.remove('pop'); void poemEl.offsetWidth; poemEl.classList.add('pop');
    confetti();
  });
  function say(t) { msg.textContent = t; msg.classList.remove('pop'); void msg.offsetWidth; msg.classList.add('pop'); }
  function confetti() {
    var cv = $('fx'), ctx = cv.getContext('2d'), W = cv.width = innerWidth, H = cv.height = innerHeight;
    var cols = ['#ff4d6d', '#ffd166', '#06d6a0', '#118ab2', '#9b5de5', '#f15bb5', '#fee440'];
    var ps = [];
    for (var j = 0; j < 220; j++) ps.push({ x: W / 2, y: H / 3, vx: (Math.random() - .5) * 16, vy: Math.random() * -14 - 4, r: Math.random() * 6 + 4, c: cols[j % cols.length], a: Math.random() * 6, va: (Math.random() - .5) * .4 });
    var t0 = performance.now();
    (function f(t) {
      ctx.clearRect(0, 0, W, H);
      ps.forEach(function (p) { p.vy += .35; p.vx *= .99; p.x += p.vx; p.y += p.vy; p.a += p.va; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a); ctx.fillStyle = p.c; ctx.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2); ctx.restore(); });
      if (t - t0 < 4000) requestAnimationFrame(f); else ctx.clearRect(0, 0, W, H);
    })(t0);
  }
  updateCount();
})(typeof window !== 'undefined' ? window : globalThis);
