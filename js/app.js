/* Điều hướng giữa các màn hình. Địa chỉ #vocab, #kanji, #grammar, #review dùng được với nút Back của trình duyệt. */
(function () {
  'use strict';
  const JP = window.JP;
  const VIEWS = { home: JP.homeView, vocab: JP.vocabView, kanji: JP.kanjiView, grammar: JP.grammarView, review: JP.reviewView };
  let current = null;

  function show(name) {
    if (!VIEWS[name]) name = 'home';
    if (current && VIEWS[current] && VIEWS[current].hide) VIEWS[current].hide();
    current = name;
    Object.keys(VIEWS).forEach((v) => { JP.$('v-' + v).hidden = v !== name; });
    document.querySelectorAll('.tab').forEach((t) => {
      if (t.dataset.view === name) t.setAttribute('aria-current', 'page'); else t.removeAttribute('aria-current');
    });
    JP.store('jp-last-view', name);
    VIEWS[name].show && VIEWS[name].show();
  }
  JP.go = (name) => {
    if (location.hash.slice(1) === name) show(name);
    else location.hash = name;   // hashchange sẽ gọi show
  };
  window.addEventListener('hashchange', () => show(location.hash.slice(1)));
  document.querySelector('.tabs').addEventListener('click', (ev) => {
    const b = ev.target.closest('.tab');
    if (b) JP.go(b.dataset.view);
  });

  const start = location.hash.slice(1) || 'home';
  show(VIEWS[start] && start !== 'review' ? start : 'home');
})();
