/* Ngữ pháp: xem bài giảng theo mẫu câu, điền từ vào chỗ trống, thẻ mẫu câu. */
(function () {
  'use strict';
  const JP = window.JP;
  const $ = JP.$;
  const esc = JP.esc;

  const ui = Object.assign({ mode: 'lesson', pat: null, slide: 0 }, JP.load('jp-ui-grammar', {}));
  const save = () => JP.store('jp-ui-grammar', ui);

  const ALL = [];   // mẫu câu của mọi chương
  const CLOZE = [];
  JP.CHAPTERS.forEach((ch) => {
    const g = JP.grammar[ch];
    if (!g) return;
    g.patterns.forEach((p) => ALL.push(p));
    g.cloze.forEach((c) => CLOZE.push(c));
  });
  const byId = {};
  ALL.forEach((p) => { byId[p.id] = p; });

  // mặt thẻ ghi nhớ của một mẫu câu
  JP.patternCard = (p, flipped) => {
    const front = '<p class="flash-pattern" lang="ja">' + esc(p.title) + '</p><p class="flash-where">Chương ' + p.ch + ', bài ' + p.sec + '</p>';
    if (!flipped) return '<div class="fc-front">' + front + '<p class="flash-hint">Bấm vào thẻ để xem ý nghĩa và cách dùng</p></div>';
    const ex = [];
    p.slides.forEach((sl) => (sl.sent || []).forEach((x) => { if (ex.length < 4 && x.t.length >= 6) ex.push(x.html.replace(/<\/?mark>/g, '')); }));
    return '<div class="fc-main"><p class="flash-pattern" lang="ja">' + esc(p.title) + '</p></div>' +
      '<div class="fc-lines">' + p.lines.slice(0, 7).map((l) => '<p>' + esc(cleanLine(l)) + '</p>').join('') + '</div>' + JP.exampleList(ex);
  };

  const host = $('v-grammar');
  host.innerHTML =
    '<div id="gram-scope"></div>' +
    '<div class="modes" role="group" aria-label="Cách ôn ngữ pháp">' +
    '<button class="mode" data-mode="lesson">Bài giảng</button><button class="mode" data-mode="cloze">Điền từ</button><button class="mode" data-mode="cards">Thẻ mẫu câu</button></div>' +
    '<div id="gram-body"></div>';
  const scope = JP.scope($('gram-scope'), 'grammar', { sections: true, onChange: () => render() });
  const patterns = () => scope.filter(ALL);

  const cleanLine = (t) => t.replace(/^[•・\s]+/, '').trim();

  // ===== Bài giảng =====
  function buildLesson() {
    const list = patterns();
    if (!list.length) { $('gram-body').innerHTML = '<p class="weak-empty">Không có mẫu câu trong phạm vi này.</p>'; return; }
    if (!list.some((p) => p.id === ui.pat)) { ui.pat = list[0].id; ui.slide = 0; }
    let last = '', nav = '';
    list.forEach((p) => {
      const g = p.ch + p.sec;
      if (g !== last) { nav += '<h3 class="group-title">Chương ' + p.ch + ', bài ' + p.sec + '</h3>'; last = g; }
      const cls = (p.id === ui.pat ? ' is-current' : '') + (JP.isMastered(p.id) ? ' is-done' : '');
      nav += '<button class="pat' + cls + '" data-id="' + p.id + '"><span class="pat-n">' + (p.pat ? String(p.pat).padStart(2, '0') : '・') + '</span>' +
        '<span class="pat-t" lang="ja">' + esc(p.title) + '</span></button>';
    });
    $('gram-body').innerHTML =
      '<div class="lesson"><nav class="pats" aria-label="Danh sách mẫu câu">' + nav + '</nav><div class="viewer" id="viewer"></div></div>';
    $('gram-body').querySelector('.pats').addEventListener('click', (ev) => {
      const b = ev.target.closest('.pat');
      if (b) { ui.pat = b.dataset.id; ui.slide = 0; save(); buildLesson(); }
    });
    paintViewer();
  }
  function paintViewer() {
    const p = byId[ui.pat];
    if (!p) return;
    const i = Math.min(ui.slide, p.slides.length - 1);
    const s = p.slides[i];
    const txt = [];
    p.slides.forEach((sl) => {
      if (sl.type === 'pattern') (sl.lines || []).forEach((l) => txt.push('<p>' + esc(cleanLine(l)) + '</p>'));
      else if (sl.type === 'example') (sl.sent || []).forEach((x) => txt.push('<p class="ex" lang="ja">' + x.html + '</p>'));
      else (sl.lines || []).forEach((l) => txt.push('<p>' + esc(cleanLine(l)) + '</p>'));
    });
    const rec = JP.rec(p.id);
    $('viewer').innerHTML =
      '<div class="viewer-head"><h2 class="vt" lang="ja">' + (p.pat ? '文型 ' + String(p.pat).padStart(2, '0') + '  ' : '') + esc(p.title) + '</h2>' +
      '<p class="where">Chương ' + p.ch + ', bài ' + p.sec + '. Slide ' + (i + 1) + ' trên ' + p.slides.length + '.' + (rec ? (JP.isMastered(p.id) ? ' Đã thuộc.' : ' Đang học.') : '') + '</p></div>' +
      '<figure class="slide"><img src="' + s.img + '" alt="Slide ' + s.n + ' của chương ' + p.ch + ': ' + esc(p.title) + '" width="864" height="720"></figure>' +
      '<div class="row pager"><button class="btn" id="g-prev">Slide trước</button><span class="pager-pos">' + (i + 1) + ' / ' + p.slides.length + '</span><button class="btn btn-solid" id="g-next">Slide sau</button></div>' +
      '<div class="row rate-row"><span class="rate-label">Bạn hiểu mẫu câu này chưa?</span><button class="btn btn-sm" id="g-no">Chưa hiểu</button><button class="btn btn-sm btn-solid" id="g-yes">Hiểu rồi</button></div>' +
      '<details class="astext"><summary>Xem nội dung dạng chữ</summary><div class="astext-body">' + (txt.join('') || '<p>Slide này chỉ có hình.</p>') + '</div></details>';
    const list = patterns();
    const move = (d) => {
      const n = i + d;
      if (n >= 0 && n < p.slides.length) { ui.slide = n; save(); paintViewer(); return; }
      const k = list.findIndex((x) => x.id === p.id) + d;
      if (k >= 0 && k < list.length) { ui.pat = list[k].id; ui.slide = d < 0 ? list[k].slides.length - 1 : 0; save(); buildLesson(); }
    };
    $('g-prev').onclick = () => move(-1);
    $('g-next').onclick = () => move(1);
    $('g-yes').onclick = () => { JP.rate(p.id, true); paintViewer(); refreshNav(); };
    $('g-no').onclick = () => { JP.rate(p.id, false); paintViewer(); refreshNav(); };
    api.move = move;
  }
  function refreshNav() {
    document.querySelectorAll('.pat').forEach((b) => b.classList.toggle('is-done', JP.isMastered(b.dataset.id)));
  }
  const api = {};
  JP.on('key', (ev) => {
    if (host.hidden || ui.mode !== 'lesson' || !api.move) return;
    if (ev.key === 'ArrowLeft') api.move(-1);
    else if (ev.key === 'ArrowRight') api.move(1);
  });

  // ===== Điền từ =====
  let quiz, recent = [];
  const FALLBACK = ['は', 'が', 'を', 'に', 'で', 'と', 'も', 'の', 'へ', 'から', 'まで', 'です', 'ですか', 'ね', 'よ', 'より', 'や'];
  function clozeQuestion() {
    const pool = scope.filter(CLOZE);
    if (!pool.length) return null;
    let cand = pool.filter((c) => recent.indexOf(c.id) < 0);
    if (!cand.length) cand = pool;
    const c = JP.order(cand)[0];
    recent.push(c.id); if (recent.length > 4) recent.shift();
    const ans = c.a.join('・');
    const others = [];
    const seen = { [ans]: true };
    JP.shuffle(CLOZE.filter((x) => x.id !== c.id && x.a.length === c.a.length)).forEach((x) => {
      const t = x.a.join('・');
      if (others.length < 3 && !seen[t]) { seen[t] = true; others.push(t); }
    });
    if (c.a.length === 1) JP.shuffle(FALLBACK).forEach((t) => { if (others.length < 3 && !seen[t]) { seen[t] = true; others.push(t); } });
    const opts = JP.shuffle([ans].concat(others));
    return {
      id: c.id,
      ask: 'Chọn từ điền vào chỗ trống',
      prompt: '<p class="cloze" lang="ja">' + c.q + '</p>',
      hint: 'Chương ' + c.ch + ', bài ' + c.sec,
      options: opts.map((o) => ({ html: esc(o), plain: esc(o), lang: 'ja' })),
      answer: opts.indexOf(ans),
      explain: '<span class="cloze-full" lang="ja">' + c.full + '</span>',
    };
  }
  function buildCloze() {
    $('gram-body').innerHTML = '<div id="gquiz"></div>';
    quiz = JP.quiz($('gquiz'), {
      next: clozeQuestion,
      empty: 'Chưa có câu ví dụ để điền từ trong phạm vi này. Hãy chọn thêm chương hoặc bài.',
      onAnswer: (q, ok) => JP.rate(q.id, ok),
    });
    quiz.next();
  }

  // ===== Thẻ mẫu câu =====
  let flash;
  function buildCards() {
    $('gram-body').innerHTML = '<div id="gflash"></div>';
    flash = JP.flash($('gflash'), {
      items: () => JP.order(patterns().filter((p) => p.pat && p.title)).slice(0, 15),
      render: (p, flipped) => JP.patternCard(p, flipped),
      onRate: (p, ok) => JP.rate(p.id, ok),
      empty: 'Hết lượt này rồi.',
    });
    flash.start();
  }

  function render() {
    if (quiz) quiz.active = false;
    if (flash) flash.active = false;
    host.querySelectorAll('.mode').forEach((b) => b.setAttribute('aria-pressed', b.dataset.mode === ui.mode));
    if (ui.mode === 'lesson') buildLesson();
    else if (ui.mode === 'cloze') { buildCloze(); quiz.active = true; }
    else { buildCards(); flash.active = true; }
  }
  host.querySelector('.modes').addEventListener('click', (ev) => {
    const b = ev.target.closest('.mode');
    if (b) { ui.mode = b.dataset.mode; save(); render(); }
  });

  JP.grammarView = {
    show() { render(); },
    hide() { if (quiz) quiz.active = false; if (flash) flash.active = false; },
    open(ch, sec) {
      const off = [];
      JP.sections(ch).forEach((s) => { if (sec && s !== sec) off.push(ch + s); });
      scope.set([ch], off);
      ui.mode = 'lesson';
      const first = ALL.find((p) => p.ch === ch && (!sec || p.sec === sec));
      if (first) { ui.pat = first.id; ui.slide = 0; }
      save();
    },
  };
})();
