/* Mục lục (trang chủ) và phiên "Ôn hôm nay" trộn từ vựng, kanji, ngữ pháp. */
(function () {
  'use strict';
  const JP = window.JP;
  const $ = JP.$;
  const esc = JP.esc;

  const home = $('v-home');
  const review = $('v-review');

  // ---- số liệu theo chương
  function stats() {
    const rows = JP.CHAPTERS.map((ch) => {
      const v = JP.vocab.filter((e) => e.ch === ch && e.vi);
      const k = JP.kanji.filter((e) => e.ch === ch);
      const g = ((JP.grammar[ch] || {}).patterns || []).filter((p) => p.pat);
      return {
        ch, v, k, g,
        vDone: v.filter((e) => JP.isMastered(e.id)).length,
        kDone: k.filter((e) => JP.kanjiView.status(e.k) === 'strong').length,
        gDone: g.filter((p) => JP.isMastered(p.id)).length,
        secs: JP.sections(ch),
      };
    });
    return rows;
  }
  function dueItems() {
    const out = [];
    const now = Date.now();
    const srs = JP.srs();
    const vById = {}, pById = {};
    JP.vocab.forEach((e) => { vById[e.id] = e; });
    JP.CHAPTERS.forEach((ch) => ((JP.grammar[ch] || {}).patterns || []).forEach((p) => { pById[p.id] = p; }));
    Object.keys(srs).forEach((id) => {
      if (srs[id].due > now) return;
      if (vById[id]) out.push({ id, type: 'v', e: vById[id] });
      else if (id.startsWith('k|') && JP.kanjiBy[id.slice(2)]) out.push({ id, type: 'k', e: JP.kanjiBy[id.slice(2)] });
      else if (pById[id]) out.push({ id, type: 'g', e: pById[id] });
    });
    return out.sort((a, b) => srs[a.id].due - srs[b.id].due);
  }
  // Mục mới để học tiếp: lấy từ chương nhỏ nhất còn chữ chưa học
  function newItems(n) {
    const out = [];
    for (const ch of JP.CHAPTERS) {
      JP.kanji.filter((e) => e.ch === ch && JP.isNew('k|' + e.k)).forEach((e) => out.push({ id: 'k|' + e.k, type: 'k', e }));
      JP.vocab.filter((e) => e.ch === ch && e.vi && JP.isNew(e.id)).forEach((e) => out.push({ id: e.id, type: 'v', e }));
      ((JP.grammar[ch] || {}).patterns || []).filter((p) => p.pat && JP.isNew(p.id)).forEach((p) => out.push({ id: p.id, type: 'g', e: p }));
      if (out.length >= n) break;
    }
    return out.slice(0, n);
  }

  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
  const bar = (a, b) => '<span class="bar" role="img" aria-label="Đã thuộc ' + a + ' trên ' + b + '"><i style="width:' + pct(a, b) + '%"></i></span>';

  function paintHome() {
    const rows = stats();
    const due = dueItems().length;
    const tot = rows.reduce((a, r) => ({ v: a.v + r.v.length, vd: a.vd + r.vDone, k: a.k + r.k.length, kd: a.kd + r.kDone, g: a.g + r.g.length, gd: a.gd + r.gDone }), { v: 0, vd: 0, k: 0, kd: 0, g: 0, gd: 0 });
    home.innerHTML =
      '<div class="today"><div class="today-main"><h2>Ôn hôm nay</h2>' +
      '<p class="today-n">' + (due ? 'Có <b>' + due + '</b> mục đến hạn ôn.' : 'Chưa có mục nào đến hạn.') + '</p>' +
      '<div class="row"><button class="btn btn-solid" id="go-review">' + (due ? 'Bắt đầu ôn' : 'Học mục mới') + '</button>' +
      (due ? '<button class="btn" id="go-new">Học thêm mục mới</button>' : '') + '</div>' +
      '<p class="today-tip">Mỗi mục bạn nhớ được sẽ đến hạn ôn lại sau 1, 3, 7, 14 ngày. Mục bạn quên sẽ quay lại ngay.</p></div>' +
      '<dl class="today-sum"><div><dt>Từ vựng</dt><dd><b>' + tot.vd + '</b> trên ' + tot.v + '</dd></div>' +
      '<div><dt>Kanji</dt><dd><b>' + tot.kd + '</b> trên ' + tot.k + '</dd></div>' +
      '<div><dt>Mẫu ngữ pháp</dt><dd><b>' + tot.gd + '</b> trên ' + tot.g + '</dd></div></dl></div>' +
      '<div id="planner"></div>' +
      '<h2 class="toc-title">Mục lục</h2><div class="toc">' +
      rows.map((r) =>
        '<div class="toc-row"><div class="cell toc-num" aria-hidden="true"><span lang="ja">' + r.ch + '</span></div>' +
        '<h3 class="toc-h">Chương ' + r.ch + '</h3>' +
        '<div class="toc-col"><a class="toc-link" href="#vocab" data-open="vocab" data-ch="' + r.ch + '">Từ vựng</a>' +
        '<p class="toc-meta">' + r.v.length + ' từ, đã thuộc ' + r.vDone + '</p>' + bar(r.vDone, r.v.length) +
        '<p class="toc-secs">' + r.secs.map((s) => '<a href="#vocab" data-open="vocab" data-ch="' + r.ch + '" data-sec="' + s + '">' + r.ch + s + '</a>').join('') + '</p></div>' +
        '<div class="toc-col"><a class="toc-link" href="#kanji" data-open="kanji" data-ch="' + r.ch + '">Kanji</a>' +
        '<p class="toc-meta">' + r.k.length + ' chữ, đã thuộc ' + r.kDone + '</p>' + bar(r.kDone, r.k.length) +
        '<p class="toc-kanji" lang="ja">' + r.k.map((e) => '<a href="#kanji" data-open="kanji" data-ch="' + r.ch + '" data-k="' + e.k + '" aria-label="' + esc(e.k + (e.vi ? ', ' + e.vi : '')) + '">' + e.k + '</a>').join('') + '</p></div>' +
        '<div class="toc-col"><a class="toc-link" href="#grammar" data-open="grammar" data-ch="' + r.ch + '">Ngữ pháp</a>' +
        '<p class="toc-meta">' + r.g.length + ' mẫu, đã thuộc ' + r.gDone + '</p>' + bar(r.gDone, r.g.length) +
        '<p class="toc-secs">' + r.secs.map((s) => '<a href="#grammar" data-open="grammar" data-ch="' + r.ch + '" data-sec="' + s + '">' + r.ch + s + '</a>').join('') + '</p></div></div>').join('') +
      '</div><p class="reset-row"><button class="link" id="reset-all">Xoá toàn bộ tiến độ</button></p>';
    if (JP.planner) JP.planner.mount($('planner'));
  }

  home.addEventListener('click', (ev) => {
    const a = ev.target.closest('[data-open]');
    if (a) {
      ev.preventDefault();
      const ch = +a.dataset.ch, sec = a.dataset.sec;
      if (a.dataset.open === 'vocab') {
        const off = [];
        JP.sections(ch).forEach((s) => { if (sec && s !== sec) off.push(ch + s); });
        JP.vocabView.openScope([ch], off);
      } else if (a.dataset.open === 'kanji') {
        if (a.dataset.k) JP.kanjiView.open(a.dataset.k); else JP.kanjiView.openChapter && JP.kanjiView.openChapter(ch);
      } else JP.grammarView.open(ch, sec);
      JP.go(a.dataset.open);
      return;
    }
    if (ev.target.id === 'go-review') startReview(false);
    else if (ev.target.id === 'go-new') startReview(true);
    else if (ev.target.id === 'reset-all' && confirm('Xoá toàn bộ tiến độ ôn tập?')) { JP.resetProgress(); }
  });

  // ---- phiên ôn
  let flash;
  function cardFor(it, flipped) {
    const tag = it.type === 'v' ? 'Từ vựng, chương ' + it.e.ch + it.e.sec : it.type === 'k' ? 'Kanji, chương ' + it.e.ch : 'Ngữ pháp, chương ' + it.e.ch + it.e.sec;
    const body = it.type === 'v' ? JP.vocabCard(it.e, flipped, 'jv') : it.type === 'k' ? JP.kanjiCard(it.e, flipped) : JP.patternCard(it.e, flipped);
    return '<p class="fc-tagline">' + esc(tag) + '</p>' + body;
  }
  function startReview(forceNew) {
    let queue = forceNew ? newItems(10) : dueItems().slice(0, 30);
    if (!forceNew && queue.length < 10) {
      const have = new Set(queue.map((q) => q.id));
      queue = queue.concat(newItems(10 - queue.length).filter((q) => !have.has(q.id)));
    }
    review.innerHTML = '<p class="back-row"><button class="link" id="back-home">Về mục lục</button></p><h2 class="review-title">Ôn hôm nay</h2><div id="rflash"></div>';
    review.querySelector('#back-home').onclick = () => JP.go('home');
    flash = JP.flash($('rflash'), {
      items: () => queue.slice(),
      render: (it, flipped) => cardFor(it, flipped),
      speak: (it, flipped) => (it.type === 'v' && !flipped ? JP.firstReading(it.e) : it.type === 'k' && flipped && it.e.words[0] ? it.e.words[0].r.split('/')[0].replace(/\s/g, '') : ''),
      onRate: (it, ok) => JP.rate(it.id, ok),
      empty: 'Xong lượt ôn. Bạn có thể quay về mục lục hoặc học thêm.',
      restart: false,
    });
    JP.go('review');
    flash.active = true;
    flash.start();
  }
  JP.startReview = startReview;
  JP.reviewView = { show() { if (flash) flash.active = true; }, hide() { if (flash) flash.active = false; } };
  JP.homeView = { show() { paintHome(); }, hide() {} };
  JP.on('progress', () => { if (!home.hidden) paintHome(); });
})();
