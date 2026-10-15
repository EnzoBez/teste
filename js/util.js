/* Utilidades gerais: formatação, datas, CNPJ, DOM, avisos e modais. */
(function () {
  'use strict';

  const U = {};

  // ---------- Números e dinheiro ----------
  const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const num = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });
  const num0 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });

  U.money = (v) => brl.format(Number(v) || 0);
  U.num = (v) => num.format(Number(v) || 0);
  U.int = (v) => num0.format(Number(v) || 0);
  U.round2 = (v) => Math.round((Number(v) || 0) * 100) / 100;

  /** Converte "1.234,56", "1234.56", "R$ 12,3" em número. */
  U.parseNum = (v) => {
    if (typeof v === 'number') return v;
    if (v == null) return 0;
    let s = String(v).trim().replace(/[R$\s]/g, '');
    if (!s) return 0;
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
    const n = parseFloat(s);
    return isNaN(n) ? 0 : n;
  };

  // ---------- Datas (sempre ISO yyyy-mm-dd no banco) ----------
  U.today = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  U.addDays = (iso, days) => {
    const d = new Date(iso + 'T12:00:00');
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  };
  U.date = (iso) => {
    if (!iso) return '';
    const [y, m, d] = String(iso).slice(0, 10).split('-');
    return d ? `${d}/${m}/${y}` : iso;
  };
  U.daysBetween = (a, b) => Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000);

  // ---------- CNPJ / CPF ----------
  U.digits = (v) => String(v || '').replace(/\D/g, '');
  U.fmtDoc = (v) => {
    const d = U.digits(v);
    if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
    if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
    return v || '';
  };
  U.maskDoc = (v) => {
    const d = U.digits(v).slice(0, 14);
    if (d.length <= 11) {
      return d.replace(/^(\d{3})(\d)/, '$1.$2').replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1-$2');
    }
    return d.replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d)/, '$1-$2');
  };
  U.validCnpj = (v) => {
    const c = U.digits(v);
    if (c.length !== 14 || /^(\d)\1+$/.test(c)) return false;
    const calc = (len) => {
      let sum = 0, pos = len - 7;
      for (let i = len; i >= 1; i--) {
        sum += c[len - i] * pos--;
        if (pos < 2) pos = 9;
      }
      const r = sum % 11;
      return r < 2 ? 0 : 11 - r;
    };
    return calc(12) === +c[12] && calc(13) === +c[13];
  };
  U.maskPhone = (v) => {
    const d = U.digits(v).slice(0, 11);
    if (d.length <= 10) return d.replace(/^(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d)/, '$1-$2');
    return d.replace(/^(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d)/, '$1-$2');
  };

  // ---------- Texto ----------
  U.norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  U.esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  U.uuid = () => (crypto.randomUUID ? crypto.randomUUID() :
    'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    }));
  /** Extrai dias de prazo de textos como "28 dias", "28 DDL", "28/35". Retorna o primeiro número. */
  U.prazoDias = (s) => {
    const m = String(s || '').match(/\d+/);
    return m ? +m[0] : null;
  };

  // ---------- DOM ----------
  U.$ = (sel, root) => (root || document).querySelector(sel);
  U.$$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  U.debounce = (fn, ms) => {
    let t;
    return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  };
  /** Lê os campos [name] de um formulário para um objeto. */
  U.formData = (form) => {
    const o = {};
    U.$$('[name]', form).forEach((el) => {
      if (el.type === 'checkbox') o[el.name] = el.checked;
      else if (el.type === 'radio') { if (el.checked) o[el.name] = el.value; }
      else o[el.name] = el.value.trim();
    });
    return o;
  };
  U.fillForm = (form, obj) => {
    U.$$('[name]', form).forEach((el) => {
      const v = obj[el.name];
      if (el.type === 'checkbox') el.checked = !!v;
      else if (el.type === 'radio') el.checked = el.value === v;
      else el.value = v == null ? '' : v;
    });
  };

  // ---------- Avisos (toast) ----------
  U.toast = (msg, type = 'ok', ms = 3200) => {
    let box = U.$('#toasts');
    if (!box) {
      box = document.createElement('div');
      box.id = 'toasts';
      document.body.appendChild(box);
    }
    const t = document.createElement('div');
    t.className = 'toast toast-' + type;
    t.textContent = msg;
    box.appendChild(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, ms);
  };

  // ---------- Modal ----------
  /**
   * Abre um modal. `body` é HTML. `buttons`: [{label, cls, value}].
   * Retorna Promise com o value do botão (ou null ao fechar).
   * onOpen(root) permite ligar eventos no conteúdo.
   */
  U.modal = ({ title, body, buttons = [{ label: 'Fechar', value: null }], wide = false, onOpen }) =>
    new Promise((resolve) => {
      const wrap = document.createElement('div');
      wrap.className = 'modal-back';
      wrap.innerHTML = `
        <div class="modal ${wide ? 'modal-wide' : ''}" role="dialog" aria-modal="true">
          <div class="modal-head"><h3>${U.esc(title)}</h3><button class="icon-btn" data-close aria-label="Fechar">✕</button></div>
          <div class="modal-body">${body}</div>
          <div class="modal-foot">${buttons.map((b, i) => `<button class="btn ${b.cls || ''}" data-i="${i}">${U.esc(b.label)}</button>`).join('')}</div>
        </div>`;
      const close = (v) => {
        document.removeEventListener('keydown', onKey);
        wrap.remove();
        resolve(v);
      };
      const onKey = (e) => { if (e.key === 'Escape') close(null); };
      wrap.addEventListener('mousedown', (e) => { if (e.target === wrap) close(null); });
      wrap.querySelector('[data-close]').onclick = () => close(null);
      wrap.querySelectorAll('.modal-foot .btn').forEach((b) => {
        b.onclick = async () => {
          const btn = buttons[+b.dataset.i];
          if (btn.validate) {
            const ok = await btn.validate(wrap);
            if (!ok) return;
          }
          close(btn.value !== undefined ? btn.value : btn.label);
        };
      });
      document.addEventListener('keydown', onKey);
      document.body.appendChild(wrap);
      if (onOpen) onOpen(wrap);
      const first = wrap.querySelector('.modal-body input, .modal-body select, .modal-body textarea');
      if (first) first.focus();
    });

  U.confirm = (msg, { ok = 'Confirmar', danger = false, title = 'Confirmar' } = {}) =>
    U.modal({
      title,
      body: `<p>${U.esc(msg)}</p>`,
      buttons: [{ label: 'Cancelar', value: false }, { label: ok, cls: danger ? 'btn-danger' : 'btn-primary', value: true }],
    }).then((v) => v === true);

  // ---------- Carregamento sob demanda de scripts pesados ----------
  const loaded = {};
  U.loadScript = (src) => {
    if (!loaded[src]) {
      loaded[src] = new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = src;
        s.onload = res;
        s.onerror = () => { delete loaded[src]; rej(new Error('Falha ao carregar ' + src)); };
        document.head.appendChild(s);
      });
    }
    return loaded[src];
  };

  // ---------- Download ----------
  U.download = (filename, content, type = 'application/json') => {
    const blob = content instanceof Blob ? content : new Blob([content], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  };

  // ---------- Cores de destaque para linhas de pedido ----------
  U.DESTAQUES = [
    { v: '', label: 'Sem destaque' },
    { v: 'amarelo', label: 'Amarelo' },
    { v: 'laranja', label: 'Laranja' },
    { v: 'verde', label: 'Verde' },
    { v: 'azul', label: 'Azul' },
    { v: 'vermelho', label: 'Vermelho' },
    { v: 'roxo', label: 'Roxo' },
  ];

  U.TIPOS_PEDIDO = { venda: 'Venda', bonificacao: 'Bonificação', troca: 'Troca' };
  U.TIPOS_OCORRENCIA = { cancelamento: 'Cancelamento', devolucao: 'Devolução', troca: 'Troca' };


  // ---------- Ícones (traço, 24x24) ----------
  const ICONS = {
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    receipt: '<path d="M4 2v20l3-2 3 2 3-2 3 2 3-2 1 .7V2l-1 .7-3-2-3 2-3-2-3 2-3-2z" transform="translate(0 .5) scale(1 .96)"/><path d="M8 8h8M8 12h8M8 16h5"/>',
    box: '<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="m3 8 9 5 9-5M12 13v8"/>',
    alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
    refresh: '<path d="M21 12a9 9 0 0 1-15 6.7L3 16M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M3 21v-5h5"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
    more: '<circle cx="12" cy="5" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="12" cy="19" r="1.2"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    filter: '<path d="M22 3H2l8 9.5V19l4 2v-8.5z"/>',
    edit: '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    trash: '<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>',
    undo: '<path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-15-6.7L3 13"/>',
    pen: '<path d="M12 19l7-7 3 3-7 7zM18 13l-1.5-7.5L2 2l3.5 14.5L13 18zM2 2l7.6 7.6"/><circle cx="11" cy="11" r="2"/>',
    truck: '<path d="M1 3h15v13H1zM16 8h4l3 3v5h-7z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>',
    clipboard: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/>',
    history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l4 2"/>',
    arrow: '<path d="M5 12h14M12 5l7 7-7 7"/>',
    building: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4M8 6h.01M16 6h.01M12 6h.01M12 10h.01M12 14h.01M16 10h.01M16 14h.01M8 10h.01M8 14h.01"/>',
  };
  U.icon = (name, size = 18) => `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;

  // ---------- Painel lateral (drawer) ----------
  /** HTML de um painel lateral; fica dentro da página e aparece por cima. */
  U.drawerHtml = (id, { title, sub = '', body, foot = '', wide = false }) => `
    <div class="drawer ${wide ? 'drawer-wide' : ''}" id="${id}" aria-hidden="true">
      <div class="drawer-back" data-drawer-close></div>
      <div class="drawer-panel" role="dialog" aria-modal="true" aria-labelledby="${id}-title">
        <div class="drawer-head">
          <div><h2 id="${id}-title">${title}</h2><div class="sub" id="${id}-sub">${sub}</div></div>
          <button type="button" class="icon-btn" data-drawer-close aria-label="Fechar">${U.icon('x', 20)}</button>
        </div>
        <div class="drawer-body">${body}</div>
        ${foot ? `<div class="drawer-foot">${foot}</div>` : ''}
      </div>
    </div>`;
  const openDrawers = [];
  U.openDrawer = (el, focusSel) => {
    if (!el) return;
    if (!el.dataset.bound) {
      el.dataset.bound = '1';
      el.addEventListener('click', (e) => { if (e.target.closest('[data-drawer-close]')) U.closeDrawer(el); });
    }
    if (!openDrawers.includes(el)) openDrawers.push(el);
    el.classList.add('open');
    el.setAttribute('aria-hidden', 'false');
    document.documentElement.classList.add('has-drawer');
    setTimeout(() => {
      const f = focusSel ? el.querySelector(focusSel) : null;
      if (f && !f.hidden) f.focus();
    }, 60);
  };
  U.closeDrawer = (el) => {
    el = el || openDrawers[openDrawers.length - 1];
    if (!el) return;
    el.classList.remove('open');
    el.setAttribute('aria-hidden', 'true');
    const i = openDrawers.indexOf(el);
    if (i >= 0) openDrawers.splice(i, 1);
    if (!openDrawers.length) document.documentElement.classList.remove('has-drawer');
    el.dispatchEvent(new CustomEvent('drawer-close'));
  };
  U.drawerOpen = () => openDrawers.length > 0;
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && openDrawers.length && !document.querySelector('.modal-back, .menu-pop, .palette-back')) U.closeDrawer();
  });

  // ---------- Menu suspenso ----------
  /** Abre um menu junto ao elemento. items: [{label, value, icon, danger}] ou '-' para separador. */
  U.menu = (anchor, items) => new Promise((resolve) => {
    document.querySelectorAll('.menu-pop').forEach((m) => m.remove());
    const m = document.createElement('div');
    m.className = 'menu-pop';
    m.innerHTML = items.map((it, i) => it === '-' ? '<div class="menu-sep"></div>' :
      `<button type="button" class="menu-item ${it.danger ? 'danger' : ''}" data-i="${i}">${it.icon ? U.icon(it.icon, 16) : (it.swatch !== undefined ? `<span class="swatch sw-${it.swatch || 'none'}"></span>` : '')}<span>${U.esc(it.label)}</span>${it.checked ? U.icon('check', 14) : ''}</button>`).join('');
    document.body.appendChild(m);
    const r = anchor.getBoundingClientRect();
    const mw = m.offsetWidth, mh = m.offsetHeight;
    let left = Math.min(r.right - mw, window.innerWidth - mw - 8);
    if (left < 8) left = 8;
    let top = r.bottom + 6;
    if (top + mh > window.innerHeight - 8) top = Math.max(8, r.top - mh - 6);
    m.style.left = left + 'px';
    m.style.top = top + 'px';
    const done = (v) => { m.remove(); document.removeEventListener('mousedown', out, true); document.removeEventListener('keydown', key, true); resolve(v); };
    const out = (e) => { if (!m.contains(e.target)) done(null); };
    const key = (e) => { if (e.key === 'Escape') { e.stopPropagation(); done(null); } };
    m.addEventListener('click', (e) => { const b = e.target.closest('[data-i]'); if (b) done(items[+b.dataset.i].value); });
    setTimeout(() => { document.addEventListener('mousedown', out, true); document.addEventListener('keydown', key, true); }, 0);
    const first = m.querySelector('.menu-item');
    if (first) first.focus();
  });

  /** Iniciais para avatar. */
  U.initials = (s) => {
    const w = String(s || '').replace(/[^A-Za-zÀ-ÿ0-9 ]/g, ' ').split(/\s+/).filter((x) => x && !/^(LTDA|ME|EPP|S\/?A|DE|DA|DO|DOS|DAS|E|COMERCIO|COM)$/i.test(x));
    return ((w[0] || '?')[0] + ((w[1] || '')[0] || '')).toUpperCase();
  };
  /** Cor estável a partir de um texto (para avatares). */
  U.hue = (s) => { let h = 0; for (const c of String(s || '')) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };

  /** Data por extenso curta: "Hoje", "Ontem", "Seg, 13 out". */
  U.dayLabel = (iso) => {
    if (!iso) return 'Sem data';
    const t = U.today();
    if (iso === t) return 'Hoje';
    if (iso === U.addDays(t, -1)) return 'Ontem';
    const d = new Date(iso + 'T12:00:00');
    const s = d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short', year: iso.slice(0, 4) !== t.slice(0, 4) ? 'numeric' : undefined });
    return s.charAt(0).toUpperCase() + s.slice(1).replace(/\./g, '');
  };

  window.U = U;
  window.Pages = window.Pages || {};
})();
