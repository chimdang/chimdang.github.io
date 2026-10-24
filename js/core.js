/* Lõi dùng chung: dữ liệu, lưu tiến độ, lặp lại ngắt quãng, chọn phạm vi, bộ trắc nghiệm, thẻ ghi nhớ. */
(function () {
  'use strict';

  const JP = window.JP = {};

  // ---- tiện ích
  const $ = JP.$ = (id) => document.getElementById(id);
  JP.esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  JP.slash = (s) => String(s).replace(/\s*\/\s*/g, ' / ');
  JP.shuffle = (a) => {
    a = a.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  JP.load = (key, fallback) => {
    try { const v = JSON.parse(localStorage.getItem(key)); return v == null ? fallback : v; } catch (e) { return fallback; }
  };
  JP.store = (key, value) => {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* bị chặn thì bỏ qua */ }
  };
  JP.CHAPTERS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

  // ---- dữ liệu
  JP.vocab = (window.VOCAB || []).map((e) => Object.assign({ id: 'v|' + e.ch + e.sec + '|' + e.w + '|' + e.r }, e));
  JP.kanji = (window.KANJI || []).map((e, n) => Object.assign({ n, id: 'k|' + e.k }, e));
  JP.kanjiBy = {};
  JP.kanji.forEach((e) => { JP.kanjiBy[e.k] = e; });
  JP.grammar = {};   // ch -> { slides, patterns: [{n, pat, sec, title, lines, slides:[...]}], cloze: [...] }
  Object.keys(window.GRAMMAR || {}).forEach((ch) => {
    const slides = window.GRAMMAR[ch];
    const patterns = [];
    const byGroup = {};
    slides.forEach((s) => {
      if (s.type === 'pattern') {
        const p = { id: 'g|' + ch + '|' + s.n, ch: +ch, n: s.n, pat: s.pat, sec: s.sec, title: s.title, lines: s.lines, slides: [s] };
        patterns.push(p);
        byGroup[s.n] = p;
      } else if (byGroup[s.group]) {
        byGroup[s.group].slides.push(s);
      }
    });
    const lead = slides.filter((s) => s.type !== 'pattern' && !byGroup[s.group]);
    if (lead.length) {
      const p = { id: 'g|' + ch + '|0', ch: +ch, n: 0, pat: null, sec: lead[0].sec, title: 'Mở đầu', lines: [], slides: lead };
      patterns.unshift(p);
    }
    const cloze = [];
    slides.forEach((s) => {
      (s.cloze || []).forEach((c, i) => cloze.push(Object.assign({ id: 'c|' + ch + '|' + s.n + '|' + i, ch: +ch, sec: s.sec, slide: s.n }, c)));
    });
    JP.grammar[ch] = { slides, patterns, cloze };
  });
  JP.sections = (ch) => {
    const set = new Set();
    JP.vocab.filter((e) => e.ch === ch).forEach((e) => set.add(e.sec));
    ((JP.grammar[ch] || {}).slides || []).forEach((s) => s.sec && set.add(s.sec));
    return Array.from(set).sort();
  };

  // ---- lặp lại ngắt quãng (hộp Leitner): đúng thì lên hộp, sai thì về hộp 0
  const SRS_KEY = 'jp-srs-v1';
  const DAY = 864e5;
  const GAP = [0, 1, 3, 7, 14, 30, 60];   // số ngày chờ theo hộp
  let srs = JP.load(SRS_KEY, {});
  JP.srs = () => srs;
  JP.rec = (id) => srs[id];
  JP.rate = (id, ok) => {
    const r = srs[id] || (srs[id] = { box: 0, ok: 0, ng: 0, due: 0 });
    if (ok) { r.ok++; r.box = Math.min(GAP.length - 1, r.box + 1); } else { r.ng++; r.box = 0; }
    r.due = Date.now() + (r.box === 0 ? 10 * 60 * 1000 : GAP[r.box] * DAY);
    JP.store(SRS_KEY, srs);
    JP.emit('progress');
  };
  JP.restore = (id, snap) => {
    if (snap) srs[id] = snap; else delete srs[id];
    JP.store(SRS_KEY, srs);
    JP.emit('progress');
  };
  JP.isNew = (id) => !srs[id];
  JP.isDue = (id) => !!srs[id] && srs[id].due <= Date.now();
  JP.isMastered = (id) => !!srs[id] && srs[id].box >= 3;
  JP.resetProgress = () => { srs = {}; JP.store(SRS_KEY, srs); JP.emit('progress'); };

  // Thứ tự học: đến hạn ôn trước (sai nhiều trước), rồi chữ mới, rồi những chữ chưa đến hạn.
  JP.order = (items, limitNew) => {
    const due = items.filter((i) => JP.isDue(i.id)).sort((a, b) => srs[a.id].due - srs[b.id].due);
    let fresh = JP.shuffle(items.filter((i) => JP.isNew(i.id)));
    if (limitNew) fresh = fresh.slice(0, limitNew);
    const rest = JP.shuffle(items.filter((i) => srs[i.id] && srs[i.id].due > Date.now()));
    return due.concat(fresh, rest);
  };

  // ---- furigana: bật hoặc tắt chung cho mọi màn hình
  let furi = JP.load('jp-furi', true);
  JP.furi = () => furi;
  JP.furiPick = () => '<label class="pick"><input type="checkbox" class="furi-chk"' + (furi ? ' checked' : '') + '><span>Furigana</span></label>';
  JP.bindFuri = (root, onChange) => {
    root.querySelectorAll('.furi-chk').forEach((x) => x.addEventListener('change', () => {
      furi = x.checked; JP.store('jp-furi', furi);
      onChange && onChange(furi);
    }));
  };

  // ---- sự kiện nhỏ
  const handlers = {};
  JP.on = (name, fn) => { (handlers[name] || (handlers[name] = [])).push(fn); };
  JP.emit = (name, arg) => (handlers[name] || []).forEach((fn) => fn(arg));

  // ---- chọn phạm vi: chương (nhiều chương) và bài A, B, C... (có thể bỏ bớt)
  JP.scope = (host, key, opts) => {
    const state = Object.assign({ chs: [1], off: [] }, JP.load('jp-scope-' + key, {}));
    const api = {
      get: () => state,
      has: (ch, sec) => state.chs.indexOf(ch) >= 0 && (!opts.sections || state.off.indexOf(ch + sec) < 0),
      filter: (items) => items.filter((i) => api.has(i.ch, i.sec)),
    };
    function paint() {
      const chips = JP.CHAPTERS.map((c) =>
        '<label class="pick"><input type="checkbox" data-ch="' + c + '"' + (state.chs.indexOf(c) >= 0 ? ' checked' : '') + '><span>' + c + '</span></label>').join('');
      let secs = '';
      if (opts.sections) {
        secs = '<div class="group"><span class="group-label">Bài</span>' + state.chs.slice().sort((a, b) => a - b).map((c) =>
          JP.sections(c).map((s) =>
            '<label class="pick pick-sm"><input type="checkbox" data-sec="' + c + s + '"' + (state.off.indexOf(c + s) < 0 ? ' checked' : '') + '><span>' + c + s + '</span></label>').join('')).join('') + '</div>';
      }
      host.innerHTML = '<div class="scope"><div class="group"><span class="group-label">Chương</span>' + chips +
        '<button class="link" data-all="1">Chọn hết</button></div>' + secs + '</div>';
    }
    host.addEventListener('change', (ev) => {
      const t = ev.target;
      if (t.dataset.ch) {
        const c = +t.dataset.ch;
        state.chs = state.chs.filter((x) => x !== c);
        if (t.checked) state.chs.push(c);
        if (!state.chs.length) state.chs = [c];
      } else if (t.dataset.sec) {
        state.off = state.off.filter((x) => x !== t.dataset.sec);
        if (!t.checked) state.off.push(t.dataset.sec);
      }
      JP.store('jp-scope-' + key, state);
      paint();
      opts.onChange && opts.onChange(api);
    });
    host.addEventListener('click', (ev) => {
      if (ev.target.dataset.all) {
        state.chs = JP.CHAPTERS.slice(); state.off = [];
        JP.store('jp-scope-' + key, state);
        paint();
        opts.onChange && opts.onChange(api);
      }
    });
    api.set = (chs, off) => { state.chs = chs; state.off = off || []; JP.store('jp-scope-' + key, state); paint(); opts.onChange && opts.onChange(api); };
    paint();
    return api;
  };

  // ---- ô 田字格: mỗi chữ một ô, như dòng trong vở tập viết
  JP.squares = (text, label) => {
    const chars = Array.from(text);
    const n = chars.filter((c) => c !== '/').length;
    const size = n <= 1 ? 148 : n === 2 ? 128 : n === 3 ? 112 : n === 4 ? 96 : n <= 6 ? 80 : 64;
    return '<div class="line" role="img" aria-label="' + JP.esc(label || text.replace('/', ' hoặc ')) + '" style="--sq:' + size + 'px">' +
      chars.map((c) => c === '/'
        ? '<span class="sep" aria-hidden="true">/</span>'
        : '<span class="cell sq" aria-hidden="true"><span lang="ja">' + JP.esc(c) + '</span></span>').join('') + '</div>';
  };

  // ---- vòng tròn bút đỏ quanh đáp án đúng
  function maruPath(w, h) {
    const cx = w / 2, cy = h / 2, p = 2 / 3.2, N = 80;
    const a0 = Math.PI * 0.88, sweep = Math.PI * 2 * 1.08;
    let d = '';
    for (let i = 0; i <= N; i++) {
      const t = i / N, a = a0 - t * sweep;
      const c = Math.cos(a), s = Math.sin(a);
      const k = 0.955 + 0.055 * t + 0.012 * Math.sin(t * 11);
      const x = cx + (w / 2 - 2) * k * Math.sign(c) * Math.pow(Math.abs(c), p);
      const y = cy + (h / 2 - 2) * k * Math.sign(s) * Math.pow(Math.abs(s), p);
      d += (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1);
    }
    return d;
  }
  JP.maru = (el) => {
    const NS = 'http://www.w3.org/2000/svg';
    const w = el.offsetWidth + 28, h = el.offsetHeight + 18;
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'maru');
    svg.setAttribute('width', w); svg.setAttribute('height', h);
    svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS(NS, 'path');
    path.setAttribute('d', maruPath(w, h));
    svg.appendChild(path);
    el.appendChild(svg);
    path.style.setProperty('--len', Math.ceil(path.getTotalLength()));
  };

  // ---- bộ trắc nghiệm dùng chung cho từ vựng, kanji và ngữ pháp
  // opts.next() trả về { ask, prompt (html), hint, options: [{html, lang}], answer, explain (html), id }
  JP.quiz = (host, opts) => {
    host.innerHTML =
      '<div class="paper"><div class="paper-head"><h2 class="qno"></h2><p class="score"><span class="streak"></span><span class="grade"></span></p></div>' +
      '<div class="q"><p class="ask"></p><div class="prompt"></div><p class="hint"></p></div>' +
      '<div class="opts" role="group" aria-label="Các đáp án"></div>' +
      '<div class="result" aria-live="polite"></div>' +
      '<button class="btn btn-solid next" hidden>Câu tiếp theo</button></div>';
    const q$ = (s) => host.querySelector(s);
    const st = { ok: 0, total: 0, streak: 0, cur: null, answered: false };
    const api = { active: false };

    function score() {
      q$('.qno').textContent = 'Câu ' + (st.total + (st.answered ? 0 : 1));
      q$('.grade').textContent = st.ok + '/' + st.total;
      q$('.grade').setAttribute('aria-label', 'Đúng ' + st.ok + ' trên ' + st.total + ' câu');
      q$('.streak').textContent = st.streak > 1 ? 'Đúng liên tiếp ' + st.streak + ' câu' : '';
    }
    api.next = () => {
      const q = opts.next();
      st.answered = false;
      if (!q) {
        q$('.q').innerHTML = '<p class="ask">' + (opts.empty || 'Chưa có câu hỏi trong phạm vi này.') + '</p>';
        q$('.opts').innerHTML = ''; q$('.result').innerHTML = ''; q$('.next').hidden = true;
        return;
      }
      st.cur = q;
      host.querySelector('.q').innerHTML = '<p class="ask"></p><div class="prompt"></div><p class="hint"></p>';
      q$('.ask').textContent = q.ask;
      q$('.prompt').innerHTML = q.prompt;
      q$('.hint').textContent = q.hint || '';
      q$('.opts').innerHTML = q.options.map((o, i) =>
        '<button class="opt" data-i="' + i + '"><span class="no" aria-hidden="true">' + (i + 1) + '</span>' +
        '<span class="txt' + (o.lang === 'ja' ? '' : ' txt-vi') + '"' + (o.lang === 'ja' ? ' lang="ja"' : '') + '>' + o.html + '</span></button>').join('');
      q$('.result').innerHTML = '';
      q$('.next').hidden = true;
      score();
      if (api.active && q.say) JP.autoSay(q.say);
    };
    api.answer = (i) => {
      if (st.answered || !st.cur || i >= st.cur.options.length) return;
      st.answered = true;
      const ok = i === st.cur.answer;
      st.total++;
      if (ok) { st.ok++; st.streak++; } else { st.streak = 0; }
      Array.from(host.querySelectorAll('.opt')).forEach((b, k) => {
        b.disabled = true;
        if (k === st.cur.answer) { b.classList.add('ok'); JP.maru(b); } else if (k === i) b.classList.add('ng');
      });
      q$('.result').innerHTML = '<p class="verdict ' + (ok ? 'ok' : 'ng') + '">' + (ok ? 'Đúng' : 'Chưa đúng. Đáp án là ' + st.cur.options[st.cur.answer].plain) + '</p>' +
        '<p class="explain">' + (st.cur.explain || '') + '</p>';
      const nb = q$('.next'); nb.hidden = false; nb.focus();
      score();
      opts.onAnswer && opts.onAnswer(st.cur, ok);
      if (st.cur.sayAfter) JP.autoSay(st.cur.sayAfter);
    };
    api.restart = () => { st.ok = st.total = st.streak = 0; api.next(); };
    api.key = (ev) => {
      if (!api.active || ev.ctrlKey || ev.metaKey || ev.altKey) return false;
      if (!st.answered && /^[1-4]$/.test(ev.key)) { api.answer(+ev.key - 1); return true; }
      if (st.answered && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); api.next(); return true; }
      return false;
    };
    host.addEventListener('click', (ev) => {
      const b = ev.target.closest('.opt');
      if (b) api.answer(+b.dataset.i);
      else if (ev.target.closest('.next')) api.next();
    });
    JP.quizzes.push(api);
    return api;
  };
  JP.quizzes = [];
  document.addEventListener('keydown', (ev) => {
    const t = ev.target;
    if (t && t.matches && t.matches('input[type=text], input[type=search], textarea')) return;
    if (t && t.matches && t.matches('input[type=checkbox], input[type=radio]') && ev.key === ' ') return;
    for (const q of JP.quizzes) if (q.key(ev)) return;
    JP.emit('key', ev);
  });

  // ---- yêu thích (gắn tim) và phát âm
  const FAV_KEY = 'jp-fav-v1';
  let favs = JP.load(FAV_KEY, {});
  JP.isFav = (id) => !!favs[id];
  JP.toggleFav = (id) => { if (favs[id]) delete favs[id]; else favs[id] = 1; JP.store(FAV_KEY, favs); return !!favs[id]; };
  let voice = null;
  function pickVoice() {
    const vs = (window.speechSynthesis.getVoices() || []).filter((v) => /^ja/i.test(v.lang));
    const rank = (v) => (/google|natural|nanami|keita|online/i.test(v.name) ? 0 : /haruka|ayumi|ichiro|kyoko|otoya/i.test(v.name) ? 1 : 2);
    voice = vs.sort((a, b) => rank(a) - rank(b))[0] || null;
  }
  if ('speechSynthesis' in window) {
    pickVoice();
    window.speechSynthesis.addEventListener('voiceschanged', pickVoice);
  }
  JP.say = (text) => {
    if (!('speechSynthesis' in window) || !text) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'ja-JP'; u.rate = 0.85;
    if (voice) u.voice = voice;
    window.speechSynthesis.speak(u);
  };
  // tự đọc: bật tắt chung; chỉ đọc khi người dùng đã bật và trình duyệt có giọng
  let auto = JP.load('jp-autosay', true);
  JP.autoSay = (text) => { if (auto && text) JP.say(text); };
  JP.autoPick = () => ('speechSynthesis' in window)
    ? '<label class="pick"><input type="checkbox" class="auto-chk"' + (auto ? ' checked' : '') + '><span>Tự đọc</span></label>' : '';
  JP.bindAuto = (root) => {
    root.querySelectorAll('.auto-chk').forEach((x) => x.addEventListener('change', () => {
      auto = x.checked; JP.store('jp-autosay', auto);
      if (!auto && 'speechSynthesis' in window) window.speechSynthesis.cancel();
    }));
  };
  JP.sayBtn = (text, small) =>
    ('speechSynthesis' in window)
      ? '<button class="say' + (small ? ' say-sm' : '') + '" type="button" data-say="' + JP.esc(text) + '" aria-label="Nghe phát âm"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></button>'
      : '';

  // ---- thẻ ghi nhớ: xem mặt trước, lật thẻ, rồi chọn "Chưa nhớ" hoặc "Đã học" (vuốt trái/phải hoặc phím ← →)
  // opts.items(): danh sách mục (mỗi mục có id); opts.render(item, flipped) -> html; opts.onRate(item, ok)
  JP.flash = (host, opts) => {
    host.innerHTML =
      '<div class="flash"><p class="fc-counts" aria-live="polite"><b class="c-ng" title="Chưa nhớ">0</b><span aria-hidden="true">←</span><b class="c-left" title="Còn lại">0</b><span aria-hidden="true">→</span><b class="c-ok" title="Đã học">0</b></p>' +
      '<div class="fc-stage"><div class="fc-card" tabindex="0" role="group" aria-label="Thẻ ghi nhớ"><div class="fc-body"></div>' +
      '<div class="fc-foot"><button class="fc-heart" type="button" aria-label="Gắn tim thẻ này" aria-pressed="false"><svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-9.2-9.3C1.6 7.900 3.6 4.8 6.8 4.8c1.9 0 3.5 1 5.2 3 1.700-2 3.300-3 5.200-3 3.200 0 5.200 3.100 4 6.400-1.700 4.700-9.200 9.300-9.200 9.300z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg></button></div></div></div>' +
      '<div class="fc-actions"><button class="fc-btn fc-ng" type="button">← Chưa nhớ</button><button class="fc-undo" type="button" aria-label="Hoàn tác thẻ vừa chọn" title="Hoàn tác (Z)"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M9 7H15a4.500 4.500 0 0 1 0 9H8M9 7 6 10M9 7l3-3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></button><button class="fc-btn fc-ok" type="button">Đã học →</button></div>' +
      '<p class="flash-tip">Phím tắt: Space lật thẻ, ← chưa nhớ, → đã học, Z hoàn tác. Trên điện thoại, vuốt thẻ sang trái hoặc phải.</p></div>';
    const q$ = (s) => host.querySelector(s);
    const card = q$('.fc-card');
    const st = { queue: [], cur: null, flipped: false, ok: 0, ng: 0, hist: [] };
    const api = { active: false };

    function paint(turn) {
      q$('.fc-body').innerHTML = st.cur ? opts.render(st.cur, st.flipped) : '<div class="flash-empty"><p>' + (opts.empty || 'Hết thẻ trong phạm vi này.') + '</p>' + (opts.restart === false ? '' : '<button class="btn" data-restart="1">Bắt đầu lượt mới</button>') + '</div>';
      q$('.fc-body').scrollTop = 0;
      q$('.c-ng').textContent = st.ng;
      q$('.c-left').textContent = st.cur ? st.queue.length + 1 : 0;
      q$('.c-ok').textContent = st.ok;
      q$('.fc-ng').disabled = q$('.fc-ok').disabled = !st.cur;
      q$('.fc-undo').disabled = !st.hist.length;
      const heart = q$('.fc-heart');
      heart.hidden = !st.cur || opts.fav === false;
      if (st.cur) { heart.setAttribute('aria-pressed', JP.isFav(st.cur.id)); heart.classList.toggle('is-on', JP.isFav(st.cur.id)); }
      card.classList.toggle('is-flipped', st.flipped);
      if (turn) { card.classList.remove('is-turning'); void card.offsetWidth; card.classList.add('is-turning'); }
    }
    api.start = () => { st.queue = opts.items(); st.ok = st.ng = 0; st.hist = []; api.next(); };
    const speakNow = () => { if (api.active && st.cur && opts.speak) JP.autoSay(opts.speak(st.cur, st.flipped)); };
    api.next = () => { st.cur = st.queue.shift() || null; st.flipped = false; paint(); speakNow(); };
    api.repaint = () => paint();
    api.flip = () => { if (st.cur) { st.flipped = !st.flipped; paint(true); speakNow(); } };
    api.rate = (ok) => {
      if (!st.cur) return;
      const snap = JP.rec(st.cur.id) ? Object.assign({}, JP.rec(st.cur.id)) : null;
      st.hist.push({ item: st.cur, snap, ok });
      opts.onRate(st.cur, ok);
      if (ok) st.ok++; else { st.ng++; st.queue.push(st.cur); }   // thẻ chưa nhớ quay lại cuối lượt
      api.next();
    };
    api.undo = () => {
      const h = st.hist.pop();
      if (!h) return;
      JP.restore(h.item.id, h.snap);
      if (h.ok) st.ok--; else { st.ng--; const i = st.queue.lastIndexOf(h.item); if (i >= 0) st.queue.splice(i, 1); }
      if (st.cur) st.queue.unshift(st.cur);
      st.cur = h.item; st.flipped = false;
      paint();
    };
    api.key = (ev) => {
      if (!api.active || ev.ctrlKey || ev.metaKey || ev.altKey) return false;
      if (ev.key === ' ') { ev.preventDefault(); api.flip(); return true; }
      if (ev.key === 'ArrowLeft' || ev.key === '1') { ev.preventDefault(); api.rate(false); return true; }
      if (ev.key === 'ArrowRight' || ev.key === '2') { ev.preventDefault(); api.rate(true); return true; }
      if (ev.key === 'z' || ev.key === 'Z') { api.undo(); return true; }
      return false;
    };

    // vuốt thẻ: kéo ngang quá 80px thì chọn Chưa nhớ (trái) hoặc Đã học (phải)
    let drag = null, moved = false;
    card.addEventListener('pointerdown', (ev) => {
      if (ev.target.closest('button, a') || !st.cur) return;
      drag = { x: ev.clientX, y: ev.clientY, id: ev.pointerId }; moved = false;
    });
    card.addEventListener('pointermove', (ev) => {
      if (!drag || drag.id !== ev.pointerId) return;
      const dx = ev.clientX - drag.x, dy = ev.clientY - drag.y;
      if (!moved && Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.5) { moved = true; card.setPointerCapture(ev.pointerId); }
      if (moved) {
        card.style.transform = 'translateX(' + dx + 'px) rotate(' + dx / 40 + 'deg)';
        card.classList.toggle('is-ok', dx > 40); card.classList.toggle('is-ng', dx < -40);
      }
    });
    const endDrag = (ev) => {
      if (!drag) return;
      const dx = ev.clientX - drag.x;
      drag = null;
      card.style.transform = ''; card.classList.remove('is-ok', 'is-ng');
      if (moved && Math.abs(dx) > 80) api.rate(dx > 0);
    };
    card.addEventListener('pointerup', endDrag);
    card.addEventListener('pointercancel', () => { drag = null; card.style.transform = ''; card.classList.remove('is-ok', 'is-ng'); });

    host.addEventListener('click', (ev) => {
      if (ev.target.closest('[data-restart]')) { api.start(); return; }
      const say = ev.target.closest('[data-say]');
      if (say) { JP.say(say.dataset.say); return; }
      if (ev.target.closest('.fc-heart')) { if (st.cur) { JP.toggleFav(st.cur.id); paint(); } return; }
      if (ev.target.closest('.fc-ng')) { api.rate(false); return; }
      if (ev.target.closest('.fc-ok')) { api.rate(true); return; }
      if (ev.target.closest('.fc-undo')) { api.undo(); return; }
      if (ev.target.closest('.fc-card') && !moved) api.flip();
      moved = false;
    });
    card.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); api.flip(); } });
    JP.quizzes.push(api);
    return api;
  };
})();
