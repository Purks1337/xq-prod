/* Хвалите Media — логика страницы.
 * Файл собран скриптом source/build.mjs из source/Main.dc.html. Править лучше исходник и пересобирать,
 * но настройки ниже (адрес для заявок) можно менять прямо здесь.
 *
 * Что внутри:
 *  - класс Component — вся логика из макета: шоурил за курсором, ускорение ленты логотипов,
 *    «рыбий глаз» в команде, 3D-сканы на WebGL, персонаж на карте, окна кейсов, форма;
 *  - маленькая обвязка внизу: вешает обработчики по data-on-*, вызывает ref-колбэки по data-ref
 *    и обновляет элементы с data-b-* / data-if, когда меняется состояние (setState).
 */
(function () {
  'use strict';

  // ===== НАСТРОЙКА =====
  // Куда отправлять заявки: адрес, принимающий POST с JSON
  // { name, contact, service, budget, agree, page } + на разных страницах about, format, link, date, details.
  var LEAD_ENDPOINT = (typeof window !== 'undefined' && window.__LEAD_ENDPOINT__) || (typeof window !== 'undefined' && window.__BASE_URL__ ? window.__BASE_URL__.replace(/\/$/, '') + '/api/lead' : '/api/lead');
  var BASE = (typeof window !== 'undefined' && window.__BASE_URL__) ? window.__BASE_URL__.replace(/\/$/, '') + '/' : '';
  // Номер счётчика Яндекс Метрики (код счётчика вставляется в <head>). 0 — цели не отправляются.
  // Цели: lead_form — заявка отправлена, click_phone — клик по телефону, click_messenger — Telegram/WhatsApp.
  var METRIKA_ID = 0;
  // =====================

  function goal(name) {
    try { if (METRIKA_ID && typeof window.ym === 'function') window.ym(METRIKA_ID, 'reachGoal', name); } catch (err) { /* без Метрики */ }
  }

  var pending = false;
  function __dcUpdate() {
    if (pending) return;
    pending = true;
    Promise.resolve().then(function () { pending = false; update(); });
  }

  class DCLogic {
  constructor(props) { this.props = props || {}; this.state = {}; }
  setState(patch) { Object.assign(this.state, typeof patch === 'function' ? patch(this.state, this.props) : patch); __dcUpdate(); }
}

  class Component extends DCLogic {
  constructor(props) {
    super(props);
    this.state = { sent: false };
    // ===== Слот-машина со скидкой: настройки =====
    // chance — шанс выигрыша за одну попытку (0.02 = 2%), tries — попыток на посетителя,
    // prizes — [скидка в %, доля среди выигрышей]; сумма долей = 1.
    this.SLOT = { chance: 0.02, tries: 3, prizes: [[5, 0.6], [10, 0.3], [15, 0.1]], key: 'hm-slot-v1' };
    this.SYMS = ['cherry', 'lemon', 'melon', 'grapes', 'orange', 'p5', 'p10', 'p15'];
    this.FRUITS = ['cherry', 'lemon', 'melon', 'grapes', 'orange'];
    this.PLATES = ['p5', 'p10', 'p15'];
    this.rootEl = null;
    this.faderEl = null;
    this.slotEl = null;
    this.shelfEl = null;
    this.raf = 0;
    this.listening = false;
    this.timers = [];
    this.tick = this.tick.bind(this);
    this.onScroll = this.onScroll.bind(this);
    this.onResize = this.onResize.bind(this);
  }
  componentWillUnmount() {
    window.removeEventListener('scroll', this.onScroll);
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('load', this.onResize);
    if (this.raf) cancelAnimationFrame(this.raf);
    this.timers.forEach(clearTimeout);
  }
  // Холст дизайна показывает страницу целиком в одном высоком окне: прокрутки там нет, эффекты отключаем.
  flat() { return window.innerHeight > 1600; }
  calm() { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); }
  later(fn, ms) { const t = setTimeout(fn, ms); this.timers.push(t); return t; }
  listen() {
    if (this.listening) return;
    this.listening = true;
    window.addEventListener('scroll', this.onScroll, { passive: true });
    window.addEventListener('resize', this.onResize);
    window.addEventListener('load', this.onResize);
  }
  onResize() { this.layoutMarks(); this.onScroll(); }
  onScroll() {
    const y = window.scrollY || window.pageYOffset || 0;
    if (y !== this.lastY) {
      this.dir = y >= (this.lastY || 0) ? 1 : -1;
      this.lastY = y;
      this.movedAt = performance.now();
    }
    if (!this.raf) this.raf = requestAnimationFrame(this.tick);
  }
  tick(now) {
    this.raf = 0;
    let more = false;
    if (this.fSecs) more = this.faderStep(now || performance.now());
    if (more) this.raf = requestAnimationFrame(this.tick);
  }

  // ---------- персонаж-фейдер ----------
  // Справа — фейдер микшера: человечек едет по нему вместе с прокруткой, отметки — разделы страницы.
  // На телефоне тот же человечек бежит по липкой кнопке внизу.
  setFader(el) {
    if (!el || el === this.faderEl) return;
    this.faderEl = el;
    this.fRail = el.querySelector('.fd-rail');
    this.fMarks = el.querySelector('.fd-marks');
    this.fCap = el.querySelector('.fd-cap');
    this.fTag = el.querySelector('.fd-tag');
    this.fRun = document.querySelector('.runner-m');
    this.fPos = 0;
    this.fShown = -2;
    this.dir = 1;
    this.movedAt = 0;
    this.lastY = window.scrollY || 0;
    this.fMarks.textContent = '';
    this.fSecs = Array.prototype.map.call(document.querySelectorAll('[data-fader]'), (s) => {
      const a = document.createElement('a');
      a.className = 'fd-mark';
      a.href = '#' + s.id;
      a.tabIndex = -1;
      a.appendChild(document.createElement('i'));
      const t = document.createElement('span');
      t.textContent = s.getAttribute('data-fader');
      a.appendChild(t);
      this.fMarks.appendChild(a);
      return { el: s, a: a, label: s.getAttribute('data-fader'), f: 0 };
    });
    this.layoutMarks();
    this.listen();
    this.onScroll();
    this.later(this.onResize, 1200);
  }
  span() { return Math.max(1, document.documentElement.scrollHeight - window.innerHeight); }
  layoutMarks() {
    if (!this.fSecs) return;
    const H = this.fRail.clientHeight, sp = this.span(), y0 = window.scrollY || 0, flat = this.flat();
    const total = document.documentElement.scrollHeight, vh = window.innerHeight;
    let prev = -99;
    this.fSecs.forEach((s) => {
      const top = s.el.getBoundingClientRect().top + y0;
      s.f = Math.min(1, Math.max(0, flat ? top / total : (top - vh * 0.35) / sp));
      const px = s.f * H;
      s.a.style.top = px.toFixed(1) + 'px';
      const tight = px - prev < 22;
      s.a.classList.toggle('tight', tight);
      if (!tight) prev = px;
    });
    this.fShown = -2;
  }
  faderStep(now) {
    const target = this.flat() ? 0 : Math.min(1, Math.max(0, (window.scrollY || 0) / this.span()));
    const calm = this.calm();
    this.fPos = calm ? target : this.fPos + (target - this.fPos) * 0.18;
    if (Math.abs(target - this.fPos) < 0.0004) this.fPos = target;
    const H = this.fRail.clientHeight;
    this.fCap.style.transform = 'translateY(' + (this.fPos * H).toFixed(1) + 'px)';
    const running = !calm && (Math.abs(target - this.fPos) * H > 1 || now - this.movedAt < 160);
    const cl = this.faderEl.classList;
    cl.toggle('running', running);
    cl.toggle('up', this.dir < 0);
    let k = -1;
    this.fSecs.forEach((s, i) => { if (s.f <= this.fPos + 0.002) k = i; });
    if (k !== this.fShown) {
      this.fShown = k;
      this.fSecs.forEach((s, i) => s.a.classList.toggle('on', i === k));
      this.fTag.textContent = k >= 0 ? this.fSecs[k].label : this.fSecs.length ? this.fSecs[0].label : '';
    }
    if (this.fRun && this.fRun.parentElement) {
      const w = Math.max(0, this.fRun.parentElement.clientWidth - 40);
      this.fRun.style.transform = 'translateX(' + (this.fPos * w).toFixed(1) + 'px)';
      this.fRun.classList.toggle('running', running);
      this.fRun.classList.toggle('up', this.dir < 0);
    }
    return running || this.fPos !== target;
  }

  // ---------- корневой элемент ----------
  setRoot(el) {
    if (!el || el === this.rootEl) return;
    this.rootEl = el;
  }

  // ---------- полка с томами-этапами ----------
  setShelf(el) {
    if (!el || el === this.shelfEl) return;
    this.shelfEl = el;
    const books = Array.prototype.slice.call(el.querySelectorAll('.book'));
    const open = (b) => books.forEach((x) => {
      const on = x === b;
      x.classList.toggle('open', on);
      const s = x.querySelector('.spine');
      if (s) s.setAttribute('aria-expanded', on ? 'true' : 'false');
    });
    const wide = () => !window.matchMedia || window.matchMedia('(hover: hover) and (min-width: 821px)').matches;
    books.forEach((b) => {
      b.addEventListener('mouseenter', () => { if (wide()) open(b); });
      const s = b.querySelector('.spine');
      if (s) {
        s.addEventListener('click', () => open(b));
        s.addEventListener('focus', () => { if (wide()) open(b); });
      }
    });
  }

  // ---------- слот-машина ----------
  setSlot(el) {
    if (!el || el === this.slotEl) return;
    this.slotEl = el;
    const box = el.closest('.casino') || el;
    this.sl = {
      box: box,
      cab: el.querySelector('.cab'),
      strips: Array.prototype.slice.call(el.querySelectorAll('.strip')),
      lever: el.querySelector('.lever'),
      lamps: Array.prototype.slice.call(el.querySelectorAll('.tries i')),
      lcd: el.querySelector('.lcd-msg'),
      spin: box.querySelector('.spin'),
      take: box.querySelector('.take'),
      prize: box.querySelector('.prize'),
      now: [['lemon', 'p10', 'cherry'], ['grapes', 'p5', 'melon'], ['orange', 'p15', 'lemon']]
    };
    this.slotData = this.slotLoad();
    this.spinning = false;
    this.sl.lever.addEventListener('click', () => this.pull());
    this.sl.spin.addEventListener('click', () => this.pull());
    if (this.slotData.win) {
      const p = 'p' + this.slotData.win;
      this.sl.strips.forEach((st, i) => this.reelSet(st, i, [this.sl.now[i][0], p, this.sl.now[i][2]]));
    }
    this.slotShow('init');
  }
  slotLoad() {
    try {
      const v = JSON.parse(window.localStorage.getItem(this.SLOT.key) || 'null');
      if (v && typeof v.used === 'number') return v;
    } catch (e) { /* хранилище недоступно — попытки живут до перезагрузки */ }
    return { used: 0, win: 0, code: '' };
  }
  slotSave() {
    try { window.localStorage.setItem(this.SLOT.key, JSON.stringify(this.slotData)); } catch (e) { /* без хранилища */ }
  }
  cell(k) {
    return '<span class="cell"><svg viewBox="0 0 16 16" shape-rendering="crispEdges" aria-hidden="true"><use href="#s-' + k + '"></use></svg></span>';
  }
  reelSet(strip, i, three) {
    strip.style.transition = 'none';
    strip.style.transform = 'translateY(0)';
    strip.innerHTML = three.map((k) => this.cell(k)).join('');
    this.sl.now[i] = three;
  }
  reelSpin(strip, i, three, dur, n) {
    const fill = [];
    for (let k = 0; k < n; k++) fill.push(this.SYMS[Math.floor(Math.random() * this.SYMS.length)]);
    const seq = three.concat(fill, this.sl.now[i]);
    strip.innerHTML = seq.map((k) => this.cell(k)).join('');
    const h = strip.firstElementChild.offsetHeight;
    strip.style.transition = 'none';
    strip.style.transform = 'translateY(' + (-(seq.length - 3) * h) + 'px)';
    void strip.offsetHeight;
    strip.style.transition = 'transform ' + dur + 's cubic-bezier(.16,.72,.26,1.05)';
    strip.style.transform = 'translateY(0)';
    this.later(() => this.reelSet(strip, i, three), dur * 1000 + 60);
  }
  slotText(parts) {
    const P = this.sl.prize;
    P.textContent = '';
    parts.forEach((x) => {
      if (typeof x === 'string') P.appendChild(document.createTextNode(x));
      else { const b = document.createElement('b'); b.textContent = x[0]; P.appendChild(b); }
    });
  }
  slotShow(mode) {
    const S = this.sl, d = this.slotData, left = Math.max(0, this.SLOT.tries - d.used);
    S.lamps.forEach((l, i) => l.classList.toggle('on', i < left));
    S.box.classList.toggle('won', !!d.win);
    S.box.classList.toggle('over', !d.win && left === 0);
    const off = !!d.win || left === 0 || this.spinning;
    S.spin.disabled = off;
    S.lever.disabled = off;
    if (d.win) {
      S.lcd.textContent = 'ДЖЕКПОТ −' + d.win + '%';
      this.slotText(['Скидка ', [d.win + '%'], ' ваша. Код ', [d.code], ' уже прикреплён к заявке — осталось её отправить.']);
      S.take.textContent = 'Забрать скидку';
      S.take.hidden = false;
      S.spin.hidden = true;
    } else if (left === 0) {
      S.lcd.textContent = 'ПОПЫТКИ КОНЧИЛИСЬ';
      this.slotText(['Сегодня не повезло. Смету всё равно посчитаем честно — по сменам, без накруток.']);
      S.take.textContent = 'Рассчитать смету';
      S.take.hidden = false;
      S.spin.hidden = true;
    } else if (mode === 'init') {
      S.lcd.textContent = d.used ? 'ЕЩЁ ' + left + ' ' + (left === 1 ? 'ПОПЫТКА' : 'ПОПЫТКИ') : 'ДЁРНИТЕ РЫЧАГ';
    }
    const inp = document.querySelector('#zayavka input[name="discount"]');
    if (inp) inp.value = d.win ? d.win + '% · ' + d.code : '';
    const note = document.querySelector('#zayavka .bonus');
    if (note) {
      note.hidden = !d.win;
      note.textContent = d.win ? '★ Скидка ' + d.win + '% по коду ' + d.code + ' прикреплена к заявке' : '';
    }
  }
  pull() {
    const S = this.sl, d = this.slotData;
    if (!S || this.spinning || d.win || d.used >= this.SLOT.tries) return;
    this.spinning = true;
    d.used += 1;
    let win = 0;
    if (Math.random() < this.SLOT.chance) {
      const r = Math.random();
      let acc = 0;
      for (let k = 0; k < this.SLOT.prizes.length; k++) {
        acc += this.SLOT.prizes[k][1];
        if (r <= acc) { win = this.SLOT.prizes[k][0]; break; }
      }
      if (!win) win = this.SLOT.prizes[this.SLOT.prizes.length - 1][0];
    }
    const pick = (a) => a[Math.floor(Math.random() * a.length)];
    let mid, near = false;
    if (win) {
      mid = ['p' + win, 'p' + win, 'p' + win];
      const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      let c = '';
      for (let k = 0; k < 4; k++) c += A[Math.floor(Math.random() * A.length)];
      d.win = win;
      d.code = 'HM' + win + '-' + c;
    } else if (Math.random() < 0.35) {
      const p = pick(this.PLATES);
      mid = [p, p, pick(this.FRUITS)];
      near = true;
    } else {
      do { mid = [pick(this.SYMS), pick(this.SYMS), pick(this.SYMS)]; } while (mid[0] === mid[1] && mid[1] === mid[2]);
    }
    this.slotSave();
    S.lever.classList.remove('pull');
    void S.lever.offsetWidth;
    S.lever.classList.add('pull');
    S.box.classList.add('spinning');
    S.lcd.textContent = 'КРУТИМ…';
    S.spin.disabled = true;
    S.lever.disabled = true;
    const calm = this.calm();
    let end = 0;
    S.strips.forEach((st, i) => {
      const three = [pick(this.SYMS), mid[i], pick(this.SYMS)];
      const slow = near && i === 2;
      const dur = calm ? 0.3 : 1.15 + i * 0.5 + (slow ? 1.2 : 0);
      end = Math.max(end, dur);
      this.later(() => this.reelSpin(st, i, three, dur, calm ? 4 : 18 + i * 7 + (slow ? 12 : 0)), calm ? 0 : 160);
    });
    this.later(() => {
      this.spinning = false;
      S.box.classList.remove('spinning');
      const left = Math.max(0, this.SLOT.tries - d.used);
      if (win) this.confetti();
      else if (left > 0) {
        S.lcd.textContent = (near ? 'ПОЧТИ! ' : 'МИМО! ') + 'ЕЩЁ ' + left;
        this.slotText(near ? ['Две из трёх — совсем рядом. Попыток осталось: ', [String(left)], '.'] : ['Не в этот раз. Попыток осталось: ', [String(left)], '.']);
      }
      this.slotShow('end');
    }, (calm ? 0 : 160) + end * 1000 + 160);
  }
  confetti() {
    if (this.calm()) return;
    const cab = this.sl.cab, cols = ['#D4A54C', '#3358F4', '#FFFFFF', '#E5383B', '#F7D046'];
    for (let k = 0; k < 40; k++) {
      const s = document.createElement('span');
      s.className = 'cf';
      s.style.left = (Math.random() * 100).toFixed(1) + '%';
      s.style.background = cols[k % cols.length];
      s.style.animationDelay = (Math.random() * 0.6).toFixed(2) + 's';
      s.style.setProperty('--dx', ((Math.random() - 0.5) * 160).toFixed(0) + 'px');
      cab.appendChild(s);
      this.later(() => { if (s.parentNode) s.parentNode.removeChild(s); }, 2800);
    }
  }

  renderVals() {
    const self = this;
    const SP = [[12, 12], [100, 64], [188, 12], [136, 100], [188, 188], [100, 136], [12, 188], [64, 100]];
    const inStar = (x, y) => {
      let c = false;
      for (let a = 0, b = SP.length - 1; a < SP.length; b = a++) {
        const xa = SP[a][0], ya = SP[a][1], xb = SP[b][0], yb = SP[b][1];
        if ((ya > y) !== (yb > y) && x < (xb - xa) * (y - ya) / (yb - ya) + xa) c = !c;
      }
      return c;
    };
    const PN = 13;
    const pix = [];
    for (let r = 0; r < PN; r++) {
      for (let c = 0; c < PN; c++) {
        const on = inStar((c + 0.5) / PN * 200, (r + 0.5) / PN * 200);
        const h = Math.abs(Math.sin((r * PN + c + 1) * 12.9898) * 43758.5453) % 1;
        const h2 = Math.abs(Math.sin((r * PN + c + 7) * 78.233) * 12345.678) % 1;
        const delay = Math.round(Math.hypot(c - 6, r - 6) * 40);
        pix.push({ on: on ? '1' : '0', st: 'opacity: ' + (0.15 + h * 0.7).toFixed(2) + '; background: ' + (on || h2 > 0.55 ? '#B9C6FB' : '#3358F4') + '; transition-delay: ' + delay + 'ms; animation-delay: -' + (h2 * 1.8).toFixed(2) + 's' });
      }
    }
    return {
      pix: pix,
      sent: this.state.sent, notSent: !this.state.sent,
      send: () => self.setState({ sent: true }),
      setRoot: (el) => self.setRoot(el),
      setFader: (el) => self.setFader(el),
      setShelf: (el) => self.setShelf(el),
      setSlot: (el) => self.setSlot(el)
    };
  }
}

  var comp = new Component({});
  var vals = comp.renderVals();
  var getp = function (p) {
    return p.split('.').reduce(function (a, k) { return a == null ? undefined : a[k]; }, vals);
  };

  var BOOL = { disabled: 'disabled', checked: 'checked', hidden: 'hidden', selected: 'selected', readonly: 'readOnly', required: 'required' };
  var binds = [];
  var refs = [];

  function getAnalyticsData() {
    var params = new URLSearchParams(window.location.search);
    var utmKeys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'yclid', 'gclid', 'vkclid'];
    var storedUtm = {};
    try {
      storedUtm = JSON.parse(sessionStorage.getItem('xq_utm') || '{}');
    } catch (e) {}

    var hasNewUtm = false;
    utmKeys.forEach(function (k) {
      var val = params.get(k);
      if (val) {
        storedUtm[k] = val;
        hasNewUtm = true;
      }
    });
    if (hasNewUtm) {
      try { sessionStorage.setItem('xq_utm', JSON.stringify(storedUtm)); } catch (e) {}
    }

    var landingPage = '';
    var referrer = '';
    try {
      landingPage = sessionStorage.getItem('xq_landing') || window.location.href;
      if (!sessionStorage.getItem('xq_landing')) {
        sessionStorage.setItem('xq_landing', landingPage);
      }
      referrer = sessionStorage.getItem('xq_referrer') || document.referrer || '';
      if (!sessionStorage.getItem('xq_referrer') && document.referrer) {
        sessionStorage.setItem('xq_referrer', referrer);
      }
    } catch (e) {}

    var sessionStart = Date.now();
    try {
      var storedStart = sessionStorage.getItem('xq_session_start');
      if (storedStart) {
        sessionStart = Number(storedStart);
      } else {
        sessionStorage.setItem('xq_session_start', String(sessionStart));
      }
    } catch (e) {}
    var secondsOnSite = Math.max(0, Math.round((Date.now() - sessionStart) / 1000));
    var timeOnSite = secondsOnSite < 60 ? (secondsOnSite + ' сек.') : (Math.floor(secondsOnSite / 60) + ' мин. ' + (secondsOnSite % 60) + ' сек.');

    var ua = navigator.userAgent || '';
    var isMobile = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
    var deviceType = isMobile ? 'Смартфон' : 'Десктоп';
    var screen = window.screen ? (window.screen.width + '×' + window.screen.height) : '';

    var ymUid = '';
    var ymMatch = document.cookie.match(/_ym_uid=([^;]+)/);
    if (ymMatch) ymUid = ymMatch[1];

    var result = {
      landing_page: landingPage,
      referrer: referrer || 'Прямой заход',
      device: deviceType + (screen ? ' (' + screen + ')' : ''),
      time_on_site: timeOnSite,
      ym_uid: ymUid
    };
    Object.keys(storedUtm).forEach(function (k) { result[k] = storedUtm[k]; });
    return result;
  }

  try { getAnalyticsData(); } catch (e) {}

  function submitLead(e, done) {
    var btn = e.currentTarget;
    var form = btn.form || btn.closest('form');
    if (!form) return;

    var nameInput = form.querySelector('input[name="name"]');
    if (nameInput && !nameInput.value.trim()) {
      nameInput.setCustomValidity('Пожалуйста, укажите имя или компанию');
      nameInput.reportValidity();
      var clearName = function () {
        nameInput.setCustomValidity('');
        nameInput.removeEventListener('input', clearName);
      };
      nameInput.addEventListener('input', clearName);
      return;
    }

    var contactInput = form.querySelector('input[name="contact"]');
    if (contactInput && !contactInput.value.trim()) {
      contactInput.setCustomValidity('Пожалуйста, укажите телефон или Telegram');
      contactInput.reportValidity();
      var clearContact = function () {
        contactInput.setCustomValidity('');
        contactInput.removeEventListener('input', clearContact);
      };
      contactInput.addEventListener('input', clearContact);
      return;
    }

    var chips = form.querySelectorAll('input[name="format"]');
    if (chips.length > 0) {
      var anyChecked = Array.prototype.some.call(chips, function (c) { return c.checked; });
      if (!anyChecked) {
        var fieldset = form.querySelector('.chips') || chips[0].closest('fieldset');
        if (fieldset) fieldset.classList.add('has-error');
        var errEl = form.querySelector('.chips-err');
        if (errEl) errEl.style.display = 'block';
        chips[0].setCustomValidity('Пожалуйста, выберите хотя бы один вариант');
        chips[0].reportValidity();
        var clearChips = function () {
          if (Array.prototype.some.call(chips, function (c) { return c.checked; })) {
            if (fieldset) fieldset.classList.remove('has-error');
            if (errEl) errEl.style.display = 'none';
            chips[0].setCustomValidity('');
            Array.prototype.forEach.call(chips, function (c) {
              c.removeEventListener('change', clearChips);
            });
          }
        };
        Array.prototype.forEach.call(chips, function (c) {
          c.addEventListener('change', clearChips);
        });
        return;
      }
    }

    var agreeInput = form.querySelector('input[name="agree"]');
    if (agreeInput && !agreeInput.checked) {
      agreeInput.setCustomValidity('Необходимо согласие на обработку данных');
      agreeInput.reportValidity();
      var clearAgree = function () {
        agreeInput.setCustomValidity('');
        agreeInput.removeEventListener('change', clearAgree);
      };
      agreeInput.addEventListener('change', clearAgree);
      return;
    }

    if (form.reportValidity && !form.reportValidity()) return;

    var data = {};
    new FormData(form).forEach(function (v, k) {
      if (data[k] !== undefined) {
        if (Array.isArray(data[k])) data[k].push(v);
        else data[k] = [data[k], v];
      } else {
        data[k] = v;
      }
    });
    data.page = location.href;
    try {
      var analytics = getAnalyticsData();
      Object.assign(data, analytics);
    } catch (e) {}
    var endpoint = (typeof window !== 'undefined' && window.__LEAD_ENDPOINT__) || LEAD_ENDPOINT || (typeof window !== 'undefined' && window.__BASE_URL__ ? window.__BASE_URL__.replace(/\/$/, '') + '/api/lead' : '/api/lead');
    var label = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Отправляем…';
    fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
      .then(function (r) {
        if (!r.ok) {
          return r.json().then(function (err) { throw new Error(err.error || ('HTTP ' + r.status)); });
        }
        return r.json().catch(function () { return {}; });
      })
      .then(function () {
        btn.disabled = false;
        btn.textContent = label;
        goal('lead_form');
        done(e);
      })
      .catch(function (err) {
        console.error('Submit lead error:', err);
        btn.disabled = false;
        btn.textContent = 'Ошибка отправки — повторить';
      });
  }

  Array.prototype.forEach.call(document.querySelectorAll('*'), function (el) {
    Array.prototype.forEach.call(el.attributes, function (at) {
      var n = at.name, p = at.value;
      if (n.indexOf('data-on-') === 0) {
        el.addEventListener(n.slice(8), function (e) {
          var fn = getp(p);
          if (typeof fn !== 'function') return;
          if (p === 'send') submitLead(e, fn); else fn(e);
        });
      } else if (n === 'data-ref') {
        refs.push([el, p]);
      } else if (n === 'data-if') {
        binds.push({ el: el, kind: 'if', path: p, last: el.style.display !== 'none' });
      } else if (n.indexOf('data-b-') === 0) {
        var kind = n.slice(7);
        var last = kind === 'text' ? el.textContent : (BOOL[kind] ? !!el[BOOL[kind]] : el.getAttribute(kind));
        binds.push({ el: el, kind: kind, path: p, last: last });
      }
    });
  });

  var openedFrom = null;
  var wasOpen = false;

  function update() {
    vals = comp.renderVals();
    binds.forEach(function (b) {
      var v = getp(b.path);
      if (b.kind === 'if' || BOOL[b.kind]) {
        var on = !!v;
        if (on === b.last) return;
        b.last = on;
        if (b.kind === 'if') b.el.style.display = on ? 'contents' : 'none';
        else b.el[BOOL[b.kind]] = on;
        return;
      }
      var s = v == null ? '' : String(v);
      if (s === b.last) return;
      b.last = s;
      if (b.kind === 'text') b.el.textContent = s; else b.el.setAttribute(b.kind, s);
    });
    // Окно кейса: фокус на кнопку закрытия при открытии и обратно — при закрытии.
    var open = !!vals.showCase;
    if (open && !wasOpen) {
      openedFrom = document.activeElement;
      var dlg = document.querySelector('[data-if="showCase"] [role="dialog"]');
      var btn = dlg && dlg.querySelector('button');
      if (btn) btn.focus();
    } else if (!open && wasOpen && openedFrom && openedFrom.focus) {
      openedFrom.focus();
    }
    wasOpen = open;
  }

  refs.forEach(function (r) { var fn = getp(r[1]); if (typeof fn === 'function') fn(r[0]); });
  update();

  // Esc закрывает окно кейса.
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && comp.state.caseOpen >= 0) comp.setState({ caseOpen: -1 });
  });
  // Форма не должна перезагружать страницу по Enter.
  Array.prototype.forEach.call(document.querySelectorAll('form'), function (f) {
    f.addEventListener('submit', function (e) { e.preventDefault(); });
  });
  // Мультилендинг: подмена H1 и подзаголовка по метке ?h=… из объявления (словарь — в <script id="h-swap">).
  var sw = document.getElementById('h-swap');
  if (sw) {
    try {
      var map = JSON.parse(sw.textContent);
      var key = new URLSearchParams(location.search).get('h');
      if (key && map[key]) {
        var h1 = document.querySelector('[data-h1]');
        var sub = document.querySelector('[data-sub]');
        if (h1) h1.textContent = map[key].h1;
        if (sub) sub.textContent = map[key].sub;
      }
    } catch (err) { /* метка не распознана — остаётся основной заголовок */ }
  }
  // Цели Метрики по кликам на телефон и мессенджеры.
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href]');
    if (!a) return;
    var h = a.getAttribute('href');
    if (h.indexOf('tel:') === 0) goal('click_phone');
    else if (/t\.me\/|wa\.me\//.test(h)) goal('click_messenger');
  });
  // Раскрытие карточек форматов на мобильных устройствах
  document.addEventListener('click', function (e) {
    var win = e.target.closest && e.target.closest('.sp .fwin');
    if (!win) {
      if (window.innerWidth <= 640) {
        document.querySelectorAll('.sp .fwin.is-open').forEach(function (el) {
          el.classList.remove('is-open');
        });
        if (document.activeElement && document.activeElement.closest('.sp .fwin')) {
          document.activeElement.blur();
        }
      }
      return;
    }
    if (e.target.closest('a')) return;

    if (window.innerWidth <= 640) {
      if (win.classList.contains('is-open') && e.target.closest('.fmore')) {
        return;
      }
      var wasOpen = win.classList.contains('is-open');
      document.querySelectorAll('.sp .fwin.is-open').forEach(function (el) {
        el.classList.remove('is-open');
      });
      if (document.activeElement && document.activeElement.closest('.sp .fwin')) {
        document.activeElement.blur();
      }
      if (!wasOpen) {
        win.classList.add('is-open');
      }
    }
  });
  // Часы в панели задач кейсов.
  setInterval(update, 30000);
})();
