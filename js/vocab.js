/* Từ vựng: thẻ ghi nhớ, trắc nghiệm, danh sách. */
(function () {
  'use strict';
  const JP = window.JP;
  const $ = JP.$;
  const esc = JP.esc;

  const POS_NAME = {
    'N': 'danh từ', 'V I': 'động từ nhóm I', 'V II': 'động từ nhóm II', 'V III': 'động từ nhóm III',
    'N/V III': 'danh từ / động từ nhóm III', 'A い': 'tính từ い', 'A な': 'tính từ な', 'Adv.': 'phó từ',
    'N/Adv.': 'danh từ / phó từ', 'N/A な': 'danh từ / tính từ な', 'A な/Adv.': 'tính từ な / phó từ',
  };
  const posCell = (e) => e.pos ? '<span class="pos-code" title="' + esc(POS_NAME[e.pos] || e.pos) + '">(' + esc(e.pos.replace(/\s/g, '')) + ')</span>' +
    '<span class="pos-name">' + esc(POS_NAME[e.pos] || '') + '</span>' : '';
  const pos = (e) => e.pos ? '<span class="pos" title="' + esc(POS_NAME[e.pos] || e.pos) + '">' + esc(POS_NAME[e.pos] || e.pos) + '</span>' : '';
  JP.posBadge = pos;

  // ---- hiển thị từ: furigana nằm trên từ, cách đọc có vạch cao độ
  const HAS_KANJI = /[㐀-鿿々]/;
  const firstReading = (e) => (e.r || e.w).split(' / ')[0].replace(/\s/g, '');
  JP.firstReading = firstReading;
  JP.rubyWord = (e) => {
    const rd = firstReading(e);
    return HAS_KANJI.test(e.w) && rd && rd !== e.w
      ? '<ruby>' + esc(e.w) + '<rp>(</rp><rt>' + esc(rd) + '</rt><rp>)</rp></ruby>' : esc(e.w);
  };
  JP.accentHTML = (e) => {
    const parts = (e.r || e.w).split(' / ');
    let first = esc(parts[0]);
    if (e.acc && e.acc[0] === firstReading(e) && !/\s/.test(parts[0])) {
      const chars = Array.from(e.acc[0]);
      let html = '', i = 0;
      e.acc[1].forEach(([s, t]) => {
        html += esc(chars.slice(i, s).join('')) + '<span class="ov">' + esc(chars.slice(s, t).join('')) + '</span>';
        i = t;
      });
      first = html + esc(chars.slice(i).join(''));
    }
    return [first].concat(parts.slice(1).map(esc)).join(' / ');
  };

  // ---- câu ví dụ lấy từ các slide ngữ pháp có chứa từ này (ưu tiên cùng chương)
  let SENT = null;
  JP.examples = (word, ch, max) => {
    if (!SENT) {
      SENT = [];
      JP.CHAPTERS.forEach((c) => ((JP.grammar[c] || {}).slides || []).forEach((s) => (s.sent || []).forEach((x) => {
        if (x.t.length >= 6) SENT.push({ ch: c, t: x.t, html: x.html.replace(/<\/?mark>/g, '') });
      })));
    }
    const core = word.replace(/[（）()～〜\s]/g, '');
    if (Array.from(core).length < 2) return [];
    const seen = {};
    return SENT.filter((x) => x.t.indexOf(core) >= 0 && !seen[x.t] && (seen[x.t] = 1))
      .sort((a, b) => Math.abs(a.ch - ch) - Math.abs(b.ch - ch)).slice(0, max || 3);
  };
  JP.exampleList = (list) => list.length
    ? '<div class="fc-ex"><span class="fc-tag">Ví dụ</span><ol>' + list.map((h) => '<li lang="ja">' + h + '</li>').join('') + '</ol></div>' : '';

  // mặt thẻ của một từ vựng; dir = 'jv' (hiện tiếng Nhật trước) hoặc 'vj'
  JP.vocabCard = (e, flipped, dir) => {
    const front = dir === 'vj'
      ? '<p class="fc-mean">' + esc(e.vi) + '</p>' + pos(e)
      : '<p class="bigword" lang="ja">' + (JP.furi() ? JP.rubyWord(e) : esc(e.w)) + '</p>';
    if (!flipped) return '<div class="fc-front">' + front + '<p class="flash-hint">Bấm vào thẻ để lật</p></div>';
    return '<div class="fc-top">' + JP.sayBtn(firstReading(e)) + '<span class="fc-read" lang="ja">' + JP.accentHTML(e) + '</span></div>' +
      '<div class="fc-main"><p class="bigword" lang="ja">' + JP.rubyWord(e) + '</p><p class="fc-mean">' + esc(e.vi) + '</p>' + pos(e) +
      (e.note ? '<p class="flash-note">' + esc(e.note) + '</p>' : '') + '</div>' +
      JP.exampleList(JP.examples(e.w, e.ch).map((x) => x.html));
  };

  const ui = Object.assign({ mode: 'flash', dir: 'jv', qmode: 'mix', favOnly: false }, JP.load('jp-ui-vocab', {}));
  const save = () => JP.store('jp-ui-vocab', ui);

  const host = $('v-vocab');
  host.innerHTML =
    '<div id="vocab-scope"></div>' +
    '<div class="modes" role="group" aria-label="Cách ôn từ vựng">' +
    '<button class="mode" data-mode="flash">Thẻ ghi nhớ</button><button class="mode" data-mode="quiz">Trắc nghiệm</button><button class="mode" data-mode="list">Danh sách</button></div>' +
    '<div id="vocab-body"></div>';

  const scope = JP.scope($('vocab-scope'), 'vocab', { sections: true, onChange: () => render() });
  const items = () => scope.filter(JP.vocab).filter((e) => e.vi);

  // ---- thẻ ghi nhớ
  let flash, quiz;
  function buildFlash() {
    $('vocab-body').innerHTML =
      '<div class="group tool-row"><span class="group-label">Mặt trước</span>' +
      '<label class="pick"><input type="radio" name="vdir" value="jv"><span>Tiếng Nhật</span></label>' +
      '<label class="pick"><input type="radio" name="vdir" value="vj"><span>Tiếng Việt</span></label>' +
      JP.furiPick() + JP.autoPick() + '<label class="pick"><input type="checkbox" id="vfav"><span>Chỉ thẻ đã gắn tim</span></label></div><div id="vflash"></div>';
    document.querySelector('input[name=vdir][value=' + ui.dir + ']').checked = true;
    $('vfav').checked = ui.favOnly;
    document.querySelectorAll('input[name=vdir]').forEach((x) => x.addEventListener('change', () => { ui.dir = x.value; save(); flash.start(); }));
    $('vfav').addEventListener('change', () => { ui.favOnly = $('vfav').checked; save(); flash.start(); });
    flash = JP.flash($('vflash'), {
      items: () => {
        const list = items().filter((e) => !ui.favOnly || JP.isFav(e.id));
        return JP.order(list, 10).slice(0, 20);
      },
      render: (e, flipped) => JP.vocabCard(e, flipped, ui.dir),
      speak: (e, flipped) => (ui.dir === 'vj') === flipped ? firstReading(e) : '',   // đọc khi mặt tiếng Nhật hiện ra
      onRate: (e, ok) => JP.rate(e.id, ok),
      empty: ui.favOnly ? 'Chưa có thẻ nào gắn tim trong phạm vi này.' : 'Hết lượt này rồi.',
    });
    JP.bindFuri($('vocab-body'), () => flash.repaint());
    JP.bindAuto($('vocab-body'));
    flash.start();
  }

  // ---- trắc nghiệm
  const bigword = (t) => '<p class="bigword" lang="ja">' + esc(t) + '</p>';
  function distractors(e, field, pool) {
    const seen = {}; seen[e[field]] = true;
    const ranked = pool.filter((o) => o.id !== e.id && o[field]).map((o) => ({
      o, s: (o.pos === e.pos ? 2 : 0) + (o.sec === e.sec && o.ch === e.ch ? 1 : 0) + (Array.from(o[field]).length === Array.from(e[field]).length ? 0.5 : 0) + Math.random() * 1.5,
    })).sort((a, b) => b.s - a.s);
    const out = [];
    ranked.forEach((x) => { if (out.length < 3 && !seen[x.o[field]]) { seen[x.o[field]] = true; out.push(x.o); } });
    return out;
  }
  const recent = [];
  function nextQuestion() {
    const pool = items();
    if (pool.length < 4) return null;
    let kind = ui.qmode;
    if (kind === 'mix') kind = ['meaning', 'word', 'reading'][Math.floor(Math.random() * 3)];
    let cand = pool;
    if (kind === 'reading') {
      cand = pool.filter((e) => e.r && e.r !== e.w && !/[ー～]$/.test(e.w) && HAS_KANJI.test(e.w));
      if (cand.length < 4) { kind = 'meaning'; cand = pool; }
    }
    let fresh = cand.filter((x) => recent.indexOf(x.id) < 0);
    if (!fresh.length) fresh = cand;
    const e = JP.order(fresh)[0];
    recent.push(e.id); if (recent.length > 4) recent.shift();
    const field = kind === 'meaning' ? 'vi' : kind === 'word' ? 'w' : 'r';
    const opts = JP.shuffle([e].concat(distractors(e, field, kind === 'reading' ? cand : pool)));
    const ja = field !== 'vi';
    const showFuri = JP.furi() && kind !== 'reading';   // dạng "cách đọc" không hiện furigana vì đó là đáp án
    const word = (o) => (showFuri && HAS_KANJI.test(o.w) ? JP.rubyWord(o) : esc(o.w));
    return {
      id: e.id, item: e,
      ask: kind === 'meaning' ? 'Chọn nghĩa đúng của từ này' : kind === 'word' ? 'Chọn từ tiếng Nhật đúng với nghĩa này' : 'Chọn cách đọc đúng của từ này',
      prompt: kind === 'word' ? '<p class="prompt-vi">' + esc(e.vi) + '</p>' + pos(e) : '<p class="bigword" lang="ja">' + word(e) + '</p>',
      hint: '',
      say: kind === 'meaning' ? firstReading(e) : '',        // dạng "cách đọc" không đọc trước vì đó là đáp án
      sayAfter: firstReading(e),
      options: opts.map((o) => ({
        html: field === 'w' ? word(o) : esc(field === 'r' ? JP.slash(o.r) : o.vi),
        plain: esc(field === 'w' ? o.w : field === 'r' ? JP.slash(o.r) : o.vi),
        lang: ja ? 'ja' : 'vi',
      })),
      answer: opts.indexOf(e),
      explain: '<b lang="ja">' + esc(e.w) + '</b> đọc là <b lang="ja">' + esc(JP.slash(e.r || e.w)) + '</b>, nghĩa là ' + esc(e.vi) + '. ' + pos(e),
    };
  }
  function buildQuiz() {
    $('vocab-body').innerHTML =
      '<div class="group tool-row"><span class="group-label">Dạng câu hỏi</span>' +
      [['mix', 'Trộn'], ['meaning', 'Từ sang nghĩa'], ['word', 'Nghĩa sang từ'], ['reading', 'Cách đọc']].map(([v, l]) =>
        '<label class="pick"><input type="radio" name="vq" value="' + v + '"><span>' + l + '</span></label>').join('') +
      JP.furiPick() + JP.autoPick() + '</div><div id="vquiz"></div>';
    document.querySelector('input[name=vq][value=' + ui.qmode + ']').checked = true;
    document.querySelectorAll('input[name=vq]').forEach((x) => x.addEventListener('change', () => { ui.qmode = x.value; save(); quiz.next(); }));
    quiz = JP.quiz($('vquiz'), {
      next: nextQuestion,
      empty: 'Cần ít nhất 4 từ trong phạm vi để làm trắc nghiệm. Hãy chọn thêm chương hoặc bài.',
      onAnswer: (q, ok) => JP.rate(q.id, ok),
    });
    JP.bindFuri($('vocab-body'), () => quiz.next());
    JP.bindAuto($('vocab-body'));
    quiz.next();
  }

  // ---- danh sách
  function buildList() {
    $('vocab-body').innerHTML =
      '<div class="group tool-row"><input class="search" type="search" id="vsearch" placeholder="Tìm từ, cách đọc hoặc nghĩa" aria-label="Tìm từ vựng">' +
      JP.furiPick() + '<label class="pick"><input type="checkbox" id="hide-r"><span>Che cách đọc</span></label>' +
      '<label class="pick"><input type="checkbox" id="hide-m"><span>Che nghĩa</span></label></div>' +
      '<p class="pos-legend">Loại từ: N danh từ, V động từ (I, II, III là nhóm), A い tính từ い, A な tính từ な, Adv. phó từ. Rê chuột vào mã để xem tên đầy đủ.</p><div id="vlist"></div>';
    const paint = () => {
      const q = $('vsearch').value.trim().toLowerCase();
      const list = items().filter((e) => !q || (e.w + e.r + e.vi).toLowerCase().indexOf(q) >= 0);
      let last = '', html = '';
      list.forEach((e) => {
        const g = e.ch + e.sec;
        if (g !== last) {
          if (last) html += '</tbody></table>';
          html += '<h3 class="group-title">Chương ' + e.ch + ', bài ' + e.sec + '</h3><table class="vtable"><tbody>';
          last = g;
        }
        html += '<tr class="' + (JP.isMastered(e.id) ? 'is-done' : '') + '"><td class="vw" lang="ja">' + (JP.furi() ? JP.rubyWord(e) : esc(e.w)) + '</td><td class="vp">' + posCell(e) + '</td>' +
          '<td class="vr sec" lang="ja">' + JP.accentHTML(e) + '</td>' +
          '<td class="vm sec">' + esc(e.vi) + (e.note ? ' <span class="vnote">' + esc(e.note) + '</span>' : '') + '</td></tr>';
      });
      $('vlist').innerHTML = html ? html + '</tbody></table>' : '<p class="weak-empty">Không có từ nào khớp.</p>';
      $('vlist').classList.toggle('hide-r', $('hide-r').checked);
      $('vlist').classList.toggle('hide-m', $('hide-m').checked);
    };
    JP.bindFuri($('vocab-body'), paint);
    $('vsearch').addEventListener('input', paint);
    $('hide-r').addEventListener('change', paint);
    $('hide-m').addEventListener('change', paint);
    $('vlist').addEventListener('click', (ev) => {
      const c = ev.target.closest('.sec');
      if (c) c.classList.toggle('is-shown');
    });
    paint();
  }

  function render() {
    if (flash) flash.active = false;
    if (quiz) quiz.active = false;
    host.querySelectorAll('.mode').forEach((b) => b.setAttribute('aria-pressed', b.dataset.mode === ui.mode));
    if (ui.mode === 'flash') { buildFlash(); flash.active = true; }
    else if (ui.mode === 'quiz') { buildQuiz(); quiz.active = true; }
    else buildList();
  }
  host.querySelector('.modes').addEventListener('click', (ev) => {
    const b = ev.target.closest('.mode');
    if (b) { ui.mode = b.dataset.mode; save(); render(); }
  });

  JP.vocabView = {
    show() { render(); },
    hide() { if (flash) flash.active = false; if (quiz) quiz.active = false; },
    openScope(chs, off) { scope.set(chs, off); },
  };
})();
