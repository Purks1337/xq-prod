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
  // { name, contact, service, budget, about, agree, page }.
  var LEAD_ENDPOINT = (typeof window !== 'undefined' && window.__LEAD_ENDPOINT__) || (typeof window !== 'undefined' && window.__BASE_URL__ ? window.__BASE_URL__.replace(/\/$/, '') + '/api/lead' : '/api/lead');
  // Префикс базового URL для корректной загрузки ресурсов на GitHub Pages / подпапках
  var BASE = (typeof window !== 'undefined' && window.__BASE_URL__) ? window.__BASE_URL__.replace(/\/$/, '') + '/' : '';
  // =====================

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
    this.state = { caseOpen: -1, stage: 0, sent: false, showHeroReel: false };
    this.track = null;
    this.teamRow = null;
    this.heroEl = null;
    this.heroS = 0;
    this.heroTarget = 0;
    this.heroRaf = 0;
    this.heroLast = 0;
    this.heroTick = this.heroTick.bind(this);
    this.mqRate = 1;
    this.mqTarget = 1;
    this.mqRaf = 0;
    this.mqTick = this.mqTick.bind(this);
    // 3D-сканы команды по порядку карточек: [модель JSON, текстура JPG]; null — скана пока нет (остаётся каркас).
    this.team3d = [
      [BASE + 'assets/team/mark.json', BASE + 'assets/team/mark.jpg'], // Марк
      [BASE + 'assets/team/anastasia.json', BASE + 'assets/team/anastasia.jpg'], // Анастасия
      [BASE + 'assets/team/sergey.json', BASE + 'assets/team/sergey.jpg'], // Сергей
      [BASE + 'assets/team/denis.json', BASE + 'assets/team/denis.jpg'], // Денис
      [BASE + 'assets/team/svyatoslav.json', BASE + 'assets/team/svyatoslav.jpg'], // Святослав
      [BASE + 'assets/team/oleg.json', BASE + 'assets/team/oleg.jpg'], // Олег
      [BASE + 'assets/team/georgy.json', BASE + 'assets/team/georgy.jpg'], // Георгий
      [BASE + 'assets/team/ilya.json', BASE + 'assets/team/ilya.jpg'], // Илья
      [BASE + 'assets/team/yana.json', BASE + 'assets/team/yana.jpg'], // Яна
      [BASE + 'assets/team/mikhail.json', BASE + 'assets/team/mikhail.jpg'], // Михаил
      [BASE + 'assets/team/darya.json', BASE + 'assets/team/darya.jpg'] // Дарья
    ];
    this.bust = null;
    this.bustRaf = 0;
    this.bustIo = null;
    this.bustIoEl = null;
    this.bustVisible = false;
    this.teamMouse = null;
    this.bustTick = this.bustTick.bind(this);
  }
  componentWillUnmount() {
    if (this.mqRaf) cancelAnimationFrame(this.mqRaf);
    if (this.heroRaf) cancelAnimationFrame(this.heroRaf);
    if (this.bustRaf) cancelAnimationFrame(this.bustRaf);
    if (this.bustIo) this.bustIo.disconnect();
    const B = this.bust;
    this.bust = null;
    if (B && B.gl) { const ext = B.gl.getExtension('WEBGL_lose_context'); if (ext) ext.loseContext(); }
  }
  // ---- 3D-сканы команды ----
  // Один общий WebGL-контекст по очереди рисует каждую голову и копирует кадр в canvas её карточки,
  // поэтому браузер не упирается в лимит контекстов. Все сканы нормализованы: глаза в y=0, глаз→подбородок = 1,
  // камера у всех одна — значит, глаза стоят на одной линии во всех карточках.
  bustObserve(el) {
    if (!el || this.bustIoEl === el) return;
    if (this.bustIo) this.bustIo.disconnect();
    this.bustIoEl = el;
    if (typeof IntersectionObserver === 'undefined') { this.bustVisible = true; this.bustInit(); this.bustStart(); return; }
    this.bustIo = new IntersectionObserver((entries) => {
      this.bustVisible = entries.some((en) => en.isIntersecting);
      if (this.bustVisible) { this.bustInit(); this.bustStart(); }
    }, { rootMargin: '500px 0px' });
    this.bustIo.observe(el);
  }
  bustInit() {
    if (this.bust) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const glc = document.createElement('canvas');
    glc.width = Math.round(300 * dpr);
    glc.height = Math.round(360 * dpr);
    let gl = null;
    try { gl = glc.getContext('webgl', { antialias: true, alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: true }); } catch (err) { gl = null; }
    if (!gl) { this.bust = { off: true }; return; }
    const VS = 'attribute vec3 aP;attribute vec2 aT;attribute vec3 aN;uniform mat4 uM;uniform mat4 uVP;varying vec2 vT;varying vec3 vN;varying float vNormY;void main(){vT=aT;vN=mat3(uM)*aN;vec4 p=uVP*uM*vec4(aP,1.0);vNormY=(p.y/p.w)*0.5+0.5;gl_Position=p;}';
    const FS = 'precision mediump float;uniform sampler2D uTex;varying vec2 vT;varying vec3 vN;varying float vNormY;void main(){vec3 n=normalize(vN);vec3 L=normalize(vec3(-0.35,0.45,0.85));float d=max(dot(n,L),0.0);vec3 b=texture2D(uTex,vT).rgb;vec3 c=b*(0.62+0.5*d);float rim=pow(1.0-max(n.z,0.0),3.0);c+=vec3(0.2,0.34,0.96)*rim*0.55;float a=clamp((vNormY-0.25)/0.15,0.0,1.0);gl_FragColor=vec4(c*a,a);}';
    const sh = (type, src) => { const o = gl.createShader(type); gl.shaderSource(o, src); gl.compileShader(o); return o; };
    const p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, VS));
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { this.bust = { off: true }; return; }
    gl.useProgram(p);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.getExtension('OES_element_index_uint');
    const B = {
      off: false, gl: gl, glc: glc, w: glc.width, h: glc.height, models: {},
      aP: gl.getAttribLocation(p, 'aP'), aT: gl.getAttribLocation(p, 'aT'), aN: gl.getAttribLocation(p, 'aN'),
      uM: gl.getUniformLocation(p, 'uM'), uVP: gl.getUniformLocation(p, 'uVP'),
      reduce: window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null
    };
    this.bust = B;
    glc.addEventListener('webglcontextlost', (ev) => { ev.preventDefault(); B.off = true; });
    this.team3d.forEach((src, j) => { if (src) this.bustLoad(B, j, src); });
  }
  bustLoad(B, j, src) {
    const b64 = (s, T) => { const bin = atob(s); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); return new T(u8.buffer); };
    const loadImg = (blob) => new Promise((res, rej) => {
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); res(img); };
      img.onerror = (err) => { URL.revokeObjectURL(url); rej(err); };
      img.src = url;
    });
    Promise.all([
      fetch(src[0]).then((r) => { if (!r.ok) throw new Error('model ' + r.status); return r.json(); }),
      fetch(src[1]).then((r) => { if (!r.ok) throw new Error('texture ' + r.status); return r.blob(); }).then(loadImg)
    ]).then((res) => {
      if (this.bust !== B || B.off) return;
      const data = res[0], img = res[1], gl = B.gl;
      const buf = (arr, tgt) => { const o = gl.createBuffer(); gl.bindBuffer(tgt, o); gl.bufferData(tgt, arr, gl.STATIC_DRAW); return o; };
      const isU32 = !!data.idx32 || (data.n > 65535);
      const idx = b64(data.idx, isU32 ? Uint32Array : Uint16Array);
      const m = {
        c: data.c, r: data.r, count: idx.length,
        idxType: isU32 ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT,
        pos: buf(b64(data.pos, Int16Array), gl.ARRAY_BUFFER),
        uv: buf(b64(data.uv, Uint16Array), gl.ARRAY_BUFFER),
        nor: buf(b64(data.nor, Int8Array), gl.ARRAY_BUFFER),
        idx: buf(idx, gl.ELEMENT_ARRAY_BUFFER),
        tex: gl.createTexture(),
        yaw: 0, pitch: 0, phase: j * 1.7, cv: null
      };
      gl.bindTexture(gl.TEXTURE_2D, m.tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      B.models[j] = m;
      this.bustStart();
    }).catch(() => {});
  }
  bustDraw(B, m) {
    const gl = B.gl;
    const mul = (a, b) => { const o = new Float32Array(16); for (let i = 0; i < 4; i++) for (let k = 0; k < 4; k++) { let s = 0; for (let q = 0; q < 4; q++) s += a[q * 4 + k] * b[i * 4 + q]; o[i * 4 + k] = s; } return o; };
    const T = (x, y, z) => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]);
    const S = (s) => new Float32Array([s, 0, 0, 0, 0, s, 0, 0, 0, 0, s, 0, 0, 0, 0, 1]);
    const RY = (a) => { const c = Math.cos(a), s = Math.sin(a); return new Float32Array([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]); };
    const RX = (a) => { const c = Math.cos(a), s = Math.sin(a); return new Float32Array([1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]); };
    const P = (fov, asp, n, f) => { const t = 1 / Math.tan(fov / 2); return new Float32Array([t / asp, 0, 0, 0, 0, t, 0, 0, 0, 0, (f + n) / (n - f), -1, 0, 0, 2 * f * n / (n - f), 0]); };
    // Поворот вокруг центра головы (0, -0.4, 0); камера одна на всех — глаза на одной высоте.
    let M = mul(T(m.c[0], m.c[1], m.c[2]), S(m.r));
    M = mul(T(0, 0.4, 0), M);
    M = mul(RX(m.pitch), M);
    M = mul(RY(m.yaw), M);
    M = mul(T(0, -0.4, 0), M);
    const VP = mul(P(0.38, B.w / B.h, 0.1, 100), T(0, 1.15, -15.9));
    gl.viewport(0, 0, B.w, B.h);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.uniformMatrix4fv(B.uM, false, M);
    gl.uniformMatrix4fv(B.uVP, false, VP);
    gl.bindBuffer(gl.ARRAY_BUFFER, m.pos); gl.enableVertexAttribArray(B.aP); gl.vertexAttribPointer(B.aP, 3, gl.SHORT, true, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, m.uv); gl.enableVertexAttribArray(B.aT); gl.vertexAttribPointer(B.aT, 2, gl.UNSIGNED_SHORT, true, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, m.nor); gl.enableVertexAttribArray(B.aN); gl.vertexAttribPointer(B.aN, 3, gl.BYTE, true, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, m.idx);
    gl.bindTexture(gl.TEXTURE_2D, m.tex);
    gl.drawElements(gl.TRIANGLES, m.count, m.idxType || gl.UNSIGNED_SHORT, 0);
  }
  bustStart() {
    const B = this.bust;
    if (this.bustRaf || !B || B.off || !this.bustVisible) return;
    this.bustRaf = requestAnimationFrame(this.bustTick);
  }
  // Каждый кадр: под курсором — голова смотрит на курсор, без курсора — медленно покачивается.
  // Если угол не изменился, карточка не перерисовывается.
  bustTick(now) {
    this.bustRaf = 0;
    const B = this.bust;
    if (!B || B.off || !this.bustVisible) return;
    const row = this.teamRow;
    if (row) {
      const cards = row.querySelectorAll('.member');
      const ms = row.classList.contains('following') ? this.teamMouse : null;
      const still = B.reduce ? B.reduce.matches : false;
      const D2R = Math.PI / 180;
      const sec = now / 1000;
      cards.forEach((card, j) => {
        const m = B.models[j];
        if (!m) return;
        const cv = card.querySelector('.bustcv');
        if (!cv) return;
        let ty = 0, tp = 0;
        if (ms) {
          const r = cv.getBoundingClientRect();
          const dx = ms.x - (r.left + r.width / 2);
          const dy = ms.y - (r.top + r.height * 0.31);
          ty = Math.max(-55, Math.min(55, dx / 5)) * D2R;
          tp = Math.max(-16, Math.min(16, dy / 9)) * D2R;
        } else if (!still) {
          ty = 24 * D2R * Math.sin(sec * 0.62 + m.phase);
          tp = 3 * D2R * Math.sin(sec * 0.47 + m.phase * 1.3);
        }
        const k = ms ? 0.18 : 0.06;
        const ny = m.yaw + (ty - m.yaw) * k;
        const np = m.pitch + (tp - m.pitch) * k;
        const fresh = m.cv !== cv;
        if (!fresh && Math.abs(ny - m.yaw) < 1e-4 && Math.abs(np - m.pitch) < 1e-4) return;
        m.yaw = ny;
        m.pitch = np;
        if (cv.width !== B.w || cv.height !== B.h) { cv.width = B.w; cv.height = B.h; }
        this.bustDraw(B, m);
        const ctx = cv.getContext('2d');
        ctx.clearRect(0, 0, cv.width, cv.height);
        ctx.drawImage(B.glc, 0, 0);
        if (fresh) { m.cv = cv; cv.classList.add('ready'); card.classList.add('scanned'); }
      });
    }
    this.bustRaf = requestAnimationFrame(this.bustTick);
  }
  // «Рыбий глаз» как в доке macOS: точка под курсором остаётся на месте,
  // карточка под ней расширяется, соседи плавно сжимаются. f — доля ширины ряда (0..1).
  teamFisheye(f) {
    const row = this.teamRow;
    if (!row || (window.matchMedia && window.matchMedia('(max-width: 820px)').matches)) return;
    const items = row.querySelectorAll('.member');
    const n = items.length;
    if (!n) return;
    f = Math.min(0.999, Math.max(0.001, f));
    const D = 2.6;
    const g = (x) => (D + 1) * x / (D * x + 1);
    const map = (b) => (b >= f ? f + (1 - f) * g((b - f) / (1 - f)) : f - f * g((f - b) / f));
    const active = Math.min(n - 1, Math.floor(f * n));
    let prev = 0;
    items.forEach((el, j) => {
      const end = j === n - 1 ? 1 : map((j + 1) / n);
      el.style.flex = '0 0 ' + (Math.max(0, end - prev) * 100).toFixed(3) + '%';
      prev = end;
      if (j === active) el.classList.add('active'); else el.classList.remove('active');
    });
  }
  teamReset() {
    const row = this.teamRow;
    if (!row) return;
    row.querySelectorAll('.member').forEach((el) => { el.style.flex = ''; el.classList.remove('active'); });
  }
  // Маршрут по дороге карты (в клетках 40×18). Точки с чётным индексом — этапы 0..6.
  heroRoute() {
    if (!this._route) {
      const P = [[3, 16], [12, 16], [12, 12], [12, 9], [16, 9], [20, 9], [20, 11.5], [20, 14], [26, 14], [29, 14], [29, 10.5], [29, 8], [37, 8]];
      const cum = [0];
      for (let k = 1; k < P.length; k++) cum.push(cum[k - 1] + Math.hypot(P[k][0] - P[k - 1][0], P[k][1] - P[k - 1][1]));
      this._route = { P: P, cum: cum };
    }
    return this._route;
  }
  heroPos(s) {
    const r = this.heroRoute();
    let k = 0;
    while (k < r.cum.length - 2 && s > r.cum[k + 1]) k++;
    const seg = r.cum[k + 1] - r.cum[k] || 1;
    const t = Math.max(0, Math.min(1, (s - r.cum[k]) / seg));
    return [r.P[k][0] + (r.P[k + 1][0] - r.P[k][0]) * t, r.P[k][1] + (r.P[k + 1][1] - r.P[k][1]) * t];
  }
  heroPlace(s) {
    const el = this.heroEl;
    if (!el) return;
    const p = this.heroPos(s);
    el.style.left = (p[0] / 40 * 100).toFixed(3) + '%';
    el.style.top = (p[1] / 18 * 100).toFixed(3) + '%';
  }
  heroGo(stage) {
    const r = this.heroRoute();
    this.heroTarget = r.cum[stage * 2];
    const el = this.heroEl;
    if (!el) return;
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.heroS = this.heroTarget; this.heroPlace(this.heroS); return;
    }
    if (this.heroS === this.heroTarget) return;
    el.classList.add('running');
    if (!this.heroRaf) { this.heroLast = 0; this.heroRaf = requestAnimationFrame(this.heroTick); }
  }
  heroTick(ts) {
    const el = this.heroEl;
    const dt = this.heroLast ? Math.min(0.05, (ts - this.heroLast) / 1000) : 0.016;
    this.heroLast = ts;
    const speed = 8; // клеток в секунду
    const before = this.heroPos(this.heroS);
    const d = this.heroTarget - this.heroS;
    this.heroS = Math.abs(d) <= speed * dt ? this.heroTarget : this.heroS + Math.sign(d) * speed * dt;
    const after = this.heroPos(this.heroS);
    if (el) {
      if (after[0] - before[0] < -0.0005) el.classList.add('flip');
      else if (after[0] - before[0] > 0.0005) el.classList.remove('flip');
      this.heroPlace(this.heroS);
    }
    if (this.heroS === this.heroTarget) {
      if (el) { el.classList.remove('running'); el.classList.remove('flip'); }
      this.heroRaf = 0;
    } else {
      this.heroRaf = requestAnimationFrame(this.heroTick);
    }
  }
  mqSet(target) {
    this.mqTarget = target;
    if (!this.mqRaf) this.mqRaf = requestAnimationFrame(this.mqTick);
  }
  mqTick() {
    this.mqRate += (this.mqTarget - this.mqRate) * 0.12;
    if (Math.abs(this.mqTarget - this.mqRate) < 0.02) this.mqRate = this.mqTarget;
    const anims = this.track && this.track.getAnimations ? this.track.getAnimations() : [];
    anims.forEach((a) => { a.playbackRate = this.mqRate; });
    this.mqRaf = this.mqRate !== this.mqTarget ? requestAnimationFrame(this.mqTick) : 0;
  }
  renderVals() {
    const self = this;
    const stage = this.state.stage;
    const CASES = [
      {
        kinescopeId: 'apkWJSgEJoRMNfrroPHyAF',
        file: 'yandex_plus_live.mp4',
        cat: 'ТРАНСЛЯЦИЯ',
        title: 'Яндекс Плюс × матч сборной России',
        sub: 'Многокамерный прямой эфир матч-дня со звёздами и игроками',
        time: '01:12',
        img: BASE + 'assets/img/cases/yandex-plus.jpg',
        alt: 'Прямой эфир Яндекс Плюс: студия матча сборной России',
        task: 'Провести живой эфир матч-дня для аудитории Яндекс Плюс — со звёздами и игроками сборной: Вася Вписка, Карен Аданян, Александр Максименко, Матвей Кисляк, Алексей Хрущев. Переснять нельзя, всё решается в моменте.',
        sol: 'На площадке работала команда из 10 человек: 5 операторов, режиссёр трансляции, звукорежиссёр, гаффер, осветитель и инженер.',
        res: 'Эфир прошёл без единого сбоя и строго по стандартам Яндекса. Собрали картинку, которая держала зрителя от первой минуты до финального свистка.'
      },
      {
        kinescopeId: 'bP76PynKdWHrdwDZbjthUZ',
        file: 'drink_creative.mp4',
        cat: 'РЕКЛАМА',
        title: '«Содержимое придумайте сами»',
        sub: 'Рекламный ролик напитка: неделя от идеи до сдачи',
        time: '00:45',
        img: 'https://edge-dallas-1.kinescopecdn.net/b4a16b74-9883-4d55-8a44-6b446eb2b4c8/posters/cd548123-5312-4f62-8a9e-d0572141e559/poster_lg/019a30a9-a59a-7698-85e5-077e6435c8ee.jpg',
        alt: 'Рекламный ролик напитка «Содержимое придумайте сами»',
        task: 'Сделать рекламу уровня большого бренда всего за неделю и на минимальном бюджете.',
        sol: 'Безымянная бутылка, точный свет, вода, стекло и макросъёмка — ни одного кадра, за который стыдно.',
        res: 'Доказали, что дорогая картинка начинается не с суммы в смете, а с того, как поставлен свет и выстроен кадр.'
      },
      {
        kinescopeId: 'xaGqACBAjVGxWWzAYQrNCi',
        file: 'vetliga_review.mp4',
        cat: 'РЕКЛАМА',
        title: 'Vetliga: обзор оборудования',
        sub: 'Презентационный ролик для B2B-продаж',
        time: '01:45',
        img: 'https://edge-dallas-1.kinescopecdn.net/b4a16b74-9883-4d55-8a44-6b446eb2b4c8/posters/846d2b46-b1a6-4a4d-bfe8-1fc726a6e917/poster_lg/01a1447b-870e-7837-baf2-c13c2374dd24.jpg',
        alt: 'Vetliga: обзор ветеринарного оборудования',
        task: 'Показать технику, которую сложно продать по фотографии в каталоге: функционал понятен, только когда видишь её в реальной работе.',
        sol: 'Собрали рекламно-презентационное видео, показывающее узлы в работе, главные преимущества и простоту управления без затянутых пауз.',
        res: 'Менеджеры отправляют ролик клиентам вместо получасового созвона — он снимает базовые вопросы и доводит до заявки.'
      },
      {
        kinescopeId: 'uHyCrR3Qzr3iG3XKp6AwtM',
        file: 'dlb_ai_clip.mp4',
        cat: 'AI-ВИДЕО',
        title: 'Шоурил AI-генераций и клип dlb',
        sub: '3D-сканы артистов в сгенерированных мирах',
        time: '01:30',
        img: 'https://edge-dallas-1.kinescopecdn.net/b4a16b74-9883-4d55-8a44-6b446eb2b4c8/posters/84f01c8d-7774-4c5d-af5c-38e5101a9010/poster_lg/01a1447e-819d-7313-976d-f35cc07de221.jpg',
        alt: 'Шоурил AI-генераций и клип dlb',
        task: 'Показать миры, которые невозможно или слишком дорого снять камерой.',
        sol: 'Отсканировали артистов группы dlb в 3D и поместили их цифровые аватары внутрь игровой вселенной через AI и CGI.',
        res: 'Нестандартная задача даже по меркам AI-продакшена — клиент принял результат с первого раза и без единой правки.'
      },
      {
        kinescopeId: 'b2cDjUfESLQUpa3LLbZ5LZ',
        file: 'cosmetics_product.mp4',
        cat: 'РЕКЛАМА',
        title: 'Косметика: продуктовый ролик',
        sub: 'Один съёмочный день, две недели подготовки',
        time: '00:45',
        img: 'https://edge-dallas-1.kinescopecdn.net/b4a16b74-9883-4d55-8a44-6b446eb2b4c8/posters/6e52e901-510a-470a-8a7f-aa6c431a6451/poster_lg/f214644a-bff3-4a96-ac42-a358cfe2c444.jpg',
        alt: 'Косметика: продуктовый рекламный ролик',
        task: 'Снять косметику так, чтобы продукт на экране выглядел дороже, чем на полке.',
        sol: 'Две недели препродакшна: раскадровка, тесты света, подбор фактур, отработка каждого микродвижения. Сама съёмка заняла один день без импровизаций.',
        res: 'Кинематографичная картинка для сайта бренда, маркетплейсов и таргетированной рекламы.'
      },
      {
        kinescopeId: 'oYZx7Qd5NUSAi7s3cNGS5d',
        file: 'dance_school_doc.mp4',
        cat: 'ДОКУМЕНТАЛЬНОЕ',
        title: 'Школа хореографии',
        sub: 'Документальный фильм к юбилею школы',
        time: '04:10',
        img: 'https://edge-dallas-1.kinescopecdn.net/b4a16b74-9883-4d55-8a44-6b446eb2b4c8/posters/b837c9a2-cd44-45b6-9209-f1ecf3106334/poster_lg/01a1447a-123a-705e-af48-18919183c4a7.jpg',
        alt: 'Документальный фильм о школе хореографии',
        task: 'Уйти от протокольного отчёта к фильму, который по-настоящему тронет зрителей к юбилею школы.',
        sol: 'Искренние интервью педагогов, отдавших школе десятилетия, и детей, которые приходят в зал раньше родителей. Плюс пластика танца.',
        res: 'На премьере в зале плакали. Видео стало историей, которую пересматривают годами.'
      },
      {
        kinescopeId: 'jicVUoBtLdkRD8Qd2G3jYN',
        file: 'medliga_hospital.mp4',
        cat: 'ИМИДЖЕВЫЙ',
        title: 'Medliga: больница в Новосибирске',
        sub: 'Кейс-фильм о новом оборудовании в действующей клинике',
        time: '02:30',
        img: 'https://edge-dallas-1.kinescopecdn.net/b4a16b74-9883-4d55-8a44-6b446eb2b4c8/posters/8f0db9d3-64f9-4af9-8d5e-45652042992f/poster_lg/01a14483-e013-722e-9d67-a28f643fcc60.jpg',
        alt: 'Medliga: фильм о новом оборудовании в больнице Новосибирска',
        task: 'Показать, как новое медицинское оборудование меняет работу клиники — не в формате пресс-релиза, а через живых врачей.',
        sol: 'Снимали в действующей больнице, не нарушая графика операций и приёма. В центре истории — люди, которые на нём работают.',
        res: 'Кейс отлично работает и для привлечения новых заказчиков медицинского оборудования, и как отчёт перед регионом.'
      }
    ];
    const open = (i) => () => self.setState({ caseOpen: i });
    const fc = CASES[0];
    const grid = CASES.slice(1).map((c, k) => Object.assign({}, c, {
      hasImg: !!c.img, noImg: !c.img, open: open(k + 1), aria: 'Открыть кейс: ' + c.title
    }));
    const raised = 'inset -1px -1px 0 #0A0A0A, inset 1px 1px 0 #FFFFFF, inset -2px -2px 0 #7B7B7B, inset 2px 2px 0 #DFDFDF';
    const sunken = 'inset 1px 1px 0 #0A0A0A, inset -1px -1px 0 #FFFFFF, inset 2px 2px 0 #7B7B7B, inset -2px -2px 0 #DFDFDF';
    const tasks = CASES.map((c, i) => ({
      title: c.title,
      open: open(i),
      style: 'flex: 0 0 auto; max-width: 220px; height: 44px; padding: 0 12px; border: 0; background: ' + (this.state.caseOpen === i ? '#E4E3DE' : '#C3C3C3') + '; color: #1B1B1B; font-family: inherit; font-weight: 700; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; cursor: pointer; box-shadow: ' + (this.state.caseOpen === i ? sunken : raised)
    }));
    const showCase = this.state.caseOpen >= 0;
    const curCase = showCase ? CASES[this.state.caseOpen] : CASES[0];
    const dlg = Object.assign({}, curCase, {
      embedUrl: showCase ? 'https://kinescope.io/embed/' + curCase.kinescopeId + '?autoplay=1' : '',
      kinescopeUrl: 'https://kinescope.io/' + curCase.kinescopeId
    });

    const ticker = [];
    const words = ['ИМИДЖЕВЫЕ РОЛИКИ', 'РЕКЛАМА', 'AI-ВИДЕО', 'ДОКУМЕНТАЛЬНОЕ КИНО', '3D-РОЛИКИ', 'ОНЛАЙН-ТРАНСЛЯЦИИ'];
    for (let r = 0; r < 2; r++) words.forEach((w) => ticker.push(w));

    const L = [
      { name: 'КАМАЗ', img: BASE + 'assets/img/logos/kamaz.svg' },
      { name: 'MEDLIGA', img: BASE + 'assets/img/logos/medliga.svg', c: true },
      { name: 'Газпром', img: BASE + 'assets/img/logos/gazprom.svg' },
      { name: 'Пятёрочка', img: BASE + 'assets/img/logos/pyaterochka.svg' },
      { name: 'Фестиваль «Пляж»', img: BASE + 'assets/img/logos/plyazh.svg' },
      { name: 'КХЛ', img: BASE + 'assets/img/logos/khl.svg' },
      { name: 'СИБУР', img: BASE + 'assets/img/logos/sibur.svg' },
      { name: 'Свердловская киностудия', img: BASE + 'assets/img/logos/kinostudia.svg' },
      { name: 'Сбер', img: BASE + 'assets/img/logos/sber.svg' },
      { name: 'LADA', img: BASE + 'assets/img/logos/lada.svg' },
      { name: 'ESOX', img: BASE + 'assets/img/logos/esox.svg' },
      { name: 'Брусника', img: BASE + 'assets/img/logos/brusnika.svg' },
      { name: 'Atlas Development', img: BASE + 'assets/img/logos/atlas.svg' },
      { name: 'VETLIGA', img: BASE + 'assets/img/logos/vetliga.svg', c: true },
      { name: 'Т-Банк', img: BASE + 'assets/img/logos/tbank.svg' },
      { name: 'РЖД', img: BASE + 'assets/img/logos/rjd.svg' },
      { name: 'Синара', img: BASE + 'assets/img/logos/sinara.svg' },
      { name: 'Ростелеком', img: BASE + 'assets/img/logos/rostelekom.svg' },
      { name: 'Changan', img: BASE + 'assets/img/logos/changan.svg' },
      { name: 'МХЛ', img: BASE + 'assets/img/logos/jhl.svg' },
      { name: 'Netflix', img: BASE + 'assets/img/logos/netflix.svg' },
      { name: '100+ TechnoBuild', img: BASE + 'assets/img/logos/100plus.svg' },
      { name: 'FIDE', img: BASE + 'assets/img/logos/fide.svg' },
      { name: 'Speedsoft', img: BASE + 'assets/img/logos/speedsoft.svg' },
      { name: 'Ural Motorsport', img: BASE + 'assets/img/logos/uralmotorsport.svg' },
      { name: 'Ural Music Night', img: BASE + 'assets/img/logos/uralmusicnight.svg' }
    ];
    const logos = [];
    for (let r = 0; r < 2; r++) L.forEach((l) => logos.push({
      name: l.name, img: l.img || '', hasImg: !!l.img, noImg: !l.img,
      hasCase: false, nda: false, ah: r === 0 ? 'false' : 'true', tab: r === 0 ? '0' : '-1'
    }));

    const ST = [
      { num: '▶', label: 'СТАРТ', x: 7.5, y: 88.9, who: 'ПРОДЮСЕР', title: 'Заявка', time: '', text: 'Оставьте заявку или напишите в Telegram. Созвонимся и разберёмся в задаче.' },
      { num: '1', label: 'БРИФ', x: 30, y: 66.7, who: 'ПРОДЮСЕР', title: 'Бриф и концепция', time: '1–3 ДНЯ', text: 'Разбираем цель ролика и предлагаем 2–3 идеи. Сразу считаем смету по сменам — видно, за что вы платите.' },
      { num: '2', label: 'ПРЕДПРОДАКШН', x: 40, y: 50, who: 'РЕЖИССЁР', title: 'Препродакшн', time: '3–7 ДНЕЙ', text: 'Пишем сценарий, рисуем раскадровку, ищем локации и актёров. Если нужно — согласуем допуск на объект.' },
      { num: '3', label: 'СЪЁМКА', x: 50, y: 63.9, who: 'ОПЕРАТОР', title: 'Съёмка', time: '1–5 ДНЕЙ', text: 'Выезжаем с группой, светом и техникой на локацию. 3D-отдел параллельно начинает работу.' },
      { num: '4', label: 'ПОСТПРОДАКШН', x: 65, y: 77.8, who: 'МОНТАЖЁР', title: 'Монтаж, графика, звук', time: '5–10 ДНЕЙ', text: 'Монтаж, цвет, звук, 3D и ИИ-сцены. Показываем черновик и вносим правки.' },
      { num: '5', label: 'СДАЧА', x: 72.5, y: 58.3, who: 'ПРОДЮСЕР', title: 'Сдача', time: '1–2 ДНЯ', text: 'Отдаём мастер-ролик, вертикальные версии для соцсетей и документы на права.' },
      { num: '★', label: 'ФИНИШ', x: 92.5, y: 44.4, who: 'КОМАНДА', title: 'Ролик в эфире', time: '', text: 'Готово. Теперь вас хвалят.' }
    ];
    const nodes = ST.map((s, i) => {
      const passed = i < stage, cur = i === stage;
      const bg = cur ? '#3358F4' : (passed ? '#D4A54C' : '#1B1B1B');
      const fg = cur ? '#FFFFFF' : (passed ? '#1B1B1B' : '#FFFFFF');
      const ring = cur ? '0 0 0 5px rgba(51,88,244,0.45), ' : '';
      return {
        num: s.num, label: s.label,
        aria: 'Этап: ' + s.title,
        go: () => { self.setState({ stage: i }); self.heroGo(i); },
        wrap: 'position: absolute; left: ' + s.x + '%; top: ' + s.y + '%; transform: translate(-50%, -22px); display: flex; flex-direction: column; align-items: center; gap: 4px; z-index: 2',
        btn: 'width: 44px; height: 44px; display: flex; align-items: center; justify-content: center; padding: 0; border: 3px solid #FFFFFF; background: ' + bg + '; color: ' + fg + '; font-family: Unbounded, sans-serif; font-weight: 900; font-size: 18px; cursor: pointer; box-shadow: ' + ring + '4px 4px 0 #1B1B1B'
      };
    });
    const pts = (arr) => arr.map((s) => (s.x * 10) + ',' + (s.y * 4.4)).join(' ');
    const allPoints = pts(ST);
    const donePoints = pts(ST.slice(0, stage + 1));
    const curS = ST[stage];
    const tokenStyle = 'position: absolute; left: ' + curS.x + '%; top: ' + curS.y + '%; width: 0; height: 0; z-index: 3';
    const st = { who: curS.who, title: curS.title, time: curS.time, hasTime: !!curS.time, text: curS.text };
    const passed = Math.max(0, Math.min(5, stage - 1));
    const last = ST.length - 1;
    const prevDisabled = stage === 0;
    const prevStyle = 'min-height: 44px; padding: 0 18px; border: 2px solid #E4E3DE; background: transparent; color: #E4E3DE; font-family: JetBrains Mono, monospace; font-weight: 700; font-size: 14px; letter-spacing: 0.06em; cursor: ' + (prevDisabled ? 'default' : 'pointer') + '; opacity: ' + (prevDisabled ? '0.4' : '1');

    // Команда: ширины карточек считает «рыбий глаз» по положению курсора в ряду (teamFisheye),
    // поэтому курсор проходит по людям строго по порядку, без перескоков.
    const teamLayout = () => ({
      layer: 'position: absolute; top: 0; bottom: 0; left: 4px; right: 4px; display: block; overflow: hidden; pointer-events: none; background-color: #2A2A2A; background-image: radial-gradient(rgba(185,198,251,0.16) 1px, transparent 1.3px); background-size: 10px 10px; transition: background-color .3s, box-shadow .3s',
      chip: 'position: absolute; top: 10px; left: 50%; transform: translateX(-50%); z-index: 2; padding: 2px 6px; border: 1px solid #B9C6FB; color: #B9C6FB; font-family: JetBrains Mono, monospace; font-weight: 700; font-size: 10px; letter-spacing: 0.1em',
      // Каркас для тех, кого ещё не отсканировали: увеличен и сдвинут так, чтобы его «глаза» были на той же линии, что у сканов.
      bpos: 'position: absolute; left: 50%; top: 10px; width: 0; height: 0; display: block; perspective: 700px; transform-style: preserve-3d; transform: scale(1.25); transform-origin: 0 62px',
      vname: 'position: absolute; left: 50%; bottom: 18px; transform: translateX(-50%) rotate(180deg); writing-mode: vertical-rl; white-space: nowrap; font-weight: 800; font-size: 17px; letter-spacing: 0.02em; color: #E4E3DE'
    });
    const d = new Date();
    const pad = (n) => (n < 10 ? '0' : '') + n;

    // Услуги → AI-видео: сетка 13×13 «шумных» пикселей; при наведении проявляется звезда из логотипа.
    // Шум детерминированный (хэш от индекса), чтобы картинка не менялась при перерисовке.
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
        pix.push({
          on: on ? '1' : '0',
          st: 'opacity: ' + (0.15 + h * 0.7).toFixed(2) + '; background: ' + (on || h2 > 0.55 ? '#B9C6FB' : '#3358F4') + '; transition-delay: ' + delay + 'ms; animation-delay: -' + (h2 * 1.8).toFixed(2) + 's'
        });
      }
    }

    return {
      fc: fc, grid: grid, tasks: tasks, showCase: showCase, dlg: dlg,
      openFeatured: open(0),
      closeCase: () => self.setState({ caseOpen: -1 }),
      showHeroReel: !!this.state.showHeroReel,
      heroReelUrl: this.state.showHeroReel ? 'https://kinescope.io/embed/nEadicVPUJhzLd4uRqTCZy?autoplay=1' : '',
      playShowreel: () => self.setState({ showHeroReel: true }),
      ticker: ticker, logos: logos, pix: pix,
      // Шоурил следит за курсором: окно наклоняется к нему, кадр и звезда сдвигаются в противофазе, кнопка «притягивается».
      heroMove: (e) => {
        if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        const sec = e.currentTarget;
        const win = sec.querySelector('.reelwin');
        if (!win) return;
        const r = win.getBoundingClientRect();
        const nx = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / (window.innerWidth / 2)));
        const ny = Math.max(-1, Math.min(1, (e.clientY - (r.top + r.height / 2)) / (window.innerHeight / 2)));
        win.style.transform = 'perspective(1100px) rotateY(' + (nx * 9).toFixed(2) + 'deg) rotateX(' + (-ny * 7).toFixed(2) + 'deg) translate3d(' + (nx * 8).toFixed(1) + 'px,' + (ny * 6).toFixed(1) + 'px,0)';
        win.style.boxShadow = 'inset -1px -1px 0 #0A0A0A, inset 1px 1px 0 #FFFFFF, inset -2px -2px 0 #7B7B7B, inset 2px 2px 0 #DFDFDF, ' + (12 - nx * 10).toFixed(1) + 'px ' + (12 - ny * 10).toFixed(1) + 'px 0 #3358F4';
        const img = sec.querySelector('.reelimg');
        if (img) img.style.transform = 'scale(1.1) translate(' + (-nx * 14).toFixed(1) + 'px,' + (-ny * 10).toFixed(1) + 'px)';
        const play = sec.querySelector('.reelplay');
        if (play) play.style.transform = 'translate(-50%, -50%) translate(' + (nx * 16).toFixed(1) + 'px,' + (ny * 12).toFixed(1) + 'px)';
        const star = sec.querySelector('.herostar');
        if (star) star.style.transform = 'translate(' + (-nx * 26).toFixed(1) + 'px,' + (-ny * 20).toFixed(1) + 'px) rotate(' + (nx * 24).toFixed(1) + 'deg)';
      },
      heroLeave: (e) => {
        const sec = e.currentTarget;
        ['.reelwin', '.reelimg', '.reelplay', '.herostar'].forEach((s) => {
          const el = sec.querySelector(s);
          if (el) { el.style.transform = ''; el.style.boxShadow = ''; }
        });
      },
      team: [
        { name: 'Марк', role: 'CEO · РЕЖИССЁР', bio: 'Ведёт компанию и режиссирует проекты.' },
        { name: 'Анастасия', role: 'ГЕНЕРАЛЬНЫЙ ПРОДЮСЕР', bio: 'Смета, договор и весь путь проекта — от брифа до сдачи.' },
        { name: 'Сергей', role: 'ОПЕРАЦИОННЫЙ ДИРЕКТОР · ЗВУКОРЕЖИССЁР', bio: 'Процессы внутри команды и звук: запись, чистка, сведение.' },
        { name: 'Денис', role: 'ТЕХНИЧЕСКИЙ ДИРЕКТОР', bio: 'Техника и съёмочные группы на каждом проекте.' },
        { name: 'Святослав', role: 'СЦЕНАРИСТ', bio: 'Сценарии — от рекламного ролика до документального фильма.' },
        { name: 'Олег', role: 'ДИЗАЙНЕР', bio: 'Графический дизайн, веб-дизайн, разработка сайтов.' },
        { name: 'Георгий', role: '3D-ГЕНЕРАЛИСТ', bio: '3D-графика, анаморфы и всё, что не снять камерой.' },
        { name: 'Илья', role: 'РЕЖИССЁР МОНТАЖА', bio: 'Собирает из отснятого ролик, который смотрят до конца.' },
        { name: 'Яна', role: 'SMM-МЕНЕДЖЕР', bio: 'Ведет наши соц сети' },
        { name: 'Михаил', role: 'МАРКЕТОЛОГ', bio: 'Реклама, продвижение и продажи.' },
        { name: 'Дарья', role: 'AI CREATOR', bio: 'Ролики и визуал, созданные с помощью нейросетей.' }
      ].map((m, i, arr) => Object.assign({}, m, teamLayout(), {
        hasModel: !!self.team3d[i],
        noModel: !self.team3d[i],
        focus: () => self.teamFisheye((i + 0.5) / arr.length)
      })),
      setTeamRow: (el) => { self.teamRow = el; if (el) self.bustObserve(el); },
      teamMove: (e) => {
        const row = self.teamRow;
        if (!row) return;
        self.teamMouse = { x: e.clientX, y: e.clientY };
        const rr = row.getBoundingClientRect();
        self.teamFisheye((e.clientX - rr.left) / Math.max(1, rr.width));
        if (!row.classList.contains('following')) row.classList.add('following');
        row.querySelectorAll('.bust').forEach((b) => {
          const r = b.parentElement.getBoundingClientRect();
          const dx = e.clientX - (r.left + r.width / 2);
          const dy = e.clientY - (r.top + 70);
          const ry = Math.max(-60, Math.min(60, dx / 5));
          const rx = Math.max(-28, Math.min(28, -dy / 8));
          b.style.transform = 'rotateX(' + rx.toFixed(1) + 'deg) rotateY(' + ry.toFixed(1) + 'deg)';
        });
      },
      teamLeave: () => {
        const row = self.teamRow;
        if (!row) return;
        self.teamMouse = null;
        row.classList.remove('following');
        row.querySelectorAll('.bust').forEach((b) => { b.style.transform = ''; });
        self.teamReset();
      },
      setTrack: (el) => { self.track = el; },
      mqMove: (e) => {
        const r = e.currentTarget.getBoundingClientRect();
        const x = (e.clientX - r.left) / Math.max(1, r.width);
        const zone = 0.15;
        let t = 1;
        if (x < zone) t = 1 + 2 * ((zone - x) / zone);
        else if (x > 1 - zone) t = 1 + 2 * ((x - (1 - zone)) / zone);
        self.mqSet(t);
      },
      mqLeave: () => self.mqSet(1),
      nodes: nodes, allPoints: allPoints, donePoints: donePoints, tokenStyle: tokenStyle,
      st: st, passed: passed,
      prev: () => { if (stage > 0) { self.setState({ stage: stage - 1 }); self.heroGo(stage - 1); } },
      next: () => { const to = stage >= last ? 0 : stage + 1; self.setState({ stage: to }); self.heroGo(to); },
      setHero: (el) => { self.heroEl = el; },
      nextLabel: stage >= last ? 'ЗАНОВО ↺' : 'ДАЛЬШЕ ▶',
      prevDisabled: prevDisabled, prevStyle: prevStyle,
      clock: pad(d.getHours()) + ':' + pad(d.getMinutes()),
      sent: this.state.sent, notSent: !this.state.sent,
      send: () => self.setState({ sent: true })
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
    if (form && form.reportValidity && !form.reportValidity()) return;
    var data = {};
    if (form) {
      new FormData(form).forEach(function (v, k) {
        if (data[k] !== undefined) {
          if (Array.isArray(data[k])) data[k].push(v);
          else data[k] = [data[k], v];
        } else {
          data[k] = v;
        }
      });
    }
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
  // Часы в панели задач кейсов.
  setInterval(update, 30000);
})();
