/* Kanji: học từng chữ (tập viết trong ô 田字格), luyện tập trắc nghiệm, bảng chữ. */
(function () {
  'use strict';
  const JP = window.JP;
  const $ = JP.$;
  const esc = JP.esc;

  const ui = Object.assign({ mode: 'learn', idx: 0, ghost: true, mask: false, qmode: 'mix' }, JP.load('jp-ui-kanji', {}));
  const save = () => JP.store('jp-ui-kanji', ui);

  const WORDS = [];
  JP.kanji.forEach((e) => e.words.forEach((x) => WORDS.push({ id: 'kw|' + e.k + '|' + x.w, w: x.w, r: x.r, vi: x.vi, k: e.k, ch: e.ch })));
  const KSET = {};
  JP.kanji.forEach((e) => { KSET[e.k] = true; });
  const kanjiOf = (s) => Array.from(s).filter((c) => KSET[c]);
  const shared = (a, b) => { const cb = kanjiOf(b); return kanjiOf(a).filter((c) => cb.indexOf(c) >= 0).length; };

  const IDS = {};
  JP.kanji.forEach((e) => { IDS[e.k] = ['k|' + e.k].concat(e.words.map((x) => 'kw|' + e.k + '|' + x.w)); });
  const STATUS_TEXT = { new: 'Chưa luyện', learning: 'Đang học', weak: 'Hay sai', strong: 'Đã thuộc' };
  function status(k) {
    const rs = IDS[k].map((id) => JP.rec(id)).filter(Boolean);
    if (!rs.length) return 'new';
    if (rs.some((r) => r.box === 0 && r.ng > 0)) return 'weak';
    return rs.every((r) => r.box >= 3) && rs.length >= Math.min(2, IDS[k].length) ? 'strong' : 'learning';
  }

  // mặt thẻ ghi nhớ của một chữ kanji
  JP.kanjiCard = (e, flipped) => {
    if (!flipped) return '<div class="fc-front"><p class="bigword bigword-xl" lang="ja">' + esc(e.k) + '</p><p class="flash-hint">Bấm vào thẻ để lật</p></div>';
    const w0 = e.words[0];
    return '<div class="fc-top">' + (w0 ? JP.sayBtn(w0.r.replace(/\s|\//g, '')) : '') +
      '<span class="fc-read" lang="ja">On: ' + esc(e.on.join('、') || 'không có') + ' &nbsp; Kun: ' + esc(e.kun.join('、') || 'không có') + '</span></div>' +
      '<div class="fc-main"><p class="bigword bigword-xl" lang="ja">' + esc(e.k) + '</p><p class="fc-mean">' + esc(e.vi || 'Không có âm Hán Việt') + '</p></div>' +
      JP.exampleList(e.words.map((x) => JP.rubyWord(x) + ' <span class="ex-vi">' + esc(x.vi) + '</span>'));
  };

  const host = $('v-kanji');
  host.innerHTML =
    '<div id="kanji-scope"></div>' +
    '<div class="modes" role="group" aria-label="Cách ôn kanji">' +
    '<button class="mode" data-mode="learn">Học và tập viết</button><button class="mode" data-mode="quiz">Luyện tập</button><button class="mode" data-mode="table">Bảng chữ</button></div>' +
    '<div id="kanji-body"></div>';
  const scope = JP.scope($('kanji-scope'), 'kanji', { sections: false, onChange: () => { ui.mode === 'learn' ? fixIdx() : null; render(); } });
  const list = () => scope.filter(JP.kanji);

  function fixIdx() {
    const l = list();
    if (!l.length) return;
    if (!l.some((e) => e.n === ui.idx)) ui.idx = l[0].n;
  }

  // ===== Học =====
  let pad, ctx, strokes = [], live = null;
  function buildLearn() {
    $('kanji-body').innerHTML =
      '<div class="learn"><div class="learn-pad">' +
      '<div class="cell pad-cell"><span class="ghost" id="k-ghost" lang="ja" aria-hidden="true"></span>' +
      '<canvas id="k-pad" role="img" aria-label="Ô tập viết. Dùng chuột hoặc ngón tay để viết chữ."></canvas></div>' +
      '<div class="row" role="group" aria-label="Công cụ tập viết">' +
      '<button class="btn btn-sm" id="k-tg-ghost" aria-pressed="true">Nét mẫu</button><button class="btn btn-sm" id="k-undo">Hoàn tác</button><button class="btn btn-sm" id="k-clear">Xoá hết</button></div>' +
      '<div class="row pager"><button class="btn" id="k-prev">Chữ trước</button><span class="pager-pos" id="k-pos" aria-live="polite"></span><button class="btn btn-solid" id="k-next">Chữ tiếp theo</button></div></div>' +
      '<div class="learn-info" id="k-info"><h2 class="hv sec" id="k-hv"></h2><p class="where" id="k-where"></p>' +
      '<dl class="readings"><dt>Âm On</dt><dd class="sec" id="k-on" lang="ja"></dd><dt>Âm Kun</dt><dd class="sec" id="k-kun" lang="ja"></dd></dl>' +
      '<h3 class="words-title">Từ ví dụ</h3><ul class="words" id="k-words"></ul>' +
      '<div class="row test-row"><button class="btn btn-sm" id="k-tg-mask" aria-pressed="false">Che đáp án để tự kiểm tra</button><button class="btn btn-sm" id="k-reveal" hidden>Hiện đáp án</button></div>' +
      '<div class="row rate-row"><span class="rate-label">Bạn nhớ chữ này chưa?</span><button class="btn btn-sm" id="k-no">Chưa nhớ</button><button class="btn btn-sm btn-solid" id="k-yes">Nhớ rồi</button></div></div></div>';
    pad = $('k-pad'); ctx = pad.getContext('2d');
    $('k-info').addEventListener('click', (ev) => { const b = ev.target.closest('[data-say]'); if (b) JP.say(b.dataset.say); });
    $('k-tg-ghost').addEventListener('click', () => { ui.ghost = !ui.ghost; save(); toggles(); });
    $('k-tg-mask').addEventListener('click', () => { ui.mask = !ui.mask; save(); $('k-info').classList.remove('is-shown'); toggles(); });
    $('k-reveal').addEventListener('click', () => $('k-info').classList.toggle('is-shown'));
    $('k-prev').addEventListener('click', () => step(-1));
    $('k-next').addEventListener('click', () => step(1));
    $('k-undo').addEventListener('click', () => { strokes.pop(); redraw(); });
    $('k-clear').addEventListener('click', clearPad);
    $('k-yes').addEventListener('click', () => { JP.rate('k|' + JP.kanji[ui.idx].k, true); show(ui.idx, true); step(1); });
    $('k-no').addEventListener('click', () => { JP.rate('k|' + JP.kanji[ui.idx].k, false); show(ui.idx, true); });
    pad.addEventListener('pointerdown', (ev) => { pad.setPointerCapture(ev.pointerId); live = [pt(ev)]; strokes.push(live); redraw(); });
    pad.addEventListener('pointermove', (ev) => { if (live) { live.push(pt(ev)); redraw(); } });
    const end = () => { live = null; };
    pad.addEventListener('pointerup', end); pad.addEventListener('pointercancel', end);
    if (window.ResizeObserver) new ResizeObserver(fit).observe(pad);
    fixIdx();
    toggles();
    show(ui.idx);
    fit();
  }
  function toggles() {
    $('k-ghost').classList.toggle('is-off', !ui.ghost);
    $('k-tg-ghost').setAttribute('aria-pressed', ui.ghost);
    $('k-info').classList.toggle('info-masked', ui.mask);
    $('k-tg-mask').setAttribute('aria-pressed', ui.mask);
    $('k-reveal').hidden = !ui.mask;
  }
  function step(d) {
    const l = list();
    if (!l.length) return;
    let i = l.findIndex((e) => e.n === ui.idx);
    i = (i + d + l.length) % l.length;
    show(l[i].n);
  }
  function show(n, keepPad) {
    const e = JP.kanji[n];
    if (!e) return;
    ui.idx = n; save();
    const l = list(), pos = l.findIndex((x) => x.n === n);
    $('k-ghost').textContent = e.k;
    const hv = $('k-hv');
    hv.textContent = e.vi || 'Không có âm Hán Việt';
    hv.classList.toggle('is-long', hv.textContent.length > 8);
    $('k-where').textContent = 'Chữ thứ ' + (pos + 1) + ' trong ' + l.length + ' chữ. Chương ' + e.ch + ', bài ' + e.lesson + '. ' + STATUS_TEXT[status(e.k)] + '.';
    $('k-pos').textContent = (pos + 1) + ' / ' + l.length;
    const lst = (a) => a.length
      ? a.map((x) => '<span class="rd">' + esc(x) + JP.sayBtn(x.replace(/[・･]/g, ''), true) + '</span>').join('')
      : '<span class="none">Không có</span>';
    $('k-on').innerHTML = lst(e.on);
    $('k-kun').innerHTML = lst(e.kun);
    $('k-words').innerHTML = e.words.map((x) =>
      '<li><span class="w" lang="ja">' + JP.rubyWord(x, 'sec') + '</span><span class="m sec">' + esc(x.vi) + JP.sayBtn(x.r.split('/')[0].replace(/\s/g, ''), true) + '</span></li>').join('');
    $('k-info').classList.remove('is-shown');
    if (!keepPad) clearPad();
  }
  function fit() {
    if (!pad) return;
    const r = pad.getBoundingClientRect();
    if (!r.width) return;
    const dpr = window.devicePixelRatio || 1;
    pad.width = Math.round(r.width * dpr); pad.height = Math.round(r.height * dpr);
    redraw();
  }
  function redraw() {
    if (!ctx) return;
    ctx.clearRect(0, 0, pad.width, pad.height);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--ink').trim() || '#1b2547';
    ctx.lineWidth = pad.width * 0.04;
    strokes.forEach((s) => {
      if (s.length === 1) { ctx.beginPath(); ctx.arc(s[0][0] * pad.width, s[0][1] * pad.height, ctx.lineWidth / 2, 0, Math.PI * 2); ctx.fill(); return; }
      ctx.beginPath();
      s.forEach((p, i) => { if (i) ctx.lineTo(p[0] * pad.width, p[1] * pad.height); else ctx.moveTo(p[0] * pad.width, p[1] * pad.height); });
      ctx.stroke();
    });
  }
  function clearPad() { strokes = []; live = null; redraw(); }
  function pt(ev) { const r = pad.getBoundingClientRect(); return [(ev.clientX - r.left) / r.width, (ev.clientY - r.top) / r.height]; }
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', redraw);

  // ===== Luyện tập =====
  let quiz;
  const wpool = () => scope.filter(WORDS);
  const kpool = () => scope.filter(JP.kanji).filter((k) => k.vi);
  function distractors(item, field, all) {
    const seen = {}; seen[item[field]] = true;
    const ranked = all.filter((o) => o.id !== item.id && o[field]).map((o) => ({
      o, s: (item.w ? shared(item.w, o.w) * 2 : 0) + (Array.from(o[field]).length === Array.from(item[field]).length ? 1 : 0) + Math.random(),
    })).sort((a, b) => b.s - a.s);
    const out = [];
    ranked.forEach((x) => { if (out.length < 3 && !seen[x.o[field]]) { seen[x.o[field]] = true; out.push(x.o); } });
    return out;
  }
  const recent = [];
  function nextQuestion() {
    let m = ui.qmode;
    if (m === 'mix') m = ['read', 'write', 'hv'][Math.floor(Math.random() * 3)];
    const all = m === 'hv' ? kpool() : wpool();
    if (all.length < 4) return null;
    let fresh = all.filter((x) => recent.indexOf(x.id) < 0);
    if (!fresh.length) fresh = all;
    const item = JP.order(fresh)[0];
    recent.push(item.id); if (recent.length > 4) recent.shift();
    const field = m === 'read' ? 'r' : m === 'write' ? 'w' : 'vi';
    const opts = JP.shuffle([item].concat(distractors(item, field, all)));
    const optHtml = (o) => (m === 'write' ? (JP.furi() && /[\u3400-\u9fff]/.test(o.w) ? JP.rubyWord(o) : esc(o.w)) : esc(m === 'read' ? JP.slash(o.r) : o.vi));
    const optPlain = (o) => esc(m === 'write' ? o.w : m === 'read' ? JP.slash(o.r) : o.vi);
    const right = m === 'hv' ? item.vi : m === 'write' ? item.w : JP.slash(item.r);
    const shown = m === 'read' ? item.w : m === 'write' ? item.r : item.k;
    let explain;
    if (m === 'hv') explain = '<b lang="ja">' + esc(item.k) + '</b> có âm Hán Việt là <b>' + esc(item.vi) + '</b>. Âm On: <span lang="ja">' + esc(item.on.join('、') || 'không có') + '</span>.';
    else explain = '<b lang="ja">' + esc(item.w) + '</b> đọc là <b lang="ja">' + esc(JP.slash(item.r)) + '</b>, nghĩa là ' + esc(item.vi.charAt(0).toLowerCase() + item.vi.slice(1)) + '.';
    return {
      id: item.id,
      ask: m === 'read' ? 'Chọn cách đọc đúng của từ này' : m === 'write' ? 'Chọn chữ kanji đúng với cách đọc này' : 'Chọn âm Hán Việt của chữ này',
      prompt: '<p class="bigword" lang="ja">' + esc(shown) + '</p>',
      hint: m === 'write' ? 'Nghĩa: ' + item.vi : '',
      say: m === 'write' ? item.r.split('/')[0].replace(/\s/g, '') : '',
      sayAfter: item.r ? item.r.split('/')[0].replace(/\s/g, '') : (item.words && item.words[0] ? item.words[0].r.split('/')[0].replace(/\s/g, '') : ''),
      options: opts.map((o) => ({ html: optHtml(o), plain: optPlain(o), lang: m === 'hv' ? 'vi' : 'ja' })),
      answer: opts.indexOf(item),
      explain, right,
    };
  }
  function buildQuiz() {
    $('kanji-body').innerHTML =
      '<div class="group tool-row"><span class="group-label">Dạng câu hỏi</span>' +
      [['read', 'Đọc kanji'], ['write', 'Viết kanji'], ['hv', 'Hán Việt'], ['mix', 'Trộn cả ba']].map(([v, l]) =>
        '<label class="pick"><input type="radio" name="kq" value="' + v + '"><span>' + l + '</span></label>').join('') +
      JP.furiPick() + JP.autoPick() + '</div><div id="kquiz"></div>';
    document.querySelector('input[name=kq][value=' + ui.qmode + ']').checked = true;
    document.querySelectorAll('input[name=kq]').forEach((x) => x.addEventListener('change', () => { ui.qmode = x.value; save(); quiz.next(); }));
    quiz = JP.quiz($('kquiz'), {
      next: nextQuestion,
      empty: 'Cần ít nhất 4 mục trong phạm vi để làm trắc nghiệm. Hãy chọn thêm chương.',
      onAnswer: (q, ok) => JP.rate(q.id, ok),
    });
    JP.bindFuri($('kanji-body'), () => quiz.next());
    JP.bindAuto($('kanji-body'));
    quiz.next();
  }

  // ===== Bảng chữ =====
  function buildTable() {
    const l = list();
    const done = l.filter((e) => status(e.k) === 'strong').length;
    const chs = Array.from(new Set(l.map((e) => e.ch)));
    $('kanji-body').innerHTML =
      '<div class="table-head"><p class="sum">Đã thuộc <b>' + done + '</b> trên ' + l.length + ' chữ.</p>' +
      '<p class="legend"><span class="lg"><i class="lg-ring"></i>Đã thuộc</span><span class="lg"><i class="lg-hl"></i>Hay sai</span><span class="lg-note">Bấm vào một ô để học chữ đó.</span></p></div>' +
      chs.map((c) => {
        const cl = l.filter((e) => e.ch === c);
        const n = cl.filter((e) => status(e.k) === 'strong').length;
        return '<section class="chap"><h3>Chương ' + c + ' <small>' + n + ' trên ' + cl.length + ' chữ đã thuộc</small></h3><div class="grid">' +
          cl.map((e) => {
            const st = status(e.k);
            return '<button class="cell kcell is-' + st + '" data-n="' + e.n + '" aria-label="' + esc(e.k + ', ' + (e.vi || 'không có âm Hán Việt') + ', ' + STATUS_TEXT[st].toLowerCase()) + '">' +
              '<span class="kk" lang="ja">' + e.k + '</span><span class="kv">' + esc(e.vi) + '</span></button>';
          }).join('') + '</div></section>';
      }).join('');
    $('kanji-body').onclick = (ev) => {
      const b = ev.target.closest('.kcell');
      if (b) { ui.idx = +b.dataset.n; ui.mode = 'learn'; save(); render(); window.scrollTo(0, 0); }
    };
  }

  function render() {
    if (quiz) quiz.active = false;
    host.querySelectorAll('.mode').forEach((b) => b.setAttribute('aria-pressed', b.dataset.mode === ui.mode));
    $('kanji-body').onclick = null;
    if (ui.mode === 'learn') buildLearn();
    else if (ui.mode === 'quiz') { buildQuiz(); quiz.active = true; }
    else buildTable();
  }
  host.querySelector('.modes').addEventListener('click', (ev) => {
    const b = ev.target.closest('.mode');
    if (b) { ui.mode = b.dataset.mode; save(); render(); }
  });
  JP.on('key', (ev) => {
    if (host.hidden || ui.mode !== 'learn') return;
    if (ev.key === 'ArrowLeft') step(-1);
    else if (ev.key === 'ArrowRight') step(1);
  });

  JP.kanjiView = {
    show() { render(); },
    hide() { if (quiz) quiz.active = false; },
    open(k) {
      const e = JP.kanjiBy[k];
      if (!e) return;
      if (scope.get().chs.indexOf(e.ch) < 0) scope.set(scope.get().chs.concat(e.ch));
      ui.idx = e.n; ui.mode = 'learn'; save();
    },
    openChapter(ch) {
      scope.set([ch]);
      ui.mode = 'learn'; save();
      const f = JP.kanji.find((e) => e.ch === ch);
      if (f) ui.idx = f.n;
    },
    status,
  };
})();
