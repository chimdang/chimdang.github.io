/* Lập kế hoạch học bằng AI (bản thử).
   Khoá API do người dùng tự nhập, lưu trong trình duyệt này và chỉ gửi đến api.anthropic.com cùng bản tóm tắt tiến độ. */
(function () {
  'use strict';
  const JP = window.JP;
  const esc = JP.esc;

  const KEY = 'jp-ai-key';
  const FORM = 'jp-plan-form';
  const PLAN = 'jp-plan-v1';
  const MODELS = [
    ['claude-opus-5-5', 'Claude Opus 5.5 (mặc định, chính xác nhất)'],
    ['claude-sonnet-5-5', 'Claude Sonnet 5.5 (rẻ hơn)'],
    ['claude-haiku-5-5', 'Claude Haiku 5.5 (rẻ nhất, nhanh)'],
  ];
  const TYPE_NAME = { vocab: 'Từ vựng', kanji: 'Kanji', grammar: 'Ngữ pháp', review: 'Ôn tập' };

  const form = Object.assign({ goal: 'all', date: '', perWeek: 5, minutes: 30, note: '', model: MODELS[0][0], remember: true }, JP.load(FORM, {}));
  let plan = JP.load(PLAN, null);
  let busy = false;
  let message = '';
  let host = null;

  const getKey = () => { try { return localStorage.getItem(KEY) || ''; } catch (e) { return ''; } };
  const setKey = (k) => { try { if (k) localStorage.setItem(KEY, k); else localStorage.removeItem(KEY); } catch (e) { /* bị chặn thì bỏ qua */ } };

  // ---- bản tóm tắt tiến độ gửi cho AI
  function summary() {
    const now = Date.now();
    const srs = JP.srs();
    const due = Object.keys(srs).filter((id) => srs[id].due <= now).length;
    const chapters = JP.CHAPTERS.map((ch) => {
      const v = JP.vocab.filter((e) => e.ch === ch && e.vi);
      const k = JP.kanji.filter((e) => e.ch === ch);
      const g = ((JP.grammar[ch] || {}).patterns || []).filter((p) => p.pat);
      return {
        chuong: ch,
        cac_bai: JP.sections(ch).join(''),
        tu_vung: { tong: v.length, da_thuoc: v.filter((e) => JP.isMastered(e.id)).length, chua_hoc: v.filter((e) => JP.isNew(e.id)).length },
        kanji: { tong: k.length, da_thuoc: k.filter((e) => JP.kanjiView.status(e.k) === 'strong').length, chua_hoc: k.filter((e) => JP.isNew('k|' + e.k)).length },
        ngu_phap: { tong: g.length, da_thuoc: g.filter((p) => JP.isMastered(p.id)).length, chua_hoc: g.filter((p) => JP.isNew(p.id)).length },
      };
    });
    const label = {};
    JP.vocab.forEach((e) => { label[e.id] = e.w + ' (chương ' + e.ch + e.sec + ')'; });
    JP.kanji.forEach((e) => { label['k|' + e.k] = 'kanji ' + e.k + ' (chương ' + e.ch + ')'; });
    JP.CHAPTERS.forEach((ch) => ((JP.grammar[ch] || {}).patterns || []).forEach((p) => { label[p.id] = 'mẫu ' + p.title + ' (chương ' + ch + p.sec + ')'; }));
    const weak = Object.keys(srs).filter((id) => label[id] && srs[id].ng > 0 && srs[id].box <= 1)
      .sort((a, b) => srs[b].ng - srs[a].ng).slice(0, 12).map((id) => label[id] + ', sai ' + srs[id].ng + ' lần');
    return { muc_den_han_on_lai: due, chuong: chapters, hay_sai: weak };
  }

  function sessionCount() {
    if (!form.date) return Math.max(1, +form.perWeek * 2);
    const days = Math.ceil((new Date(form.date + 'T00:00:00') - new Date(new Date().toDateString())) / 864e5);
    if (!(days >= 1)) return Math.max(1, +form.perWeek);
    return Math.min(40, Math.max(1, Math.round((days / 7) * form.perWeek)));
  }

  const SYSTEM = [
    'Bạn là gia sư tiếng Nhật cho người Việt, giúp lập kế hoạch học từ dữ liệu tiến độ thật của học viên.',
    'Giáo trình có 12 chương, mỗi chương chia các bài A, B, C (có thể D). Mỗi chương có từ vựng, kanji và mẫu ngữ pháp.',
    'Nguyên tắc: ưu tiên (1) ôn các mục đến hạn và các mục hay sai, (2) học nội dung mới theo thứ tự chương, (3) xen kẽ từ vựng, kanji, ngữ pháp, không dồn một loại.',
    'Ước lượng thời gian: khoảng 8 từ mới mất 10 phút, 3 kanji mất 10 phút, 1 mẫu ngữ pháp mất 10 phút, 10 câu trắc nghiệm hoặc ôn thẻ mất 5 phút.',
    'Mỗi buổi phải vừa đúng số phút học viên có, tổng thời gian các việc trong buổi không vượt quá số phút đó.',
    'Chỉ trả về một đối tượng JSON hợp lệ, không có chữ nào ngoài JSON, theo mẫu:',
    '{"danh_gia":"2-3 câu nhận xét tình hình hiện tại","buoi":[{"ten":"tiêu đề ngắn của buổi","viec":[{"loai":"vocab|kanji|grammar|review","chuong":3,"bai":"A","noi_dung":"việc cụ thể, viết bằng tiếng Việt","phut":10}]}],"meo":["lời khuyên ngắn"]}',
    'Trường "bai" có thể bỏ trống. "loai": review nghĩa là mở phiên Ôn hôm nay (không cần chuong). Số phần tử của "buoi" phải đúng bằng số buổi được yêu cầu.',
  ].join('\n');

  const GOALS = {
    all: 'Học hết các chương và nhớ chắc',
    test: 'Ôn tập để chuẩn bị cho một bài kiểm tra hoặc kỳ thi',
    weak: 'Củng cố các điểm yếu và những mục hay quên trước, rồi mới học mới',
  };

  async function generate() {
    const key = (document.getElementById('ai-key') || {}).value || getKey();
    if (!key) { message = 'Hãy dán khoá API của bạn vào ô bên trên.'; return paint(); }
    if (form.remember) setKey(key.trim());
    busy = true; message = ''; paint();
    const n = sessionCount();
    const user = JSON.stringify({
      hom_nay: new Date().toISOString().slice(0, 10),
      muc_tieu: GOALS[form.goal] || GOALS.all,
      ngay_ket_thuc: form.date || 'không có, lập kế hoạch cho 2 tuần',
      so_buoi_can_lap: n,
      so_phut_moi_buoi: +form.minutes,
      ghi_chu_cua_hoc_vien: form.note || '',
      tien_do: summary(),
    });
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': key.trim(),
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({ model: form.model, max_tokens: 8000, system: SYSTEM, messages: [{ role: 'user', content: user }] }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const m = (data.error && data.error.message) || '';
        message = res.status === 401 ? 'Khoá API không đúng hoặc đã bị thu hồi. Kiểm tra lại khoá.'
          : res.status === 429 ? 'Đang bị giới hạn lượt gọi hoặc hết hạn mức. Thử lại sau ít phút.'
          : res.status === 403 || res.status === 404 ? 'Khoá này chưa dùng được mô hình đã chọn. Thử chọn mô hình khác. ' + m
          : 'Lỗi từ máy chủ (' + res.status + '). ' + m;
      } else if (data.stop_reason === 'refusal') {
        message = 'AI từ chối yêu cầu này. Thử đổi ghi chú hoặc mô hình khác.';
      } else {
        const text = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
        const a = text.indexOf('{'), b = text.lastIndexOf('}');
        const obj = JSON.parse(text.slice(a, b + 1));
        if (!obj || !Array.isArray(obj.buoi) || !obj.buoi.length) throw new Error('thiếu danh sách buổi học');
        plan = { made: Date.now(), form: Object.assign({}, form, { n }), data: obj, done: {} };
        JP.store(PLAN, plan);
        if (data.stop_reason === 'max_tokens') message = 'Kế hoạch bị cắt do quá dài. Hãy giảm số buổi.';
      }
    } catch (e) {
      message = e instanceof SyntaxError || /JSON|buổi/.test(String(e.message))
        ? 'Không đọc được kế hoạch AI trả về. Bấm lập lại thử lần nữa.'
        : 'Không kết nối được tới Anthropic. Kiểm tra mạng rồi thử lại.';
    }
    busy = false;
    paint();
  }

  function dates(n, perWeek) {
    const out = [];
    const start = new Date(new Date().toDateString());
    for (let i = 0; i < n; i++) {
      const w = Math.floor(i / perWeek), j = i % perWeek;
      const d = new Date(start);
      d.setDate(d.getDate() + w * 7 + Math.floor((j * 7) / perWeek));
      out.push(d);
    }
    return out;
  }
  const fmt = (d) => ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'][d.getDay()] + ' ' + d.getDate() + '/' + (d.getMonth() + 1);

  function taskLink(t) {
    const ch = +t.chuong;
    const view = { vocab: 'vocab', kanji: 'kanji', grammar: 'grammar' }[t.loai];
    if (t.loai === 'review') return '<a href="#review" data-act="review">Mở ôn hôm nay</a>';
    if (!view || !(ch >= 1 && ch <= 12)) return '';
    const sec = t.bai && JP.sections(ch).indexOf(t.bai) >= 0 ? ' data-sec="' + esc(t.bai) + '"' : '';
    return '<a href="#' + view + '" data-open="' + view + '" data-ch="' + ch + '"' + sec + '>Mở chương ' + ch + (sec ? t.bai : '') + '</a>';
  }

  function renderPlan() {
    const d = plan.data;
    const ds = dates(d.buoi.length, +plan.form.perWeek || 5);
    const today = new Date().toDateString();
    return '<div class="plan-out"><p class="plan-eval">' + esc(d.danh_gia || '') + '</p>' +
      d.buoi.map((b, i) => {
        const isToday = ds[i].toDateString() === today;
        const tasks = (b.viec || []).map((t, k) => {
          const id = 's' + i + 't' + k;
          return '<li class="plan-task' + (plan.done[id] ? ' is-done' : '') + '"><label><input type="checkbox" data-done="' + id + '"' + (plan.done[id] ? ' checked' : '') + '>' +
            '<span class="plan-kind">' + esc(TYPE_NAME[t.loai] || 'Việc') + '</span> <span class="plan-text">' + esc(t.noi_dung || '') + '</span></label>' +
            '<span class="plan-meta">' + (t.phut ? esc(t.phut) + ' phút' : '') + '</span>' + taskLink(t) + '</li>';
        }).join('');
        return '<section class="plan-day' + (isToday ? ' is-today' : '') + '"><h4>' + esc(fmt(ds[i])) + (isToday ? ' (hôm nay)' : '') + ' <small>' + esc(b.ten || 'Buổi ' + (i + 1)) + '</small></h4><ul>' + tasks + '</ul></section>';
      }).join('') +
      ((d.meo || []).length ? '<ul class="plan-tips">' + d.meo.map((m) => '<li>' + esc(m) + '</li>').join('') + '</ul>' : '') +
      '<p class="plan-foot">Lập lúc ' + new Date(plan.made).toLocaleString('vi-VN') + '. <button class="link" data-act="clear-plan">Xoá kế hoạch</button></p></div>';
  }

  function paint() {
    if (!host) return;
    const hasKey = !!getKey();
    host.innerHTML =
      '<details class="plan"' + (plan || message || busy ? ' open' : '') + '><summary><span class="plan-title">Lập kế hoạch học bằng AI</span> <span class="plan-beta">bản thử</span></summary>' +
      '<div class="plan-body"><div class="plan-form">' +
      '<label class="plan-f"><span>Mục tiêu</span><select id="pl-goal">' + Object.keys(GOALS).map((g) => '<option value="' + g + '"' + (form.goal === g ? ' selected' : '') + '>' + esc(GOALS[g]) + '</option>').join('') + '</select></label>' +
      '<label class="plan-f"><span>Ngày cần xong (không bắt buộc)</span><input type="date" id="pl-date" value="' + esc(form.date) + '"></label>' +
      '<label class="plan-f"><span>Số buổi học mỗi tuần</span><input type="number" id="pl-week" min="1" max="7" value="' + (+form.perWeek) + '"></label>' +
      '<label class="plan-f"><span>Số phút mỗi buổi</span><input type="number" id="pl-min" min="10" max="240" step="5" value="' + (+form.minutes) + '"></label>' +
      '<label class="plan-f plan-wide"><span>Ghi chú thêm (ví dụ: yếu kanji, bận cuối tuần)</span><input type="text" id="pl-note" maxlength="300" value="' + esc(form.note) + '"></label>' +
      '<label class="plan-f plan-wide"><span>Khoá API Anthropic của bạn</span><input type="password" id="ai-key" autocomplete="off" spellcheck="false" placeholder="' + (hasKey ? 'Đã lưu khoá trong trình duyệt này' : 'sk-ant-...') + '"></label>' +
      '<label class="plan-f"><span>Mô hình</span><select id="pl-model">' + MODELS.map((m) => '<option value="' + m[0] + '"' + (form.model === m[0] ? ' selected' : '') + '>' + esc(m[1]) + '</option>').join('') + '</select></label>' +
      '<label class="plan-chk"><input type="checkbox" id="pl-remember"' + (form.remember ? ' checked' : '') + '> Nhớ khoá trong trình duyệt này</label></div>' +
      '<div class="row"><button class="btn btn-solid" id="pl-go"' + (busy ? ' disabled' : '') + '>' + (busy ? 'Đang lập kế hoạch...' : plan ? 'Lập lại kế hoạch' : 'Lập kế hoạch') + '</button>' +
      (hasKey ? '<button class="btn btn-sm" data-act="forget-key">Xoá khoá đã lưu</button>' : '') + '</div>' +
      (message ? '<p class="plan-msg" role="alert">' + esc(message) + '</p>' : '') +
      '<p class="plan-note">Khoá chỉ nằm trong trình duyệt này và chỉ được gửi tới api.anthropic.com, cùng bản tóm tắt số từ, kanji, mẫu đã thuộc và những mục hay sai. Mỗi lần lập tốn một khoản nhỏ trong tài khoản API của bạn. Nên tạo một khoá riêng có đặt hạn mức chi tiêu, và đừng dùng trên máy dùng chung.</p>' +
      (plan ? renderPlan() : '') + '</div></details>';
  }

  function onChange(ev) {
    const t = ev.target;
    if (t.id === 'pl-goal') form.goal = t.value;
    else if (t.id === 'pl-date') form.date = t.value;
    else if (t.id === 'pl-week') form.perWeek = Math.min(7, Math.max(1, +t.value || 1));
    else if (t.id === 'pl-min') form.minutes = Math.min(240, Math.max(10, +t.value || 30));
    else if (t.id === 'pl-note') form.note = t.value;
    else if (t.id === 'pl-model') form.model = t.value;
    else if (t.id === 'pl-remember') { form.remember = t.checked; if (!t.checked) setKey(''); }
    else if (t.dataset && t.dataset.done) {
      plan.done[t.dataset.done] = t.checked;
      JP.store(PLAN, plan);
      t.closest('.plan-task').classList.toggle('is-done', t.checked);
      return;
    } else return;
    JP.store(FORM, form);
  }
  function onClick(ev) {
    if (ev.target.id === 'pl-go') { generate(); return; }
    const a = ev.target.closest('[data-act]');
    if (!a) return;
    if (a.dataset.act === 'forget-key') { setKey(''); message = 'Đã xoá khoá khỏi trình duyệt này.'; paint(); }
    else if (a.dataset.act === 'clear-plan') { plan = null; JP.store(PLAN, null); paint(); }
    else if (a.dataset.act === 'review') { ev.preventDefault(); JP.startReview && JP.startReview(false); }
  }

  JP.planner = {
    mount(el) {
      host = el;
      host.addEventListener('change', onChange);
      host.addEventListener('click', onClick);
      paint();
    },
  };
})();
